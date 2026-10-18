import type { ApiMockingMode } from "@/lib/env";

export type DemoHelp = "show" | "loading" | "failed" | "hide";

/**
 * B13c1 E4: whether to show the demo's help (one-click logins, demo PINs, the texted links, the operator's hint).
 * It follows the backend: shown when GET /auth/demo-accounts answers (MSW, or an API with DEMO_LOGINS). With mocks off,
 * a real deployment's 404 hides it, and so does the wait for the answer, so a production sign-in page never flashes
 * a demo loader. With MSW running, a failure is the demo's own and is shown.
 */
export function demoHelp(mode: ApiMockingMode, demo: { isSuccess: boolean; isPending: boolean; isError: boolean }): DemoHelp {
  if (demo.isSuccess) return "show";
  if (mode === "disabled") return "hide";
  return demo.isPending ? "loading" : demo.isError ? "failed" : "hide";
}

/** "Reset demo data" clears the browser's copy of the demo: only while MSW holds the data. */
export const canResetDemoData = (mode: ApiMockingMode) => mode !== "disabled";
