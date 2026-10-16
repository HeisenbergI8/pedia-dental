-- CreateTable
CREATE TABLE `Appointment` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `branchId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `dentistId` VARCHAR(191) NOT NULL,
    `chairId` VARCHAR(191) NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `durationMin` INTEGER NOT NULL,
    `reason` TEXT NOT NULL,
    `procedureCode` VARCHAR(64) NULL,
    `status` ENUM('booked', 'confirmed', 'arrived', 'in_chair', 'done', 'no_show', 'cancelled') NOT NULL,
    `cancelReason` TEXT NULL,
    `sourceRuleId` VARCHAR(64) NULL,

    INDEX `Appointment_clinicId_branchId_startsAt_idx`(`clinicId`, `branchId`, `startsAt`),
    INDEX `Appointment_clinicId_chairId_startsAt_idx`(`clinicId`, `chairId`, `startsAt`),
    INDEX `Appointment_clinicId_dentistId_startsAt_idx`(`clinicId`, `dentistId`, `startsAt`),
    INDEX `Appointment_clinicId_patientId_startsAt_idx`(`clinicId`, `patientId`, `startsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AppointmentRequest` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `guardianId` VARCHAR(191) NOT NULL,
    `preferredDate` DATE NOT NULL,
    `timeOfDay` ENUM('morning', 'afternoon', 'any') NOT NULL,
    `reason` VARCHAR(200) NOT NULL,
    `note` VARCHAR(500) NULL,
    `status` ENUM('pending', 'handled') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `AppointmentRequest_clinicId_status_createdAt_idx`(`clinicId`, `status`, `createdAt`),
    INDEX `AppointmentRequest_clinicId_patientId_createdAt_idx`(`clinicId`, `patientId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DueItem` (
    `id` VARCHAR(191) NOT NULL,
    `clinicId` VARCHAR(191) NOT NULL,
    `patientId` VARCHAR(191) NOT NULL,
    `ruleId` VARCHAR(64) NOT NULL,
    `kind` ENUM('follow_up', 'recall') NOT NULL,
    `procedure` VARCHAR(64) NOT NULL,
    `dueOn` DATE NOT NULL,
    `sourceNoteId` VARCHAR(191) NOT NULL,
    `visitId` VARCHAR(191) NOT NULL,
    `appointmentId` VARCHAR(191) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL,

    INDEX `DueItem_clinicId_closedAt_dueOn_idx`(`clinicId`, `closedAt`, `dueOn`),
    INDEX `DueItem_clinicId_patientId_procedure_idx`(`clinicId`, `patientId`, `procedure`),
    UNIQUE INDEX `DueItem_clinicId_sourceNoteId_key`(`clinicId`, `sourceNoteId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

