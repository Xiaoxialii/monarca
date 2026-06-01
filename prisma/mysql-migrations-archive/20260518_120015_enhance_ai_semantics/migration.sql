-- AlterTable
ALTER TABLE `DataSourceConnection` ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lastErrorMessage` VARCHAR(191) NULL,
    ADD COLUMN `provider` VARCHAR(191) NOT NULL,
    ADD COLUMN `schemas` JSON NULL;

-- AlterTable
ALTER TABLE `MetricDefinition` ADD COLUMN `expressionType` ENUM('AGGREGATE', 'RATE', 'CALCULATION') NOT NULL DEFAULT 'CALCULATION',
    ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lineageJson` JSON NULL,
    ADD COLUMN `sourceMetricIds` JSON NULL,
    ADD COLUMN `unit` VARCHAR(191) NULL,
    ADD COLUMN `window` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Insight` ADD COLUMN `anomalyTypeNormalized` VARCHAR(191) NULL,
    ADD COLUMN `dataQualityScore` INTEGER NULL,
    ADD COLUMN `explanationJson` JSON NULL,
    ADD COLUMN `relatedMetricIds` JSON NULL,
    ADD COLUMN `sampleSize` INTEGER NULL;

-- AlterTable
ALTER TABLE `ActionRecommendation` ADD COLUMN `actualOutcome` VARCHAR(191) NULL,
    ADD COLUMN `dueDate` DATETIME(3) NULL,
    ADD COLUMN `impactScore` DOUBLE NULL,
    ADD COLUMN `targetOwner` VARCHAR(191) NULL,
    MODIFY `status` ENUM('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'PLANNED';

-- AlterTable
ALTER TABLE `WorkspaceSubscription` ADD COLUMN `cancelAt` DATETIME(3) NULL,
    ADD COLUMN `endPeriod` DATETIME(3) NULL,
    ADD COLUMN `planVersion` VARCHAR(191) NULL,
    ADD COLUMN `startPeriod` DATETIME(3) NULL,
    ADD COLUMN `trialEndsAt` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `SupportTicket` ADD COLUMN `assigneeId` VARCHAR(191) NULL,
    ADD COLUMN `resolvedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `SupportTicket_assigneeId_status_idx` ON `SupportTicket`(`assigneeId`, `status`);

-- AddForeignKey
ALTER TABLE `SupportTicket` ADD CONSTRAINT `SupportTicket_assigneeId_fkey` FOREIGN KEY (`assigneeId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
