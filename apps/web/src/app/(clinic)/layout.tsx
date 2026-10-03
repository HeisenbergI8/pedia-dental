import { AppShell } from "@/components/app-shell";
import { RequireSession } from "@/features/auth/components/access-gate";

export default function ClinicLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession area="clinic">
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}
