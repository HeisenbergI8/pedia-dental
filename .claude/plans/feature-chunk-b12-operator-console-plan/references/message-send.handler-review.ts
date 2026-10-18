// apps/api/src/message-queue/message-send.handler.ts: sends one Message exactly once (B9 E3) through a committed claim.

const claim = await runInTransaction(this.prisma, async (tx) => {
  // First statement locks (lock-before-first-read trap):
  const [m] = await tx.$queryRaw`SELECT status, dispatchedAt, \`to\`, body, kind, linkId FROM Message WHERE id = ${messageId} AND clinicId = ${ownClinicId()} FOR UPDATE`;
  if (!m || m.status !== "queued") return { skip: true };
  if (open > now && !isAccountText(m.kind)) return { defer: open };      // sending hours; account texts any hour
  if (m.dispatchedAt) { /* failed: FAILURE.notConfirmed */ }
  // noPhone → failed + permanent; link minted here for account texts (B11 E5)
  await tx.message.update({ where: { id: messageId }, data: { dispatchedAt: now } });
  return { send: { number, body, dispatchedAt: now } };
});
// provider call outside the transaction; a definite failure releases the claim (dispatchedAt: null).

// IMPORTANT (E9): the text allowance is checked in this claim. lockAccount goes BEFORE the Message lock (global order
// account → … → Message → PortalLink), `segments` is written with dispatchedAt, and a template kind over the month's
// parts is failed with FAILURE.textLimit and never retried (decision 19).
// NOTE: `segments` is today written only after the provider answers, so a count by sentAt misses in-flight texts.
