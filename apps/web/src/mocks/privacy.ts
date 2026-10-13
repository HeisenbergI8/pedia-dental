import {
  CONFIDENTIALITY_NOTICE,
  LEGAL_DOCUMENTS,
  currentChoices,
  rolesCan,
  termsOutdated,
  type AcknowledgementKind,
  type AcknowledgementPrompt,
  type AgreementRecord,
  type ClinicAgreement,
  type PrivacyNotice,
  type PrivacyNoticeView,
} from "@pedia/shared";
import { accountById, platform, type Db } from "./db";
import { childrenOf, type DemoAccountRecord } from "./demo-accounts";

/*
 * Privacy, terms and consent (feature 18). Reads `platform` and the tenant it is handed, never the per-request
 * binding, so the public notice route and the console can use it too.
 */

const last = <T>(rows: T[]): T | undefined => rows[rows.length - 1];

/** The agreement in force for a clinic (P6): the newest row. */
export const latestAgreement = (clinicId: string): ClinicAgreement | undefined => last(platform.agreements.filter((a) => a.clinicId === clinicId));

/** For the console's strict `AccountOverview`: the agreement without its clinic id. */
export const agreementView = ({ termsVersion, dpaVersion, acceptedBy, at, method, signedOn }: ClinicAgreement): AgreementRecord => ({
  termsVersion,
  dpaVersion,
  acceptedBy,
  at,
  method,
  ...(signedOn && { signedOn }),
});

/** The notice in force (P20). Every clinic has version 1 from its seed or `createClinic`. */
export const currentNotice = (tenant: Db): PrivacyNotice => last(tenant.privacyNotices)!;

export function noticeView(clinicId: string): PrivacyNoticeView {
  const n = currentNotice(platform.tenants[clinicId]!);
  return { version: n.version, body: n.body, contactName: n.contactName, contactEmail: n.contactEmail, savedByName: n.savedByName, at: n.at, clinicName: accountById(clinicId)!.name };
}

const acknowledged = (tenant: Db, accountId: string, kind: "confidentiality" | "notice", version: number) =>
  tenant.acknowledgements.some((a) => a.accountId === accountId && a.kind === kind && a.version === version);

/**
 * P10: what this login must clear before working, in order. The Owner (clinic.manage) accepts new Terms or DPA (#9);
 * a staff login acknowledges confidentiality once per version (#21); a parent reads each notice version once (#20).
 */
export function pendingAcknowledgement(account: DemoAccountRecord, clinicId: string): AcknowledgementKind | undefined {
  const tenant = platform.tenants[clinicId];
  if (!tenant) return undefined;
  if (rolesCan(account.roles, "clinic.manage") && termsOutdated(latestAgreement(clinicId))) return "terms";
  if (account.staffId && !acknowledged(tenant, account.id, "confidentiality", CONFIDENTIALITY_NOTICE.version)) return "confidentiality";
  if (account.guardianId && !acknowledged(tenant, account.id, "notice", currentNotice(tenant).version)) return "notice";
  return undefined;
}

/** The version a POST must name: terms and DPA move together on the terms number. */
export function expectedVersion(kind: AcknowledgementKind, tenant: Db): number {
  if (kind === "terms") return LEGAL_DOCUMENTS.terms.version;
  if (kind === "confidentiality") return CONFIDENTIALITY_NOTICE.version;
  return currentNotice(tenant).version;
}

/** GET /auth/acknowledgement: the page the app shows. A parent's own children and their consents come with the notice. */
export function acknowledgementPrompt(kind: AcknowledgementKind, account: DemoAccountRecord, clinicId: string): AcknowledgementPrompt {
  const tenant = platform.tenants[clinicId]!;
  const clinicName = accountById(clinicId)!.name;
  const version = expectedVersion(kind, tenant);
  if (kind === "terms") {
    const { terms, dpa } = LEGAL_DOCUMENTS;
    return {
      kind,
      version,
      clinicName,
      title: "Primolar's updated terms",
      paragraphs: [
        `Primolar has updated its Terms of Service (version ${terms.version}) and Data Processing Agreement (version ${dpa.version}). Read them, then accept to keep using Primolar. Your staff keep working meanwhile.`,
        `By accepting, you confirm you're authorised to act for ${clinicName}.`,
      ],
    };
  }
  if (kind === "confidentiality") {
    return { kind, version, clinicName, title: "Patient records are confidential", paragraphs: [CONFIDENTIALITY_NOTICE.text, CONFIDENTIALITY_NOTICE.more] };
  }
  const notice = currentNotice(tenant);
  const children = account.guardianId
    ? childrenOf(tenant, account.guardianId).map((p) => {
        const c = currentChoices(p);
        return { firstName: p.firstName, recorded: !!p.privacyConsent, photos: c?.photos, reminders: c?.reminders };
      })
    : [];
  return {
    kind,
    version,
    clinicName,
    title: `${clinicName}'s privacy notice`,
    paragraphs: notice.body.split(/\n{2,}/).filter((p) => p.trim()),
    contact: { name: notice.contactName, email: notice.contactEmail },
    children,
  };
}

/** Privacy #23: who acknowledged which version, when. Append-only. The caller persists. */
export function recordAcknowledgement(tenant: Db, clinicId: string, account: { id: string; name: string }, kind: "confidentiality" | "notice", version: number) {
  tenant.acknowledgements.push({ clinicId, kind, version, accountId: account.id, name: account.name, at: new Date().toISOString() });
}
