-- CreateTable
CREATE TABLE `ClinicAccount` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `logoRef` VARCHAR(191) NULL,
    `contactEmail` VARCHAR(191) NOT NULL,
    `tin` VARCHAR(191) NOT NULL,
    `tier` ENUM('small', 'mid', 'big') NOT NULL,
    `status` ENUM('active', 'suspended') NOT NULL,
    `brandColor` CHAR(7) NOT NULL,
    `headingFont` ENUM('nunito', 'poppins', 'lexend', 'quicksand', 'outfit', 'fredoka') NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `openingHours` JSON NOT NULL,
    `archived` BOOLEAN NOT NULL DEFAULT false,

    INDEX `Branch_clinicId_archived_idx`(`clinicId`, `archived`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Staff` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `role` ENUM('admin', 'dentist', 'front_desk') NOT NULL,
    `alsoRoles` JSON NOT NULL,
    `isOwner` BOOLEAN NOT NULL DEFAULT false,
    `branchIds` JSON NOT NULL,
    `licenseNo` VARCHAR(191) NULL,
    `email` VARCHAR(191) NOT NULL,
    `deactivatedAt` DATETIME(3) NULL,

    INDEX `Staff_clinicId_email_idx`(`clinicId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Credential` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NULL,
    `guardianId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `mustChange` BOOLEAN NOT NULL DEFAULT false,
    `pinHash` VARCHAR(191) NULL,
    `pinFailedAt` JSON NOT NULL,

    INDEX `Credential_email_idx`(`email`),
    UNIQUE INDEX `Credential_clinicId_accountId_key`(`clinicId`, `accountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_tokenHash_key`(`tokenHash`),
    INDEX `Session_clinicId_accountId_idx`(`clinicId`, `accountId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OperatorUser` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `OperatorUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OperatorSession` (
    `id` VARCHAR(191) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `operatorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `OperatorSession_tokenHash_key`(`tokenHash`),
    INDEX `OperatorSession_operatorId_idx`(`operatorId`),
    INDEX `OperatorSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Agreement` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `termsVersion` INTEGER NOT NULL,
    `dpaVersion` INTEGER NOT NULL,
    `acceptedBy` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `method` ENUM('online', 'on_file') NOT NULL,
    `signedOn` DATE NULL,

    INDEX `Agreement_clinicId_at_idx`(`clinicId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Acknowledgement` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `kind` ENUM('confidentiality', 'notice') NOT NULL,
    `version` INTEGER NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,

    INDEX `Acknowledgement_clinicId_accountId_kind_version_idx`(`clinicId`, `accountId`, `kind`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PrivacyNotice` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `body` TEXT NOT NULL,
    `contactName` VARCHAR(191) NOT NULL,
    `contactEmail` VARCHAR(191) NOT NULL,
    `savedByName` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PrivacyNotice_clinicId_version_key`(`clinicId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DemoLogin` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `role` ENUM('owner', 'admin', 'dentist', 'front_desk', 'parent') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(191) NOT NULL,
    `pin` CHAR(4) NULL,
    `position` INTEGER NOT NULL,
    `featured` BOOLEAN NOT NULL DEFAULT false,

    INDEX `DemoLogin_clinicId_position_idx`(`clinicId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
