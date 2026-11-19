-- Billing console hardening (area E). Add-only: a new enum value, a nullable column and an index.

-- #27: a pause the operator made by hand, which only their Reactivate clears.
ALTER TABLE `Subscription` MODIFY `pause` ENUM('overdue', 'cancelled', 'manual') NULL;

-- #28: what each operator action changed (no patient data).
ALTER TABLE `OperatorAuditEvent` ADD COLUMN `values` JSON NULL;

-- #18: the same reference on the same paid date is "already recorded", read through this index.
CREATE INDEX `SubscriptionPayment_clinicId_paidOn_idx` ON `SubscriptionPayment`(`clinicId`, `paidOn`);
