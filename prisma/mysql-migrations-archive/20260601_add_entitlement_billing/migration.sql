-- CreateTable
CREATE TABLE `Plan` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ONE_TIME', 'MONTHLY') NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `description` VARCHAR(191) NOT NULL,
    `reportQuota` INTEGER NOT NULL DEFAULT 0,
    `aiTokenQuota` INTEGER NOT NULL DEFAULT 0,
    `databaseConnectionQuota` INTEGER NOT NULL DEFAULT 0,
    `includesHumanService` BOOLEAN NOT NULL DEFAULT false,
    `validDays` INTEGER NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Plan_code_key`(`code`),
    INDEX `Plan_type_isActive_idx`(`type`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'CANCELED', 'EXPIRED', 'PAYMENT_FAILED') NOT NULL DEFAULT 'ACTIVE',
    `currentPeriodStart` DATETIME(3) NOT NULL,
    `currentPeriodEnd` DATETIME(3) NOT NULL,
    `cancelAtPeriodEnd` BOOLEAN NOT NULL DEFAULT false,
    `paymentProvider` VARCHAR(191) NULL,
    `providerSubscriptionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserSubscription_providerSubscriptionId_key`(`providerSubscriptionId`),
    INDEX `UserSubscription_userId_status_idx`(`userId`, `status`),
    INDEX `UserSubscription_planId_status_idx`(`planId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserCredit` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `subscriptionId` VARCHAR(191) NULL,
    `paymentOrderId` VARCHAR(191) NULL,
    `sourceType` ENUM('ONE_TIME_PURCHASE', 'MONTHLY_SUBSCRIPTION') NOT NULL,
    `reportCreditsTotal` INTEGER NOT NULL DEFAULT 0,
    `reportCreditsUsed` INTEGER NOT NULL DEFAULT 0,
    `aiTokenTotal` INTEGER NOT NULL DEFAULT 0,
    `aiTokenUsed` INTEGER NOT NULL DEFAULT 0,
    `validFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `validUntil` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'USED_UP', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UserCredit_paymentOrderId_key`(`paymentOrderId`),
    INDEX `UserCredit_userId_status_validUntil_idx`(`userId`, `status`, `validUntil`),
    INDEX `UserCredit_planId_sourceType_idx`(`planId`, `sourceType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentOrder` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `planId` VARCHAR(191) NOT NULL,
    `orderType` ENUM('ONE_TIME', 'MONTHLY') NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `paymentProvider` VARCHAR(191) NULL,
    `providerPaymentId` VARCHAR(191) NULL,
    `providerSessionId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` DATETIME(3) NULL,

    UNIQUE INDEX `PaymentOrder_providerPaymentId_key`(`providerPaymentId`),
    UNIQUE INDEX `PaymentOrder_providerSessionId_key`(`providerSessionId`),
    INDEX `PaymentOrder_userId_status_idx`(`userId`, `status`),
    INDEX `PaymentOrder_planId_orderType_idx`(`planId`, `orderType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UsageLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `actionType` ENUM('GENERATE_REPORT', 'AI_FOLLOW_UP', 'DATABASE_CONNECTION', 'EXPORT_REPORT', 'HUMAN_SERVICE') NOT NULL,
    `creditId` VARCHAR(191) NULL,
    `usageAmount` INTEGER NOT NULL DEFAULT 1,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UsageLog_userId_actionType_createdAt_idx`(`userId`, `actionType`, `createdAt`),
    INDEX `UsageLog_creditId_createdAt_idx`(`creditId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserSubscription` ADD CONSTRAINT `UserSubscription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserSubscription` ADD CONSTRAINT `UserSubscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCredit` ADD CONSTRAINT `UserCredit_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCredit` ADD CONSTRAINT `UserCredit_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCredit` ADD CONSTRAINT `UserCredit_subscriptionId_fkey` FOREIGN KEY (`subscriptionId`) REFERENCES `UserSubscription`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserCredit` ADD CONSTRAINT `UserCredit_paymentOrderId_fkey` FOREIGN KEY (`paymentOrderId`) REFERENCES `PaymentOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentOrder` ADD CONSTRAINT `PaymentOrder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentOrder` ADD CONSTRAINT `PaymentOrder_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `Plan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UsageLog` ADD CONSTRAINT `UsageLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UsageLog` ADD CONSTRAINT `UsageLog_creditId_fkey` FOREIGN KEY (`creditId`) REFERENCES `UserCredit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedData
INSERT INTO `Plan` (
    `id`, `code`, `name`, `type`, `price`, `currency`, `description`, `reportQuota`, `aiTokenQuota`,
    `databaseConnectionQuota`, `includesHumanService`, `validDays`, `isActive`, `createdAt`, `updatedAt`
) VALUES
    ('plan_starter_one_time', 'starter-one-time', 'Starter One-Time', 'ONE_TIME', 29.00, 'USD', 'One report generation credit for a focused analysis run', 1, 100000, 0, false, 30, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('plan_growth_one_time', 'growth-one-time', 'Growth One-Time', 'ONE_TIME', 99.00, 'USD', 'Five report generation credits for a growth analysis sprint', 5, 500000, 0, false, 90, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('plan_pro_monthly', 'pro-monthly', 'Pro Monthly', 'MONTHLY', 49.00, 'USD', 'Monthly report automation for small teams', 10, 1000000, 3, false, NULL, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
    ('plan_business_monthly', 'business-monthly', 'Business Monthly', 'MONTHLY', 199.00, 'USD', 'Monthly report automation with higher quota and human service', 50, 5000000, 10, true, NULL, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `type` = VALUES(`type`),
    `price` = VALUES(`price`),
    `currency` = VALUES(`currency`),
    `description` = VALUES(`description`),
    `reportQuota` = VALUES(`reportQuota`),
    `aiTokenQuota` = VALUES(`aiTokenQuota`),
    `databaseConnectionQuota` = VALUES(`databaseConnectionQuota`),
    `includesHumanService` = VALUES(`includesHumanService`),
    `validDays` = VALUES(`validDays`),
    `isActive` = VALUES(`isActive`),
    `updatedAt` = CURRENT_TIMESTAMP(3);
