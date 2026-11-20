"use client";
import { ComparePlansLink } from "@/features/plans/components/compare-plans-link";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  DENTIST_LINE_NOTE, LETTERHEAD_IMAGE_RULES, TIER_LIMITS, UpdateLetterheadInput, branchLine, deriveBrandPalette, imageProblem, letterheadLines,
  type ClinicContext, type LetterheadMode, type LetterheadSettings, type Tier,
} from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DocContent } from "@/features/documents/content";
import { DocumentPreview } from "@/features/documents/components/document-preview";
import { letterheadImageUrl, useClinic, useLetterhead, useRemoveLetterheadImage, useSaveLetterhead, useUploadLetterheadImage } from "../api";

/** "Own text" on wider screens, "Text" on a phone: the three fit a 320 px screen (#41). The hidden one isn't read out. */
const ownLabel = (word: string) => (
  <>
    <span className="sm:hidden">{word}</span>
    <span className="hidden sm:inline">Own {word.toLowerCase()}</span>
  </>
);
const MODES: { value: LetterheadMode; label: ReactNode }[] = [
  { value: "standard", label: "Standard" },
  { value: "text", label: ownLabel("Text") },
  { value: "image", label: ownLabel("Image") },
];

/**
 * D11, decisions 22, 24, 25: how documents and receipts are headed. Standard (the logo and the branch's address) until
 * the Owner chooses otherwise; Clinic and Pro may add their own lines or upload a letterhead image. After a downgrade
 * the custom letterhead stays, can't be changed, and can be reset.
 */
export function LetterheadCard() {
  const clinic = useClinic();
  const letterhead = useLetterhead();
  if (letterhead.isLoading || clinic.isLoading) return <Loading compact label="Loading your letterhead" />;
  if (!letterhead.data || !clinic.data) return <ErrorState what="your letterhead" onRetry={() => void letterhead.refetch()} />;
  return <LetterheadFields key={JSON.stringify(letterhead.data)} saved={letterhead.data} clinic={clinic.data} />;
}

/** 8.5: a sample document headed by the draft, as documents will print it (the same DocumentPreview). */
function sample(clinic: ClinicContext, draft: LetterheadSettings, saved: LetterheadSettings): DocContent {
  const active = clinic.branches.find((b) => b.id === clinic.activeBranchId) ?? clinic.branches[0]!;
  const image = draft.mode === "image" && saved.imageUpdatedAt ? { imageUrl: letterheadImageUrl(saved.imageUpdatedAt) } : undefined;
  return {
    title: "Dental certificate",
    subtitle: "A sample, to show your letterhead",
    clinicName: clinic.account.name,
    fileName: "sample.pdf",
    letterhead: {
      clinicName: clinic.account.name,
      branchLine: branchLine(active),
      logoUrl: clinic.logoUrl,
      ring: deriveBrandPalette(clinic.account.brandColor).light["brand-ring"],
      custom: image ?? (draft.mode === "text" ? letterheadLines(draft, clinic.branches.map(branchLine)) : undefined),
    },
    blocks: [{ kind: "text", paragraphs: ["This is to certify that the child named here was seen and treated at this clinic."] }],
  };
}

