-- B14: the booking's clash check reads one day's appointments by start, inside the clinic's lock (Book target).
-- CreateIndex
CREATE INDEX `Appointment_clinicId_startsAt_idx` ON `Appointment`(`clinicId`, `startsAt`);

