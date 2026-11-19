-- CreateTable
CREATE TABLE `ClinicLetterhead` (
    `clinicId` VARCHAR(191) NOT NULL,
    `mode` ENUM('standard', 'text', 'image') NOT NULL,
    `tagline` VARCHAR(80) NULL,
    `listBranches` BOOLEAN NOT NULL,
    `socialLinks` JSON NOT NULL,
    `dentistLine` VARCHAR(120) NULL,
    `footerNote` VARCHAR(160) NULL,
    `imageKey` VARCHAR(191) NULL,
    `imageUpdatedAt` DATETIME(3) NULL,

    PRIMARY KEY (`clinicId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
