import { Injectable } from "@nestjs/common";

/** Which patient a record belongs to: undefined for an unknown id (or another clinic's: the lookup is tenant-scoped). */
export type RecordOwner = (id: string) => Promise<string | undefined>;

/**
 * `owner: "record"` routes' lookups, by rule path (decision 2, B7). The feature owning the table registers one in
 * onModuleInit; the guard asks only for an own-scope caller (a parent). A record route without one stays refused for
 * parents (fail closed); test/int/parent-ownership.int.test.ts proves every route a parent can pass has one (B11 E12).
 */
@Injectable()
export class RecordOwners {
  private readonly owners = new Map<string, RecordOwner>();
  register(path: string, owner: RecordOwner): void {
    if (this.owners.has(path)) throw new Error(`A record owner for ${path} is already registered.`);
    this.owners.set(path, owner);
  }
  has(path: string): boolean {
    return this.owners.has(path);
  }
  async of(path: string, id: string | undefined): Promise<string | undefined> {
    const owner = this.owners.get(path);
    return owner && id ? owner(id) : undefined;
  }
}
