import { Db } from "mongodb";
import type {
  ThemeManifest,
  ThemeAssignment,
} from "@hospital-cms/shared-types";
import { ThemeStatus } from "@hospital-cms/shared-types";
import { COLLECTIONS } from "@hospital-cms/database";
import {
  validateThemeManifest,
  verifyThemeSignature,
  buildCssVariables,
} from "./theme-validator";
import { logger } from "@hospital-cms/logger";

// THEME REGISTRY
// Manages the active theme assignment for a hospital.
// Only one theme is active at a time; previous is replaced.

const log = logger("theme:registry");

export class ThemeRegistry {
  private readonly db: Db;
  private readonly vendorPublicKey: string;
  private activeThemeCache: Map<string, ThemeManifest> = new Map();

  constructor(db: Db, vendorPublicKey: string) {
    this.db = db;
    this.vendorPublicKey = vendorPublicKey;
  }

  private get collection() {
    return this.db.collection<ThemeAssignment>(COLLECTIONS.THEME_ASSIGNMENTS);
  }

  async activateTheme(params: {
    hospitalId: string;
    manifest: unknown;
    actorId: string;
  }): Promise<ThemeAssignment & { _id: string }> {
    const validated = validateThemeManifest(params.manifest);
    verifyThemeSignature(validated as ThemeManifest, this.vendorPublicKey);

    const now = new Date();

    // Upsert: exactly one theme assignment per hospital
    await this.collection.updateOne(
      { hospitalId: params.hospitalId },
      {
        $set: {
          themeId: validated.themeId,
          manifest: validated as ThemeManifest,
          status: ThemeStatus.ACTIVE,
          assignedAt: now,
          assignedBy: params.actorId,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true },
    );

    this.activeThemeCache.set(params.hospitalId, validated as ThemeManifest);

    log.info(
      { hospitalId: params.hospitalId, themeId: validated.themeId },
      "Theme activated",
    );

    const doc = await this.collection.findOne({
      hospitalId: params.hospitalId,
    });
    return { ...doc!, _id: String(doc!._id) } as ThemeAssignment & {
      _id: string;
    };
  }

  async getActiveTheme(hospitalId: string): Promise<ThemeManifest | null> {
    if (this.activeThemeCache.has(hospitalId)) {
      return this.activeThemeCache.get(hospitalId)!;
    }
    const doc = await this.collection.findOne({
      hospitalId,
      status: ThemeStatus.ACTIVE,
    });
    if (!doc) return null;
    this.activeThemeCache.set(hospitalId, doc.manifest);
    return doc.manifest;
  }

  async getActiveCss(hospitalId: string): Promise<string> {
    const theme = await this.getActiveTheme(hospitalId);
    if (!theme) return "";
    return buildCssVariables(theme.variables);
  }

  invalidateCache(hospitalId: string): void {
    this.activeThemeCache.delete(hospitalId);
  }
}
