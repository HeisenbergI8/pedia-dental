-- CreateTable
CREATE TABLE `ClinicalPhoto` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NULL,
    `type` ENUM('intraoral', 'extraoral', 'xray', 'referral', 'document') NOT NULL,
    `stage` ENUM('before', 'after') NULL,
    `tooth` INTEGER NULL,
    `takenOn` DATE NOT NULL,
    `caption` TEXT NOT NULL,
    `contentType` VARCHAR(64) NOT NULL,
    `uploadedBy` ENUM('staff', 'parent') NOT NULL,
    `fileKey` VARCHAR(191) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `ClinicalPhoto_clinicId_patientId_takenOn_createdAt_idx`(`clinicId`, `patientId`, `takenOn`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PatientDocument` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `type` ENUM('dental_certificate', 'treatment_plan', 'consent_form', 'referral_letter', 'clearance', 'dental_clearance', 'post_op_instructions', 'prescription', 'receipt', 'patient_summary', 'notes_report', 'privacy_consent') NOT NULL,
    `title` TEXT NOT NULL,
    `sourceId` VARCHAR(191) NULL,
    `details` JSON NULL,
    `items` JSON NULL,
    `issuedBy` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `PatientDocument_clinicId_createdAt_idx`(`clinicId`, `createdAt`),
    INDEX `PatientDocument_clinicId_patientId_createdAt_idx`(`clinicId`, `patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StoredFile` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `area` VARCHAR(32) NOT NULL,
    `bytes` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StoredFile_key_key`(`key`),
    INDEX `StoredFile_clinicId_idx`(`clinicId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
