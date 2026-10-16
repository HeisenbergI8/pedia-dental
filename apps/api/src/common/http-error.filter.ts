import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";
import { ZodIssuesException } from "./zod-validation.pipe";

/**
 * Errors in the shape the web's api-client already reads from MSW: a 400 with Zod issues is a JSON array,
 * everything else is a plain-text message. Unexpected errors are logged and never leak their details.
 */
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (!(exception instanceof HttpException)) {
      this.logger.error(loggable(exception));
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

/**
 * Prisma errors quote the query's arguments (patient data) in their message, so only their kind, code and stack
 * frames are logged. Everything else is logged as is.
 */
function loggable(exception: unknown): unknown {
  if (!(exception instanceof Error) || !exception.name.startsWith("PrismaClient")) return exception;
  const code = (exception as { code?: unknown }).code;
  const frames = exception.stack?.split("\n").filter((line) => line.trimStart().startsWith("at ")).join("\n");
  return `${exception.name}${typeof code === "string" ? ` ${code}` : ""} (message withheld: may hold patient data)\n${frames ?? ""}`;
}

function messageOf(body: string | object): string | undefined {
  if (typeof body === "string") return body;
  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.join(". ");
  return undefined;
}
