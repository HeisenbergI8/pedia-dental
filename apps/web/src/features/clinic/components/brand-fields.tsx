"use client";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ImageIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import {
  BRAND_BACKGROUNDS,
  HEADING_FONT_LABEL,
  HeadingFont,
  HexColor,
  brandColorProblem,
  deriveBrandPalette,
  suggestBrandColor,
} from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HEADING_FONT_VAR } from "../brand-css";

const isHex = (value: string) => HexColor.safeParse(value).success;
const DEFAULT_FONT = "default"; // Radix Select can't hold "": this stands for "no heading font, the app's own"

/**
 * One brand colour (decision #29, billing #19): a picker and its hex, the AA refusal with the nearest colour that
 * passes, and a two-theme preview once it passes. Controlled; `fallback` is what the swatch shows while the hex is
 * half-typed. Used by Settings → Look, the sign-up's Use my own and the console's Set branding.
 */
export function BrandColorField({ id, value, onChange, fallback }: { id: string; value: string; onChange: (hex: string) => void; fallback: string }) {
  const problem = brandColorProblem(value);
  const suggestion = problem && isHex(value) ? suggestBrandColor(value) : undefined;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={id}>Brand colour</Label>
        <p id={`${id}-hint`} className="text-sm text-ink-muted">
          Used for buttons, links and highlights. Lighter shades and the dark-mode version are worked out from it.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Pick a brand colour"
            value={isHex(value) ? value.toLowerCase() : fallback}
            onChange={(e) => onChange(e.target.value)}
            className="size-(--control-h) shrink-0 cursor-pointer rounded-md border border-control-border bg-surface p-1"
          />
          <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
            aria-describedby={`${id}-hint`}
            aria-invalid={!!problem}
            spellCheck={false}
            className="w-32 font-mono"
          />
        </div>
      </div>
      {problem ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning-line bg-warning-bg p-3 text-sm text-warning">
          <TriangleAlertIcon className="size-4 shrink-0" aria-hidden />
          <p className="min-w-48 flex-1">{problem}</p>
          {suggestion && (
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(suggestion)}>
              <span aria-hidden className="size-4 rounded-sm border border-line" style={{ background: suggestion }} /> Use {suggestion}
            </Button>
          )}
        </div>
      ) : (
        <BrandPreview color={value} />
      )}
    </div>
  );
}

/** The shortlist (platform #53), on every plan (billing #8). `allowDefault` offers "Primolar default" (null). */
export function HeadingFontSelect({
  id,
  value,
  onChange,
  allowDefault = true,
}: {
  id: string;
  value: HeadingFont | null;
  onChange: (font: HeadingFont | null) => void;
  allowDefault?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Heading font</Label>
      <p id={`${id}-hint`} className="text-sm text-ink-muted">For page titles and the clinic&apos;s name. Body text stays easy to read.</p>
      <Select value={value ?? (allowDefault ? DEFAULT_FONT : undefined)} onValueChange={(v) => onChange(v === DEFAULT_FONT ? null : HeadingFont.parse(v))}>
        <SelectTrigger id={id} aria-describedby={`${id}-hint`} className="w-full sm:w-64">
          <SelectValue placeholder="Choose a font" />
        </SelectTrigger>
        <SelectContent>
          {allowDefault && <SelectItem value={DEFAULT_FONT}>Primolar default</SelectItem>}
          {HeadingFont.options.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: `var(${HEADING_FONT_VAR[f]})` }}>
              {HEADING_FONT_LABEL[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Files held until the form is sent (a logo, or up to three reference images), each with a preview and a remove
 * button. `problemOf` is the shared rule (logoProblem, referenceImagesProblem), checked before anything is kept.
 */
export function ImagePicker({
  id,
  label,
  hint,
  accept,
  max,
  files,
  onChange,
  problemOf,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  accept: string[];
  max: number;
  files: File[];
  onChange: (files: File[]) => void;
  problemOf: (files: File[]) => string | undefined;
  error?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string>();
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  function add(chosen: File[]) {
    // Too many at once keeps what fits and says so, rather than dropping the lot.
    const room = max === 1 ? 1 : max - files.length;
    const kept = chosen.slice(0, room);
    const next = max === 1 ? kept : [...files, ...kept];
    const why = problemOf(next);
    if (why) return setProblem(why);
    setProblem(chosen.length > room ? `Only the first ${room} ${room === 1 ? "was" : "were"} kept: up to ${max} in all` : undefined);
    onChange(next);
  }

  const message = problem ?? error;
  return (
    <div className="space-y-2">
      <p id={`${id}-label`} className="text-sm font-semibold">{label}</p>
      <p id={`${id}-hint`} className="text-sm text-ink-muted">{hint}</p>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="relative flex h-20 w-32 items-center justify-center rounded-lg border border-line bg-ground/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL, not an optimisable asset */}
              <img src={urls[i]} alt={f.name} className="max-h-full max-w-full object-contain" />
              <Button type="button" size="icon" variant="ghost" className="absolute -top-2 -right-2 size-7 rounded-full bg-surface" aria-label={`Remove ${f.name}`} onClick={() => (setProblem(undefined), onChange(files.filter((_, j) => j !== i)))}>
                <XIcon aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        id={id}
        type="file"
        accept={accept.join(",")}
        multiple={max > 1}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          add([...(e.target.files ?? [])]);
          e.target.value = ""; // the same file can be chosen again after an error
        }}
      />
      {files.length < max && (
        <Button type="button" variant="outline" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} onClick={() => input.current?.click()}>
          <ImageIcon aria-hidden /> {max === 1 ? "Choose file" : "Add images"}
        </Button>
      )}
      {message && <p role="alert" className="text-sm text-danger">{message}</p>}
    </div>
  );
}

/**
 * The colour before it is saved, in both themes: a button, a link and a selected chip, painted from the derived
 * palette. Inline style on purpose: the colour isn't the account's yet, so the tokens can't show it (CONVENTIONS).
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
              <span className="rounded-md px-3 py-1.5 font-semibold" style={{ background: p.brand, color: p["brand-ink"] }}>Book visit</span>
              <span className="font-semibold underline underline-offset-4" style={{ color: p.brand }}>View chart</span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: p["brand-subtle"], color: p["brand-tint-ink"] }}>Selected</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
