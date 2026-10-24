-- Supporting reusable templates; no procurement records or statuses change.
CREATE TABLE `RequestTemplate` (
  `id` VARCHAR(191) NOT NULL,
  `ownerId` VARCHAR(191) NOT NULL,
  `departmentId` VARCHAR(191) NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `payload` JSON NOT NULL,
  `version` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `RequestTemplate_ownerId_departmentId_createdAt_id_idx`(`ownerId`, `departmentId`, `createdAt`, `id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `RequestTemplate` ADD CONSTRAINT `RequestTemplate_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `RequestTemplate` ADD CONSTRAINT `RequestTemplate_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
