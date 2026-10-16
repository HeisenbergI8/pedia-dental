import { setupWorker } from "msw/browser";
import { env } from "@/lib/env";
import { handlers } from "./handlers";
import { apiPassthrough } from "./passthrough";

// Hybrid: the API's routes pass through first, so neither the access gate nor a feature mock answers them.
export const worker = setupWorker(...(env.apiMockingMode === "hybrid" ? [apiPassthrough()] : []), ...handlers);
