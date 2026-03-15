import { Db } from "mongodb";
import type {
  OperationalCommand,
  CommandStatus,
} from "@hospital-cms/shared-types";
import { BaseRepository, WithStringId } from "../base-repository";
import { COLLECTIONS } from "../collections";

export class CommandRepository extends BaseRepository<OperationalCommand> {
  constructor(db: Db) {
    super(db, COLLECTIONS.OPERATIONAL_COMMANDS, "Command");
  }

  async findByCommandId(
    commandId: string,
  ): Promise<WithStringId<OperationalCommand> | null> {
    return this.findOne({ commandId });
  }

  async findByNonce(
    nonce: string,
  ): Promise<WithStringId<OperationalCommand> | null> {
    return this.findOne({ nonce });
  }

  async findPendingForInstance(
    instanceId: string,
  ): Promise<WithStringId<OperationalCommand>[]> {
    const result = await this.findMany(
      {
        instanceId,
        status: "PENDING",
        expiresAt: { $gt: new Date() },
      },
      { sort: { createdAt: 1 } },
    );
    return result.items;
  }

  async nonceExists(nonce: string): Promise<boolean> {
    return this.exists({ nonce });
  }
}
