-- DropIndex
DROP INDEX `Staff_clinicId_email_idx` ON `Staff`;

-- CreateTable
CREATE TABLE `Chair` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `Chair_clinicId_branchId_idx`(`clinicId`, `branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Procedure` (
    `clinicId` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `defaultDurationMin` INTEGER NOT NULL,
    `fee` INTEGER NOT NULL,
    `perTooth` BOOLEAN NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`clinicId`, `code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NoteTemplate` (
    `clinicId` VARCHAR(191) NOT NULL,
    `id` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `procedure` VARCHAR(64) NOT NULL,
    `fields` JSON NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`clinicId`, `id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MessageTemplate` (
    `clinicId` VARCHAR(191) NOT NULL,
    `kind` ENUM('appointment_confirmation', 'appointment_reminder', 'post_extraction', 'post_pulpotomy', 'fluoride_instructions', 'pre_treatment', 'missed_appointment', 'follow_up_reminder', 'recall', 'birthday') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `body` VARCHAR(480) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`clinicId`, `kind`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `Staff_clinicId_email_key` ON `Staff`(`clinicId`, `email`);

