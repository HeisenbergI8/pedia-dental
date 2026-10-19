import { Injectable } from "@nestjs/common";

/** This clinic's restricted children's ids. Registered by PatientsService (the only reader of Patient). */
export type RestrictedLookup = () => Promise<ReadonlySet<string>>;
export const RESTRICTED_MESSAGE = "This child's record is restricted after a privacy request. Ask the clinic's Owner.";

/**
 * B13c2b E6: the guard's view of restricted records. A slot the patients feature fills in onModuleInit, as RecordOwners
 * (AuthModule can't import PatientsModule: it imports AuthModule). Unfilled, it fails closed: the request errors.
 */
@Injectable()
export class PatientRestrictions {
  private lookup?: RestrictedLookup;
  register(lookup: RestrictedLookup): void {
    if (this.lookup) throw new Error("A restriction lookup is already registered.");
    this.lookup = lookup;
  }
  restricted(): Promise<ReadonlySet<string>> {
    if (!this.lookup) throw new Error("No restriction lookup is registered (PatientsModule registers it).");
    return this.lookup();
  }
}
