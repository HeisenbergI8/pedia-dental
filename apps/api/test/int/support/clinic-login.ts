import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD } from "@pedia/seed";
import request from "supertest";

/** POST /auth/login and the session cookie it set (or "" when refused). */
export async function signIn(app: INestApplication, email: string, clinicId?: string, password = DEMO_PASSWORD) {
  const res = await request(app.getHttpServer()).post("/api/auth/login").send({ email, password, ...(clinicId && { clinicId }) });
  const cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))?.split(";")[0] ?? "";
  return { res, cookie };
}
