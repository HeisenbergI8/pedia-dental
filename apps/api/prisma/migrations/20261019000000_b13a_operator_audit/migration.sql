-- CreateTable
CREATE TABLE `OperatorAuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `operatorId` VARCHAR(191) NOT NULL,
    `operatorName` VARCHAR(191) NOT NULL,
    `action` ENUM('sign_in', 'sign_in_failed', 'sign_out', 'timed_out', 'view', 'create', 'update', 'export', 'denied') NOT NULL,
    `record` VARCHAR(191) NOT NULL,
    `detail` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NULL,

    INDEX `OperatorAuditEvent_at_idx`(`at`),
    INDEX `OperatorAuditEvent_targetId_at_idx`(`targetId`, `at`),
    INDEX `OperatorAuditEvent_operatorId_at_idx`(`operatorId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

