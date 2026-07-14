ALTER TABLE "Pedido"
ADD COLUMN "publicAccessTokenHash" TEXT,
ADD COLUMN "publicAccessTokenIssuedAt" TIMESTAMP(3);
