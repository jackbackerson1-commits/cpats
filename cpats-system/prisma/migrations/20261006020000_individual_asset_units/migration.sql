CREATE TABLE `AssetUnit` (
    `id` VARCHAR(191) NOT NULL,
    `assetTag` VARCHAR(191) NOT NULL,
    `qrCodeToken` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `receivingReportId` VARCHAR(191) NOT NULL,
    `lineIndex` INTEGER NOT NULL,
    `unitNumber` INTEGER NOT NULL,
    `itemName` TEXT NOT NULL,
    `serialNumber` VARCHAR(191) NULL,
    `registeredById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `AssetUnit_assetTag_key`(`assetTag`),
    UNIQUE INDEX `AssetUnit_qrCodeToken_key`(`qrCodeToken`),
    UNIQUE INDEX `AssetUnit_purchaseOrderId_lineIndex_unitNumber_key`(`purchaseOrderId`, `lineIndex`, `unitNumber`),
    INDEX `AssetUnit_receivingReportId_idx`(`receivingReportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `AssetUnit` ADD CONSTRAINT `AssetUnit_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `AssetUnit` ADD CONSTRAINT `AssetUnit_receivingReportId_fkey` FOREIGN KEY (`receivingReportId`) REFERENCES `ReceivingReport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
