import { RequireSession } from "@/features/auth/components/access-gate";
import { PortalShell } from "@/features/portal/components/portal-shell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession area="portal">
      <PortalShell>{children}</PortalShell>
    </RequireSession>
  );
}
