/**
 * The clinic's time zone for the whole process (B7, E3). The shared rules the API runs unchanged read local time:
 * outsideClinicHours (getHours), findConflict's "h:mm a", todaySummary's and visitDays' day of a timestamp, and the
 * seed's setHours. Node re-reads TZ when it is assigned, so this must run before any of them: import it first.
 * Philippine time has no daylight saving, so the offset is always +08:00.
 */
export const CLINIC_TIME_ZONE = "Asia/Manila";
process.env.TZ = CLINIC_TIME_ZONE;
