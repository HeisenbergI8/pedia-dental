import { appointmentHandlers } from "@/features/appointments/mocks";
import { chartHandlers } from "@/features/chart/mocks";
import { clinicHandlers } from "@/features/clinic/mocks";
import { growthHandlers } from "@/features/growth/mocks";
import { noteHandlers } from "@/features/notes/mocks";
import { patientHandlers } from "@/features/patients/mocks";
import { photoHandlers } from "@/features/photos/mocks";
import { planHandlers } from "@/features/plan/mocks";
import { visitHandlers } from "@/features/visits/mocks";

/** Each feature owns its handlers. Register them here. */
export const handlers = [
  ...patientHandlers,
  ...clinicHandlers,
  ...visitHandlers,
  ...chartHandlers,
  ...noteHandlers,
  ...growthHandlers,
  ...planHandlers,
  ...appointmentHandlers,
  ...photoHandlers,
];
