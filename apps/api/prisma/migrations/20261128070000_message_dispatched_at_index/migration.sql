-- Text-abuse limits: the platform daily cap sums billed parts across every clinic since Manila midnight.
-- CreateIndex
CREATE INDEX `Message_dispatchedAt_idx` ON `Message`(`dispatchedAt`);
