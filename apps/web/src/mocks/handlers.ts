import { appointmentHandlers } from "@/features/appointments/mocks";
import { clinicHandlers } from "@/features/clinic/mocks";
import { patientHandlers } from "@/features/patients/mocks";
import { photoHandlers } from "@/features/photos/mocks";
import { visitHandlers } from "@/features/visits/mocks";

/** Each feature owns its handlers. Register them here. */
export const handlers = [...patientHandlers, ...clinicHandlers, ...visitHandlers, ...appointmentHandlers, ...photoHandlers];
