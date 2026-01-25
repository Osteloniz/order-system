-- AlterEnum
ALTER TYPE "StatusPedido" ADD VALUE 'CANCELADO';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "motivoCancelamento" TEXT;

-- AlterTable
ALTER TABLE "Produto" ALTER COLUMN "imagens" SET DEFAULT ARRAY[]::TEXT[];
