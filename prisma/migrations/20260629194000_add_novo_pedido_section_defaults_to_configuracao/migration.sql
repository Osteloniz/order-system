ALTER TABLE "Configuracao"
ADD COLUMN "padraoNovoPedidoDescontosExpandidos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "padraoNovoPedidoObservacoesExpandidas" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "padraoNovoPedidoResponsavelExpandido" BOOLEAN NOT NULL DEFAULT false;
