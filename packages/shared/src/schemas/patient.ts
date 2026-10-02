import { z } from "zod";
import { ClinicScoped, Id, IsoDate, IsoDateTime } from "./common";

export const Sex = z.enum(["male", "female"]);

export const Guardian = z.object({
  id: Id,
  fullName: z.string().min(1),
  relationship: z.string().min(1), // mother, father, grandparent, legal guardian…
  phone: z.string().min(7),
  email: z.string().email().optional(),
  isPrimary: z.boolean(),
});
export type Guardian = z.infer<typeof Guardian>;

export const Patient = ClinicScoped.extend({
  id: Id,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  birthDate: IsoDate,
  sex: Sex,
  address: z.string().optional(),
  guardians: z.array(Guardian).min(1),
  emergencyContact: z.object({ name: z.string(), phone: z.string() }).optional(),
  allergies: z.array(z.string()),
  medicalConditions: z.array(z.string()),
  medications: z.array(z.string()),
  alerts: z.array(z.string()), // shown as a banner on every screen for this child
  createdAt: IsoDateTime,
});
export type Patient = z.infer<typeof Patient>;

export const CreatePatientInput = Patient.omit({ id: true, clinicId: true, createdAt: true });
export type CreatePatientInput = z.infer<typeof CreatePatientInput>;
