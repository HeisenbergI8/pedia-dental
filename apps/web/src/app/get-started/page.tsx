import type { Metadata } from "next";
import { GetStartedScreen } from "@/features/signup/components/get-started-screen";

export const metadata: Metadata = { title: "Get started · Primolar" };

export default function Page() {
  return <GetStartedScreen />;
}
