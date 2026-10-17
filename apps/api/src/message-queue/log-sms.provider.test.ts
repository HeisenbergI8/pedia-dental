import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { LogSmsProvider } from "./log-sms.provider";

describe("LogSmsProvider", () => {
  it("logs the message id and its parts, never the number or the words", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const receipt = await new LogSmsProvider().send({ messageId: "m1", number: "639171234567", body: "Hi Rosa, Bea's visit is tomorrow." });
    expect(receipt).toEqual({ providerRef: "log:m1", segments: 1 });
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain("m1");
    for (const secret of ["639171234567", "Rosa", "Bea"]) expect(line).not.toContain(secret);
    log.mockRestore();
  });
});
