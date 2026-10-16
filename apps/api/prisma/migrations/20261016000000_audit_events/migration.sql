-- CreateTable
CREATE TABLE `AuditEvent` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `at` DATETIME(3) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `actorName` VARCHAR(191) NOT NULL,
    `actorRole` ENUM('owner', 'admin', 'dentist', 'front_desk', 'parent') NOT NULL,
    `action` ENUM('sign_in', 'sign_in_failed', 'sign_out', 'timed_out', 'view', 'create', 'update', 'export', 'denied') NOT NULL,
    `record` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NULL,

    INDEX `AuditEvent_clinicId_at_idx`(`clinicId`, `at`),
    INDEX `AuditEvent_clinicId_actorId_at_idx`(`clinicId`, `actorId`, `at`),
    INDEX `AuditEvent_clinicId_patientId_at_idx`(`clinicId`, `patientId`, `at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
