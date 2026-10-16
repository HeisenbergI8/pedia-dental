-- CreateTable
CREATE TABLE `OutboxMessage` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NULL,
    `kind` VARCHAR(64) NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('pending', 'done', 'failed') NOT NULL DEFAULT 'pending',
    `availableAt` DATETIME(3) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL,
    `processedAt` DATETIME(3) NULL,

    INDEX `OutboxMessage_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `OutboxMessage_status_processedAt_idx`(`status`, `processedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JobLock` (
    `name` VARCHAR(64) NOT NULL,
    `lockedUntil` DATETIME(3) NOT NULL,
    `lockedBy` VARCHAR(191) NOT NULL,
    `lastStartedAt` DATETIME(3) NULL,
    `lastFinishedAt` DATETIME(3) NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `OperatorSession_lastSeenAt_idx` ON `OperatorSession`(`lastSeenAt`);

-- CreateIndex
CREATE INDEX `Session_lastSeenAt_idx` ON `Session`(`lastSeenAt`);
