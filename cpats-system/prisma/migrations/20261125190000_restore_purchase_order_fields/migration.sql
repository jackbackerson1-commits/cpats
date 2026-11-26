-- Existing installations may already have these columns from a schema sync.
ALTER TABLE `PurchaseOrder`
    ADD COLUMN IF NOT EXISTS `paymentType` ENUM('CASH_CHECK', 'CREDIT_TERMS') NULL,
    ADD COLUMN IF NOT EXISTS `qrCodeToken` VARCHAR(191) NULL;

-- Match the payment type used for new orders and preserve existing values.
UPDATE `PurchaseOrder`
SET `paymentType` = CASE
    WHEN `purchaseMethod` = 'SUPPLIER_CREDIT' THEN 'CREDIT_TERMS'
    ELSE 'CASH_CHECK'
END
WHERE `paymentType` IS NULL;

UPDATE `PurchaseOrder`
SET `qrCodeToken` = CONCAT('PO-TOKEN-', UUID())
WHERE `qrCodeToken` IS NULL;

ALTER TABLE `PurchaseOrder`
    MODIFY COLUMN `paymentType` ENUM('CASH_CHECK', 'CREDIT_TERMS') NOT NULL DEFAULT 'CASH_CHECK',
    MODIFY COLUMN `qrCodeToken` VARCHAR(191) NOT NULL,
    ADD UNIQUE INDEX IF NOT EXISTS `PurchaseOrder_qrCodeToken_key` (`qrCodeToken`);
