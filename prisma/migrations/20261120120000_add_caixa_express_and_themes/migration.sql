-- CreateEnum
CREATE TYPE "OrigemPedido" AS ENUM ('LEGADO', 'CAIXA_EXPRESS');

-- CreateEnum
CREATE TYPE "TemaVisual" AS ENUM ('PADRAO', 'NATAL', 'ANO_NOVO');

-- CreateEnum
CREATE TYPE "CaixaOperacao" AS ENUM ('VENDA', 'BAIXA', 'CORRECAO', 'ESTORNO', 'CANCELAMENTO', 'DEVOLUCAO');

-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'CAIXA';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuthAuditAction" ADD VALUE 'CAIXA_ACCOUNT_CHANGED';
ALTER TYPE "AuthAuditAction" ADD VALUE 'TEMA_VISUAL_ALTERADO';

-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "temaVisual" "TemaVisual" NOT NULL DEFAULT 'PADRAO';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "caixaPagamentoPrevisto" "TipoPagamento",
ADD COLUMN     "caixaRecebimentoAtualId" TEXT,
ADD COLUMN     "caixaTipoCartaoPrevisto" "TipoCartao",
ADD COLUMN     "entregueEm" TIMESTAMP(3),
ADD COLUMN     "origem" "OrigemPedido" NOT NULL DEFAULT 'LEGADO';

-- CreateTable
CREATE TABLE "CaixaEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "operacao" "CaixaOperacao" NOT NULL,
    "tentativa" TEXT NOT NULL,
    "intencaoHash" TEXT NOT NULL,
    "atorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "efetivoEm" TIMESTAMP(3),
    "recebimentoId" TEXT,
    "bruto" INTEGER,
    "taxa" INTEGER,
    "meio" "TipoPagamento",
    "tipoCartao" "TipoCartao",
    "motivo" TEXT,
    "detalhes" JSONB,

    CONSTRAINT "CaixaEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaixaSessao" (
    "tokenHash" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "atividadeEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaixaSessao_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "CaixaEvento_tenantId_operacao_efetivoEm_idx" ON "CaixaEvento"("tenantId", "operacao", "efetivoEm");

-- CreateIndex
CREATE INDEX "CaixaEvento_pedidoId_recebimentoId_idx" ON "CaixaEvento"("pedidoId", "recebimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "CaixaEvento_tenantId_operacao_tentativa_key" ON "CaixaEvento"("tenantId", "operacao", "tentativa");

-- CreateIndex
CREATE INDEX "CaixaSessao_adminUserId_idx" ON "CaixaSessao"("adminUserId");

-- CreateIndex
CREATE INDEX "CaixaSessao_expiraEm_idx" ON "CaixaSessao"("expiraEm");

-- CreateIndex
CREATE INDEX "Pedido_tenantId_origem_statusPagamento_entregueEm_idx" ON "Pedido"("tenantId", "origem", "statusPagamento", "entregueEm");

-- AddForeignKey
ALTER TABLE "CaixaEvento" ADD CONSTRAINT "CaixaEvento_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "Pedido"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaixaSessao" ADD CONSTRAINT "CaixaSessao_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

