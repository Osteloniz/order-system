BEGIN;

-- CreateEnum
CREATE TYPE "StatusDocumentoFinanceiro" AS ENUM ('PRONTO_PARA_REVISAO', 'FALHA_LEITURA', 'CONFIRMADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemLeituraFinanceira" AS ENUM ('XML', 'OCR');

-- CreateEnum
CREATE TYPE "AcaoDocumentoFinanceiro" AS ENUM ('ENVIO', 'LEITURA', 'FALHA_LEITURA', 'REVISAO', 'DUPLICIDADE', 'CONFIRMACAO', 'CANCELAMENTO', 'ACESSO_ANEXO');

-- AlterTable
ALTER TABLE "FornecedorFinanceiro" ADD COLUMN     "cnpjNormalizado" TEXT,
ADD COLUMN     "nomeNormalizado" TEXT,
ADD COLUMN     "razaoSocial" TEXT;

-- CreateTable
CREATE TABLE "DocumentoFinanceiro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "driveId" TEXT NOT NULL,
    "driveItemId" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "enviadoPorId" TEXT NOT NULL,
    "status" "StatusDocumentoFinanceiro" NOT NULL,
    "origemLeitura" "OrigemLeituraFinanceira" NOT NULL,
    "dadosExtraidos" JSONB,
    "extraidoEm" TIMESTAMP(3),
    "cnpjEmissor" TEXT,
    "chaveAcesso" TEXT,
    "numeroDocumento" TEXT,
    "serie" TEXT,
    "dataEmissao" DATE,
    "valorTotalExtraido" INTEGER,
    "revisao" JSONB,
    "versao" INTEGER NOT NULL DEFAULT 0,
    "contaPagarId" TEXT,
    "confirmadoPorId" TEXT,
    "confirmadoEm" TIMESTAMP(3),
    "canceladoPorId" TEXT,
    "canceladoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoFinanceiro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DocumentoFinanceiro_confirmacao_check" CHECK (
        ("status" = 'CONFIRMADO' AND "contaPagarId" IS NOT NULL AND "confirmadoPorId" IS NOT NULL AND "confirmadoEm" IS NOT NULL)
        OR ("status" <> 'CONFIRMADO' AND "contaPagarId" IS NULL AND "confirmadoPorId" IS NULL AND "confirmadoEm" IS NULL)
    ),
    CONSTRAINT "DocumentoFinanceiro_tamanho_check" CHECK ("tamanhoBytes" BETWEEN 1 AND 15728640)
);

-- CreateTable
CREATE TABLE "DocumentoFinanceiroEvento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "documentoId" TEXT NOT NULL,
    "atorId" TEXT NOT NULL,
    "acao" "AcaoDocumentoFinanceiro" NOT NULL,
    "contaPagarId" TEXT,
    "motivo" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoFinanceiroEvento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentoFinanceiro_tenantId_status_criadoEm_idx" ON "DocumentoFinanceiro"("tenantId", "status", "criadoEm");

-- CreateIndex
CREATE INDEX "DocumentoFinanceiro_tenantId_chaveAcesso_idx" ON "DocumentoFinanceiro"("tenantId", "chaveAcesso");

-- CreateIndex
CREATE INDEX "DocumentoFinanceiro_tenantId_cnpjEmissor_numeroDocumento_se_idx" ON "DocumentoFinanceiro"("tenantId", "cnpjEmissor", "numeroDocumento", "serie");

-- CreateIndex
CREATE INDEX "DocumentoFinanceiro_tenantId_sha256_idx" ON "DocumentoFinanceiro"("tenantId", "sha256");

-- CreateIndex
CREATE INDEX "DocumentoFinanceiro_tenantId_dataEmissao_valorTotalExtraido_idx" ON "DocumentoFinanceiro"("tenantId", "dataEmissao", "valorTotalExtraido");

-- CreateIndex
CREATE INDEX "DocumentoFinanceiro_tenantId_contaPagarId_idx" ON "DocumentoFinanceiro"("tenantId", "contaPagarId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFinanceiro_tenantId_id_key" ON "DocumentoFinanceiro"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentoFinanceiro_tenantId_driveId_driveItemId_key" ON "DocumentoFinanceiro"("tenantId", "driveId", "driveItemId");

-- CreateIndex
CREATE INDEX "DocumentoFinanceiroEvento_tenantId_documentoId_criadoEm_idx" ON "DocumentoFinanceiroEvento"("tenantId", "documentoId", "criadoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_tenantId_id_key" ON "ContaPagar"("tenantId", "id");

-- CreateIndex
CREATE INDEX "FornecedorFinanceiro_tenantId_nomeNormalizado_idx" ON "FornecedorFinanceiro"("tenantId", "nomeNormalizado");

-- CreateIndex
CREATE UNIQUE INDEX "FornecedorFinanceiro_tenantId_cnpjNormalizado_key" ON "FornecedorFinanceiro"("tenantId", "cnpjNormalizado");

-- AddForeignKey
ALTER TABLE "DocumentoFinanceiro" ADD CONSTRAINT "DocumentoFinanceiro_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFinanceiro" ADD CONSTRAINT "DocumentoFinanceiro_tenantId_contaPagarId_fkey" FOREIGN KEY ("tenantId", "contaPagarId") REFERENCES "ContaPagar"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFinanceiroEvento" ADD CONSTRAINT "DocumentoFinanceiroEvento_tenantId_documentoId_fkey" FOREIGN KEY ("tenantId", "documentoId") REFERENCES "DocumentoFinanceiro"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FornecedorFinanceiro" ADD CONSTRAINT "FornecedorFinanceiro_cnpj_formato_check"
    CHECK ("cnpjNormalizado" IS NULL OR "cnpjNormalizado" ~ '^[0-9]{14}$');

COMMIT;

