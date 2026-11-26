ALTER TABLE `PurchaseOrderDocument` ADD COLUMN `receivingFormRevisionId` VARCHAR(191) NULL;
CREATE TABLE `ReceivingForm` (
  `id` VARCHAR(191) NOT NULL,
  `purchaseOrderId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(2) NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `ReceivingForm_purchaseOrderId_updatedAt_id_idx` (`purchaseOrderId`, `updatedAt`, `id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `ReceivingFormRevision` (
  `id` VARCHAR(191) NOT NULL,
  `formId` VARCHAR(191) NOT NULL,
  `version` INTEGER NOT NULL,
  `payload` JSON NOT NULL,
  `createdById` VARCHAR(191) NOT NULL,
  `exportedAt` DATETIME(3) NULL,
  `exportedById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `ReceivingFormRevision_formId_version_key` (`formId`, `version`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `ReceivingForm` ADD CONSTRAINT `ReceivingForm_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReceivingFormRevision` ADD CONSTRAINT `ReceivingFormRevision_formId_fkey` FOREIGN KEY (`formId`) REFERENCES `ReceivingForm` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReceivingFormRevision` ADD CONSTRAINT `ReceivingFormRevision_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `ReceivingFormRevision` ADD CONSTRAINT `ReceivingFormRevision_exportedById_fkey` FOREIGN KEY (`exportedById`) REFERENCES `User` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PurchaseOrderDocument` ADD CONSTRAINT `PurchaseOrderDocument_receivingFormRevisionId_fkey` FOREIGN KEY (`receivingFormRevisionId`) REFERENCES `ReceivingFormRevision` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
