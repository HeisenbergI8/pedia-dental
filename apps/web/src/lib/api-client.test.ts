import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, UNREACHABLE, api, readableError } from "./api-client";

afterEach(() => vi.unstubAllGlobals());

const reply = (body: string, status: number) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));
const PAGE = '<!DOCTYPE html><html lang="en"><head><link rel="preload" href="/_next/static/media/a.woff2"></head></html>';

it("keeps the API's own messages", () => {
  expect(readableError("Tick the box to accept")).toBe("Tick the box to accept");
  expect(readableError(JSON.stringify([{ message: "Enter a name" }, { message: "Enter a phone" }]))).toBe("Enter a name. Enter a phone");
});

it("never shows a web page's markup as the message", () => {
  expect(readableError(PAGE)).toBe(UNREACHABLE);
  expect(readableError("  \n")).toBe(UNREACHABLE);
});

it("refuses a failed request that came back as a web page in plain words", async () => {
  reply(PAGE, 404);
  await expect(api("/patients", z.object({}), { method: "POST" })).rejects.toEqual(new ApiError(404, UNREACHABLE));
});

it("refuses a successful status whose body is a web page, not JSON", async () => {
  reply(PAGE, 200);
  const error = await api("/patients", z.object({})).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect((error as ApiError).message).toBe(UNREACHABLE);
});
