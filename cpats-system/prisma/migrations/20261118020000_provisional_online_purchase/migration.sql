ALTER TABLE `AuditLog` ADD COLUMN `onlinePurchaseAction` VARCHAR(30) NULL,
    ADD COLUMN `onlinePurchaseAmount` DECIMAL(14, 2) NULL,
    ADD COLUMN `onlinePurchaseDocumentId` VARCHAR(191) NULL,
    ADD COLUMN `onlinePurchasePlanId` VARCHAR(191) NULL,
    ADD COLUMN `onlinePurchaseRevision` INTEGER NULL;

CREATE TABLE `OnlinePurchasePlan` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `policyVersion` INTEGER NOT NULL DEFAULT 1,
    `version` INTEGER NOT NULL DEFAULT 1,
    `revision` INTEGER NOT NULL DEFAULT 1,
    `stage` VARCHAR(30) NOT NULL,
    `initialAmount` DECIMAL(14, 2) NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `quoteDocumentId` VARCHAR(191) NOT NULL,
    `orderDocumentId` VARCHAR(191) NULL,
    `checkNumber` VARCHAR(100) NULL,
    `payee` VARCHAR(180) NULL,
    `orderReference` VARCHAR(180) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `OnlinePurchasePlan_purchaseOrderId_key`(`purchaseOrderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OnlinePurchasePlan` ADD CONSTRAINT `OnlinePurchasePlan_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OnlinePurchasePlan` ADD CONSTRAINT `OnlinePurchasePlan_quoteDocumentId_fkey` FOREIGN KEY (`quoteDocumentId`) REFERENCES `PurchaseOrderDocument`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `OnlinePurchasePlan` ADD CONSTRAINT `OnlinePurchasePlan_orderDocumentId_fkey` FOREIGN KEY (`orderDocumentId`) REFERENCES `PurchaseOrderDocument`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_onlinePurchasePlanId_fkey` FOREIGN KEY (`onlinePurchasePlanId`) REFERENCES `OnlinePurchasePlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_onlinePurchaseDocumentId_fkey` FOREIGN KEY (`onlinePurchaseDocumentId`) REFERENCES `PurchaseOrderDocument`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
