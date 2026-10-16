-- CreateTable
CREATE TABLE `ClinicalNote` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(64) NOT NULL,
    `values` JSON NOT NULL,
    `behavior` JSON NOT NULL,
    `behaviorNote` VARCHAR(300) NULL,
    `authorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `signedAt` DATETIME(3) NULL,

    INDEX `ClinicalNote_clinicId_patientId_createdAt_idx`(`clinicId`, `patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GrowthRecord` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NOT NULL,
    `habits` JSON NOT NULL,
    `speech` TEXT NULL,
    `recordedAt` DATETIME(3) NOT NULL,

    INDEX `GrowthRecord_clinicId_patientId_recordedAt_idx`(`clinicId`, `patientId`, `recordedAt`),
    UNIQUE INDEX `GrowthRecord_clinicId_visitId_key`(`clinicId`, `visitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PlanItem` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `procedureCode` VARCHAR(64) NOT NULL,
    `tooth` INTEGER NULL,
    `fee` INTEGER NOT NULL,
    `status` ENUM('planned', 'in_progress', 'done', 'declined') NOT NULL,
    `sourceChartEntryId` VARCHAR(191) NULL,
    `completedVisitId` VARCHAR(191) NULL,
    `completedNoteId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `PlanItem_clinicId_patientId_createdAt_idx`(`clinicId`, `patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

