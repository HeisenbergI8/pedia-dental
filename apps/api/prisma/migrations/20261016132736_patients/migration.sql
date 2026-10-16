-- CreateTable
CREATE TABLE `Patient` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientNo` VARCHAR(16) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `nickname` VARCHAR(30) NULL,
    `birthDate` DATE NOT NULL,
    `sex` ENUM('male', 'female') NOT NULL,
    `address` TEXT NULL,
    `emergencyName` VARCHAR(191) NULL,
    `emergencyPhone` VARCHAR(191) NULL,
    `allergies` JSON NOT NULL,
    `noKnownAllergies` BOOLEAN NULL,
    `medicalConditions` JSON NOT NULL,
    `medications` JSON NOT NULL,
    `noKnownConditions` BOOLEAN NULL,
    `alerts` JSON NOT NULL,
    `tags` JSON NULL,
    `dentalHistory` JSON NOT NULL,
    `profile` JSON NULL,
    `photoRef` VARCHAR(191) NULL,
    `photoUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `searchNames` TEXT NOT NULL,
    `searchPhones` VARCHAR(512) NOT NULL,

    INDEX `Patient_clinicId_lastName_firstName_idx`(`clinicId`, `lastName`, `firstName`),
    INDEX `Patient_clinicId_birthDate_idx`(`clinicId`, `birthDate`),
    UNIQUE INDEX `Patient_clinicId_patientNo_key`(`clinicId`, `patientNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PatientGuardian` (
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `guardianId` VARCHAR(64) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `email` VARCHAR(191) NULL,
    `isPrimary` BOOLEAN NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,

    INDEX `PatientGuardian_clinicId_guardianId_idx`(`clinicId`, `guardianId`),
    INDEX `PatientGuardian_clinicId_phone_idx`(`clinicId`, `phone`),
    PRIMARY KEY (`clinicId`, `patientId`, `guardianId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PatientConsent` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `guardianId` VARCHAR(64) NOT NULL,
    `scope` ENUM('general_treatment', 'local_anesthesia', 'extraction', 'radiographs', 'clinical_photos', 'sedation') NOT NULL,
    `date` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `PatientConsent_clinicId_patientId_createdAt_idx`(`clinicId`, `patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PatientPrivacyConsent` (
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `guardianId` VARCHAR(64) NOT NULL,
    `guardianName` VARCHAR(191) NOT NULL,
    `relationship` VARCHAR(191) NOT NULL,
    `noticeVersion` INTEGER NOT NULL,
    `formVersion` INTEGER NOT NULL,
    `recordedById` VARCHAR(191) NOT NULL,
    `recordedByName` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`clinicId`, `patientId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrivacyChoice` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `photos` BOOLEAN NOT NULL,
    `reminders` BOOLEAN NOT NULL,
    `by` ENUM('staff', 'parent') NOT NULL,
    `byName` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PrivacyChoice_clinicId_patientId_position_key`(`clinicId`, `patientId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
