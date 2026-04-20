CREATE TABLE IF NOT EXISTS "Cliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "clienteBloco" TEXT,
    "clienteApartamento" TEXT,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "clienteId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Cliente_tenantId_telefone_key" ON "Cliente"("tenantId", "telefone");
CREATE INDEX IF NOT EXISTS "Cliente_telefone_idx" ON "Cliente"("telefone");
CREATE INDEX IF NOT EXISTS "Pedido_clienteId_idx" ON "Pedido"("clienteId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Cliente_tenantId_fkey'
    ) THEN
        ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Pedido_clienteId_fkey'
    ) THEN
        ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;