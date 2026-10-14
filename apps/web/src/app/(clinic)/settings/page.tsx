import { Suspense } from "react";
import { ClinicPageLoading } from "@/features/clinic/components/clinic-logo";
import { SettingsScreen } from "@/features/clinic/components/settings-screen";

export default function SettingsPage() {
  // The open tab comes from the URL.
  return (
    <Suspense fallback={<ClinicPageLoading label="Loading settings" />}>
      <SettingsScreen />
    </Suspense>
  );
}
