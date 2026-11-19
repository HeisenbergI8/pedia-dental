import { DEFAULT_BRAND_COLOR, TIER_LABEL, Tier } from "@pedia/shared";
import type { DocContent } from "@/features/documents/content";
import { downloadPdf } from "@/features/documents/download";
import type { PlansContent } from "./plans-content";

/**
 * D15, D18: the Plans page as a PDF to save, print or share, from the same PlansContent as the page and through the
 * documents' PDF builder (Noto Sans, react-pdf loaded on first use, saved by saveFile). Primolar's letterhead, as on
 * its invoices: its name and ring, never a clinic's look.
 */
export function plansPdf(c: PlansContent, on: string): DocContent {
  const tiers = Tier.options;
  return {
    title: "Primolar plans",
    subtitle: `Prices as of ${on}`,
    clinicName: "Primolar",
    fileName: "primolar-plans.pdf",
    letterhead: { clinicName: "Primolar", branchLine: "Pediatric dental clinic software", logoUrl: null, ring: DEFAULT_BRAND_COLOR },
    blocks: [
      { kind: "text", heading: c.headline.title, paragraphs: [c.headline.lead, c.headline.note] },
      ...c.cards.map((card) => ({
        kind: "rows" as const,
        heading: `${card.name}${card.popular ? " (most popular)" : ""}: ${card.price} a month`,
        rows: [["Who it's for", card.forWho], ["Setup", card.setup], ["Includes", card.top.join("; ")]] as [string, string][],
      })),
      { kind: "rows", heading: "Every plan includes", rows: c.everyPlan.map((e): [string, string] => [e.title, e.detail]) },
      { kind: "table", heading: "Compare the plans", head: ["", ...tiers.map((t) => TIER_LABEL[t])], rows: c.table.map((r) => [r.row, ...tiers.map((t) => r.cells[t])]) },
      { kind: "text", heading: "Questions clinics ask", paragraphs: c.faq.flatMap((f) => [f.q, f.a]) },
    ],
    footnote: "Prices include VAT. Get started at the Primolar sign-up page.",
  };
}

export const downloadPlans = (c: PlansContent, on: string) => downloadPdf(plansPdf(c, on));
