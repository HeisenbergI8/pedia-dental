import { AppointmentCalendar } from "@/features/appointments/components/appointment-calendar";
import { AppointmentRequests } from "@/features/appointments/components/appointment-requests";

export default function Page() {
  return (
    <div className="space-y-5">
      <AppointmentRequests />
      <AppointmentCalendar />
    </div>
  );
}
