-- Private unfinished request forms; existing procurement tables and records stay unchanged.
CREATE TABLE `RequestDraft` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `submittedRequestId` VARCHAR(191) NULL,
    `submittedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    UNIQUE INDEX `RequestDraft_submittedRequestId_key`(`submittedRequestId`),
    INDEX `RequestDraft_ownerId_departmentId_submittedAt_updatedAt_id_idx`(`ownerId`, `departmentId`, `submittedAt`, `updatedAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `RequestDraft` ADD CONSTRAINT `RequestDraft_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RequestDraft` ADD CONSTRAINT `RequestDraft_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RequestDraft` ADD CONSTRAINT `RequestDraft_submittedRequestId_fkey` FOREIGN KEY (`submittedRequestId`) REFERENCES `PurchaseRequest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
