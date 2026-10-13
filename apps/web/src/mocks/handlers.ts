import { appointmentHandlers } from "@/features/appointments/mocks";
import { authHandlers } from "@/features/auth/mocks";
import { billingHandlers } from "@/features/billing/mocks";
import { chartHandlers } from "@/features/chart/mocks";
import { clinicHandlers } from "@/features/clinic/mocks";
import { dashboardHandlers } from "@/features/dashboard/mocks";
import { documentHandlers } from "@/features/documents/mocks";
import { growthHandlers } from "@/features/growth/mocks";
import { messageHandlers } from "@/features/messages/mocks";
import { noteHandlers } from "@/features/notes/mocks";
import { operatorHandlers } from "@/features/operator/mocks";
import { operatorSignupHandlers } from "@/features/operator/signup-mocks";
import { patientHandlers } from "@/features/patients/mocks";
import { photoHandlers } from "@/features/photos/mocks";
import { planHandlers } from "@/features/plan/mocks";
import { recallHandlers } from "@/features/recalls/mocks";
import { signupHandlers } from "@/features/signup/mocks";
import { visitHandlers } from "@/features/visits/mocks";
import { accessGate } from "./access";

/**
 * Each feature owns its handlers. Register them here, and give each route a rule in access.ts.
 * The access gate must stay first: it answers 401 / 403 before any feature handler runs.
 */
export const handlers = [
  accessGate,
  ...authHandlers,
  ...operatorHandlers,
  ...operatorSignupHandlers,
  ...signupHandlers,
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
