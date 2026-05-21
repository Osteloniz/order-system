CREATE TYPE "StatusContaPagar" AS ENUM ('PENDENTE', 'PAGO', 'CANCELADO');

CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT,
    "fornecedor" TEXT,
    "observacoes" TEXT,
    "valor" INTEGER NOT NULL,
    "vencimento" TIMESTAMP(3) NOT NULL,
    "pagoEm" TIMESTAMP(3),
    "status" "StatusContaPagar" NOT NULL DEFAULT 'PENDENTE',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContaPagar_tenantId_vencimento_idx" ON "ContaPagar"("tenantId", "vencimento");
CREATE INDEX "ContaPagar_tenantId_status_vencimento_idx" ON "ContaPagar"("tenantId", "status", "vencimento");

ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
