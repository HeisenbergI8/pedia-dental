import type { Metadata } from "next";
import { PlansScreen } from "@/features/plans/components/plans-screen";

// D15, decision 23: public and indexable, like Get started.
export const metadata: Metadata = {
  title: "Primolar plans",
  description: "Starter, Clinic and Pro: what each plan includes and costs, for pediatric dental clinics.",
};

export default function Page() {
  return <PlansScreen />;
}
