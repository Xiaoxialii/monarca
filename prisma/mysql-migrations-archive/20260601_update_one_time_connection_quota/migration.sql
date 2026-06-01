-- UpdateData
UPDATE `Plan`
SET `databaseConnectionQuota` = 1, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'starter-one-time';

-- UpdateData
UPDATE `Plan`
SET `databaseConnectionQuota` = 3, `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `code` = 'growth-one-time';
