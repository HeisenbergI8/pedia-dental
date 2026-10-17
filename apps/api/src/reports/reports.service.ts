import { BadRequestException, Injectable } from "@nestjs/common";
import { FinanceSummary, TodaySummary, summarizeFinance, todaySummary, unpaidSince, type Payment } from "@pedia/shared";
import { addDays, format, isValid, parseISO, startOfWeek } from "date-fns";
import { AppointmentRecordsService } from "../appointments/appointment-records.service";
import { AppointmentRequestsService } from "../appointments/appointment-requests.service";
import { BillingRecordsService } from "../billing-records/billing-records.service";
import { byStartThenChair } from "../appointments/appointment.rows";
import type { ClinicIdentity } from "../auth/identity.service";
import { ClinicService } from "../clinic/clinic.service";
import { Clock } from "../common/clock";
import { refuse } from "../common/refusal";
import { requireContext } from "../common/request-context";
import { PatientsService } from "../patients/patients.service";
import { VisitDaysService } from "../visits/visit-days.service";
import { reportBranches } from "./report-branches";

const DAY = /^\d{4}-\d{2}-\d{2}$/; // dashboard/mocks.ts:12
/** The clinic day's start as an instant: Manila midnight (E3), whatever the process zone. */
const manilaMidnight = (day: string) => new Date(`${day}T00:00:00+08:00`);
/** The shape, and a real calendar day: 2026-02-30 would throw in date-fns (a 500) where a 400 is meant. */
const BAD_DAY = "today must be YYYY-MM-DD";
const isDay = (day: string) => DAY.test(day) && isValid(parseISO(day)) && format(parseISO(day), "yyyy-MM-dd") === day;

/**
 * features/dashboard/mocks.ts:38–47: todaySummary over the branches' share of the account, computed on every request.
 * Not audited (decision 6). The inputs are narrowed to what the summary can use: today's appointments, the week's
 * patients' visit days, the pending requests, every patient's name and birthday.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly records: AppointmentRecordsService,
    private readonly visitDays: VisitDaysService,
    private readonly patients: PatientsService,
    private readonly clinic: ClinicService,
    private readonly requests: AppointmentRequestsService,
    private readonly billing: BillingRecordsService,
    private readonly clock: Clock,
  ) {}

  /**
   * GET /reports/finance (dashboard/mocks.ts:29–36): 400 day → 403 branches → summarizeFinance over SQL facts (E7).
   * Not audited (B8 question 4).
   */
  async finance(who: ClinicIdentity, day: string | undefined, branch: string | undefined): Promise<FinanceSummary> {
    const today = day ?? this.clock.today();
    if (!isDay(today)) throw new BadRequestException(BAD_DAY);
    const branchIds = await this.branchesFor(who, branch);
    const done = (await this.records.inWindow(branchIds, manilaMidnight(unpaidSince(today)), addDays(manilaMidnight(today), 1))).filter((a) => a.status === "done");
    return FinanceSummary.parse(summarizeFinance(await this.billing.financeFacts(branchIds, today, done), today));
  }

  /**
   * GET /payments: the day's collections (billing/mocks.ts:97–106), payments and refunds received on the clinic's day
   * at the device's branch or the ?branch= one. Branches first, as the mock; an unparsable date lists nothing (its
   * string compare). Not audited (B8 question 4).
   */
  async collections(who: ClinicIdentity, date: string | undefined, branch: string | undefined): Promise<Payment[]> {
    const day = date ?? this.clock.today();
    const branchIds = await this.branchesFor(who, branch);
    if (!isDay(day)) return [];
    return this.billing.paymentsBetween(branchIds, manilaMidnight(day), addDays(manilaMidnight(day), 1));
  }

  /** GET /reports/today: 400 day → 403 branches → the summary. */
  async today(who: ClinicIdentity, day: string | undefined, branch: string | undefined): Promise<TodaySummary> {
    const today = day ?? this.clock.today();
    if (!isDay(today)) throw new BadRequestException(BAD_DAY);
    const branchIds = await this.branchesFor(who, branch);
    const monday = format(startOfWeek(parseISO(today), { weekStartsOn: 1 }), "yyyy-MM-dd");
    const [from, to] = [manilaMidnight(today), addDays(manilaMidnight(today), 1)];
    const [todays, weekDone, weekVisitors, patients, staff, pending, refs] = await Promise.all([
      this.records.inWindow(branchIds, from, to),
      this.records.inWindow(branchIds, manilaMidnight(monday), to).then((xs) => xs.filter((a) => a.status === "done")),
      this.visitDays.visitorsBetween(monday, today),
      this.patients.basics(),
      this.clinic.staffNames(),
      this.requests.pending(),
      this.clinic.scheduleRefs(),
    ]);
    // The week's patients: visitMix counts only their days, and "new" needs each one's whole history (visits + done).
    const week = [...new Set([...weekVisitors, ...weekDone.map((a) => a.patientId)])];
    const facts = await this.visitDays.facts(week, branchIds);
    // Today's done appointments are in both lists: one row each.
    const appointments = [...new Map([...todays, ...facts.done].map((a) => [a.id, a])).values()].sort(byStartThenChair(refs.chairOrder));
    return TodaySummary.parse(todaySummary({ patients, staff, appointments, appointmentRequests: pending, visits: facts.visits, messages: [] }, today));
  }

  /** reportBranches with this caller's tier, roles, device branch and usable branches; a refusal is thrown as is. */
  private async branchesFor(who: ClinicIdentity, asked: string | undefined): Promise<string[]> {
    const [every, tier] = await Promise.all([this.clinic.branches(), this.clinic.tier()]);
    const device = every.find((b) => b.id === requireContext().branchId)!;
    const answer = reportBranches(asked, device, tier, who.user.roles, who.branches, every);
    if (!Array.isArray(answer)) refuse(answer);
    return answer as string[];
  }
}
