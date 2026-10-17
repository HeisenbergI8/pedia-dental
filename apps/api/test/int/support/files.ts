import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { expect } from "vitest";

/** A response body as bytes, whatever its type (supertest only buffers text and JSON by itself). */
export const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c)).on("end", () => done(null, Buffer.concat(chunks)));
};

/** GET a file route and follow its 302 once, as a browser does (B10 E2). `file` is undefined when there was no 302. */
export async function openFile(app: INestApplication, cookie: string, path: string) {
  const first = await request(app.getHttpServer()).get(path).set("Cookie", cookie);
  if (first.status !== 302) return { first, file: undefined };
  expect(first.headers["cache-control"]).toBe("no-store");
  const file = await request(app.getHttpServer()).get(first.headers.location!).buffer(true).parse(binary);
  return { first, file };
}
