import { Suspense } from "react";
import { PageLoading } from "@/components/brand";
import { AppointmentCalendar } from "@/features/appointments/components/appointment-calendar";
import { AppointmentRequests } from "@/features/appointments/components/appointment-requests";

export default function Page() {
  return (
    <div className="space-y-5">
      <AppointmentRequests />
      {/* The calendar reads its date and view from the URL. */}
      <Suspense fallback={<PageLoading label="Loading the calendar" />}>
        <AppointmentCalendar />
      </Suspense>
    </div>
  );
}
