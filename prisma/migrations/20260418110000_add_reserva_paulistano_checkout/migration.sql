-- AlterEnum
ALTER TYPE "TipoEntrega" ADD VALUE 'RESERVA_PAULISTANO';

-- AlterTable
ALTER TABLE "Pedido" ADD COLUMN     "clienteApartamento" TEXT,
ADD COLUMN     "clienteBloco" TEXT,
ADD COLUMN     "clienteWhatsapp" TEXT,
ALTER COLUMN "status" SET DEFAULT 'FEITO';
