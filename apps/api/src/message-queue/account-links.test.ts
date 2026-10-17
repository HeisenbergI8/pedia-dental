import { describe, expect, it } from "vitest";
import type { Tx } from "../prisma/transaction";
import { AccountLinks } from "./account-links";

const tx = {} as Tx;

describe("AccountLinks (B11 E5)", () => {
  it("refuses to mint before the portal registers, then mints through the one minter", async () => {
    const links = new AccountLinks();
    await expect(async () => links.mint(tx, "l1")).rejects.toThrow("No account-link minter");
    links.register(async (_, id) => `https://example.test/set-password#t=${id}`);
    expect(await links.mint(tx, "l1")).toBe("https://example.test/set-password#t=l1");
  });
  it("takes one minter only", () => {
    const links = new AccountLinks();
    links.register(async () => undefined);
    expect(() => links.register(async () => undefined)).toThrow("already registered");
  });
});
