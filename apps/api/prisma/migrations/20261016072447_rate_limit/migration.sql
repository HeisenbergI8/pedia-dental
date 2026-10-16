-- CreateTable
CREATE TABLE `RateLimitCounter` (
    `bucket` VARCHAR(191) NOT NULL,
    `windowStart` DATETIME(3) NOT NULL,
    `hits` INTEGER NOT NULL,

    INDEX `RateLimitCounter_windowStart_idx`(`windowStart`),
    PRIMARY KEY (`bucket`, `windowStart`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
