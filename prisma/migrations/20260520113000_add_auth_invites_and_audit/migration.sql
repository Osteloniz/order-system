DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InviteStatus') THEN
    CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED', 'REVOKED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthAuditAction') THEN
    CREATE TYPE "AuthAuditAction" AS ENUM (
      'LOGIN_SUCCESS',
      'LOGIN_FAILURE',
      'LOGOUT',
      'INVITE_CREATED',
      'INVITE_USED',
      'USER_CREATED'
    );
  END IF;
END $$;

ALTER TABLE "AdminUser"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "emailNormalizado" TEXT;

CREATE TABLE IF NOT EXISTS "UserInvite" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailNormalizado" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT,
  "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AuthAuditLog" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "adminUserId" TEXT,
  "inviteId" TEXT,
  "action" "AuthAuditAction" NOT NULL,
  "identifier" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthAuditLog_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'UserInvite_tenantId_fkey'
  ) THEN
    ALTER TABLE "UserInvite"
      ADD CONSTRAINT "UserInvite_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AuthAuditLog_tenantId_fkey'
  ) THEN
    ALTER TABLE "AuthAuditLog"
      ADD CONSTRAINT "AuthAuditLog_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_tenantId_emailNormalizado_key"
  ON "AdminUser"("tenantId", "emailNormalizado");

CREATE INDEX IF NOT EXISTS "AdminUser_tenantId_emailNormalizado_idx"
  ON "AdminUser"("tenantId", "emailNormalizado");

CREATE UNIQUE INDEX IF NOT EXISTS "UserInvite_tokenHash_key"
  ON "UserInvite"("tokenHash");

CREATE INDEX IF NOT EXISTS "UserInvite_tenantId_emailNormalizado_status_idx"
  ON "UserInvite"("tenantId", "emailNormalizado", "status");

CREATE INDEX IF NOT EXISTS "UserInvite_tenantId_expiresAt_idx"
  ON "UserInvite"("tenantId", "expiresAt");

CREATE INDEX IF NOT EXISTS "AuthAuditLog_tenantId_action_createdAt_idx"
  ON "AuthAuditLog"("tenantId", "action", "createdAt");

CREATE INDEX IF NOT EXISTS "AuthAuditLog_adminUserId_createdAt_idx"
  ON "AuthAuditLog"("adminUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "AuthAuditLog_inviteId_idx"
  ON "AuthAuditLog"("inviteId");
