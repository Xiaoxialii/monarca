-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `clerkUserId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'en',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_clerkUserId_key`(`clerkUserId`),
    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Workspace` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Workspace_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceMember` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `invitedEmail` VARCHAR(191) NULL,
    `role` ENUM('OWNER', 'ADMIN', 'VIEWER') NOT NULL DEFAULT 'VIEWER',
    `status` ENUM('ACTIVE', 'INVITED', 'REMOVED') NOT NULL DEFAULT 'ACTIVE',
    `invitedBy` VARCHAR(191) NULL,
    `clerk_invitation_id` VARCHAR(191) NULL,
    `joinedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `WorkspaceMember_workspaceId_userId_key`(`workspaceId`, `userId`),
    UNIQUE INDEX `WorkspaceMember_workspaceId_invitedEmail_key`(`workspaceId`, `invitedEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataSourceConnection` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `type` ENUM('SQL_SERVER', 'MYSQL', 'POSTGRESQL', 'SNOWFLAKE', 'BIGQUERY', 'EXCEL', 'CSV', 'GOOGLE_ANALYTICS', 'STRIPE') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'CONNECTED', 'FAILED', 'DISCONNECTED') NOT NULL DEFAULT 'PENDING',
    `connectionMode` VARCHAR(191) NULL,
    `authMethod` VARCHAR(191) NULL,
    `config` JSON NULL,
    `connectedAt` DATETIME(3) NULL,
    `lastSyncAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DataSourceConnection_workspaceId_status_idx`(`workspaceId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SchemaSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `dataSourceId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'CONNECTED', 'FAILED', 'DISCONNECTED') NOT NULL DEFAULT 'PENDING',
    `schemaJson` JSON NOT NULL,
    `qualityReport` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `SchemaSnapshot_workspaceId_version_key`(`workspaceId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MetricDefinition` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `layer` ENUM('PRIMARY', 'DRIVER', 'DIAGNOSTIC') NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `definition` VARCHAR(191) NOT NULL,
    `formula` VARCHAR(191) NOT NULL,
    `mappingJson` JSON NULL,
    `maintainerRole` ENUM('AI', 'USER') NOT NULL,
    `maintainerUserId` VARCHAR(191) NULL,
    `status` ENUM('AI_READY', 'NEEDS_MAPPING', 'NEEDS_VALIDATION') NOT NULL DEFAULT 'NEEDS_MAPPING',
    `tagsJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MetricDefinition_workspaceId_layer_idx`(`workspaceId`, `layer`),
    UNIQUE INDEX `MetricDefinition_workspaceId_name_key`(`workspaceId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DailyBriefing` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `briefingDate` DATETIME(3) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` VARCHAR(191) NOT NULL,
    `confidence` INTEGER NULL,
    `payloadJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DailyBriefing_workspaceId_briefingDate_idx`(`workspaceId`, `briefingDate`),
    UNIQUE INDEX `DailyBriefing_workspaceId_briefingDate_key`(`workspaceId`, `briefingDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Insight` (
    `id` VARCHAR(191) NOT NULL,
    `briefingId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `anomalyType` VARCHAR(191) NULL,
    `impactScore` DOUBLE NULL,
    `confidence` INTEGER NULL,
    `evidenceJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ActionRecommendation` (
    `id` VARCHAR(191) NOT NULL,
    `insightId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `ownerTeam` VARCHAR(191) NULL,
    `executionPriority` VARCHAR(191) NULL,
    `estimatedOutcome` VARCHAR(191) NULL,
    `workflowAction` VARCHAR(191) NULL,
    `status` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WorkspaceSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NOT NULL,
    `plan` ENUM('TRIAL', 'PROFESSIONAL', 'ENTERPRISE', 'DATABASE_SETUP') NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELED', 'PAST_DUE', 'PENDING') NOT NULL DEFAULT 'PENDING',
    `amount` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
    `interval` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WorkspaceSubscription_workspaceId_status_idx`(`workspaceId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupportTicket` (
    `id` VARCHAR(191) NOT NULL,
    `workspaceId` VARCHAR(191) NULL,
    `submitterId` VARCHAR(191) NULL,
    `type` ENUM('DATA_CONNECTION', 'REPORT_GENERATION', 'BILLING', 'ACCOUNT_ACCESS', 'OTHER') NOT NULL,
    `priority` ENUM('NORMAL', 'HIGH', 'URGENT') NOT NULL DEFAULT 'NORMAL',
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `subject` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `contextJson` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SupportTicket_workspaceId_status_idx`(`workspaceId`, `status`),
    INDEX `SupportTicket_submitterId_createdAt_idx`(`submitterId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Workspace` ADD CONSTRAINT `Workspace_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceMember` ADD CONSTRAINT `WorkspaceMember_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceMember` ADD CONSTRAINT `WorkspaceMember_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataSourceConnection` ADD CONSTRAINT `DataSourceConnection_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchemaSnapshot` ADD CONSTRAINT `SchemaSnapshot_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SchemaSnapshot` ADD CONSTRAINT `SchemaSnapshot_dataSourceId_fkey` FOREIGN KEY (`dataSourceId`) REFERENCES `DataSourceConnection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MetricDefinition` ADD CONSTRAINT `MetricDefinition_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MetricDefinition` ADD CONSTRAINT `MetricDefinition_maintainerUserId_fkey` FOREIGN KEY (`maintainerUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DailyBriefing` ADD CONSTRAINT `DailyBriefing_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Insight` ADD CONSTRAINT `Insight_briefingId_fkey` FOREIGN KEY (`briefingId`) REFERENCES `DailyBriefing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ActionRecommendation` ADD CONSTRAINT `ActionRecommendation_insightId_fkey` FOREIGN KEY (`insightId`) REFERENCES `Insight`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WorkspaceSubscription` ADD CONSTRAINT `WorkspaceSubscription_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportTicket` ADD CONSTRAINT `SupportTicket_workspaceId_fkey` FOREIGN KEY (`workspaceId`) REFERENCES `Workspace`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupportTicket` ADD CONSTRAINT `SupportTicket_submitterId_fkey` FOREIGN KEY (`submitterId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
