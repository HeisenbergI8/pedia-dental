-- AlterTable
ALTER TABLE `PaymentReceipt` ADD COLUMN `packs` INTEGER NULL,
    ADD COLUMN `parts` INTEGER NULL,
    MODIFY `purpose` ENUM('signup', 'subscription', 'text_topup') NOT NULL;

-- CreateTable
CREATE TABLE `TextTopUp` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `month` CHAR(7) NOT NULL,
    `packs` INTEGER NOT NULL,
    `parts` INTEGER NOT NULL,
    `invoiceNo` VARCHAR(16) NOT NULL,
    `method` ENUM('cash', 'gcash', 'maya', 'card', 'bank_transfer', 'account_credit') NOT NULL,
    `reference` VARCHAR(60) NULL,
    `paidOn` DATE NOT NULL,
    `amount` INTEGER NOT NULL,
    `receiptId` VARCHAR(191) NULL,
    `recordedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TextTopUp_invoiceNo_key`(`invoiceNo`),
    UNIQUE INDEX `TextTopUp_receiptId_key`(`receiptId`),
    INDEX `TextTopUp_clinicId_month_idx`(`clinicId`, `month`),
    INDEX `TextTopUp_clinicId_recordedAt_idx`(`clinicId`, `recordedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
