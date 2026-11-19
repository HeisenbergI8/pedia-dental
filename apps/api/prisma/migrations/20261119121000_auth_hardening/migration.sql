-- Security review #8: the operator's two-step sign-in (TOTP). Add-only: both columns are nullable, so the running
-- release keeps working while this one deploys.
-- AlterTable
ALTER TABLE `OperatorUser` ADD COLUMN `totpSecret` VARCHAR(64) NULL,
    ADD COLUMN `totpLastStep` INTEGER NULL;
