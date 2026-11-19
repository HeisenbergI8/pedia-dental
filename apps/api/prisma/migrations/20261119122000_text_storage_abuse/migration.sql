-- Audit #21: the account text to a guardian's old number when their sign-in number changes.
-- AlterTable
ALTER TABLE `Message` MODIFY `kind` ENUM('appointment_confirmation', 'appointment_reminder', 'post_extraction', 'post_pulpotomy', 'fluoride_instructions', 'pre_treatment', 'missed_appointment', 'follow_up_reminder', 'recall', 'birthday', 'portal_invite', 'password_reset', 'sign_in_changed') NOT NULL;

-- Audit #21: when an active parent's sign-in number last changed (resets are held for 24 hours after it).
-- AlterTable
ALTER TABLE `PortalAccount` ADD COLUMN `numberChangedAt` DATETIME(3) NULL;

-- Audit #3, #4: the clinic's invites and resets in the last day are counted by purpose and time.
-- CreateIndex
CREATE INDEX `PortalLink_clinicId_purpose_createdAt_idx` ON `PortalLink`(`clinicId`, `purpose`, `createdAt`);
