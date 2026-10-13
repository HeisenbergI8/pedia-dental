import type { Metadata } from "next";
import { OperatorLogin } from "@/features/operator/components/operator-login";

export const metadata: Metadata = { title: "Console sign-in · Primolar" };

export default function Page() {
  return <OperatorLogin />;
}
