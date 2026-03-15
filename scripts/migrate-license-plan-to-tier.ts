/**
 * Migration: rename `plan` → `tier` and `maxPatients` → `maxBeds` in the
 * `licenses` collection.
 *
 * Safe to run multiple times (idempotent — only touches documents that still
 * have the old field names).
 *
 * Usage:
 *   MONGODB_URI=mongodb://localhost:27017 MONGODB_DB=hospital \
 *     npx ts-node scripts/migrate-license-plan-to-tier.ts
 */
import { MongoClient } from "mongodb";

const MONGODB_URI = process.env["MONGODB_URI"];
const MONGODB_DB = process.env["MONGODB_DB"] ?? "hospital";
const COLLECTION = "licenses";

if (!MONGODB_URI) {
  console.error("MONGODB_URI environment variable is required");
  process.exit(1);
}

async function main() {
  const client = new MongoClient(MONGODB_URI!);
  await client.connect();
  const db = client.db(MONGODB_DB);
  const col = db.collection(COLLECTION);

  // Rename `plan` → `tier`
  const planResult = await col.updateMany(
    { plan: { $exists: true } },
    { $rename: { plan: "tier" } },
  );
  console.log(`plan → tier: ${planResult.modifiedCount} document(s) updated`);

  // Rename `maxPatients` → `maxBeds`
  const patientsResult = await col.updateMany(
    { maxPatients: { $exists: true } },
    { $rename: { maxPatients: "maxBeds" } },
  );
  console.log(`maxPatients → maxBeds: ${patientsResult.modifiedCount} document(s) updated`);

  await client.close();
  console.log("Migration complete");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
