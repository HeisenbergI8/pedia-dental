/**
 * FDI two-digit tooth numbering, matching the clinic's oral examination chart.
 * First digit = quadrant (1–4 permanent, 5–8 primary), second = position from midline.
 */
const range = (q: number, n: number) => Array.from({ length: n }, (_, i) => q * 10 + i + 1);

export const PERMANENT_TEETH = [1, 2, 3, 4].flatMap((q) => range(q, 8));
export const PRIMARY_TEETH = [5, 6, 7, 8].flatMap((q) => range(q, 5));
export const ALL_TEETH = [...PERMANENT_TEETH, ...PRIMARY_TEETH];

export type ToothNumber = number;
export type Dentition = "primary" | "permanent";

export function isValidTooth(t: ToothNumber): boolean {
  return ALL_TEETH.includes(t);
}

export function dentitionOf(t: ToothNumber): Dentition {
  if (!isValidTooth(t)) throw new Error(`Invalid FDI tooth number: ${t}`);
  return Math.floor(t / 10) >= 5 ? "primary" : "permanent";
}

/** Incisors and canines: position 1–3 in every quadrant. */
export function isAnterior(t: ToothNumber): boolean {
  if (!isValidTooth(t)) throw new Error(`Invalid FDI tooth number: ${t}`);
  return t % 10 <= 3;
}

export const SURFACES = ["M", "O", "I", "D", "B", "L"] as const;
export type Surface = (typeof SURFACES)[number];

/** Front teeth have an incisal edge (I); back teeth have an occlusal surface (O). */
export function surfacesFor(t: ToothNumber): Surface[] {
  return isAnterior(t) ? ["M", "I", "D", "B", "L"] : ["M", "O", "D", "B", "L"];
}
