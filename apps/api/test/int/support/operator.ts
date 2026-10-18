import type { INestApplication } from "@nestjs/common";
import { OPERATORS } from "@pedia/seed";
import { SessionService } from "../../../src/auth/session.service";

/** A pd_operator cookie for the seeded operator (B12 tests), without the sign-in's rate limit. */
export const asOperator = async (app: INestApplication) => `pd_operator=${await app.get(SessionService).openOperator(OPERATORS[0]!.id)}`;
