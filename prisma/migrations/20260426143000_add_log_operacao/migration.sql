CREATE TYPE "LogOperacaoTipo" AS ENUM (
  'AJUSTE_ESTOQUE',
  'REGISTRO_PRODUCAO',
  'RESERVA_ENCOMENDA',
  'LIBERACAO_RESERVA',
  'BAIXA_ESTOQUE_ENTREGA',
  'ESTORNO_ESTOQUE',
  'SINCRONIZACAO_LEGADA',
  'PEDIDO_CRIADO',
  'PEDIDO_EDITADO',
  'PEDIDO_STATUS_ALTERADO',
  'PEDIDO_EXCLUIDO'
);

CREATE TABLE "LogOperacao" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "tipo" "LogOperacaoTipo" NOT NULL,
  "produtoId" TEXT,
  "produtoNome" TEXT,
  "pedidoId" TEXT,
  "pedidoNumero" TEXT,
  "quantidade" INTEGER,
  "saldoDisponivel" INTEGER,
  "saldoReservado" INTEGER,
  "descricao" TEXT NOT NULL,
  "metadata" JSONB,
  "actorNome" TEXT,
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LogOperacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LogOperacao_tenantId_criadoEm_idx" ON "LogOperacao"("tenantId", "criadoEm");
CREATE INDEX "LogOperacao_tenantId_tipo_criadoEm_idx" ON "LogOperacao"("tenantId", "tipo", "criadoEm");
CREATE INDEX "LogOperacao_pedidoId_idx" ON "LogOperacao"("pedidoId");
CREATE INDEX "LogOperacao_produtoId_idx" ON "LogOperacao"("produtoId");

ALTER TABLE "LogOperacao"
ADD CONSTRAINT "LogOperacao_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
