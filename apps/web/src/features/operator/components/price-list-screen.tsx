"use client";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { TIER_LABEL, Tier, amountDue, formatPeso, pesos, type PriceList } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { FormField } from "@/components/form-field";
import { PageHeader } from "@/components/page-header";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOperatorPrices, useSavePrices } from "../api";

/** Pesos as typed: whole or to the centavo, never negative. Blank is refused, never read as ₱0 (a free plan is a typed 0). */
const Peso = z.coerce
  .string()
  .trim()
  .min(1, "Enter an amount in pesos")
  .pipe(z.coerce.number<string>({ message: "Enter an amount in pesos" }).min(0, "Can't be below zero").multipleOf(0.01, "Up to two decimal places"));
const PlanPesos = z.object({ setupFee: Peso, monthlyFee: Peso });
const PriceForm = z.object({ plans: z.object({ small: PlanPesos, mid: PlanPesos, big: PlanPesos }), designAddOn: Peso });
type PriceForm = z.infer<typeof PriceForm>;

const toForm = (p: PriceList): PriceForm => ({
  plans: Object.fromEntries(Tier.options.map((t) => [t, { setupFee: p.plans[t].setupFee / 100, monthlyFee: p.plans[t].monthlyFee / 100 }])) as PriceForm["plans"],
  designAddOn: p.designAddOn / 100,
});
const toPrices = (f: PriceForm): PriceList => ({
  plans: Object.fromEntries(Tier.options.map((t) => [t, { setupFee: pesos(f.plans[t].setupFee), monthlyFee: pesos(f.plans[t].monthlyFee) }])) as PriceList["plans"],
  designAddOn: pesos(f.designAddOn),
});

/** Billing #22, #23, A2, A8: VAT-inclusive pesos. New sign-ups are quoted from these; waiting ones keep their quote. */
export function PriceListScreen() {
  const prices = useOperatorPrices();
  return (
    <div className="space-y-5">
      <PageHeader title="Price list" description="VAT-inclusive pesos. New sign-ups are quoted from these; sign-ups already waiting keep the amount they were shown." />
      {prices.isLoading && <Loading label="Loading the price list" />}
      {prices.error && <ErrorState what="the price list" onRetry={() => void prices.refetch()} />}
      {prices.data && <PriceFields key={JSON.stringify(prices.data)} prices={prices.data} />}
    </div>
  );
}

function PriceFields({ prices }: { prices: PriceList }) {
  const save = useSavePrices();
  const form = useForm<z.input<typeof PriceForm>, unknown, PriceForm>({ resolver: zodResolver(PriceForm), defaultValues: toForm(prices) });
  const draft = useWatch({ control: form.control });
  const parsed = PriceForm.safeParse(draft);
  const preview = parsed.success ? toPrices(parsed.data) : undefined;
  const submit = form.handleSubmit((f) => save.mutate(toPrices(f), { onSuccess: () => toast.success("Price list saved") }));

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="space-y-5">
        {Tier.options.map((t) => (
          <SectionCard
            key={t}
            title={`${TIER_LABEL[t]} plan`}
            description={preview ? `A new ${TIER_LABEL[t]} sign-up pays ${formatPeso(amountDue(preview, t, "default").total)} upfront (${formatPeso(amountDue(preview, t, "designed").total)} with Design it for me).` : undefined}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField name={`plans.${t}.setupFee`} label="Setup fee (₱)">
                <Input inputMode="decimal" {...form.register(`plans.${t}.setupFee`)} />
              </FormField>
              <FormField name={`plans.${t}.monthlyFee`} label="Monthly fee (₱)">
                <Input inputMode="decimal" {...form.register(`plans.${t}.monthlyFee`)} />
              </FormField>
            </div>
          </SectionCard>
        ))}
        <SectionCard title="Design it for me" description="One fixed add-on, the same on every plan (billing #23).">
          <FormField name="designAddOn" label="Design add-on (₱)">
            <Input inputMode="decimal" className="sm:w-56" {...form.register("designAddOn")} />
          </FormField>
        </SectionCard>
        {save.error && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}
        <Button type="submit" disabled={save.isPending || !form.formState.isDirty}>{save.isPending ? "Saving" : "Save price list"}</Button>
      </form>
    </FormProvider>
  );
}
