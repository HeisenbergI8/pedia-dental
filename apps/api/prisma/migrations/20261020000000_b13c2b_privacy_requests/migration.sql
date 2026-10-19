-- AlterTable
ALTER TABLE `Patient` ADD COLUMN `restrictedAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `PrivacyRequest` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NULL,
    `kind` ENUM('access', 'correction', 'erasure', 'objection', 'other') NOT NULL,
    `requesterName` VARCHAR(120) NOT NULL,
    `relationship` VARCHAR(60) NULL,
    `channel` ENUM('in_person', 'phone', 'text', 'email', 'letter') NOT NULL,
    `details` VARCHAR(500) NULL,
    `receivedOn` DATE NOT NULL,
    `dueOn` DATE NOT NULL,
    `status` ENUM('open', 'done', 'declined') NOT NULL DEFAULT 'open',
    `outcome` VARCHAR(500) NULL,
    `loggedById` VARCHAR(191) NOT NULL,
    `loggedByName` VARCHAR(191) NOT NULL,
    `loggedAt` DATETIME(3) NOT NULL,
    `closedById` VARCHAR(191) NULL,
    `closedByName` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,

    INDEX `PrivacyRequest_clinicId_status_dueOn_idx`(`clinicId`, `status`, `dueOn`),
    INDEX `PrivacyRequest_clinicId_status_closedAt_idx`(`clinicId`, `status`, `closedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Patient_clinicId_restrictedAt_idx` ON `Patient`(`clinicId`, `restrictedAt`);

