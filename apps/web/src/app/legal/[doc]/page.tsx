import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_DOCUMENTS } from "@pedia/shared";
import { LegalDocumentView } from "@/features/legal/components/legal-document";
import { SignupFrame } from "@/features/signup/components/signup-frame";

/** Privacy #3: Primolar's three public documents. The notice and consent templates are the clinics'. */
const PUBLIC = { terms: LEGAL_DOCUMENTS.terms, dpa: LEGAL_DOCUMENTS.dpa, privacy: LEGAL_DOCUMENTS.privacy };
const isPublic = (doc: string): doc is keyof typeof PUBLIC => Object.hasOwn(PUBLIC, doc);

export const generateStaticParams = () => Object.keys(PUBLIC).map((doc) => ({ doc }));

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  return { title: isPublic(doc) ? `${PUBLIC[doc].title} · Primolar` : "Primolar" };
}

export default async function Page({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isPublic(doc)) notFound();
  return (
    <SignupFrame>
      <LegalDocumentView doc={PUBLIC[doc]} />
    </SignupFrame>
  );
}
