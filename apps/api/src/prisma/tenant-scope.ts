import { Prisma } from "../generated/prisma/client.ts";
import { type RequestContext, currentContext } from "../common/request-context";
import { APPEND_ONLY, MODEL_SCOPE, type ModelScope } from "./model-scope";

export class TenantScopeError extends Error {
  override name = "TenantScopeError";
}

type Args = Record<string, unknown>;

/** Operations whose `where` gets the tenant. Unique ones too: Prisma accepts extra fields in a unique where. */
const FILTERED = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany",
  "count", "aggregate", "groupBy",
  "update", "updateMany", "updateManyAndReturn", "delete", "deleteMany",
]);
const CREATES = new Set(["create", "createMany", "createManyAndReturn"]);
const UPDATES = new Set(["update", "updateMany", "updateManyAndReturn", "upsert"]);
const DELETES = new Set(["delete", "deleteMany"]);

/**
 * The query's arguments with the tenant added: `clinicId` (and `branchId` for branch models) in every `where`
 * and every created row. Refuses (throws) when the model isn't listed, when the context has no clinic (or
 * branch), when the query names a different tenant or tries to move a row to one, when an append-only model is
 * updated or deleted, and for any operation it doesn't know. Fail closed: a refusal is a bug report, a leak isn't.
 */
export function scopeArgs(
  model: string,
  operation: string,
  args: Args | undefined,
  ctx: RequestContext | undefined,
  scopes: Readonly<Record<string, ModelScope>> = MODEL_SCOPE,
  appendOnly: ReadonlySet<string> = APPEND_ONLY,
): Args {
  const scope = scopes[model];
  if (!scope) throw new TenantScopeError(`${model} isn't listed in MODEL_SCOPE (src/prisma/model-scope.ts).`);
  if (appendOnly.has(model) && (UPDATES.has(operation) || DELETES.has(operation))) {
    throw new TenantScopeError(`${model} is append-only: ${operation} isn't allowed. Write a new row instead.`);
  }
  if (scope === "platform") return args ?? {};

  const tenant = tenantOf(model, scope, ctx);
  const scoped: Args = { ...args };
  if (FILTERED.has(operation)) scoped.where = withTenant(model, scoped.where, tenant);
  else if (CREATES.has(operation)) {
    scoped.data = Array.isArray(scoped.data)
      ? scoped.data.map((row) => withTenant(model, row, tenant))
      : withTenant(model, scoped.data, tenant);
  } else if (operation === "upsert") {
    scoped.where = withTenant(model, scoped.where, tenant);
    scoped.create = withTenant(model, scoped.create, tenant);
  } else throw new TenantScopeError(`${operation} on ${model} isn't handled by the tenant extension.`);

  if (UPDATES.has(operation)) assertNotMoved(model, operation === "upsert" ? scoped.update : scoped.data, tenant);
  return scoped;
}

function tenantOf(model: string, scope: Exclude<ModelScope, "platform">, ctx: RequestContext | undefined): Args {
  if (!ctx?.clinicId) throw new TenantScopeError(`${model} needs a clinic in the request context, and there is none.`);
  if (scope === "clinic") return { clinicId: ctx.clinicId };
  if (!ctx.branchId) throw new TenantScopeError(`${model} needs a branch in the request context, and there is none.`);
  return { clinicId: ctx.clinicId, branchId: ctx.branchId };
}

/** `target` with the tenant's keys set. A key already set to anything else (another clinic, a filter) is refused. */
function withTenant(model: string, target: unknown, tenant: Args): Args {
  const given = (target ?? {}) as Args;
  for (const [key, value] of Object.entries(tenant)) {
    if (given[key] !== undefined && given[key] !== value) {
      throw new TenantScopeError(`${model}.${key} in the query doesn't match the request context.`);
    }
  }
  return { ...given, ...tenant };
}

/** An update may not change a row's clinic or branch. Setting it to the value it already has is allowed. */
function assertNotMoved(model: string, data: unknown, tenant: Args) {
  const given = (data ?? {}) as Args;
  for (const key of Object.keys(tenant)) {
    if (given[key] !== undefined && given[key] !== tenant[key]) {
      throw new TenantScopeError(`${model}.${key} can't be changed by an update.`);
    }
  }
}

/** The tenant columns to spread into a create, so the input type is satisfied: `data: { ...clinicData(), ... }`. */
export function clinicData(): { clinicId: string } {
  const clinicId = currentContext()?.clinicId;
  if (!clinicId) throw new TenantScopeError("Creating a clinic record needs a clinic in the request context.");
  return { clinicId };
}

/** Applied once, in PrismaService. Reads the context on every query, so it follows the request it runs in. */
export const tenantScope = Prisma.defineExtension({
  name: "tenant-scope",
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        return query(scopeArgs(model, operation, args as Args, currentContext()) as typeof args);
      },
    },
  },
});
