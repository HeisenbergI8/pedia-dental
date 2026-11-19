import { GRACE_DAYS, TIER_LABEL, TIER_LIMITS, TIER_SUPPORT, Tier, formatPeso, formatStorage, type PriceList } from "@pedia/shared";

/**
 * D16: the Plans page's sections, in order, as data. The page and its PDF both render this, so neither can drift from
 * the app (D18): every figure comes from TIER_LIMITS, TIER_SUPPORT and the public price list, never typed here.
 */
export type PlanCard = { tier: Tier; name: string; forWho: string; price: string; setup: string; top: string[]; popular: boolean };
export type PlansContent = {
  headline: { title: string; lead: string; note: string };
  cards: PlanCard[];
  everyPlan: { title: string; detail: string }[];
  table: { row: string; cells: Record<Tier, string> }[];
  faq: { q: string; a: string }[];
};

const POPULAR: Tier = "mid"; // D16: "Most popular" on Clinic
const count = (n: number) => n.toLocaleString("en-PH");
const per = (tiers: readonly Tier[], cell: (t: Tier) => string) => Object.fromEntries(tiers.map((t) => [t, cell(t)])) as Record<Tier, string>;

/** "1 branch, up to 10 staff" / "Up to 3 branches and 30 staff" / "Unlimited branches and staff". */
function people(t: Tier): string {
  const { branches, staffLogins } = TIER_LIMITS[t];
  if (branches === null && staffLogins === null) return "Unlimited branches and staff";
  if (branches === 1) return `1 branch, up to ${count(staffLogins!)} staff`;
  return `Up to ${branches} branches and ${count(staffLogins!)} staff`;
}

function forWho(t: Tier): string {
  const { branches } = TIER_LIMITS[t];
  if (branches === 1) return "For one busy clinic";
  return branches === null ? "For clinic groups and chains" : `For a growing clinic, up to ${branches} branches`;
}

/** The three or four things that matter most on each plan, after its size and its texts. */
function highlights(t: Tier): string[] {
  const l = TIER_LIMITS[t];
  const lines = [people(t), `${count(l.textParts)} automatic parent texts a month`];
  if (l.designIncluded) return [...lines, "We design your logo and move your old records in", TIER_SUPPORT[t].label];
  if (l.appointmentRequests) return [...lines, "Parents book visits from their phone", "Your own letterhead on every document"];
  return [...lines, "Money dashboard for your clinic", `${formatStorage(l.storageBytes)} for photos and X-rays`];
}

