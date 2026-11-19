import { amountDue, pesos, type PriceList, type Signup } from "@pedia/shared";

/**
 * A8: placeholder amounts, VAT-inclusive. The real ones are the user's call (billing "Still open"); the operator sets
 * them in the console's Price list.
 */
export const SEED_PRICES: PriceList = {
  plans: {
    // Feature 16 (revised 2026-11-19): monthly fees VAT-inclusive. Setup fees unchanged (D6).
    small: { setupFee: pesos(5000), monthlyFee: pesos(15000) },
    mid: { setupFee: pesos(10000), monthlyFee: pesos(24999) },
    big: { setupFee: pesos(20000), monthlyFee: pesos(44999) },
  },
  designAddOn: pesos(7500),
  textPack: { parts: 100, price: pesos(150) }, // ₱1.50 a text (D2)
};

/**
 * #17: three days before the seed runs, at 09:30 Manila, so the nightly expiry of unpaid sign-ups (14 days) never takes
 * the demo's waiting sign-up (it was a fixed 2026-10-12, which a fresh seed would expire at once).
 */
const submitted = () => {
  const day = new Date(Date.now() + 8 * 3_600_000 - 3 * 86_400_000).toISOString().slice(0, 10); // Manila's date, 3 days ago
  return `${day}T09:30:00.000+08:00`;
};

/**
 * Billing #34: one sign-up waiting for its setup fee. Design it for me (A10), so approving it shows the default look and
 * then Set branding. Its name and email clash with nothing seeded (seed.test.ts).
 */
export const seedSignups = (): Signup[] => [
  {
    id: "signup_hagikgik",
    reference: "PRM-HGK2-7QXM",
    source: "form",
    submittedAt: submitted(),
    account: { name: "Hagikgik Kids Dental", contactEmail: "hello@hagikgik.demo", tin: "456-789-012", tier: "mid" },
    branch: {
      name: "Bacoor",
      address: "88 Molino Road, Bacoor, Cavite",
      phone: "(046) 417 2210",
      openingHours: { opensAt: 9 * 60, closesAt: 18 * 60, closedWeekdays: [0] },
    },
    owner: { fullName: "Dr. Bea Manalo", email: "owner@hagikgik.demo", role: "dentist" },
    branding: {
      choice: "designed",
      brief: "Playful but calm: kids should smile, parents should trust us. We like sea greens and sunny yellow; no red.",
    },
    referenceRefs: [],
    quote: amountDue(SEED_PRICES, "mid", "designed"),
    status: "waiting",
    agreement: { termsVersion: 1, dpaVersion: 1, acceptedBy: "Dr. Bea Manalo", at: submitted(), method: "online" },
  },
];
