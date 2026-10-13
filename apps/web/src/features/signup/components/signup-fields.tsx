"use client";
import type { ReactNode } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import {
  BRANDING_CHOICE_LABEL,
  BrandingChoice,
  DEFAULT_BRAND_COLOR,
  DEFAULT_OPENING_HOURS,
  LOGO_RULES,
  REFERENCE_IMAGE_RULES,
  TIER_LABEL,
  TIER_LIMITS,
  Tier,
  duplicateField,
  formatPeso,
  formatTin,
  logoProblem,
  referenceImagesProblem,
  type AmountDue,
  type PriceList,
  type SignupInput,
} from "@pedia/shared";
import { ChoiceChips } from "@/components/choice-chips";
import { FormField } from "@/components/form-field";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BrandColorField, HeadingFontSelect, ImagePicker } from "@/features/clinic/components/brand-fields";
import { OpeningHoursFields } from "@/features/clinic/components/opening-hours-fields";
import { ApiError } from "@/lib/api-client";

/** The files a sign-up sends beside its JSON (billing #6, #9). */
export type SignupFiles = { logo?: File; references: File[] };

export const emptySignup = (): SignupInput => ({
  account: { name: "", contactEmail: "", tin: "", tier: "small" },
  branch: { name: "", address: "", phone: "", openingHours: DEFAULT_OPENING_HOURS },
  owner: { fullName: "", email: "", role: "dentist" },
  branding: { choice: "default" },
});

/**
 * Billing #10: a duplicate's 409 belongs under the field it is about. Sets it there and says so; any other refusal is
 * left for the form's own error line.
 */
export function showDuplicate(e: unknown, setError: (field: "account.name" | "account.contactEmail", error: { message: string }) => void): boolean {
  const field = e instanceof ApiError && e.status === 409 ? duplicateField(e.message) : undefined;
  if (field && e instanceof Error) setError(field, { message: e.message });
  return !!field;
}

/** Switching choice starts that choice afresh, so no stale brief travels with Use my own (or the reverse). */
const fresh = (choice: BrandingChoice): SignupInput["branding"] =>
  choice === "own" ? { choice, brandColor: DEFAULT_BRAND_COLOR, headingFont: null } : choice === "designed" ? { choice, brief: "" } : { choice };

