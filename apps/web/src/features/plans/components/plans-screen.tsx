"use client";
import { useState } from "react";
import Link from "next/link";
import {
  BellRingIcon, CalendarDaysIcon, CheckIcon, ClipboardListIcon, DownloadIcon, FileTextIcon, PaletteIcon, ReceiptIcon,
  RepeatIcon, ShieldCheckIcon, SmileIcon, UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Tier } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { SignupFrame } from "@/features/signup/components/signup-frame";
import { usePrices } from "@/features/signup/api";
import { formatDate } from "@/lib/format";
import { downloadPlans } from "../download";
import { plansContent, type PlanCard, type PlansContent } from "../plans-content";

const EVERY_PLAN_ICONS = [SmileIcon, UsersIcon, ClipboardListIcon, CalendarDaysIcon, BellRingIcon, RepeatIcon, ReceiptIcon, FileTextIcon, PaletteIcon, ShieldCheckIcon];

/** D15–D18: the public Plans page. Every figure comes from plansContent over the public price list, as the PDF does. */
export function PlansScreen() {
  const prices = usePrices();
  return (
    <SignupFrame wide>
      {prices.isLoading && <Loading label="Loading the plans" />}
      {prices.error && <ErrorState what="the plans" onRetry={() => void prices.refetch()} />}
      {prices.data && <Plans content={plansContent(prices.data)} />}
    </SignupFrame>
  );
}

function Plans({ content: c }: { content: PlansContent }) {
  const [saving, setSaving] = useState(false);
  const download = () => {
    setSaving(true);
    downloadPlans(c, formatDate(new Date().toISOString().slice(0, 10)))
      .catch(() => toast.error("The PDF couldn't be made. Try again."))
      .finally(() => setSaving(false));
  };
  const pdfButton = (
    <Button variant="outline" onClick={download} disabled={saving}>
      <DownloadIcon aria-hidden /> {saving ? "Making the PDF" : "Download as PDF"}
    </Button>
  );

  return (
    <div className="space-y-14">
      <header className="mx-auto max-w-2xl space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{c.headline.title}</h1>
        <p className="text-lg text-ink-muted text-balance">{c.headline.lead}</p>
        <p className="text-sm text-ink-muted">{c.headline.note}</p>
        <div className="pt-2">{pdfButton}</div>
      </header>

      <section aria-label="Plans" className="grid items-stretch gap-4 md:grid-cols-3">
        {c.cards.map((card) => <Card key={card.tier} card={card} />)}
      </section>

      <section className="space-y-4" aria-labelledby="every-plan">
        <div className="space-y-1">
          <h2 id="every-plan" className="text-2xl font-semibold">Every plan includes</h2>
          <p className="text-ink-muted">No plan holds back patient care. A {c.cards[0]!.name} clinic gets the whole app.</p>
        </div>
        <ul className="grid gap-x-6 gap-y-4 rounded-2xl border border-line bg-surface p-6 sm:grid-cols-2 lg:grid-cols-3">
          {c.everyPlan.map((e, i) => {
            const Icon = EVERY_PLAN_ICONS[i] ?? CheckIcon;
            return (
              <li key={e.title} className="grid grid-cols-[2.25rem_1fr] gap-3">
                <span className="grid size-9 place-items-center rounded-lg bg-brand-subtle text-brand"><Icon className="size-4" aria-hidden /></span>
                <span className="min-w-0">
                  <span className="block font-semibold">{e.title}</span>
                  <span className="block text-sm text-ink-muted">{e.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-4" aria-labelledby="compare">
        <h2 id="compare" className="text-2xl font-semibold">Compare the plans</h2>
        <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[40rem] text-sm tabular-nums">
            <caption className="sr-only">The plans side by side</caption>
            <thead>
              <tr className="border-b border-line-soft text-left">
                <td className="p-4" />
                {c.cards.map((card) => (
                  <th key={card.tier} scope="col" className={`p-4 font-title text-base font-semibold ${card.popular ? "border-x-2 border-brand-ring text-brand" : ""}`}>{card.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.table.map((r) => (
                <tr key={r.row} className="border-b border-line-soft last:border-0">
                  <th scope="row" className="w-1/3 p-4 text-left font-medium text-ink-muted">{r.row}</th>
                  {Tier.options.map((t) => (
                    <td key={t} className={`p-4 ${t === "mid" ? "border-x-2 border-brand-ring font-medium" : ""}`}>{r.cells[t]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4" aria-labelledby="faq">
        <h2 id="faq" className="text-2xl font-semibold">Questions clinics ask</h2>
        <div className="space-y-2">
          {c.faq.map((f, i) => (
            <details key={f.q} open={i === 0} className="group rounded-xl border border-line bg-surface px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden className="text-xl leading-none text-brand group-open:rotate-45 motion-safe:transition-transform">+</span>
              </summary>
              <p className="max-w-prose pb-4 text-ink-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-3xl bg-brand-deep px-6 py-10 text-center text-on-deep">
        <h2 className="text-2xl font-semibold sm:text-3xl">Ready to get started?</h2>
        <p className="text-on-deep-muted">Sign up in about 10 minutes. Your clinic goes live once your first payment is confirmed.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild className="bg-on-deep text-brand-deep hover:bg-on-deep/90">
            <Link href="/get-started">Get started</Link>
          </Button>
          <Button variant="outline" onClick={download} disabled={saving} className="border-on-deep/40 bg-transparent text-on-deep hover:bg-on-deep/10">
            <DownloadIcon aria-hidden /> Download as PDF
          </Button>
        </div>
      </section>
    </div>
  );
}

/** One plan. Equal height in its row, the button at the bottom (the approved draft). */
function Card({ card }: { card: PlanCard }) {
  return (
    <article
      className={`flex flex-col gap-4 rounded-2xl bg-surface p-6 ${card.popular ? "border-2 border-brand shadow-raised" : "border border-line"}`}
      aria-label={`${card.name} plan`}
    >
      <span className={`self-start rounded-full bg-brand px-2.5 py-1 text-xs font-bold tracking-wide text-brand-ink uppercase ${card.popular ? "" : "invisible max-md:hidden"}`} aria-hidden={!card.popular}>
        Most popular
      </span>
      <div>
        <h2 className="text-2xl font-semibold">{card.name}</h2>
        <p className="text-ink-muted">{card.forWho}</p>
      </div>
      <p>
        <span className="font-title text-4xl font-semibold tabular-nums">{card.price}</span> <span className="text-ink-muted">/ month</span>
      </p>
      <p className="-mt-2 text-sm text-ink-muted">{card.setup}</p>
      <ul className="mb-2 space-y-2.5">
        {card.top.map((t) => (
          <li key={t} className="grid grid-cols-[1.25rem_1fr] items-start gap-2">
            <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-second-bg text-second"><CheckIcon className="size-3" aria-hidden /></span>
            {t}
          </li>
        ))}
      </ul>
      <Button asChild variant={card.popular ? "default" : "outline"} className="mt-auto w-full">
        <Link href="/get-started">Start with {card.name}</Link>
      </Button>
    </article>
  );
}
