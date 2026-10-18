import { type Settings, settingsFrom } from "../../src/config";

/** A complete, valid settings object for tests. Never the committed cdk.json, whose required values are empty. */
export const EXAMPLE: Record<string, unknown> = {
  apiDomain: "api.example.com",
  webOrigins: "https://app.example.com",
  webUrl: "https://app.example.com",
  alertEmail: "alerts@example.com",
  githubRepo: "HeisenbergI8/pedia-dental",
};

export const exampleSettings = (overrides: Record<string, unknown> = {}): Settings =>
  settingsFrom((key) => ({ ...EXAMPLE, ...overrides })[key]);
