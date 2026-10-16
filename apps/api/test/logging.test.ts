import { Writable } from "node:stream";
import { Controller, Get, type INestApplication, Logger, Res } from "@nestjs/common";
import type { Response } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "../src/generated/prisma/client.ts";
import { createTestApp } from "./support/test-app";

const lines: string[] = [];
const logStream = new Writable({
  write(chunk, _encoding, done) {
    lines.push(String(chunk));
    done();
  },
});

@Controller("probe")
class ProbeController {
  private readonly logger = new Logger("Probe");

  @Get("log")
  log() {
    this.logger.log({ patient: { id: "pat_1", firstName: "Ana", lastName: "Santos" } }, "opened chart");
    return { ok: true };
  }

  @Get("download")
  download(@Res({ passthrough: true }) res: Response) {
    res.set("Content-Disposition", 'inline; filename="santos-ana-photo.jpg"');
    return { ok: true };
  }

  @Get("prisma-error")
  prismaError() {
    throw new Prisma.PrismaClientValidationError('Invalid value for argument `firstName`: "Ana Santos"', {
      clientVersion: "7.10.0",
    });
  }
}

describe("logs over HTTP", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ controllers: [ProbeController], logStream, openGuard: true });
  });
  afterAll(() => app.close());

  const linesFor = (requestId: string) => lines.filter((line) => line.includes(requestId));

  it("never logs a download's file name (B4: a photo is named after the child)", async () => {
    const res = await request(app.getHttpServer()).get("/api/probe/download");
    const mine = linesFor(res.headers["x-request-id"]!).join("\n");
    expect(mine).toContain("/api/probe/download");
    expect(mine).not.toMatch(/santos|ana-photo/i);
  });

  it("logs a request's path, never its query (B4: searches and duplicate checks carry names)", async () => {
    const res = await request(app.getHttpServer()).get("/api/probe/log?q=rosa%20mendoza&birthDate=2019-03-02");
    const mine = linesFor(res.headers["x-request-id"]!).join("\n");
    expect(mine).toContain("/api/probe/log");
    expect(mine).not.toMatch(/rosa|mendoza|2019-03-02/i);
  });

  it("stamps a handler's log line with the request id and no patient name", async () => {
    const res = await request(app.getHttpServer()).get("/api/probe/log");
    const mine = linesFor(res.headers["x-request-id"]!);
    expect(mine.some((line) => JSON.parse(line).msg === "opened chart")).toBe(true);
    expect(mine.join("")).toContain("pat_1");
    expect(mine.join("")).not.toMatch(/Ana|Santos/);
  });

  it("logs a database error without the patient data in its message", async () => {
    const res = await request(app.getHttpServer()).get("/api/probe/prisma-error");
    expect(res.status).toBe(500);
    const mine = linesFor(res.headers["x-request-id"]!).join("");
    expect(mine).toContain("PrismaClientValidationError");
    expect(mine).not.toContain("Ana Santos");
  });
});
