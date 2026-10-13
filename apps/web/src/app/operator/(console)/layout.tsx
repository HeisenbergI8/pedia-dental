import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OperatorShell, RequireOperator } from "@/features/operator/components/operator-shell";

export const metadata: Metadata = { title: "Console · Primolar" };

export default function OperatorLayout({ children }: { children: ReactNode }) {
  return (
    <RequireOperator>
      <OperatorShell>{children}</OperatorShell>
    </RequireOperator>
  );
}
