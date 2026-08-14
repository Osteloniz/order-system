ALTER TYPE "AuthAuditAction" ADD VALUE IF NOT EXISTS 'USERNAME_CHANGED';

UPDATE "AdminUser" target
SET "username" = 'joao.murat'
WHERE LOWER(COALESCE(target."emailNormalizado", target."email", '')) = 'joao.murat30@gmail.com'
  AND NOT EXISTS (
    SELECT 1
    FROM "AdminUser" other
    WHERE other."tenantId" = target."tenantId"
      AND LOWER(other."username") = 'joao.murat'
      AND other."id" <> target."id"
  );
