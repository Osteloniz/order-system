CREATE TYPE "MetodoPagamentoContaPagar" AS ENUM ('PIX', 'CREDITO', 'DEBITO', 'BOLETO');

ALTER TABLE "ContaPagar"
ADD COLUMN "metodoPagamento" "MetodoPagamentoContaPagar";

ALTER TABLE "FornecedorFinanceiro"
ADD COLUMN "cep" TEXT,
ADD COLUMN "endereco" TEXT,
ADD COLUMN "numero" TEXT,
ADD COLUMN "complemento" TEXT,
ADD COLUMN "estado" TEXT,
ADD COLUMN "cidade" TEXT,
ADD COLUMN "bairro" TEXT,
ADD COLUMN "telefone" TEXT,
ADD COLUMN "email" TEXT;
