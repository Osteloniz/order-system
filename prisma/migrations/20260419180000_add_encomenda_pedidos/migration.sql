ALTER TYPE "TipoEntrega" ADD VALUE IF NOT EXISTS 'ENCOMENDA';

ALTER TABLE "Pedido" ADD COLUMN IF NOT EXISTS "encomendaPara" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Pedido_encomendaPara_idx" ON "Pedido"("encomendaPara");
