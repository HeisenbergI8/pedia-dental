import { createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Clock } from "../common/clock";
import { PrismaService } from "../prisma/prisma.service";

/** Settled with the user (B2 "Decide first"): a shared clinic device signs out after 30 idle minutes, and every
 * session ends 8 hours after sign-in however active it is. Data, not `if` statements. */
export const SESSION_POLICY = { idleMinutes: 30, absoluteHours: 8 } as const;

const MINUTE = 60_000;
/** lastSeenAt moves at most once a minute: idle expiry stays accurate to a minute without a write per request. */
export const TOUCH_EVERY_MS = MINUTE;

/** What is stored: SHA-256 of the token, hex. A stolen database can't be replayed as cookies. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

type Times = { createdAt: Date; lastSeenAt: Date; expiresAt: Date };

/** Why a stored session no longer opens, or undefined while it does. */
export function sessionExpiry(s: Times, now: Date): "idle" | "absolute" | undefined {
  if (now.getTime() >= s.expiresAt.getTime()) return "absolute";
  if (now.getTime() - s.lastSeenAt.getTime() >= SESSION_POLICY.idleMinutes * MINUTE) return "idle";
  return undefined;
}

const SELECT_TIMES = { id: true, createdAt: true, lastSeenAt: true, expiresAt: true } as const;

/**
 * Server-side sessions (CONVENTIONS → Stateless instances): clinic sessions in `Session`, operator sessions in
 * `OperatorSession`, never one table for both (decision #25). Callers check passwords and PINs first (IdentityService).
 * Expired rows are deleted when they are next presented, and the rest by `sweepExpired` (AuthJobs, every 15 minutes).
 */
@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  private times() {
    const now = this.clock.now();
    return { createdAt: now, lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_POLICY.absoluteHours * 60 * MINUTE) };
  }

  /** Undefined (and the row deleted) when expired; else the row, its lastSeenAt moved if a minute has passed. */
  private async live<T extends Times & { id: string }>(row: T | null, touch: (id: string, at: Date) => Promise<unknown>, drop: (id: string) => Promise<unknown>) {
    if (!row) return undefined;
    const now = this.clock.now();
    if (sessionExpiry(row, now)) {
      await drop(row.id);
      return undefined;
    }
    if (now.getTime() - row.lastSeenAt.getTime() >= TOUCH_EVERY_MS) await touch(row.id, now);
    return row;
  }

  /** A new clinic session for a login that passed its checks. Returns the cookie's token: shown once, stored hashed. */
  async openClinic(clinicId: string, accountId: string): Promise<string> {
    const token = newToken();
    await this.prisma.session.create({ data: { tokenHash: hashToken(token), clinicId, accountId, ...this.times() }, select: { id: true } });
    return token;
  }

  async resolveClinic(token: string | undefined) {
    if (!token) return undefined;
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      select: { ...SELECT_TIMES, clinicId: true, accountId: true },
    });
    return this.live(
      row,
      (id, at) => this.prisma.session.updateMany({ where: { id }, data: { lastSeenAt: at } }),
      (id) => this.prisma.session.deleteMany({ where: { id } }),
    );
  }

  async closeClinic(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /** Every session of one login: after a password change, a deactivation or a suspension (B2c, B3, B12). */
  async closeAllFor(clinicId: string, accountId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { clinicId, accountId } });
  }

  async openOperator(operatorId: string): Promise<string> {
    const token = newToken();
    await this.prisma.operatorSession.create({ data: { tokenHash: hashToken(token), operatorId, ...this.times() }, select: { id: true } });
    return token;
  }

  async resolveOperator(token: string | undefined) {
    if (!token) return undefined;
    const row = await this.prisma.operatorSession.findUnique({ where: { tokenHash: hashToken(token) }, select: { ...SELECT_TIMES, operatorId: true } });
    return this.live(
      row,
      (id, at) => this.prisma.operatorSession.updateMany({ where: { id }, data: { lastSeenAt: at } }),
      (id) => this.prisma.operatorSession.deleteMany({ where: { id } }),
    );
  }

  async closeOperator(token: string): Promise<void> {
    await this.prisma.operatorSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /**
   * Deletes every expired clinic and operator session, by `sessionExpiry`'s rule (both limits are `>=`, so `lte`).
   * The one cross-clinic write on `Session` outside sign-in (CONVENTIONS → Decisions: identity tables). Indexed on
   * `expiresAt` and `lastSeenAt`.
   */
  async sweepExpired(): Promise<number> {
    const now = this.clock.now();
    const idleSince = new Date(now.getTime() - SESSION_POLICY.idleMinutes * MINUTE);
    const where = { OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: idleSince } }] };
    const [clinic, operator] = await Promise.all([this.prisma.session.deleteMany({ where }), this.prisma.operatorSession.deleteMany({ where })]);
    return clinic.count + operator.count;
  }
}
