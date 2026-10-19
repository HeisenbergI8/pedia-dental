-- B14: each patient's standing, kept by the writes (expand only: the defaults are a never-seen child owing nothing).
-- AlterTable
ALTER TABLE `Patient` ADD COLUMN `balance` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `lastVisitOn` DATE NULL,
    ADD COLUMN `nextDueOn` DATE NULL,
    ADD COLUMN `noContact` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `Patient_clinicId_restrictedAt_balance_idx` ON `Patient`(`clinicId`, `restrictedAt`, `balance`);

