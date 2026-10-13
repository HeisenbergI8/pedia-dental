import { SignupDetail } from "@/features/operator/components/signup-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SignupDetail id={id} />;
}
