-- AlterTable
ALTER TABLE `ClinicAccount` ADD COLUMN `supportContactEmail` VARCHAR(191) NULL,
    ADD COLUMN `supportContactName` VARCHAR(120) NULL,
    ADD COLUMN `supportContactPhone` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `PlatformSettings` ADD COLUMN `supportChatUrl` VARCHAR(500) NULL,
    ADD COLUMN `supportEmail` VARCHAR(191) NULL,
    ADD COLUMN `textPackParts` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `textPackPrice` INTEGER NOT NULL DEFAULT 15000;

-- AlterTable
ALTER TABLE `PriceChange` ADD COLUMN `textPackParts` INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN `textPackPrice` INTEGER NOT NULL DEFAULT 15000;
