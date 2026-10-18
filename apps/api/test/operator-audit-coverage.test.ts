import type { INestApplication } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { ModulesContainer } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OPERATOR_AUDIT } from "../src/operator-audit/operator-audited";
import { createTestApp } from "./support/test-app";

const VERBS = ["GET", "POST", "PUT", "DELETE", "PATCH", "ALL", "OPTIONS", "HEAD"];
const join = (...parts: string[]) => `/${parts.map((p) => p.replace(/^\/|\/$/g, "")).filter(Boolean).join("/")}`;

describe("every operator route that changes something is audited (B13a Step 5.3)", () => {
  let app: INestApplication;
  let routes: { route: string; audited: boolean }[];
  beforeAll(async () => {
    app = await createTestApp();
    routes = [];
    for (const module of app.get(ModulesContainer).values()) {
      for (const { metatype } of module.controllers.values()) {
        if (!metatype) continue;
        const base = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? "");
        for (const name of Object.getOwnPropertyNames(metatype.prototype).filter((n) => n !== "constructor")) {
          const handler = metatype.prototype[name];
          const path = typeof handler === "function" ? Reflect.getMetadata(PATH_METADATA, handler) : undefined;
          if (path === undefined) continue;
          const verb = VERBS[Reflect.getMetadata(METHOD_METADATA, handler) as number]!;
          routes.push({ route: `${verb} ${join(base, String(path))}`, audited: Reflect.getMetadata(OPERATOR_AUDIT, handler) !== undefined });
        }
      }
    }
  });
  afterAll(() => app.close());

  it("has the decorator on all 16 operator mutations, and on no read", () => {
    const mutations = routes.filter((r) => !r.route.startsWith("GET ") && / \/operator\//.test(r.route) && !r.route.includes("/operator/auth/"));
    expect(mutations.filter((r) => !r.audited).map((r) => r.route)).toEqual([]);
    expect(mutations).toHaveLength(16); // measured 2026-10-18: update deliberately when a route is added
    expect(routes.filter((r) => r.route.startsWith("GET ") && r.audited).map((r) => r.route)).toEqual([]);
  });
});
