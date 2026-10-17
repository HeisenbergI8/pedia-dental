import type { Metadata } from "next";
import { SetPasswordScreen } from "@/features/auth/components/set-password-screen";

export const metadata: Metadata = { title: "Set your password · Primolar" };

export default function SetPasswordPage() {
  return <SetPasswordScreen />;
}
