import { describe, expect, it } from "vitest";
import { readTf } from "./support/terraform";

const tf = readTf("secrets.tf");

describe("secrets.tf", () => {
  it("keeps every secret in Singapore only", () => {
    const secrets = tf.match(/resource "google_secret_manager_secret" /g) ?? [];
    const pinned = tf.match(/user_managed\s*\{\s*replicas\s*\{\s*location\s*=\s*var\.region/g) ?? [];
    expect(secrets.length).toBeGreaterThan(0);
    expect(pinned).toHaveLength(secrets.length);
    expect(tf).not.toMatch(/auto\s*\{/);
  });

  it("makes the origin secret 64 letters and digits (#2; env.ts needs 32 or more)", () => {
    expect(tf).toMatch(/resource "random_password" "origin" \{\s*length\s*=\s*64\s*special\s*=\s*false/);
  });

  it("never adds a Semaphore key version itself (I12: the owner does, by hand)", () => {
    expect(tf).not.toMatch(/secret\s*=\s*google_secret_manager_secret\.semaphore/);
  });
});
