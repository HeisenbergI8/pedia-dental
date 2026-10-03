import { appointmentHandlers } from "@/features/appointments/mocks";
import { billingHandlers } from "@/features/billing/mocks";
import { chartHandlers } from "@/features/chart/mocks";
import { clinicHandlers } from "@/features/clinic/mocks";
import { dashboardHandlers } from "@/features/dashboard/mocks";
import { documentHandlers } from "@/features/documents/mocks";
import { growthHandlers } from "@/features/growth/mocks";
import { messageHandlers } from "@/features/messages/mocks";
import { noteHandlers } from "@/features/notes/mocks";
import { patientHandlers } from "@/features/patients/mocks";
import { photoHandlers } from "@/features/photos/mocks";
import { planHandlers } from "@/features/plan/mocks";
import { recallHandlers } from "@/features/recalls/mocks";
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
  ...recallHandlers,
  ...billingHandlers,
  ...messageHandlers,
  ...documentHandlers,
  ...dashboardHandlers,
];
