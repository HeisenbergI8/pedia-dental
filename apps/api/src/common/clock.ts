import { Injectable } from "@nestjs/common";

const MANILA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The calendar date at `at` in the Philippines, `yyyy-MM-dd` (en-CA formats it that way). */
export const manilaDate = (at: Date): string => MANILA_DATE.format(at);

/**
 * "Now" for the whole API, injected so tests can pin it (CONVENTIONS → Data). Port of apps/web/src/mocks/clock.ts.
 * Store `now()` as a UTC `DateTime`; use `today()` for due dates, grace periods and pauses (`@db.Date`).
 */
export abstract class Clock {
  abstract now(): Date;
  today(): string {
    return manilaDate(this.now());
  }
}

@Injectable()
export class SystemClock extends Clock {
  now() {
    return new Date();
  }
}

/** Tests (and B1-b's harness): a clock that only moves when told to, like the mock's `setToday`. */
export class FixedClock extends Clock {
  constructor(private at: Date) {
    super();
  }
  now() {
    return new Date(this.at);
  }
  set(at: Date) {
    this.at = at;
  }
}
