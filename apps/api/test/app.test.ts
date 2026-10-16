import "reflect-metadata";
import { Body, Controller, type INestApplication, Post } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { plainLanguageError } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppModule } from "../src/app.module";
import { AccessGuard } from "../src/auth/access.guard";
import { ZodValidationPipe } from "../src/common/zod-validation.pipe";
import { loadEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";

z.config({ customError: plainLanguageError });

const Input = z.object({ name: z.string().min(1) });

@Controller("echo")
class EchoController {
  @Post()
  echo(@Body(new ZodValidationPipe(Input)) input: z.infer<typeof Input>) {
    return input;
  }

  @Post("boom")
  boom() {
    throw new Error("secret detail");
  }
}

let dbUp = true;
const prisma = { $queryRaw: async () => (dbUp ? [{ 1: 1 }] : Promise.reject(new Error("down"))), $disconnect: async () => {} };

describe("api skeleton (no database)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(loadEnv({ DATABASE_URL: "mysql://unused", PORT: "1", CORS_ORIGIN: "", LOG_LEVEL: "silent" }))],
      controllers: [EchoController],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(AccessGuard)
      .useValue({ canActivate: () => true }) // /echo tests validation and errors, not access
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    await app.init();
  });

  afterAll(() => app.close());

  it("reports the database up", async () => {
    dbUp = true;
    const res = await request(app.getHttpServer()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", database: "up" });
  });

  it("answers 503 in plain text when the database is down", async () => {
    dbUp = false;
    const res = await request(app.getHttpServer()).get("/api/health");
    expect(res.status).toBe(503);
    expect(res.type).toBe("text/plain");
    expect(res.text).toBe("The database is unreachable.");
  });

  it("answers a 400 with the Zod issues array the web reads", async () => {
    const res = await request(app.getHttpServer()).post("/api/echo").send({ name: "" });
    expect(res.status).toBe(400);
    expect(res.body).toEqual([expect.objectContaining({ path: ["name"], message: "This field is required" })]);
  });

  it("passes a valid body through, parsed", async () => {
    const res = await request(app.getHttpServer()).post("/api/echo").send({ name: "Ana", extra: 1 });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ name: "Ana" });
  });

  it("hides unexpected errors behind a plain 500", async () => {
    const res = await request(app.getHttpServer()).post("/api/echo/boom");
    expect(res.status).toBe(500);
    expect(res.text).toBe("Something went wrong. Try again.");
  });

  it("answers an unknown route with a plain-text 404", async () => {
    const res = await request(app.getHttpServer()).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.type).toBe("text/plain");
  });
});