function LetterheadFields({ saved, clinic }: { saved: LetterheadSettings; clinic: ClinicContext }) {
  const tier: Tier = clinic.account.tier;
  const save = useSaveLetterhead();
  const upload = useUploadLetterheadImage();
  const remove = useRemoveLetterheadImage();
  const [draft, setDraft] = useState(saved);
  const [fileError, setFileError] = useState<string>();
  const allowed = TIER_LIMITS[tier].customLetterhead;
  const set = (patch: Partial<LetterheadSettings>) => setDraft((d) => ({ ...d, ...patch }));
  const blank = (v: string) => v.trim() || null;
  const error = save.error?.message ?? upload.error?.message ?? remove.error?.message;

  const submit = (mode: LetterheadMode = draft.mode) => {
    const input = UpdateLetterheadInput.safeParse({ ...draft, mode, socialLinks: draft.socialLinks.map((s) => s.trim()).filter(Boolean) });
    if (!input.success) return toast.error(input.error.issues[0]?.message ?? "Check the letterhead");
    save.mutate(input.data, { onSuccess: () => toast.success(mode === "standard" ? "Documents use the standard header" : "Letterhead saved") });
  };

  if (!allowed) {
    return (
      <SectionCard title="Letterhead" description="How your certificates, receipts and other documents are headed.">
        {saved.mode === "standard" ? (
          <p className="text-sm text-ink-muted">
            Your documents use the standard header with your logo and branch address. A custom letterhead is on the Clinic and Pro plans.{" "}
            <ComparePlansLink />
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>Your plan no longer includes a custom letterhead. Your documents keep the one you made; you can&apos;t change it, but you can go back to the standard header.</p>
            <Button variant="outline" disabled={save.isPending} onClick={() => submit("standard")}>Use the standard header</Button>
          </div>
        )}
      </SectionCard>
    );
  }

  return (
    <SectionCard title="Letterhead" description="How your certificates, receipts and other documents are headed. Nothing changes until you save.">
      <Segmented label="Letterhead" options={MODES} value={draft.mode} onChange={(mode) => set({ mode })} />

      {draft.mode === "standard" && <p className="text-sm text-ink-muted">Your logo and the branch&apos;s address, as every Primolar clinic starts with.</p>}

      {draft.mode === "text" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="lh-tagline" label="Tagline" value={draft.tagline ?? ""} onChange={(v) => set({ tagline: blank(v) })} hint="Under your logo, e.g. Gentle care for little teeth" />
          <TextField id="lh-dentist" label="Dentist line" value={draft.dentistLine ?? ""} onChange={(v) => set({ dentistLine: blank(v) })} hint={DENTIST_LINE_NOTE} />
          <TextField id="lh-footer" label="Footer note" value={draft.footerNote ?? ""} onChange={(v) => set({ footerNote: blank(v) })} hint="e.g. Open Saturdays, 8 AM to 5 PM" />
          <TextField
            id="lh-links"
            label="Social links"
            value={draft.socialLinks.join(", ")}
            onChange={(v) => set({ socialLinks: v.split(",").map((s) => s.trimStart()).slice(0, 3) })}
            hint="Up to 3, separated by commas"
          />
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox id="lh-branches" checked={draft.listBranches} onCheckedChange={(c) => set({ listBranches: c === true })} />
            <Label htmlFor="lh-branches" className="font-normal">List every open branch&apos;s address in the footer</Label>
          </div>
        </div>
      )}

      {draft.mode === "image" && (
        <div className="space-y-3">
          {saved.imageUpdatedAt ? (
            // eslint-disable-next-line @next/next/no-img-element -- served by the API, replaced by the Owner any time
            <img src={letterheadImageUrl(saved.imageUpdatedAt)} alt="Your letterhead" className="max-h-28 w-full rounded-md border border-line object-contain" />
          ) : (
            <p className="text-sm text-ink-muted">Upload your letterhead as one image. It goes across the top of every document, in place of the logo and address.</p>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="lh-image">{saved.imageUpdatedAt ? "Replace the image" : "Letterhead image"}</Label>
            <Input
              id="lh-image"
              type="file"
              accept={LETTERHEAD_IMAGE_RULES.types.join(",")}
              aria-describedby="lh-image-hint"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const problem = imageProblem(LETTERHEAD_IMAGE_RULES, file);
                setFileError(problem);
                if (!problem) upload.mutate(file, { onSuccess: () => toast.success("Letterhead image saved") });
                e.target.value = "";
              }}
            />
            <p id="lh-image-hint" className="text-sm text-ink-muted">PNG or JPG, up to 2 MB, a wide strip works best. It counts toward your storage.</p>
            {fileError && <p role="alert" className="text-sm text-danger">{fileError}</p>}
          </div>
          {saved.imageUpdatedAt && (
            <Button variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success("Letterhead image removed") })}>
              Remove the image
            </Button>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">Preview</h3>
        <DocumentPreview content={sample(clinic, draft, saved)} />
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {(draft.mode !== "image" || (saved.imageUpdatedAt && saved.mode !== "image")) && (
        <Button disabled={save.isPending || JSON.stringify(draft) === JSON.stringify(saved)} onClick={() => submit()}>
          {save.isPending ? "Saving" : "Save letterhead"}
        </Button>
      )}
    </SectionCard>
  );
}

function TextField({ id, label, value, onChange, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label} <span className="font-normal text-ink-muted">(optional)</span></Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-hint`} />
      <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>
    </div>
  );
}
