import { z } from "zod";

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** Every record belongs to a clinic, so the app can serve more than one later. */
export const ClinicScoped = z.object({ clinicId: Id });

/** Calendar date, YYYY-MM-DD. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Full timestamp, ISO 8601. */
export const IsoDateTime = z.string().datetime({ offset: true });

/** Money is always integer centavos. Never floats. */
export const Centavos = z.number().int();
export type Centavos = z.infer<typeof Centavos>;

export const Role = z.enum(["admin", "dentist", "front_desk", "parent"]);
export type Role = z.infer<typeof Role>;
