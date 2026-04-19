-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('NAO_APLICAVEL', 'PENDENTE', 'APROVADO', 'RECUSADO', 'CANCELADO', 'REEMBOLSADO');

-- AlterTable
ALTER TABLE "Pedido"
ADD COLUMN "statusPagamento" "StatusPagamento" NOT NULL DEFAULT 'NAO_APLICAVEL',
ADD COLUMN "mercadoPagoPaymentId" TEXT,
ADD COLUMN "mercadoPagoPreferenceId" TEXT;

-- Backfill online payment orders created before this migration.
UPDATE "Pedido"
SET "statusPagamento" = 'PENDENTE'
WHERE "pagamento" IN ('PIX', 'CARTAO')
  AND "statusPagamento" = 'NAO_APLICAVEL';

-- CreateIndex
CREATE INDEX "Pedido_statusPagamento_idx" ON "Pedido"("statusPagamento");

-- CreateIndex
CREATE INDEX "Pedido_mercadoPagoPaymentId_idx" ON "Pedido"("mercadoPagoPaymentId");
