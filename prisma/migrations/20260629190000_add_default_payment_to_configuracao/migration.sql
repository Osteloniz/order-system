ALTER TABLE "Configuracao"
ADD COLUMN "padraoNovoPedidoPagamento" "TipoPagamento" NOT NULL DEFAULT 'DINHEIRO',
ADD COLUMN "padraoNovoPedidoTipoCartao" "TipoCartao";
