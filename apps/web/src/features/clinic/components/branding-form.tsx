"use client";
import { useRef, useState, type CSSProperties } from "react";
import { TriangleAlertIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import {
  BRAND_BACKGROUNDS,
  HEADING_FONT_LABEL,
  HexColor,
  HeadingFont,
  LOGO_RULES,
  TIER_LIMITS,
  brandColorProblem,
  deriveBrandPalette,
  logoProblem,
  suggestBrandColor,
  type ClinicAccount,
} from "@pedia/shared";
import { Loading } from "@/components/brand";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClinic, useRemoveLogo, useUpdateBranding, useUploadLogo } from "../api";
import { HEADING_FONT_VAR } from "../brand-css";
import { ClinicLogo } from "./clinic-logo";

const isHex = (value: string) => HexColor.safeParse(value).success;
const DEFAULT_FONT = "default"; // Radix Select can't hold "": this stands for "no heading font, the app's own"

/** The clinic's look (decisions #28–#31): logo, one brand colour checked against AA, and on Big a heading font. */
export function BrandingForm() {
  const clinic = useClinic().data;
  if (!clinic) return <Loading compact label="Loading your clinic's look" />;
  // Keyed so a saved change (or another tab's) resets the drafts to what the account now holds.
  return <BrandingFields key={`${clinic.account.brandColor}-${clinic.account.headingFont}`} account={clinic.account} hasLogo={!!clinic.logoUrl} />;
}

function BrandingFields({ account, hasLogo }: { account: ClinicAccount; hasLogo: boolean }) {
  const [color, setColor] = useState(account.brandColor);
  const [font, setFont] = useState<string>(account.headingFont ?? DEFAULT_FONT);
  const save = useUpdateBranding();
  const problem = brandColorProblem(color);
  const suggestion = problem && isHex(color) ? suggestBrandColor(color) : undefined;
  const fontsAllowed = TIER_LIMITS[account.tier].headingFont;
  const changed = color.toLowerCase() !== account.brandColor || font !== (account.headingFont ?? DEFAULT_FONT);

  function submit() {
    save.mutate(
      { brandColor: color, headingFont: font === DEFAULT_FONT ? null : HeadingFont.parse(font) },
      { onSuccess: () => toast.success("Your clinic's look is saved") },
    );
  }

  return (
    <SectionCard title="Look" description="Your logo and colour replace Primolar's across the staff app, the parent portal, receipts and documents.">
      <LogoField hasLogo={hasLogo} />

      <div className="space-y-3 border-t border-line pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="brand-color">Brand colour</Label>
          <p id="brand-color-hint" className="text-sm text-ink-muted">
            Used for buttons, links and highlights. Lighter shades and the dark-mode version are worked out from it.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="Pick a brand colour"
              value={isHex(color) ? color.toLowerCase() : account.brandColor}
              onChange={(e) => setColor(e.target.value)}
              className="size-(--control-h) shrink-0 cursor-pointer rounded-md border border-control-border bg-surface p-1"
            />
            <Input
              id="brand-color"
              value={color}
              onChange={(e) => setColor(e.target.value.trim())}
              aria-describedby="brand-color-hint"
              aria-invalid={!!problem}
              spellCheck={false}
              className="w-32 font-mono"
            />
          </div>
        </div>

        {problem && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-line bg-warning-bg p-3 text-sm text-warning">
            <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
            <p className="min-w-48 flex-1">{problem}</p>
            {suggestion && (
              <Button type="button" size="sm" variant="outline" onClick={() => setColor(suggestion)}>
                <span aria-hidden className="size-4 rounded-sm border border-line" style={{ background: suggestion }} /> Use {suggestion}
              </Button>
            )}
          </div>
        )}

        {!problem && <BrandPreview color={color} />}
      </div>

      <div className="space-y-1.5 border-t border-line pt-4">
        <Label htmlFor="heading-font">Heading font</Label>
        <p id="heading-font-hint" className="text-sm text-ink-muted">
          {fontsAllowed ? "For page titles and your clinic's name. Body text stays easy to read." : "Heading fonts come with the Big plan. Contact Primolar to upgrade."}
        </p>
        <Select value={font} onValueChange={setFont} disabled={!fontsAllowed && !account.headingFont}>
          <SelectTrigger id="heading-font" aria-describedby="heading-font-hint" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_FONT}>Primolar default</SelectItem>
            {HeadingFont.options.map((f) => (
              // After a downgrade the current font stays choosable; others need Big (decision #9).
              <SelectItem key={f} value={f} disabled={!fontsAllowed && f !== account.headingFont} style={{ fontFamily: `var(${HEADING_FONT_VAR[f]})` }}>
                {HEADING_FONT_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

/**
 * The colour before it is saved, in both themes: a button, a link and a selected chip, painted from the derived
 * palette. Inline style on purpose: the colour isn't the account's yet, so the tokens can't show it.
 */
function BrandPreview({ color }: { color: string }) {
  const palette = deriveBrandPalette(color);
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Preview">
      {(["light", "dark"] as const).map((theme) => {
        const p = palette[theme];
        const bg = BRAND_BACKGROUNDS[theme];
        const frame: CSSProperties = { background: bg.surface, color: bg["ink-muted"] };
        return (
          <div key={theme} className="space-y-3 rounded-lg border border-line p-4 text-sm" style={frame}>
            <p className="text-xs font-semibold tracking-wide uppercase">{theme === "light" ? "Light" : "Dark"}</p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-md px-3 py-1.5 font-semibold" style={{ background: p.brand, color: p["brand-ink"] }}>
                Book visit
              </span>
              <span className="font-semibold underline underline-offset-4" style={{ color: p.brand }}>
                View chart
              </span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: p["brand-subtle"], color: p["brand-tint-ink"] }}>
                Selected
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
