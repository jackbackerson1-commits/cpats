-- Supporting declarations captured per decision. NULL means no value was recorded.
-- No backfill, status, approval requirement, or existing audit remarks are changed.
ALTER TABLE `AuditLog`
    ADD COLUMN `businessNecessityVerified` BOOLEAN NULL,
    ADD COLUMN `businessBudgetAvailable` BOOLEAN NULL;
