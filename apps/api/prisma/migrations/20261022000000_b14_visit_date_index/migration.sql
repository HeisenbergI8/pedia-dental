-- B14: Today's week of visitors without scanning every visit.
CREATE INDEX `Visit_clinicId_status_date_idx` ON `Visit`(`clinicId`, `status`, `date`);
