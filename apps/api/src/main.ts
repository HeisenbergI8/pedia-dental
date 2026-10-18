import "./clinic-time"; // first: everything below reads local time as Manila's (E3)
import "reflect-metadata";
import { existsSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { plainLanguageError } from "@pedia/shared";
import { Logger } from "nestjs-pino";
import { z } from "zod";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env";
import { installProcessHandlers } from "./common/process-errors";
import { SHUTDOWN_GRACE_MS, drainThenClose } from "./health/readiness";
import { configureHttp } from "./http-setup";
import { MetricsService } from "./metrics/metrics.service";

if (existsSync(".env")) process.loadEnvFile(".env"); // real env vars win over the file
z.config({ customError: plainLanguageError });

const env = loadEnv();
const app = await NestFactory.create(AppModule.forRoot(env, { background: env.BACKGROUND_WORK }), { bufferLogs: true });
app.useLogger(app.get(Logger)); // Nest's own Logger (HttpErrorFilter, bootstrap) now writes pino JSON
const pino = app.get(Logger);
installProcessHandlers((fields, message) => pino.fatal(fields, message), () => app.get(MetricsService).countUnhandled());
configureHttp(app, env);
app.get(MetricsService).start(env.METRICS_INTERVAL_S);
// Ctrl-C closes at once (local); SIGTERM (ECS) drains first so the load balancer stops routing here.
app.enableShutdownHooks(["SIGINT"]);
process.once("SIGTERM", () => void drainThenClose(app, SHUTDOWN_GRACE_MS));
await app.listen(env.PORT);
app.get(Logger).log(`API listening on http://localhost:${env.PORT}/api`);
