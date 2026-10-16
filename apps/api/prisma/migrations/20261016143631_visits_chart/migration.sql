-- CreateTable
CREATE TABLE `Visit` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `dentistId` VARCHAR(191) NOT NULL,
    `appointmentId` VARCHAR(191) NULL,
    `date` DATE NOT NULL,
    `status` ENUM('in_progress', 'completed') NOT NULL,
    `startedAt` DATETIME(3) NOT NULL,
    `completedAt` DATETIME(3) NULL,

    INDEX `Visit_clinicId_patientId_startedAt_idx`(`clinicId`, `patientId`, `startedAt`),
    INDEX `Visit_clinicId_patientId_status_date_idx`(`clinicId`, `patientId`, `status`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ChartEntry` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NOT NULL,
    `tooth` INTEGER NOT NULL,
    `surfaces` JSON NOT NULL,
    `condition` ENUM('sound', 'caries', 'restored', 'sealant', 'fluoride', 'pulpotomy', 'pulpectomy', 'extracted', 'missing', 'unerupted', 'erupting') NOT NULL,
    `note` TEXT NULL,
    `recordedBy` VARCHAR(191) NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `supersedes` VARCHAR(191) NULL,

    INDEX `ChartEntry_clinicId_patientId_recordedAt_idx`(`clinicId`, `patientId`, `recordedAt`),
    UNIQUE INDEX `ChartEntry_clinicId_supersedes_key`(`clinicId`, `supersedes`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

