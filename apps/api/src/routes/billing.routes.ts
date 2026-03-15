import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import { sendSuccess, sendCreated, sendPaginated } from "../helpers/response";
import {
  Permission,
  BillingStatus,
  PaymentMethod,
  AuditAction,
} from "@hospital-cms/shared-types";
import { InvoiceRepository, CounterService } from "@hospital-cms/database";
import { AuditService } from "@hospital-cms/audit";
import { BadRequestError } from "@hospital-cms/errors";
import { v4 as uuidv4 } from "uuid";

const lineItemSchema = z.object({
  description: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  discount: z.number().nonnegative().default(0),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
});

const createInvoiceSchema = z.object({
  patientId: z.string().min(1),
  encounterId: z.string().optional(),
  lineItems: z.array(lineItemSchema).min(1),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  currency: z.string().length(3).default("USD"),
  notes: z.string().optional(),
  dueDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
});

const addPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.nativeEnum(PaymentMethod),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

function computeInvoiceTotals(
  lineItems: z.infer<typeof lineItemSchema>[],
  invoiceDiscount: number,
  tax: number,
) {
  const subtotal = lineItems.reduce((sum, item) => {
    const itemTotal =
      item.quantity * item.unitPrice * (1 - item.discount / 100);
    return sum + itemTotal;
  }, 0);

  const afterDiscount = subtotal * (1 - invoiceDiscount / 100);
  const taxAmount = afterDiscount * (tax / 100);
  const total = afterDiscount + taxAmount;

  return {
    subtotal: Math.round(subtotal * 100) / 100,
    total: Math.round(total * 100) / 100,
    items: lineItems.map((item) => ({
      ...item,
      total:
        Math.round(
          item.quantity * item.unitPrice * (1 - item.discount / 100) * 100,
        ) / 100,
    })),
  };
}

export function billingRouter(db: Db): Router {
  const router = Router();
  const repo = new InvoiceRepository(db);
  const counter = new CounterService(db);
  const auditService = new AuditService(db);

  router.use(authenticate);

  // GET /billing/invoices
  router.get(
    "/invoices",
    requirePermission(Permission.BILLING_READ),
    async (req, res, next) => {
      try {
        const patientId = req.query["patientId"] as string | undefined;
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");
        const hospitalId = req.context.hospitalId!;

        const result = patientId
          ? await repo.findByPatient(hospitalId, patientId, { page, limit })
          : await repo.findMany(
              { hospitalId } as Parameters<typeof repo.findMany>[0],
              { page, limit },
            );

        sendPaginated(res, result, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /billing/invoices/:id
  router.get(
    "/invoices/:id",
    requirePermission(Permission.BILLING_READ),
    async (req, res, next) => {
      try {
        const invoice = await repo.findByIdOrThrow(req.params["id"]!);
        sendSuccess(res, invoice, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /billing/invoices
  router.post(
    "/invoices",
    requirePermission(Permission.BILLING_CREATE),
    async (req, res, next) => {
      try {
        const body = createInvoiceSchema.parse(req.body);
        const hospitalId = req.context.hospitalId!;
        const invoiceNumber = await counter.nextInvoiceNumber(hospitalId);

        const { subtotal, total, items } = computeInvoiceTotals(
          body.lineItems,
          body.discount,
          body.tax,
        );

        const invoice = await repo.insertOne({
          hospitalId,
          invoiceNumber,
          patientId: body.patientId,
          encounterId: body.encounterId,
          status: BillingStatus.DRAFT,
          lineItems: items,
          subtotal,
          discount: body.discount,
          tax: body.tax,
          total,
          amountPaid: 0,
          amountDue: total,
          currency: body.currency,
          notes: body.notes,
          dueDate: body.dueDate,
          payments: [],
          createdBy: req.context.userId!,
        });

        await auditService.log({
          hospitalId,
          traceId: req.context.traceId,
          action: AuditAction.BILLING_INVOICE_CREATED,
          actor: {
            userId: req.context.userId!,
            username: req.context.username!,
            role: req.context.role!,
          },
          resource: {
            type: "Invoice",
            id: invoice._id,
            name: invoiceNumber,
          },
          outcome: "SUCCESS",
          metadata: { total, currency: body.currency },
        });

        sendCreated(res, invoice, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /billing/invoices/:id/payments
  router.post(
    "/invoices/:id/payments",
    requirePermission(Permission.BILLING_UPDATE),
    async (req, res, next) => {
      try {
        const body = addPaymentSchema.parse(req.body);
        const invoice = await repo.findByIdOrThrow(req.params["id"]!);

        if (invoice.status === BillingStatus.VOID) {
          throw new BadRequestError("Cannot add payment to a voided invoice");
        }
        if (invoice.status === BillingStatus.PAID) {
          throw new BadRequestError("Invoice is already fully paid");
        }

        const payment = {
          paymentId: uuidv4(),
          amount: body.amount,
          method: body.method,
          reference: body.reference,
          paidAt: new Date(),
          receivedBy: req.context.userId!,
          notes: body.notes,
        };

        const newAmountPaid = invoice.amountPaid + body.amount;
        const newAmountDue = Math.max(0, invoice.total - newAmountPaid);
        const newStatus =
          newAmountDue === 0
            ? BillingStatus.PAID
            : newAmountPaid > 0
              ? BillingStatus.PARTIAL
              : invoice.status;

        const updated = await repo.updateById(invoice._id, {
          payments: [...invoice.payments, payment],
          amountPaid: newAmountPaid,
          amountDue: newAmountDue,
          status: newStatus,
        } as Parameters<typeof repo.updateById>[1]);

        await auditService.log({
          hospitalId: req.context.hospitalId!,
          traceId: req.context.traceId,
          action: AuditAction.BILLING_PAYMENT_RECORDED,
          actor: {
            userId: req.context.userId!,
            username: req.context.username!,
            role: req.context.role!,
          },
          resource: { type: "Invoice", id: invoice._id },
          outcome: "SUCCESS",
          metadata: { amount: body.amount, method: body.method },
        });

        sendSuccess(res, updated, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /billing/invoices/:id/void
  router.post(
    "/invoices/:id/void",
    requirePermission(Permission.BILLING_VOID),
    async (req, res, next) => {
      try {
        const invoice = await repo.findByIdOrThrow(req.params["id"]!);

        if (invoice.status === BillingStatus.VOID) {
          throw new BadRequestError("Invoice is already voided");
        }

        const updated = await repo.updateById(invoice._id, {
          status: BillingStatus.VOID,
        } as Parameters<typeof repo.updateById>[1]);

        await auditService.log({
          hospitalId: req.context.hospitalId!,
          traceId: req.context.traceId,
          action: AuditAction.BILLING_INVOICE_VOIDED,
          actor: {
            userId: req.context.userId!,
            username: req.context.username!,
            role: req.context.role!,
          },
          resource: { type: "Invoice", id: invoice._id },
          outcome: "SUCCESS",
          metadata: { reason: req.body["reason"] },
        });

        sendSuccess(res, updated, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
