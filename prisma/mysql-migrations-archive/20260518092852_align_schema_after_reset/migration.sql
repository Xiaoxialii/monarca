-- DropForeignKey
ALTER TABLE `WorkspaceMember` DROP FOREIGN KEY `WorkspaceMember_userId_fkey`;

-- DropIndex
DROP INDEX `WorkspaceMember_userId_fkey` ON `WorkspaceMember`;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `avatar_url` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `WorkspaceMember` ADD CONSTRAINT `WorkspaceMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
