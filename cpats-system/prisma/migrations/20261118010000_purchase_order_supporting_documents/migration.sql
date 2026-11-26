CREATE TABLE `PurchaseOrderDocument` (
    `id` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `filePath` VARCHAR(255) NOT NULL,
    `fileName` VARCHAR(180) NOT NULL,
    `notes` TEXT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PurchaseOrderDocument_filePath_key`(`filePath`),
    INDEX `PurchaseOrderDocument_purchaseOrderId_createdAt_id_idx`(`purchaseOrderId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PurchaseOrderDocument` ADD CONSTRAINT `PurchaseOrderDocument_purchaseOrderId_fkey`
    FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `PurchaseOrderDocument` ADD CONSTRAINT `PurchaseOrderDocument_uploadedById_fkey`
    FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