const limitText = (t: Tier) => {
  const { branches, staffLogins } = TIER_LIMITS[t];
  return `${branches ?? "Unlimited"} branch${branches === 1 ? "" : "es"}, ${staffLogins ?? "unlimited"} staff logins`;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 border-t border-line pt-5 first:border-t-0 first:pt-0">
      <legend className="mb-3 text-base font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

/**
 * Everything a sign-up asks (billing #5, #6, #9), for a form whose values are a `SignupInput` (or extend it, as the
 * console's CreateAccountInput does). `hasStoredLogo`: a fix may keep the logo already on the sign-up.
 */
export function SignupFields({
  prices,
  files,
  onFilesChange,
  logoError,
  hasStoredLogo = false,
}: {
  prices: PriceList;
  files: SignupFiles;
  onFilesChange: (files: SignupFiles) => void;
  logoError?: string;
  hasStoredLogo?: boolean;
}) {
  const form = useFormContext<SignupInput>();
  const branding = useWatch({ control: form.control, name: "branding" });

  return (
    <div className="space-y-6">
      <Section title="Your clinic">
        <FormField name="account.name" label="Clinic name">
          <Input autoComplete="organization" {...form.register("account.name")} />
        </FormField>
        <FormField name="account.contactEmail" label="Contact email" hint="Where Primolar writes to the clinic.">
          <Input type="email" autoComplete="email" {...form.register("account.contactEmail")} />
        </FormField>
        <FormField name="account.tin" label="TIN" hint="9 digits, then the branch code if any">
          {(props) => (
            <Controller
              control={form.control}
              name="account.tin"
              render={({ field }) => <Input {...props} inputMode="numeric" value={field.value} onChange={(e) => field.onChange(formatTin(e.target.value))} />}
            />
          )}
        </FormField>
      </Section>

      <Section title="Plan">
        <FormField name="account.tier" label="Choose a plan" hint="Prices include VAT. Every plan has your logo, colour and heading font.">
          {(props) => (
            <Controller
              control={form.control}
              name="account.tier"
              render={({ field }) => (
                <ChoiceChips
                  size="card"
                  aria-labelledby={`${props.id}-label`}
                  value={field.value}
                  onChange={field.onChange}
                  options={Tier.options.map((t) => ({
                    value: t,
                    label: TIER_LABEL[t],
                    hint: `${formatPeso(prices.plans[t].setupFee)} setup, then ${formatPeso(prices.plans[t].monthlyFee)} a month · ${limitText(t)}`,
                  }))}
                />
              )}
            />
          )}
        </FormField>
      </Section>

      <Section title="First branch">
        <FormField name="branch.name" label="Branch name" hint="Add more branches after you sign in.">
          <Input autoComplete="off" {...form.register("branch.name")} />
        </FormField>
        <FormField name="branch.address" label="Address">
          <Input autoComplete="street-address" {...form.register("branch.address")} />
        </FormField>
        <FormField name="branch.phone" label="Phone">
          <Input type="tel" autoComplete="tel" {...form.register("branch.phone")} />
        </FormField>
        <OpeningHoursFields name="branch.openingHours" />
      </Section>

      <Section title="Owner">
        <FormField name="owner.fullName" label="Full name">
          <Input autoComplete="name" {...form.register("owner.fullName")} />
        </FormField>
        <FormField name="owner.email" label="Email" hint="The Owner signs in with this. Add your staff after you sign in.">
          <Input type="email" autoComplete="email" {...form.register("owner.email")} />
        </FormField>
        <Controller
          control={form.control}
          name="owner.role"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              {/* Platform #58: the Owner's job role is Dentist or Admin, never Front desk. */}
              <Checkbox id="owner-dentist" checked={field.value === "dentist"} onCheckedChange={(on) => field.onChange(on ? "dentist" : "admin")} />
              <Label htmlFor="owner-dentist" className="font-normal">The Owner also treats patients (a dentist)</Label>
            </div>
          )}
        />
      </Section>

      <Section title="Your clinic's look">
        <Controller
          control={form.control}
          name="branding"
          render={({ field }) => (
            <ChoiceChips
              size="card"
              aria-label="How your clinic will look"
              value={field.value.choice}
              onChange={(choice) => field.onChange(fresh(choice))}
              options={BrandingChoice.options.map((c) => ({
                value: c,
                label: BRANDING_CHOICE_LABEL[c],
                hint:
                  c === "own"
                    ? "Your logo, one colour and a heading font"
                    : c === "default"
                      ? "Primolar's colours, your clinic's name where a logo goes. Change it any time in Settings."
                      : `Primolar designs your logo, colour and font: ${formatPeso(prices.designAddOn)}, once`,
              }))}
            />
          )}
        />

        {branding.choice === "own" && (
          <div className="space-y-5">
            <ImagePicker
              id="signup-logo"
              label="Logo"
              hint={hasStoredLogo && !files.logo ? "The logo already sent stays unless you choose another. PNG, JPG or SVG, up to 1 MB." : "PNG, JPG or SVG, up to 1 MB. A wide logo on a white or clear background works best."}
              accept={LOGO_RULES.types}
              max={1}
              files={files.logo ? [files.logo] : []}
              onChange={([logo]) => onFilesChange({ ...files, logo })}
              problemOf={([f]) => (f ? logoProblem(f) : undefined)}
              error={logoError}
            />
            <Controller
              control={form.control}
              name="branding.brandColor"
              render={({ field }) => <BrandColorField id="signup-color" value={field.value} onChange={field.onChange} fallback={DEFAULT_BRAND_COLOR} />}
            />
            <Controller
              control={form.control}
              name="branding.headingFont"
              render={({ field }) => <HeadingFontSelect id="signup-font" value={field.value ?? null} onChange={field.onChange} />}
            />
          </div>
        )}

        {branding.choice === "default" && (
          <p className="text-sm text-ink-muted">Your clinic starts in Primolar&apos;s colours with its name in place of a logo. The Owner can add a logo, colour and font later in Settings.</p>
        )}

        {branding.choice === "designed" && (
          <div className="space-y-5">
            <FormField name="branding.brief" label="Your brief" hint="The feel you want, and colours you like or don't. Primolar follows up by email or chat.">
              <Textarea rows={4} {...form.register("branding.brief")} />
            </FormField>
            <ImagePicker
              id="signup-references"
              label="Looks you like (optional)"
              hint="Up to 3 PNG or JPG images, 5 MB each."
              accept={REFERENCE_IMAGE_RULES.types}
              max={REFERENCE_IMAGE_RULES.max}
              files={files.references}
              onChange={(references) => onFilesChange({ ...files, references })}
              problemOf={referenceImagesProblem}
            />
            <p className="text-sm text-ink-muted">Your clinic goes live in Primolar&apos;s colours while the design is made, then switches to it.</p>
          </div>
        )}
      </Section>
    </div>
  );
}

/** Billing #22, #24: each part, the total, and the VAT inside it. Prices are VAT-inclusive. */
export function AmountDueSummary({ quote, title = "Amount due" }: { quote: AmountDue; title?: string }) {
  const row = (label: string, amount: number) => (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="tabular-nums">{formatPeso(amount)}</dd>
    </div>
  );
  return (
    <section aria-label={title} className="space-y-2 rounded-lg bg-selected p-4 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <dl className="space-y-1">
        {row("Setup fee", quote.setupFee)}
        {row("First month", quote.firstMonth)}
        {quote.designAddOn > 0 && row("Design it for me", quote.designAddOn)}
        <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPeso(quote.total)}</dd>
        </div>
      </dl>
      <p className="text-ink-muted">Includes VAT (12%) of {formatPeso(quote.vat)}.</p>
    </section>
  );
}
