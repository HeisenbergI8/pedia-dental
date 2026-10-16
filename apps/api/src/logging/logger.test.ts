import { Writable } from "node:stream";
import pino from "pino";
import { describe, expect, it } from "vitest";
import { requestContext } from "../common/request-context";
import { PERSONAL_FIELDS, pinoOptions } from "./logger";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { logger: pino(pinoOptions({ LOG_LEVEL: "info" }), stream), lines };
}

describe("log redaction", () => {
  it.each(PERSONAL_FIELDS)("hides %s at the top level and one level down", (field) => {
    const { logger, lines } = capture();
    logger.info({ [field]: "Ana Santos", patient: { id: "pat_1", [field]: "Ana Santos" } }, "looked up");
    expect(lines.join("")).not.toContain("Ana Santos");
    expect(lines.join("")).toContain("pat_1"); // ids stay
  });

  it("hides the session cookie and the bearer token", () => {
    const { logger, lines } = capture();
    logger.info({ req: { headers: { cookie: "pd_session=secret1", authorization: "Bearer secret2" } } });
    expect(lines.join("")).not.toMatch(/secret1|secret2/);
  });

  it("adds the request id inside a request, and nothing outside one", () => {
    const { logger, lines } = capture();
    requestContext.run({ requestId: "req-12345678", operator: false }, () => logger.info("inside"));
    logger.info("outside");
    expect(JSON.parse(lines[0]!)).toMatchObject({ requestId: "req-12345678", msg: "inside" });
    expect(JSON.parse(lines[1]!)).not.toHaveProperty("requestId");
  });
});
