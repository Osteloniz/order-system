BEGIN;

-- CreateEnum
CREATE TYPE "OneDriveAcao" AS ENUM ('CONECTADO', 'DESCONECTADO', 'RENOVACAO_INVALIDA');

-- CreateTable
CREATE TABLE "OneDriveFinanceiro" (
    "tenantId" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "pastaId" TEXT NOT NULL,
    "acessoCifrado" TEXT,
    "renovacaoCifrada" TEXT,
    "acessoExpiraEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneDriveFinanceiro_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "OneDriveAutorizacao" (
    "stateHash" CHAR(64) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "sessaoId" TEXT NOT NULL,
    "verifierCifrado" TEXT NOT NULL,
    "codigoCifrado" TEXT,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OneDriveAutorizacao_pkey" PRIMARY KEY ("stateHash")
);

-- CreateTable
CREATE TABLE "OneDriveEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "acao" "OneDriveAcao" NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OneDriveEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OneDriveAutorizacao_tenantId_expiraEm_idx" ON "OneDriveAutorizacao"("tenantId", "expiraEm");

-- CreateIndex
CREATE INDEX "OneDriveEvento_tenantId_criadoEm_idx" ON "OneDriveEvento"("tenantId", "criadoEm");

-- AddForeignKey
ALTER TABLE "OneDriveFinanceiro" ADD CONSTRAINT "OneDriveFinanceiro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneDriveAutorizacao" ADD CONSTRAINT "OneDriveAutorizacao_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OneDriveEvento" ADD CONSTRAINT "OneDriveEvento_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


COMMIT;
