CREATE TYPE "EscopoCategoriaFinanceira" AS ENUM ('PAGAR', 'RECEBER', 'AMBOS');

CREATE TABLE "CategoriaFinanceira" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "escopo" "EscopoCategoriaFinanceira" NOT NULL DEFAULT 'PAGAR',
    "ordem" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaFinanceira_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ContaPagar"
ADD COLUMN "categoriaFinanceiraId" TEXT;

CREATE UNIQUE INDEX "CategoriaFinanceira_tenantId_nome_key" ON "CategoriaFinanceira"("tenantId", "nome");
CREATE INDEX "CategoriaFinanceira_tenantId_escopo_ordem_idx" ON "CategoriaFinanceira"("tenantId", "escopo", "ordem");
CREATE INDEX "ContaPagar_categoriaFinanceiraId_idx" ON "ContaPagar"("categoriaFinanceiraId");

ALTER TABLE "CategoriaFinanceira"
ADD CONSTRAINT "CategoriaFinanceira_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContaPagar"
ADD CONSTRAINT "ContaPagar_categoriaFinanceiraId_fkey" FOREIGN KEY ("categoriaFinanceiraId") REFERENCES "CategoriaFinanceira"("id") ON DELETE SET NULL ON UPDATE CASCADE;
