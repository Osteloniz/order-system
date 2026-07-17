ALTER TABLE "Pedido"
  ADD COLUMN IF NOT EXISTS "asaasReturnTokenHash" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasCheckoutId" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasCheckoutUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasCheckoutExpiresAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "asaasPaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasInvoiceUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasPixQrCode" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasPixCopyPaste" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasPaymentStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasLastEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "asaasLastSyncAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "Pedido_mercadoPagoPaymentId_idx";

CREATE TABLE IF NOT EXISTS "AsaasWebhookEvent" (
  "id" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "paymentId" TEXT,
  "externalReference" TEXT,
  "payload" JSONB NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pedidoId" TEXT,
  "tenantId" TEXT,
  CONSTRAINT "AsaasWebhookEvent_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AsaasWebhookEvent_pedidoId_fkey'
  ) THEN
    ALTER TABLE "AsaasWebhookEvent"
      ADD CONSTRAINT "AsaasWebhookEvent_pedidoId_fkey"
      FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AsaasWebhookEvent_tenantId_fkey'
  ) THEN
    ALTER TABLE "AsaasWebhookEvent"
      ADD CONSTRAINT "AsaasWebhookEvent_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Pedido_asaasCheckoutId_idx"
  ON "Pedido"("asaasCheckoutId");

CREATE INDEX IF NOT EXISTS "Pedido_asaasPaymentId_idx"
  ON "Pedido"("asaasPaymentId");

CREATE INDEX IF NOT EXISTS "AsaasWebhookEvent_paymentId_idx"
  ON "AsaasWebhookEvent"("paymentId");

CREATE INDEX IF NOT EXISTS "AsaasWebhookEvent_externalReference_idx"
  ON "AsaasWebhookEvent"("externalReference");

CREATE INDEX IF NOT EXISTS "AsaasWebhookEvent_tenantId_processedAt_idx"
  ON "AsaasWebhookEvent"("tenantId", "processedAt");
