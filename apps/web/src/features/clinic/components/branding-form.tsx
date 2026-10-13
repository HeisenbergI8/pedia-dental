"use client";
import { useRef, useState } from "react";
import { UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { LOGO_RULES, brandColorProblem, logoProblem, type ClinicAccount, type HeadingFont } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { useClinic, useRemoveLogo, useUpdateBranding, useUploadLogo } from "../api";
import { BrandColorField, HeadingFontSelect } from "./brand-fields";
import { ClinicLogo } from "./clinic-logo";


/** The clinic's look (decisions #28–#31): logo, one brand colour checked against AA, and a heading font (every plan, billing #8). */
export function BrandingForm() {
  const clinic = useClinic().data;
  if (!clinic) return <Loading compact label="Loading your clinic's look" />;
  // Keyed so a saved change (or another tab's) resets the drafts to what the account now holds.
  return <BrandingFields key={`${clinic.account.brandColor}-${clinic.account.headingFont}`} account={clinic.account} hasLogo={!!clinic.logoUrl} />;
}

function BrandingFields({ account, hasLogo }: { account: ClinicAccount; hasLogo: boolean }) {
  const [color, setColor] = useState(account.brandColor);
  const [font, setFont] = useState<HeadingFont | null>(account.headingFont ?? null);
  const save = useUpdateBranding();
  const problem = brandColorProblem(color);
  const changed = color.toLowerCase() !== account.brandColor || font !== (account.headingFont ?? null);

  function submit() {
    save.mutate({ brandColor: color, headingFont: font }, { onSuccess: () => toast.success("Your clinic's look is saved") });
  }

  return (
    <SectionCard title="Look" description="Your logo and colour replace Primolar's across the staff app, the parent portal, receipts and documents.">
      <LogoField hasLogo={hasLogo} />

      <div className="border-t border-line pt-4">
        <BrandColorField id="brand-color" value={color} onChange={setColor} fallback={account.brandColor} />
      </div>
      <div className="border-t border-line pt-4">
        <HeadingFontSelect id="heading-font" value={font} onChange={setFont} />
      </div>

      {save.error && <p className="text-sm text-danger">{save.error.message}</p>}
      <Button type="button" onClick={submit} disabled={!!problem || !changed || save.isPending}>
        {save.isPending ? "Saving" : "Save look"}
      </Button>
    </SectionCard>
  );
}

/** The current logo, upload (checked before sending) and remove. With no logo, the clinic's name shows instead. */
function LogoField({ hasLogo }: { hasLogo: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const [error, setError] = useState<string>();

  function choose(file: File | undefined) {
    if (!file) return;
    const problem = logoProblem(file);
    if (problem) return setError(problem);
    setError(undefined);
    upload.mutate(file, { onSuccess: () => toast.success("Logo updated"), onError: (e) => setError(e.message) });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Logo</p>
      <div className="flex min-h-16 items-center rounded-lg border border-line bg-ground/60 p-3">
        <ClinicLogo className="w-48" />
      </div>
      {!hasLogo && <p className="text-sm text-ink-muted">No logo yet: your clinic&apos;s name shows instead.</p>}
      <p id="logo-hint" className="text-sm text-ink-muted">PNG, JPG or SVG, up to 1 MB. A wide logo on a white or clear background works best.</p>
      <input
        ref={input}
        type="file"
        accept={LOGO_RULES.types.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          choose(e.target.files?.[0]);
          e.target.value = ""; // the same file can be chosen again after an error
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" aria-describedby="logo-hint" disabled={upload.isPending} onClick={() => input.current?.click()}>
          <UploadIcon aria-hidden /> {upload.isPending ? "Uploading" : hasLogo ? "Replace logo" : "Upload logo"}
        </Button>
        {hasLogo && (
          <Button type="button" variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => toast.success("Logo removed") })}>
            Remove logo
          </Button>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
