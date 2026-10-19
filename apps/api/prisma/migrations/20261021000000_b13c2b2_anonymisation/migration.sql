-- AlterTable
ALTER TABLE `ClinicAccount` ADD COLUMN `purgedAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Patient` ADD COLUMN `anonymisedAt` DATETIME(3) NULL;

