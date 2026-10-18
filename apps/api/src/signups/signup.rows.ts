import { OpeningHours, Signup, clinicNameKey } from "@pedia/shared";
import { z } from "zod";
import type { Prisma, Signup as SignupRow } from "../generated/prisma/client.ts";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const opt = <T>(v: T | null) => v ?? undefined;
const ReferenceKeys = z.array(z.string()).max(3);

/** Contract → row (the seed, a new sign-up, a fix). Every field of `Signup` has a column (B12 Step 4.1). */
export function toSignupRow(s: Signup): Prisma.SignupCreateInput {
  const b = s.branding;
  return {
    id: s.id, reference: s.reference, source: s.source, submittedAt: new Date(s.submittedAt),
    name: s.account.name, nameKey: clinicNameKey(s.account.name), contactEmail: s.account.contactEmail,
    contactEmailKey: s.account.contactEmail.toLowerCase(), tin: s.account.tin, tier: s.account.tier,
    branchName: s.branch.name, branchAddress: s.branch.address, branchPhone: s.branch.phone, branchOpeningHours: s.branch.openingHours,
    ownerName: s.owner.fullName, ownerEmail: s.owner.email, ownerRole: s.owner.role,
    branding: b.choice, brandColor: b.choice === "own" ? b.brandColor : null, headingFont: b.choice === "own" ? b.headingFont : null,
    brief: b.choice === "designed" ? b.brief : null, logoKey: s.logoRef ?? null, referenceKeys: s.referenceRefs,
    quoteSetupFee: s.quote.setupFee, quoteFirstMonth: s.quote.firstMonth, quoteDesignAddOn: s.quote.designAddOn,
    quoteTotal: s.quote.total, quoteVat: s.quote.vat,
    paymentMethod: s.payment?.method ?? null, paymentReference: s.payment?.reference ?? null,
    paidOn: s.payment ? day(s.payment.paidOn) : null, paymentAmount: s.payment?.amount ?? null,
    paymentRecordedAt: s.payment ? new Date(s.payment.recordedAt) : null,
    status: s.status, rejectionReason: s.rejection?.reason ?? null, rejectedAt: s.rejection ? new Date(s.rejection.at) : null,
    clinicId: s.approval?.clinicId ?? null, approvedAt: s.approval ? new Date(s.approval.at) : null,
    designStatus: s.design?.status ?? null, designDeliveredAt: s.design?.deliveredAt ? new Date(s.design.deliveredAt) : null,
    termsVersion: s.agreement.termsVersion, dpaVersion: s.agreement.dpaVersion, acceptedBy: s.agreement.acceptedBy,
    agreedAt: new Date(s.agreement.at), agreementMethod: s.agreement.method, signedOn: s.agreement.signedOn ? day(s.agreement.signedOn) : null,
    filesDeletedAt: s.filesDeletedAt ? new Date(s.filesDeletedAt) : null,
  };
}

/** Row → contract. Parsed, so a bad row fails here, not in the console. */
export function toSignup(r: SignupRow): Signup {
  const branding =
    r.branding === "own"
      ? { choice: "own" as const, brandColor: r.brandColor!, headingFont: r.headingFont }
      : r.branding === "designed"
        ? { choice: "designed" as const, brief: r.brief! }
        : { choice: "default" as const };
  return Signup.parse({
    id: r.id, reference: r.reference, source: r.source, submittedAt: r.submittedAt.toISOString(),
    account: { name: r.name, contactEmail: r.contactEmail, tin: r.tin, tier: r.tier },
    branch: { name: r.branchName, address: r.branchAddress, phone: r.branchPhone, openingHours: OpeningHours.parse(r.branchOpeningHours) },
    owner: { fullName: r.ownerName, email: r.ownerEmail, role: r.ownerRole },
    branding, logoRef: opt(r.logoKey), referenceRefs: ReferenceKeys.parse(r.referenceKeys),
    quote: { setupFee: r.quoteSetupFee, firstMonth: r.quoteFirstMonth, designAddOn: r.quoteDesignAddOn, total: r.quoteTotal, vat: r.quoteVat },
    ...(r.paymentMethod && {
      payment: {
        method: r.paymentMethod, reference: opt(r.paymentReference), paidOn: isoDay(r.paidOn!), amount: r.paymentAmount!,
        recordedAt: r.paymentRecordedAt!.toISOString(),
      },
    }),
    status: r.status,
    ...(r.rejectedAt && { rejection: { reason: r.rejectionReason!, at: r.rejectedAt.toISOString() } }),
    ...(r.approvedAt && { approval: { clinicId: r.clinicId!, at: r.approvedAt.toISOString() } }),
    ...(r.designStatus && { design: { status: r.designStatus, deliveredAt: r.designDeliveredAt?.toISOString() } }),
    agreement: {
      termsVersion: r.termsVersion, dpaVersion: r.dpaVersion, acceptedBy: r.acceptedBy, at: r.agreedAt.toISOString(),
      method: r.agreementMethod, ...(r.signedOn && { signedOn: isoDay(r.signedOn) }),
    },
    filesDeletedAt: r.filesDeletedAt?.toISOString(),
  });
}
