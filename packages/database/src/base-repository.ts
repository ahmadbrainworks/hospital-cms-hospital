import {
  Collection,
  Db,
  Filter,
  FindOptions,
  UpdateFilter,
  ObjectId,
  OptionalUnlessRequiredId,
  WithId,
  InsertOneResult,
  UpdateResult,
  DeleteResult,
} from "mongodb";
import type { PaginatedResult } from "@hospital-cms/shared-types";
import { NotFoundError } from "@hospital-cms/errors";

// BASE REPOSITORY
// Generic CRUD + pagination. Each domain repository extends this.
// _id is stored as ObjectId internally; exposed as string in types.

export type WithStringId<T> = Omit<T, "_id"> & { _id: string };

export interface DbDocument {
  _id?: ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FindManyOptions {
  page?: number;
  limit?: number;
  sort?: Record<string, 1 | -1>;
}

export abstract class BaseRepository<TDomain> {
  protected readonly collection: Collection<DbDocument>;
  protected readonly resourceName: string;

  constructor(db: Db, collectionName: string, resourceName: string) {
    this.collection = db.collection<DbDocument>(collectionName);
    this.resourceName = resourceName;
  }

  protected serialize(doc: WithId<DbDocument>): WithStringId<TDomain> {
    const { _id, ...rest } = doc;
    return { ...rest, _id: _id.toHexString() } as WithStringId<TDomain>;
  }

  protected toObjectId(id: string): ObjectId {
    try {
      return new ObjectId(id);
    } catch {
      throw new NotFoundError(this.resourceName, id);
    }
  }

  async findById(id: string): Promise<WithStringId<TDomain> | null> {
    const doc = await this.collection.findOne<WithId<DbDocument>>({
      _id: this.toObjectId(id),
    });
    return doc ? this.serialize(doc) : null;
  }

  async findByIdOrThrow(id: string): Promise<WithStringId<TDomain>> {
    const doc = await this.findById(id);
    if (!doc) throw new NotFoundError(this.resourceName, id);
    return doc;
  }

  async findOne(
    filter: Filter<DbDocument>,
  ): Promise<WithStringId<TDomain> | null> {
    const doc = await this.collection.findOne<WithId<DbDocument>>(filter);
    return doc ? this.serialize(doc) : null;
  }

  async findMany(
    filter: Filter<DbDocument>,
    opts: FindManyOptions = {},
  ): Promise<PaginatedResult<WithStringId<TDomain>>> {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const skip = (page - 1) * limit;

    const findOpts: FindOptions = {
      skip,
      limit,
      sort: opts.sort ?? { createdAt: -1 },
    };

    const [docs, total] = await Promise.all([
      this.collection.find<WithId<DbDocument>>(filter, findOpts).toArray(),
      this.collection.countDocuments(filter),
    ]);

    return {
      items: docs.map((d) => this.serialize(d)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async insertOne(
    data: Omit<TDomain, "_id" | "createdAt" | "updatedAt">,
  ): Promise<WithStringId<TDomain>> {
    const now = new Date();
    const doc = {
      ...data,
      createdAt: now,
      updatedAt: now,
    } as OptionalUnlessRequiredId<DbDocument>;

    const result: InsertOneResult = await this.collection.insertOne(doc);

    const inserted = await this.collection.findOne<WithId<DbDocument>>({
      _id: result.insertedId,
    });

    if (!inserted) {
      throw new Error(`Failed to retrieve inserted ${this.resourceName}`);
    }

    return this.serialize(inserted);
  }

  async updateById(
    id: string,
    update: Partial<Omit<TDomain, "_id" | "createdAt">>,
  ): Promise<WithStringId<TDomain>> {
    const result: UpdateResult = await this.collection.updateOne(
      { _id: this.toObjectId(id) },
      {
        $set: {
          ...update,
          updatedAt: new Date(),
        },
      } as UpdateFilter<DbDocument>,
    );

    if (result.matchedCount === 0) {
      throw new NotFoundError(this.resourceName, id);
    }

    return this.findByIdOrThrow(id);
  }

  async deleteById(id: string): Promise<boolean> {
    const result: DeleteResult = await this.collection.deleteOne({
      _id: this.toObjectId(id),
    });
    return result.deletedCount === 1;
  }

  async softDeleteById(
    id: string,
    deletedBy: string,
  ): Promise<WithStringId<TDomain>> {
    return this.updateById(id, {
      deletedAt: new Date(),
      deletedBy,
    } as unknown as Partial<Omit<TDomain, "_id" | "createdAt">>);
  }

  async exists(filter: Filter<DbDocument>): Promise<boolean> {
    const count = await this.collection.countDocuments(filter, { limit: 1 });
    return count > 0;
  }

  async count(filter: Filter<DbDocument>): Promise<number> {
    return this.collection.countDocuments(filter);
  }

  async nextSequence(
    hospitalId: string,
    sequenceName: string,
  ): Promise<number> {
    const result = await this.collection.findOneAndUpdate(
      // Using the counter_sequences collection via a workaround:
      // Each repository that needs sequences will access the collection directly.
      // This is handled in the CounterRepository.
      { hospitalId, name: sequenceName } as Filter<DbDocument>,
      { $inc: { seq: 1 } } as UpdateFilter<DbDocument>,
      { upsert: true, returnDocument: "after" },
    );
    return (result as unknown as { seq: number } | null)?.seq ?? 1;
  }
}
