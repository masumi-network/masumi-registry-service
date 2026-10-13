-- Health check outcome time series (MAS-607). Feeds the time-weighted
-- uptimeEwma and keeps history for later analysis; pruned after 90 days.

-- CreateEnum
CREATE TYPE "HealthCheckTrigger" AS ENUM ('Job', 'Request', 'Sync');

-- CreateTable
CREATE TABLE "HealthCheckEvent" (
    "id" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "status" "Status" NOT NULL,
    "trigger" "HealthCheckTrigger" NOT NULL,
    "registryEntryId" TEXT NOT NULL,

    CONSTRAINT "HealthCheckEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthCheckEvent_registryEntryId_checkedAt_idx" ON "HealthCheckEvent"("registryEntryId", "checkedAt");

-- CreateIndex
CREATE INDEX "HealthCheckEvent_checkedAt_idx" ON "HealthCheckEvent"("checkedAt");

-- AddForeignKey
ALTER TABLE "HealthCheckEvent" ADD CONSTRAINT "HealthCheckEvent_registryEntryId_fkey" FOREIGN KEY ("registryEntryId") REFERENCES "RegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