export function plansContent(prices: PriceList): PlansContent {
  const tiers = Tier.options;
  const pack = prices.textPack;
  const yes = (on: boolean, text: string, off = "—") => (on ? text : off);
  return {
    headline: {
      title: "Less paperwork. Fewer missed visits. More smiles.",
      lead: "Clinic software made for pediatric dentists. Every plan has the full dental chart, patient records and automatic reminders to parents. Pick the size that fits your clinic.",
      note: "Prices include VAT. Pay monthly by GCash, Maya or bank QR. Change plans any time.",
    },
    cards: tiers.map((t) => ({
      tier: t,
      name: TIER_LABEL[t],
      forWho: forWho(t),
      price: formatPeso(prices.plans[t].monthlyFee),
      setup: `${formatPeso(prices.plans[t].setupFee)} one-time setup`,
      top: highlights(t),
      popular: t === POPULAR,
    })),
    // Patient care is on every plan (NEVER_LIMITED), plus the logo, colour and font (D4).
    everyPlan: [
      { title: "Pediatric dental chart", detail: "Baby, mixed and adult teeth, with each tooth's history" },
      { title: "Patient records", detail: "Guardians, allergies and alerts that always show" },
      { title: "Clinical notes", detail: "Ready-made forms for exams, fluoride, extractions and more" },
      { title: "Appointments", detail: "Day, week and month views, one column per chair" },
      { title: "Automatic reminders", detail: "Confirmations, reminders and after-care texts to parents" },
      { title: "Recalls", detail: "See who is due for their 6-month checkup" },
      { title: "Billing and receipts", detail: "Cash, GCash, Maya, card and bank, with balances" },
      { title: "Documents", detail: "Certificates, prescriptions and referrals, filled in for you" },
      { title: "Your logo and colour", detail: "On every screen, receipt and parent page" },
      { title: "Data Privacy Act ready", detail: "Parent consent recorded, records kept apart and safe" },
    ],
    table: [
      { row: "Monthly price", cells: per(tiers, (t) => formatPeso(prices.plans[t].monthlyFee)) },
      { row: "One-time setup", cells: per(tiers, (t) => formatPeso(prices.plans[t].setupFee)) },
      { row: "Branches", cells: per(tiers, (t) => (TIER_LIMITS[t].branches === null ? "Unlimited" : TIER_LIMITS[t].branches === 1 ? "1" : `Up to ${TIER_LIMITS[t].branches}`)) },
      { row: "Staff accounts", cells: per(tiers, (t) => (TIER_LIMITS[t].staffLogins === null ? "Unlimited" : count(TIER_LIMITS[t].staffLogins!))) },
      { row: "Parent texts a month", cells: per(tiers, (t) => count(TIER_LIMITS[t].textParts)) },
      { row: "Extra texts", cells: per(tiers, () => `${formatPeso(pack.price)} per ${count(pack.parts)}`) },
      { row: "Photos and X-rays", cells: per(tiers, (t) => formatStorage(TIER_LIMITS[t].storageBytes)) },
      { row: "Parent app", cells: per(tiers, (t) => yes(TIER_LIMITS[t].appointmentRequests, "Plus book visits", "View visits and records")) },
      { row: "Letterhead", cells: per(tiers, (t) => yes(TIER_LIMITS[t].customLetterhead, "Your own design", "Standard, with your logo")) },
      {
        row: "Money dashboard",
        cells: per(tiers, (t) => (TIER_LIMITS[t].financeExport ? "All branches, plus export" : yes(TIER_LIMITS[t].crossBranchViews, "All branches together", "Your clinic"))),
      },
      { row: "Logo design by us", cells: per(tiers, (t) => yes(TIER_LIMITS[t].designIncluded, "Included", `${formatPeso(prices.designAddOn)} extra`)) },
      { row: "Help when you need it", cells: per(tiers, (t) => TIER_SUPPORT[t].label) },
    ],
    faq: [
      {
        q: "What happens if we run out of texts?",
        a: `You can buy more any time from your Plan page: ${formatPeso(pack.price)} for ${count(pack.parts)} texts, paid by QR. We warn you when you have used 80%, so you can top up before a reminder is missed. Extra texts last until the end of the month. Portal invites and password resets always go.`,
      },
      { q: "Can we change plans later?", a: "Yes. Moving up starts right away. Moving down starts on your next due date. Nothing you already have is turned off or deleted." },
      { q: "How do we pay?", a: "Scan Primolar's GCash, Maya or bank QR in the app, then send a screenshot of your receipt. Primolar checks it and confirms. You pay once a month, on the day you joined." },
      { q: "What if we miss a payment?", a: `You get ${GRACE_DAYS} days to pay, with a reminder on screen. After that the clinic is paused until you pay. Nothing is deleted, and parents can still see their child's records.` },
      // Only what the app does (B13c2 privacy operations); confirm the wording with counsel before launch.
      {
        q: "Is our patients' data safe?",
        a: "Primolar is built for the Data Privacy Act (RA 10173). Every clinic's records are kept apart, parents' consent is recorded, and only your own staff can see your patients.",
      },
      { q: "What is the setup fee for?", a: "We set up your clinic, branches and price list, add your logo and colour, and show your team how to use it." },
    ],
  };
}
