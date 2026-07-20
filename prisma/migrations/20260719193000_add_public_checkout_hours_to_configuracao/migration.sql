-- Add recurring public checkout hours to the store configuration.
ALTER TABLE "Configuracao"
ADD COLUMN "checkoutPublicoHorarioAtivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "checkoutPublicoHorarioAbertura" TEXT,
ADD COLUMN "checkoutPublicoHorarioFechamento" TEXT;
