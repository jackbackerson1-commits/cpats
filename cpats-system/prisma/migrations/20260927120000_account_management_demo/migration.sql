ALTER TABLE `User`
  MODIFY `role` ENUM('Requesting_Office', 'Business_Office', 'Admin_Office', 'Purchasing_Office', 'Receiving_Custodian', 'Global_Auditor', 'System_Administrator') NOT NULL,
  ADD COLUMN `accountStatus` ENUM('Pending', 'Active', 'Disabled') NOT NULL DEFAULT 'Active',
  ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `activatedAt` DATETIME(3) NULL,
  ADD COLUMN `emailVerifiedAt` DATETIME(3) NULL;

CREATE TABLE `AccountToken` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `purpose` ENUM('Activation', 'Password_Reset') NOT NULL,
  `tokenHash` VARCHAR(191) NOT NULL,
  `deliveredViaSmtp` BOOLEAN NOT NULL DEFAULT false,
  `expiresAt` DATETIME(3) NOT NULL,
  `usedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `AccountToken_tokenHash_key`(`tokenHash`),
  INDEX `AccountToken_userId_purpose_usedAt_idx`(`userId`, `purpose`, `usedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `AccountManagementEvent` (
  `id` VARCHAR(191) NOT NULL,
  `actorId` VARCHAR(191) NULL,
  `targetUserId` VARCHAR(191) NOT NULL,
  `action` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `AccountManagementEvent_actorId_createdAt_idx`(`actorId`, `createdAt`),
  INDEX `AccountManagementEvent_targetUserId_createdAt_idx`(`targetUserId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AccountToken` ADD CONSTRAINT `AccountToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `AccountManagementEvent` ADD CONSTRAINT `AccountManagementEvent_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `AccountManagementEvent` ADD CONSTRAINT `AccountManagementEvent_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
