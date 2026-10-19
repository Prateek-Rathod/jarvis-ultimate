CREATE TABLE "AgentEntitlement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentEntitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTask" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "result" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentTaskStep" (
    "id" UUID NOT NULL,
    "agentTaskId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "tool" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentTaskStep_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentEntitlement_userId_key" ON "AgentEntitlement"("userId");
CREATE UNIQUE INDEX "AgentTask_userId_idempotencyKey_key" ON "AgentTask"("userId", "idempotencyKey");
CREATE INDEX "AgentTask_userId_createdAt_idx" ON "AgentTask"("userId", "createdAt");
CREATE UNIQUE INDEX "AgentTaskStep_agentTaskId_position_key" ON "AgentTaskStep"("agentTaskId", "position");

ALTER TABLE "AgentEntitlement" ADD CONSTRAINT "AgentEntitlement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentTaskStep" ADD CONSTRAINT "AgentTaskStep_agentTaskId_fkey"
    FOREIGN KEY ("agentTaskId") REFERENCES "AgentTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
