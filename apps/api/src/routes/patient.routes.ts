import { Router } from "express";
import { Db } from "mongodb";
import { z } from "zod";
import { PatientService } from "../modules/patient/patient.service";
import { authenticate } from "../middleware/authenticate";
import { requirePermission } from "../middleware/authorize";
import {
  sendSuccess,
  sendCreated,
  sendPaginated,
  sendNoContent,
} from "../helpers/response";
import { Permission, Gender, BloodGroup } from "@hospital-cms/shared-types";
import {
  buildFhirPatient,
  buildFhirEncounter,
  buildFhirBundle,
} from "../modules/fhir/fhir-r4.builder";

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().min(1),
  postalCode: z.string().optional(),
});

const createPatientSchema = z.object({
  profile: z.object({
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    middleName: z.string().max(50).optional(),
    dateOfBirth: z.string().transform((v) => new Date(v)),
    gender: z.nativeEnum(Gender),
    nationalId: z.string().optional(),
    passportNumber: z.string().optional(),
  }),
  contactInfo: z.object({
    phone: z.string().min(7),
    alternatePhone: z.string().optional(),
    email: z.string().email().optional(),
    address: addressSchema,
  }),
  emergencyContact: z
    .object({
      name: z.string().min(1),
      relationship: z.string().min(1),
      phone: z.string().min(7),
      alternatePhone: z.string().optional(),
    })
    .optional(),
  insurance: z
    .array(
      z.object({
        provider: z.string().min(1),
        policyNumber: z.string().min(1),
        groupNumber: z.string().optional(),
        coverageType: z.string().min(1),
        expiryDate: z
          .string()
          .optional()
          .transform((v) => (v ? new Date(v) : undefined)),
        isPrimary: z.boolean(),
      }),
    )
    .optional(),
  medicalInfo: z
    .object({
      bloodGroup: z.nativeEnum(BloodGroup).optional(),
      allergies: z.array(z.string()).optional(),
      chronicConditions: z.array(z.string()).optional(),
      currentMedications: z.array(z.string()).optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export function patientRouter(db: Db): Router {
  const router = Router();
  const patientService = new PatientService(db);

  router.use(authenticate);

  // GET /patients
  router.get(
    "/",
    requirePermission(Permission.PATIENT_READ),
    async (req, res, next) => {
      try {
        const query = (req.query["q"] as string) ?? "";
        const page = parseInt((req.query["page"] as string) ?? "1");
        const limit = parseInt((req.query["limit"] as string) ?? "20");
        const result = await patientService.searchPatients(
          req.context.hospitalId!,
          query,
          { page, limit },
        );
        sendPaginated(res, result, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /patients/:id
  router.get(
    "/:id",
    requirePermission(Permission.PATIENT_READ),
    async (req, res, next) => {
      try {
        const includeSensitive = req.query["sensitive"] === "true";

        const patient = await patientService.getPatient(
          req.context.hospitalId!,
          req.params["id"]!,
          req.context.userId!,
          req.context.username!,
          req.context.role!,
          req.context.traceId,
          includeSensitive,
        );
        sendSuccess(res, patient, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /patients
  router.post(
    "/",
    requirePermission(Permission.PATIENT_CREATE),
    async (req, res, next) => {
      try {
        const body = createPatientSchema.parse(req.body);
        const patient = await patientService.createPatient({
          hospitalId: req.context.hospitalId!,
          ...body,
          actorId: req.context.userId!,
          actorUsername: req.context.username!,
          actorRole: req.context.role!,
          traceId: req.context.traceId,
        });
        sendCreated(res, patient, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // PATCH /patients/:id
  router.patch(
    "/:id",
    requirePermission(Permission.PATIENT_UPDATE),
    async (req, res, next) => {
      try {
        const patient = await patientService.updatePatient(
          req.context.hospitalId!,
          req.params["id"]!,
          req.body as Parameters<typeof patientService.updatePatient>[2],
          req.context.userId!,
          req.context.username!,
          req.context.role!,
          req.context.traceId,
        );
        sendSuccess(res, patient, 200, undefined, req.context.traceId);
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /patients/:id/fhir — export patient + encounters as FHIR R4 Bundle
  router.get(
    "/:id/fhir",
    requirePermission(Permission.PATIENT_READ),
    async (req, res, next) => {
      try {
        const patient = await patientService.getPatient(
          req.context.hospitalId!,
          req.params["id"]!,
          req.context.userId!,
          req.context.username!,
          req.context.role!,
          req.context.traceId,
        );

        const { EncounterRepository } = await import("@hospital-cms/database");
        const encounterRepo = new EncounterRepository(db);
        const { items: encounters } = await encounterRepo.findByPatient(
          req.context.hospitalId!,
          req.params["id"]!,
          { page: 1, limit: 100 },
        );

        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const fhirPatient = buildFhirPatient(patient, baseUrl);
        const fhirEncounters = encounters.map((enc) =>
          buildFhirEncounter(enc, baseUrl),
        );

        const bundle = buildFhirBundle([fhirPatient, ...fhirEncounters]);

        res.setHeader("Content-Type", "application/fhir+json");
        res.status(200).json(bundle);
      } catch (err) {
        next(err);
      }
    },
  );

  // DELETE /patients/:id
  router.delete(
    "/:id",
    requirePermission(Permission.PATIENT_DELETE),
    async (req, res, next) => {
      try {
        await patientService.deletePatient(
          req.context.hospitalId!,
          req.params["id"]!,
          req.context.userId!,
          req.context.username!,
          req.context.role!,
          req.context.traceId,
        );
        sendNoContent(res);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
