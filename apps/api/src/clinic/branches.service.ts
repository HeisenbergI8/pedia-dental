import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Branch, BranchInput, archiveProblem } from "@pedia/shared";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { type Tx, runInTransaction } from "../prisma/transaction";
import { lockAccount } from "./account-lock";
import { assertRoomFor } from "./limits";

/** The contract's columns: never `position`. */
export const BRANCH_COLUMNS = { id: true, clinicId: true, name: true, address: true, phone: true, openingHours: true, archived: true } as const;
const Ids = z.array(z.string());

/**
 * The Owner's branch writes (features/clinic/mocks.ts, decision #22: archived, never deleted). Every write that checks a
 * rule first takes the clinic's lock (B3, Decision 4), so a limit or "last open branch" can't be raced past.
 */
@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** POST /branches: the limit first, so a full account says so whatever was typed; new branches go last. */
  create(body: unknown): Promise<Branch> {
    return runInTransaction(this.prisma, async (tx) => {
      const clinicId = await lockAccount(tx);
      await assertRoomFor(tx, clinicId, "branches");
      const input = new ZodValidationPipe(BranchInput).transform(body);
      const last = await tx.branch.findFirst({ orderBy: { position: "desc" }, select: { position: true } });
      const row = await tx.branch.create({ data: { ...clinicData(), ...input, archived: false, position: (last?.position ?? -1) + 1 }, select: BRANCH_COLUMNS });
      return Branch.parse(row);
    });
  }

  /** PUT /branches/:id: name, address, phone and hours. Archiving is its own action, never a field. */
  async update(id: string, body: unknown): Promise<Branch> {
    await this.find(this.prisma, id);
    const input = new ZodValidationPipe(BranchInput).transform(body);
    await this.prisma.branch.updateMany({ where: { id }, data: input });
    return this.find(this.prisma, id);
  }

  /** POST /branches/:id/archive: frees a branch slot (decision #10). Never the last open one, nor one that strands staff. */
  archive(id: string): Promise<Branch> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockAccount(tx);
      const branch = await this.find(tx, id);
      if (branch.archived) return branch;
      const branches = await tx.branch.findMany({ select: { id: true, archived: true } });
      const staff = (await tx.staff.findMany({ select: { fullName: true, isOwner: true, branchIds: true, deactivatedAt: true } })).map((s) => ({
        ...s, branchIds: Ids.parse(s.branchIds), deactivatedAt: s.deactivatedAt?.toISOString(),
      }));
      const problem = archiveProblem(branch, { branches, staff, upcoming: await this.upcomingAt(tx, id) });
      if (problem) throw new ConflictException(problem);
      await tx.branch.updateMany({ where: { id }, data: { archived: true } });
      return { ...branch, archived: true };
    });
  }

  /** POST /branches/:id/reopen: takes a branch slot again, so the limit applies. */
  reopen(id: string): Promise<Branch> {
    return runInTransaction(this.prisma, async (tx) => {
      const clinicId = await lockAccount(tx);
      const branch = await this.find(tx, id);
      if (!branch.archived) return branch;
      await assertRoomFor(tx, clinicId, "branches");
      await tx.branch.updateMany({ where: { id }, data: { archived: false } });
      return { ...branch, archived: false };
    });
  }

  /** This clinic's branch (the extension scopes it), or 404 in the mock's words. Another clinic's id reads as missing. */
  private async find(db: Pick<Tx, "branch">, id: string): Promise<Branch> {
    const row = await db.branch.findFirst({ where: { id }, select: BRANCH_COLUMNS });
    if (!row) throw new NotFoundException("Branch not found");
    return Branch.parse(row);
  }

  /**
   * Bookings still to happen at the branch (the mock's UPCOMING: booked, confirmed, arrived, in chair, from now on).
   * Appointments arrive in B7, which replaces this body; until then nothing is booked (B3, Decision 6).
   */
  private async upcomingAt(_tx: Tx, _branchId: string): Promise<number> {
    return 0;
  }
}
