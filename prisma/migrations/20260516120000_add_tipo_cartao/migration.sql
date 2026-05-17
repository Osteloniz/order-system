CREATE TYPE "TipoCartao" AS ENUM ('CREDITO', 'DEBITO');

ALTER TABLE "Pedido"
ADD COLUMN "tipoCartao" "TipoCartao";
