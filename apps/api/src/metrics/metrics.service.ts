import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { BACKGROUND } from "../jobs/job-runner";
import { PrismaService } from "../prisma/prisma.service";

export const NAMESPACE = "Primolar/API";
/** The load test's routes (CHUNKS B13: Today, patient list, booking), by Express route template: never a raw URL. */
export const TRACKED_ROUTES: ReadonlySet<string> = new Set([
  "GET /api/reports/today",
  "GET /api/patient-summaries", // the patient list screen (usePatientPage); B13c1 load target
  "GET /api/patients", // the search box and the booking pickers (?q=); B13c1 load target
  "POST /api/appointments",
]);
/** EMF takes at most 100 values per metric per line. */
const MAX_SAMPLES = 100;

/**
 * B13a decision E6: application metrics as CloudWatch Embedded Metric Format lines on stdout (no agent, no SDK, no
 * vendor). Only what the ALB can't see: per-route latency for the load test's routes, unhandled errors, the outbox backlog.
 */
@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly log = new Logger(MetricsService.name);
  private requests = 0;
  private serverErrors = 0;
  private unhandled = 0;
  private samples = new Map<string, { seen: number; values: number[] }>();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BACKGROUND) private readonly background: boolean,
  ) {}

  /** One finished request. `route` is `METHOD /api/template`, or undefined when nothing matched (a 404). */
  observe(route: string | undefined, status: number, ms: number): void {
    this.requests += 1;
    if (status >= 500) this.serverErrors += 1;
    if (!route || !TRACKED_ROUTES.has(route)) return;
    const s = this.samples.get(route) ?? { seen: 0, values: [] };
    s.seen += 1;
    // Reservoir sampling: a fair 100 of however many came in this interval.
    if (s.values.length < MAX_SAMPLES) s.values.push(Math.round(ms));
    else {
      const slot = Math.floor(Math.random() * s.seen);
      if (slot < MAX_SAMPLES) s.values[slot] = Math.round(ms);
    }
    this.samples.set(route, s);
  }

  /** An error nothing handled: HttpErrorFilter's 500s and the process handlers. */
  countUnhandled(): void {
    this.unhandled += 1;
  }

  /** Main.ts only, from METRICS_INTERVAL_S. Tests call flush() themselves. */
  start(intervalS: number): void {
    if (intervalS > 0) this.timer = setInterval(() => void this.flush(), intervalS * 1000).unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    if (this.timer) await this.flush();
  }

  /** Writes the interval's lines and starts a new interval. Returns them for tests. */
  async flush(now = new Date()): Promise<Record<string, unknown>[]> {
    const totals: Record<string, number> = { Requests: this.requests, ServerErrors: this.serverErrors, UnhandledErrors: this.unhandled };
    if (this.background) Object.assign(totals, await this.outboxBacklog(now));
    const lines = [emf(now, ["Service"], { Service: "api" }, totals)];
    for (const [route, s] of this.samples) lines.push(emf(now, ["Service", "Route"], { Service: "api", Route: route }, { LatencyMs: s.values }));
    this.requests = this.serverErrors = this.unhandled = 0;
    this.samples = new Map();
    for (const line of lines) this.log.log(line, "metrics");
    return lines;
  }

  /** Only the instance that runs the outbox worker reports it (BACKGROUND_WORK), so N tasks don't report N copies. */
  private async outboxBacklog(now: Date): Promise<{ OutboxDue: number; OutboxOldestSeconds: number }> {
    const [row] = await this.prisma.$queryRaw<{ due: bigint | number; oldest: Date | null }[]>`
      SELECT COUNT(*) AS due, MIN(availableAt) AS oldest FROM OutboxMessage WHERE status = 'pending' AND availableAt <= ${now}`;
    const oldest = row?.oldest ? Math.max(0, Math.round((now.getTime() - row.oldest.getTime()) / 1000)) : 0;
    return { OutboxDue: Number(row?.due ?? 0), OutboxOldestSeconds: oldest };
  }
}

const UNITS: Record<string, string> = { LatencyMs: "Milliseconds", OutboxOldestSeconds: "Seconds" };

/** One EMF document: https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html */
function emf(now: Date, dimensions: string[], values: Record<string, string>, metrics: Record<string, number | number[]>) {
  return {
    _aws: {
      Timestamp: now.getTime(),
      CloudWatchMetrics: [{ Namespace: NAMESPACE, Dimensions: [dimensions], Metrics: Object.keys(metrics).map((Name) => ({ Name, Unit: UNITS[Name] ?? "Count" })) }],
    },
    ...values,
    ...metrics,
  };
}
