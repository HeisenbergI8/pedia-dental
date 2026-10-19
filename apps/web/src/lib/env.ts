/**
 * `enabled`: MSW answers every route (the demo, no API). `hybrid`: MSW answers all but the routes the API already
 * serves (`API_ROUTES`, mocks/passthrough.ts). `disabled`: no MSW. Anything else, or unset, is `disabled`.
 */
const MODES = ["enabled", "hybrid", "disabled"] as const;
export type ApiMockingMode = (typeof MODES)[number];
const asked = process.env.NEXT_PUBLIC_API_MOCKING; // inlined at build time: a literal reference on purpose
const apiMockingMode: ApiMockingMode = MODES.find((m) => m === asked) ?? "disabled";

export const env = {
  apiMockingMode,
  /** MSW is running (enabled or hybrid). The demo-only UI follows the API instead (features/auth/demo.ts, B13c1 E4). */
  apiMocking: apiMockingMode !== "disabled",
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "/api",
};
