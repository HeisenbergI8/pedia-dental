import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { MetricsService } from "../metrics/metrics.service";
import { errorFingerprint, loggable } from "./process-errors";
import { ZodIssuesException } from "./zod-validation.pipe";

/**
 * Errors in the shape the web's api-client already reads from MSW: a 400 with Zod issues is a JSON array,
 * everything else is a plain-text message. Unexpected errors are logged and never leak their details.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  constructor(private readonly metrics: MetricsService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.metrics.countUnhandled();
      this.logger.error({ fingerprint: errorFingerprint(exception), err: loggable(exception) }, "Unhandled error");
      res.status(500).type("text/plain").send("Something went wrong. Try again.");
      return;
    }

    if (exception instanceof ZodIssuesException) {
      res.status(400).json(exception.issues);
      return;
    }
    res.status(exception.getStatus()).type("text/plain").send(messageOf(exception.getResponse()) ?? exception.message);
  }
}

function messageOf(body: string | object): string | undefined {
  if (typeof body === "string") return body;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(". ");
  return undefined;
}
