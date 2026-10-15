import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/** Carries the Zod issues to `HttpErrorFilter`, which sends them as the 400 body. */
export class ZodIssuesException extends BadRequestException {
  constructor(readonly issues: z.core.$ZodIssue[]) {
    super("Invalid input");
  }
}

/**
 * Validates a body, query or param with a schema from @pedia/shared:
 * `@Body(new ZodValidationPipe(PatientInput)) input: PatientInput`.
 * A failure is a 400 whose body is the Zod issues array, the shape the web's `readableError` reads.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);
    return parsed.data;
  }
}
