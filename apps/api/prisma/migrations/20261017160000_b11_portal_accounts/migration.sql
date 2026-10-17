-- AlterTable
ALTER TABLE `Credential` ADD COLUMN `phone` VARCHAR(16) NULL,
    MODIFY `email` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Message` ADD COLUMN `linkId` VARCHAR(191) NULL,
    MODIFY `kind` ENUM('appointment_confirmation', 'appointment_reminder', 'post_extraction', 'post_pulpotomy', 'fluoride_instructions', 'pre_treatment', 'missed_appointment', 'follow_up_reminder', 'recall', 'birthday', 'portal_invite', 'password_reset') NOT NULL;

-- CreateTable
CREATE TABLE `PortalAccount` (
    `clinicId` VARCHAR(191) NOT NULL,
    `guardianId` VARCHAR(64) NOT NULL,
    `state` ENUM('invited', 'active', 'off') NOT NULL,
    `invitedAt` DATETIME(3) NULL,
    `invitedBy` VARCHAR(191) NULL,
    `activatedAt` DATETIME(3) NULL,
    `turnedOffAt` DATETIME(3) NULL,

    PRIMARY KEY (`clinicId`, `guardianId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PortalLink` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `guardianId` VARCHAR(64) NOT NULL,
    `purpose` ENUM('invite', 'reset') NOT NULL,
    `tokenHash` CHAR(64) NULL,
    `demoToken` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `cancelledAt` DATETIME(3) NULL,

    UNIQUE INDEX `PortalLink_tokenHash_key`(`tokenHash`),
    INDEX `PortalLink_clinicId_guardianId_purpose_idx`(`clinicId`, `guardianId`, `purpose`),
    INDEX `PortalLink_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Credential_phone_idx` ON `Credential`(`phone`);

-- CreateIndex
CREATE UNIQUE INDEX `Credential_clinicId_phone_key` ON `Credential`(`clinicId`, `phone`);
