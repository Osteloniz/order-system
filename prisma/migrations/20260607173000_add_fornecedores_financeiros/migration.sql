CREATE TABLE "FornecedorFinanceiro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FornecedorFinanceiro_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ContaPagar"
ADD COLUMN "fornecedorFinanceiroId" TEXT;

CREATE UNIQUE INDEX "FornecedorFinanceiro_tenantId_nome_key" ON "FornecedorFinanceiro"("tenantId", "nome");
CREATE INDEX "FornecedorFinanceiro_tenantId_nome_idx" ON "FornecedorFinanceiro"("tenantId", "nome");
CREATE INDEX "ContaPagar_fornecedorFinanceiroId_idx" ON "ContaPagar"("fornecedorFinanceiroId");

ALTER TABLE "FornecedorFinanceiro"
ADD CONSTRAINT "FornecedorFinanceiro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ContaPagar"
ADD CONSTRAINT "ContaPagar_fornecedorFinanceiroId_fkey" FOREIGN KEY ("fornecedorFinanceiroId") REFERENCES "FornecedorFinanceiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "FornecedorFinanceiro" ("id", "tenantId", "nome", "criadoEm", "atualizadoEm")
SELECT
    md5(cp."tenantId" || ':' || lower(trim(cp."fornecedor"))),
    cp."tenantId",
    min(trim(cp."fornecedor")),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "ContaPagar" cp
WHERE cp."fornecedor" IS NOT NULL
  AND trim(cp."fornecedor") <> ''
GROUP BY cp."tenantId", lower(trim(cp."fornecedor"));

UPDATE "ContaPagar" cp
SET
    "fornecedorFinanceiroId" = ff."id",
    "fornecedor" = ff."nome"
FROM "FornecedorFinanceiro" ff
WHERE cp."tenantId" = ff."tenantId"
  AND cp."fornecedor" IS NOT NULL
  AND trim(cp."fornecedor") <> ''
  AND lower(trim(cp."fornecedor")) = lower(ff."nome");
