/**
 * Report Builder
 *
 * Generates CSV and JSON reports from hospital data.
 * Reports are streamed to the client or written to disk for scheduled exports.
 *
 * Supported report types:
 *  - billing_summary    — invoice totals by status, date range
 *  - lab_turnaround     — lab result processing times
 *  - census             — daily patient census (admitted/discharged counts)
 *  - encounter_summary  — encounters by type, status, ward
 */
import { Db } from "mongodb";

export type ReportType =
  | "billing_summary"
  | "lab_turnaround"
  | "census"
  | "encounter_summary";

export type ReportFormat = "csv" | "json";

export interface ReportParams {
  hospitalId: string;
  type: ReportType;
  format: ReportFormat;
  from: Date;
  to: Date;
}

export interface ReportResult {
  filename: string;
  contentType: string;
  body: string;
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map((h) => {
          const v = row[h];
          const s = v == null ? "" : String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n")
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        })
        .join(","),
    ),
  ];
  return lines.join("\n");
}

// ─── Report generators ────────────────────────────────────────────────────────

async function billingSummary(
  db: Db,
  hospitalId: string,
  from: Date,
  to: Date,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .collection("invoices")
    .aggregate([
      {
        $match: {
          hospitalId,
          createdAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: { $sum: "$paidAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  return rows.map((r) => ({
    status: r["_id"],
    invoiceCount: r["count"],
    totalAmount: r["totalAmount"],
    paidAmount: r["paidAmount"],
    outstandingAmount: (r["totalAmount"] as number) - (r["paidAmount"] as number),
  }));
}

async function labTurnaround(
  db: Db,
  hospitalId: string,
  from: Date,
  to: Date,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .collection("lab_results")
    .aggregate([
      {
        $match: {
          hospitalId,
          orderedAt: { $gte: from, $lte: to },
          resultedAt: { $exists: true },
        },
      },
      {
        $addFields: {
          turnaroundMinutes: {
            $divide: [
              { $subtract: ["$resultedAt", "$orderedAt"] },
              60_000,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$testCode",
          count: { $sum: 1 },
          avgTurnaroundMinutes: { $avg: "$turnaroundMinutes" },
          minTurnaroundMinutes: { $min: "$turnaroundMinutes" },
          maxTurnaroundMinutes: { $max: "$turnaroundMinutes" },
        },
      },
      { $sort: { avgTurnaroundMinutes: -1 } },
    ])
    .toArray();

  return rows.map((r) => ({
    testCode: r["_id"],
    resultCount: r["count"],
    avgTurnaroundMinutes: Math.round((r["avgTurnaroundMinutes"] as number) * 10) / 10,
    minTurnaroundMinutes: Math.round((r["minTurnaroundMinutes"] as number) * 10) / 10,
    maxTurnaroundMinutes: Math.round((r["maxTurnaroundMinutes"] as number) * 10) / 10,
  }));
}

async function census(
  db: Db,
  hospitalId: string,
  from: Date,
  to: Date,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .collection("encounters")
    .aggregate([
      {
        $match: {
          hospitalId,
          admittedAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: { format: "%Y-%m-%d", date: "$admittedAt" },
            },
          },
          admissions: { $sum: 1 },
          discharges: {
            $sum: {
              $cond: [{ $ifNull: ["$dischargedAt", false] }, 1, 0],
            },
          },
        },
      },
      { $sort: { "_id.date": 1 } },
    ])
    .toArray();

  return rows.map((r) => ({
    date: (r["_id"] as { date: string }).date,
    admissions: r["admissions"],
    discharges: r["discharges"],
    netCensus: (r["admissions"] as number) - (r["discharges"] as number),
  }));
}

async function encounterSummary(
  db: Db,
  hospitalId: string,
  from: Date,
  to: Date,
): Promise<Record<string, unknown>[]> {
  const rows = await db
    .collection("encounters")
    .aggregate([
      {
        $match: {
          hospitalId,
          admittedAt: { $gte: from, $lte: to },
        },
      },
      {
        $group: {
          _id: { type: "$type", status: "$status" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.type": 1, "_id.status": 1 } },
    ])
    .toArray();

  return rows.map((r) => ({
    encounterType: (r["_id"] as { type: string; status: string }).type,
    status: (r["_id"] as { type: string; status: string }).status,
    count: r["count"],
  }));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateReport(
  db: Db,
  params: ReportParams,
): Promise<ReportResult> {
  const { hospitalId, type, format, from, to } = params;

  let rows: Record<string, unknown>[];

  switch (type) {
    case "billing_summary":
      rows = await billingSummary(db, hospitalId, from, to);
      break;
    case "lab_turnaround":
      rows = await labTurnaround(db, hospitalId, from, to);
      break;
    case "census":
      rows = await census(db, hospitalId, from, to);
      break;
    case "encounter_summary":
      rows = await encounterSummary(db, hospitalId, from, to);
      break;
  }

  const dateTag = `${from.toISOString().split("T")[0]}_${to.toISOString().split("T")[0]}`;
  const filename = `${type}_${dateTag}.${format}`;

  if (format === "json") {
    return {
      filename,
      contentType: "application/json",
      body: JSON.stringify({ report: type, from, to, rows }, null, 2),
    };
  }

  return {
    filename,
    contentType: "text/csv",
    body: toCsv(rows),
  };
}
