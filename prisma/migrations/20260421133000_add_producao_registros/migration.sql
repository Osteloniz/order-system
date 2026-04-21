CREATE TABLE "ProducaoRegistro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "dataProducao" TIMESTAMP(3) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProducaoRegistro_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProducaoRegistro_tenantId_dataProducao_idx" ON "ProducaoRegistro"("tenantId", "dataProducao");
CREATE INDEX "ProducaoRegistro_produtoId_idx" ON "ProducaoRegistro"("produtoId");

ALTER TABLE "ProducaoRegistro"
ADD CONSTRAINT "ProducaoRegistro_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProducaoRegistro"
ADD CONSTRAINT "ProducaoRegistro_produtoId_fkey"
FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
