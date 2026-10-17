-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NULL,
    `appointmentId` VARCHAR(191) NULL,
    `discount` INTEGER NOT NULL,
    `issuedAt` DATETIME(3) NOT NULL,
    `voidedAt` DATETIME(3) NULL,
    `voidedBy` VARCHAR(191) NULL,
    `voidReason` TEXT NULL,

    INDEX `Invoice_clinicId_patientId_issuedAt_idx`(`clinicId`, `patientId`, `issuedAt`),
    INDEX `Invoice_clinicId_branchId_issuedAt_idx`(`clinicId`, `branchId`, `issuedAt`),
    INDEX `Invoice_clinicId_appointmentId_idx`(`clinicId`, `appointmentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceLine` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `planItemId` VARCHAR(191) NULL,
    `livePlanItemId` VARCHAR(191) NULL,
    `procedureCode` VARCHAR(64) NOT NULL,
    `description` TEXT NOT NULL,
    `tooth` INTEGER NULL,
    `amount` INTEGER NOT NULL,

    UNIQUE INDEX `InvoiceLine_clinicId_invoiceId_position_key`(`clinicId`, `invoiceId`, `position`),
    UNIQUE INDEX `InvoiceLine_clinicId_livePlanItemId_key`(`clinicId`, `livePlanItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NULL,
    `appliedTo` VARCHAR(191) NULL,
    `amount` INTEGER NOT NULL,
    `method` ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'account_credit') NOT NULL,
    `referenceNo` VARCHAR(100) NULL,
    `note` TEXT NULL,
    `receiptNo` VARCHAR(16) NOT NULL,
    `receiptLeg` INTEGER NOT NULL DEFAULT 0,
    `receivedBy` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL,

    INDEX `Payment_clinicId_patientId_receivedAt_idx`(`clinicId`, `patientId`, `receivedAt`),
    INDEX `Payment_clinicId_invoiceId_idx`(`clinicId`, `invoiceId`),
    INDEX `Payment_clinicId_branchId_receivedAt_idx`(`clinicId`, `branchId`, `receivedAt`),
    UNIQUE INDEX `Payment_clinicId_receiptNo_receiptLeg_key`(`clinicId`, `receiptNo`, `receiptLeg`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReceiptCounter` (
    `clinicId` VARCHAR(191) NOT NULL,
    `series` VARCHAR(2) NOT NULL,
    `last` INTEGER NOT NULL,

    PRIMARY KEY (`clinicId`, `series`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IdempotencyKey` (
    `clinicId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(100) NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `status` INTEGER NOT NULL,
    `response` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `IdempotencyKey_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`clinicId`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

