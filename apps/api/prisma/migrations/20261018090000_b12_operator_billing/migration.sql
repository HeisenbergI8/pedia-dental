-- CreateTable
CREATE TABLE `PlatformSettings` (
    `id` VARCHAR(191) NOT NULL,
    `smallSetupFee` INTEGER NOT NULL,
    `smallMonthlyFee` INTEGER NOT NULL,
    `midSetupFee` INTEGER NOT NULL,
    `midMonthlyFee` INTEGER NOT NULL,
    `bigSetupFee` INTEGER NOT NULL,
    `bigMonthlyFee` INTEGER NOT NULL,
    `designAddOn` INTEGER NOT NULL,
    `paymentQrKey` VARCHAR(191) NULL,
    `paymentQrCaption` VARCHAR(120) NULL,
    `paymentQrUpdatedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PriceChange` (
    `id` VARCHAR(191) NOT NULL,
    `on` DATE NOT NULL,
    `smallSetupFee` INTEGER NOT NULL,
    `smallMonthlyFee` INTEGER NOT NULL,
    `midSetupFee` INTEGER NOT NULL,
    `midMonthlyFee` INTEGER NOT NULL,
    `bigSetupFee` INTEGER NOT NULL,
    `bigMonthlyFee` INTEGER NOT NULL,
    `designAddOn` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `PriceChange_on_idx`(`on`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Signup` (
    `id` VARCHAR(191) NOT NULL,
    `reference` CHAR(13) NOT NULL,
    `source` ENUM('form', 'console') NOT NULL,
    `submittedAt` DATETIME(3) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `nameKey` VARCHAR(191) NOT NULL,
    `contactEmail` VARCHAR(191) NOT NULL,
    `contactEmailKey` VARCHAR(191) NOT NULL,
    `tin` VARCHAR(191) NOT NULL,
    `tier` ENUM('small', 'mid', 'big') NOT NULL,
    `branchName` VARCHAR(191) NOT NULL,
    `branchAddress` VARCHAR(191) NOT NULL,
    `branchPhone` VARCHAR(191) NOT NULL,
    `branchOpeningHours` JSON NOT NULL,
    `ownerName` VARCHAR(191) NOT NULL,
    `ownerEmail` VARCHAR(191) NOT NULL,
    `ownerRole` ENUM('admin', 'dentist', 'front_desk') NOT NULL,
    `branding` ENUM('own', 'default', 'designed') NOT NULL,
    `brandColor` CHAR(7) NULL,
    `headingFont` ENUM('nunito', 'poppins', 'lexend', 'quicksand', 'outfit', 'fredoka') NULL,
    `brief` TEXT NULL,
    `logoKey` VARCHAR(191) NULL,
    `referenceKeys` JSON NOT NULL,
    `quoteSetupFee` INTEGER NOT NULL,
    `quoteFirstMonth` INTEGER NOT NULL,
    `quoteDesignAddOn` INTEGER NOT NULL,
    `quoteTotal` INTEGER NOT NULL,
    `quoteVat` INTEGER NOT NULL,
    `paymentMethod` ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'account_credit') NULL,
    `paymentReference` VARCHAR(60) NULL,
    `paidOn` DATE NULL,
    `paymentAmount` INTEGER NULL,
    `paymentRecordedAt` DATETIME(3) NULL,
    `status` ENUM('waiting', 'approved', 'rejected') NOT NULL,
    `rejectionReason` TEXT NULL,
    `rejectedAt` DATETIME(3) NULL,
    `clinicId` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `designStatus` ENUM('in_progress', 'delivered') NULL,
    `designDeliveredAt` DATETIME(3) NULL,
    `termsVersion` INTEGER NOT NULL,
    `dpaVersion` INTEGER NOT NULL,
    `acceptedBy` VARCHAR(191) NOT NULL,
    `agreedAt` DATETIME(3) NOT NULL,
    `agreementMethod` ENUM('online', 'on_file') NOT NULL,
    `signedOn` DATE NULL,
    `filesDeletedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Signup_reference_key`(`reference`),
    UNIQUE INDEX `Signup_clinicId_key`(`clinicId`),
    INDEX `Signup_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `Signup_nameKey_idx`(`nameKey`),
    INDEX `Signup_contactEmailKey_idx`(`contactEmailKey`),
    INDEX `Signup_status_rejectedAt_idx`(`status`, `rejectedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Subscription` (
    `clinicId` VARCHAR(191) NOT NULL,
    `anchor` DATE NOT NULL,
    `paidMonths` INTEGER NOT NULL,
    `downgradeTier` ENUM('small', 'mid', 'big') NULL,
    `downgradeOn` DATE NULL,
    `priceTier` ENUM('small', 'mid', 'big') NULL,
    `priceTierUntil` DATE NULL,
    `cancelledAt` DATETIME(3) NULL,
    `pause` ENUM('overdue', 'cancelled') NULL,

    PRIMARY KEY (`clinicId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionPayment` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `invoiceNo` VARCHAR(16) NOT NULL,
    `tier` ENUM('small', 'mid', 'big') NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `method` ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'account_credit') NOT NULL,
    `reference` VARCHAR(60) NULL,
    `paidOn` DATE NOT NULL,
    `amount` INTEGER NOT NULL,
    `recordedAt` DATETIME(3) NOT NULL,
    `receiptId` VARCHAR(191) NULL,

    UNIQUE INDEX `SubscriptionPayment_invoiceNo_key`(`invoiceNo`),
    UNIQUE INDEX `SubscriptionPayment_receiptId_key`(`receiptId`),
    INDEX `SubscriptionPayment_clinicId_recordedAt_idx`(`clinicId`, `recordedAt`),
    UNIQUE INDEX `SubscriptionPayment_clinicId_periodStart_key`(`clinicId`, `periodStart`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SubscriptionLine` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,

    UNIQUE INDEX `SubscriptionLine_paymentId_position_key`(`paymentId`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InvoiceCounter` (
    `id` VARCHAR(191) NOT NULL,
    `next` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `purpose` ENUM('signup', 'subscription') NOT NULL,
    `signupId` VARCHAR(191) NULL,
    `clinicId` VARCHAR(191) NULL,
    `periodStart` DATE NULL,
    `amountDue` INTEGER NOT NULL,
    `reference` VARCHAR(60) NOT NULL,
    `fileKey` VARCHAR(191) NULL,
    `bytes` INTEGER NOT NULL,
    `uploadedAt` DATETIME(3) NOT NULL,
    `status` ENUM('pending', 'confirmed', 'rejected') NOT NULL,
    `decidedAt` DATETIME(3) NULL,
    `rejectionReason` VARCHAR(500) NULL,

    INDEX `PaymentReceipt_status_uploadedAt_idx`(`status`, `uploadedAt`),
    INDEX `PaymentReceipt_clinicId_uploadedAt_idx`(`clinicId`, `uploadedAt`),
    INDEX `PaymentReceipt_signupId_uploadedAt_idx`(`signupId`, `uploadedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


-- B12: the two singletons a live database needs without the seed (the seed overwrites them). The starting price list
-- is SEED_PRICES (packages/seed/src/seed-signups.ts), in centavos; no payment QR yet (decision 23).
INSERT INTO `PlatformSettings` (`id`, `smallSetupFee`, `smallMonthlyFee`, `midSetupFee`, `midMonthlyFee`, `bigSetupFee`, `bigMonthlyFee`, `designAddOn`, `paymentQrKey`, `paymentQrCaption`, `paymentQrUpdatedAt`)
VALUES ('primolar', 500000, 250000, 1000000, 500000, 2000000, 1000000, 750000, NULL, NULL, NULL);
INSERT INTO `InvoiceCounter` (`id`, `next`) VALUES ('primolar', 1);
