import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { plainLanguageError } from "./errors";
import { CreatePatientInput } from "./schemas/patient";

const messageOf = (schema: z.ZodType, value: unknown) => schema.safeParse(value).error?.issues[0]?.message;

describe("plainLanguageError", () => {
  beforeAll(() => z.config({ customError: plainLanguageError }));
  afterAll(() => z.config({ customError: undefined }));

  it("words generic issues in plain English", () => {
    expect(messageOf(z.string().min(1), "")).toBe("This field is required");
    expect(messageOf(z.string().min(7), "12")).toBe("Enter at least 7 characters");
    expect(messageOf(z.string(), undefined)).toBe("This field is required");
    expect(messageOf(z.enum(["a", "b"]), "c")).toBe("Choose one of the options");
    expect(messageOf(z.string().email(), "x")).toBe("Enter a valid email address, like name@example.com");
  });

  it("never overrides a message the schema words itself", () => {
    expect(messageOf(z.string().min(1, "Give a reason"), "")).toBe("Give a reason");
  });

  it("leaves no developer jargon on an empty patient form", () => {
    const result = CreatePatientInput.safeParse({
      firstName: "",
      lastName: "",
      birthDate: "",
      sex: "female",
      address: "",
      guardians: [{ id: "g", fullName: "", relationship: "", phone: "", isPrimary: true }],
      emergencyContact: { name: "", phone: "" },
      allergies: [],
      medicalConditions: [],
      medications: [],
      alerts: [],
      dentalHistory: { previousClinic: "", notes: "" },
    });
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages).toContain("Enter the child's first name");
    expect(messages).toContain("Enter the date of birth");
    expect(messages).toContain("Enter the guardian's phone number, like 0917 123 4567");
    expect(messages.join(" ")).not.toMatch(/expected|pattern|Too small|Invalid/);
  });
});
