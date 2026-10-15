import "reflect-metadata";
import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { plainLanguageError } from "@pedia/shared";
import { z } from "zod";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";

if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
z.config({ customError: plainLanguageError });

const env = loadEnv();
const app = await NestFactory.create(AppModule.forRoot(env));
app.setGlobalPrefix("api");
app.enableCors({ origin: env.CORS_ORIGIN.split(","), credentials: true });
app.enableShutdownHooks();
await app.listen(env.PORT);
console.log(`API listening on http://localhost:${env.PORT}/api`);
