import { describe, expect, it } from "vitest";
import { requestContext, requireContext } from "./request-context";

const ctx = (requestId: string, clinicId?: string) => ({ requestId, clinicId, operator: false });
const tick = () => new Promise((r) => setTimeout(r, 1));

describe("request context", () => {
  it("is absent outside a run", () => {
    expect(requestContext.current()).toBeUndefined();
    expect(() => requireContext()).toThrow(/No request context/);
  });

  it("keeps concurrent requests apart across awaits", async () => {
    const seen = await Promise.all(
      ["clinic_a", "clinic_b"].map((clinicId, i) =>
        requestContext.run(ctx(`req-${i}`, clinicId), async () => {
          await tick();
          return requestContext.current()?.clinicId;
        }),
      ),
    );
    expect(seen).toEqual(["clinic_a", "clinic_b"]);
  });

  it("assign changes only the current request", async () => {
    const [signedIn, other] = await Promise.all([
      requestContext.run(ctx("req-1"), async () => {
        requestContext.assign({ clinicId: "clinic_a" });
        await tick();
        return requestContext.current()?.clinicId;
      }),
      requestContext.run(ctx("req-2"), async () => {
        await tick();
        return requestContext.current()?.clinicId;
      }),
    ]);
    expect([signedIn, other]).toEqual(["clinic_a", undefined]);
  });
});
