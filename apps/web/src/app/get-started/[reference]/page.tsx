import type { Metadata } from "next";
import { SignupStatusScreen } from "@/features/signup/components/signup-status-screen";

export const metadata: Metadata = { title: "Your sign-up · Primolar" };

export default async function Page({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <SignupStatusScreen reference={decodeURIComponent(reference)} />;
}
