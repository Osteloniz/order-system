ALTER TABLE "ItemPedido" ADD COLUMN IF NOT EXISTS "quantidadePreparada" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ItemPedido" ADD COLUMN IF NOT EXISTS "preparadoEm" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ProdutoEstoque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "quantidadeDisponivel" INTEGER NOT NULL DEFAULT 0,
    "quantidadeReservada" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoEstoque_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProdutoEstoque_tenantId_produtoId_key" ON "ProdutoEstoque"("tenantId", "produtoId");
CREATE INDEX IF NOT EXISTS "ProdutoEstoque_produtoId_idx" ON "ProdutoEstoque"("produtoId");
CREATE INDEX IF NOT EXISTS "ItemPedido_produtoId_idx" ON "ItemPedido"("produtoId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ProdutoEstoque_tenantId_fkey'
    ) THEN
        ALTER TABLE "ProdutoEstoque" ADD CONSTRAINT "ProdutoEstoque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ProdutoEstoque_produtoId_fkey'
    ) THEN
        ALTER TABLE "ProdutoEstoque" ADD CONSTRAINT "ProdutoEstoque_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;