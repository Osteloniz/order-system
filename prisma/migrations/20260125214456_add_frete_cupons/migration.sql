/*
  Warnings:

  - You are about to drop the column `freteFixo` on the `Configuracao` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "TipoCupom" AS ENUM ('FIXO', 'PERCENTUAL');

-- AlterTable
ALTER TABLE "Configuracao" DROP COLUMN "freteFixo",
ADD COLUMN     "estabelecimentoLat" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "estabelecimentoLng" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "freteBase" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "freteKmExcedente" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "freteRaioKm" DOUBLE PRECISION NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "cupomCodigoSnapshot" TEXT,
ADD COLUMN     "cupomId" TEXT,
ADD COLUMN     "descontoValor" INTEGER,
ADD COLUMN     "distanciaKm" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Cupom" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "TipoCupom" NOT NULL,
    "valor" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "maxUsos" INTEGER NOT NULL,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cupom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cupom_codigo_key" ON "Cupom"("codigo");

-- AddForeignKey
ALTER TABLE "Pedido" ADD CONSTRAINT "Pedido_cupomId_fkey" FOREIGN KEY ("cupomId") REFERENCES "Cupom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
