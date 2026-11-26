-- Some installations already have this field from a schema sync.
ALTER TABLE `ReceivingReport`
    ADD COLUMN IF NOT EXISTS `asssetImageFilePath` VARCHAR(191) NULL;

-- The history and audit views treat a blank reference as unavailable evidence.
UPDATE `ReceivingReport`
SET `asssetImageFilePath` = ''
WHERE `asssetImageFilePath` IS NULL;

ALTER TABLE `ReceivingReport`
    MODIFY COLUMN `asssetImageFilePath` VARCHAR(191) NOT NULL;
