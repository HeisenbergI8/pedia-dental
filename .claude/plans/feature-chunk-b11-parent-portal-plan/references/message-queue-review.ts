// apps/api/src/message-queue/message-queue.service.ts: the only Message writer.
// queue (31-52): returns undefined when reminders were declined; sendAt = nextSendingTime(...) (8 AM–8 PM).
// IMPORTANT: wrong for invites/resets (decisions 12, 20) → B11 adds queueAccountText (Step 7.1).
// message-send.handler.ts (161-205): defers outside hours BEFORE reading the row; claims dispatchedAt, then calls the
// provider. B11 moves the defer into the claim (skipped for account kinds) and mints the link there (E5).
// NOTE: Message.patientId is required; MessageKind doubles as the template key (seed message-templates.ts:4).
