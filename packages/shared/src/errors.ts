import { z } from "zod";

type Issue = Parameters<NonNullable<z.core.$ZodConfig["customError"]>>[0];

/**
 * Plain-English fallback for validation messages that a schema doesn't word itself.
 * Field-specific messages in the schemas always win over these.
 * Install once per app with `z.config({ customError: plainLanguageError })`.
 */
export function plainLanguageError(issue: Issue): string | undefined {
  switch (issue.code) {
    case "too_small":
      if (issue.origin === "string") return Number(issue.minimum) <= 1 ? "This field is required" : `Enter at least ${issue.minimum} characters`;
      if (issue.origin === "array") return Number(issue.minimum) <= 1 ? "Add at least one" : `Add at least ${issue.minimum}`;
      if (issue.origin === "number") return issue.inclusive ? `Enter ${issue.minimum} or more` : `Enter a number above ${issue.minimum}`;
      return undefined;
    case "too_big":
      if (issue.origin === "string") return `Keep this under ${Number(issue.maximum) + 1} characters`;
      if (issue.origin === "number") return `Enter ${issue.maximum} or less`;
      return undefined;
    case "invalid_type":
      if (issue.input === undefined || issue.input === null || issue.input === "") return "This field is required";
      return issue.expected === "number" ? "Enter a number" : "Enter a valid value";
    case "invalid_format":
      if (issue.format === "email") return "Enter a valid email address, like name@example.com";
      if (issue.format === "datetime" || issue.format === "date") return "Enter a valid date";
      return "This isn't in the expected format";
    case "invalid_value":
      return "Choose one of the options";
    default:
      return undefined;
  }
}
