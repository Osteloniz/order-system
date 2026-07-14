CREATE TYPE "ModoEncomendaCheckout" AS ENUM ('CLIENTE_DEFINE', 'FIXO');

ALTER TABLE "Configuracao"
ADD COLUMN "checkoutPublicoEntregaReservaPaulistano" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutPublicoEntregaRetirada" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutPublicoEntregaEncomenda" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutPublicoEncomendaModo" "ModoEncomendaCheckout" NOT NULL DEFAULT 'CLIENTE_DEFINE',
ADD COLUMN "checkoutPublicoEncomendaDataFixa" TIMESTAMP(3),
ADD COLUMN "checkoutPublicoPagamentoPix" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutPublicoPagamentoDinheiro" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutPublicoPagamentoCartao" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutPublicoPagamentoCartaoCredito" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "checkoutPublicoPagamentoCartaoDebito" BOOLEAN NOT NULL DEFAULT true;
