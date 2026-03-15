import { Db } from "mongodb";
import type {
  PluginRegistryEntry,
  PluginStatus,
} from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class PluginRepository extends BaseRepository<PluginRegistryEntry> {
  constructor(db: Db) {
    super(db, COLLECTIONS.PLUGIN_REGISTRY, "Plugin");
  }

  async findByPluginId(
    hospitalId: string,
    pluginId: string,
  ): Promise<WithStringId<PluginRegistryEntry> | null> {
    return this.findOne({ hospitalId, pluginId });
  }

  async findByStatus(hospitalId: string, status: PluginStatus) {
    return this.findMany({ hospitalId, status });
  }

  async findActive(hospitalId: string) {
    return this.findMany({ hospitalId, status: "ACTIVE" });
  }

  async upsertPlugin(
    hospitalId: string,
    pluginId: string,
    data: Partial<Omit<PluginRegistryEntry, "_id" | "createdAt" | "updatedAt">>,
  ): Promise<WithStringId<PluginRegistryEntry>> {
    const existing = await this.findByPluginId(hospitalId, pluginId);
    if (existing) {
      return this.updateById(existing._id, data);
    }
    return this.insertOne({
      hospitalId,
      pluginId,
      ...data,
    } as Omit<PluginRegistryEntry, "_id" | "createdAt" | "updatedAt">);
  }
}
