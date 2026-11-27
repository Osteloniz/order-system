# Captura assistida de documentos financeiros

Em HML, **Financeiro → Contas a pagar → Importar nota** reúne conexão do OneDrive, envio, revisão, confirmação e documentos recentes. A migration `20261123180000_add_documentos_financeiros` acrescenta referências, extração, revisão e auditoria. A migration `20261123200000_add_onedrive_financeiro` adiciona estado OAuth, conexão e eventos administrativos. Contas e fornecedores legados mantêm os dados existentes, sem backfill.

O Preview recebe arquivos de até 4 MiB para caber no transporte da hospedagem. O serviço de captura valida extensão, MIME declarado e assinatura. A NF-e em XML UTF-8 tem precedência, com rejeição de DTD e limites para profundidade e itens. Fotos e PDF ficam disponíveis para revisão manual enquanto o provedor OCR é aprovado. O original vai à App Folder via Microsoft Graph. O banco recebe referências estáveis e campos extraídos, sem binário ou URL de arquivo. A rota de conteúdo revalida o SHA-256 e devolve o original como anexo privado.

A revisão exige decisão explícita de fornecedor. A confirmação transacional usa a versão salva, serializa confirmações dentro do tenant, valida categoria e fornecedor no servidor e devolve o mesmo vínculo em retry. Alertas usam hash, chave fiscal, CNPJ + número + série na falta de chave e valor + emissão. Vincular uma conta existente preserva o lançamento escolhido. Manter um novo exige justificativa. O vínculo impede a exclusão física da conta e permite cancelamento no fluxo financeiro.

## Configuração de homologação

1. No Entra, registrar `Brookie Financeiro HML` como aplicação **Web** com suporte a contas Microsoft pessoais, com URI exata `https://order-system-git-develop-ostelonizs-projects.vercel.app/api/admin/integracoes/onedrive/callback`. O OAuth solicita somente `Files.ReadWrite.AppFolder` delegada e `offline_access`. [Registro Microsoft Entra](https://learn.microsoft.com/en-us/graph/auth-register-app-v2) · [Pasta de aplicativo](https://learn.microsoft.com/graph/onedrive-sharepoint-appfolder)
2. Nas variáveis da Vercel para **Preview → develop**, confirmar `DATABASE_URL` e `DIRECT_URL` de HML, configuração administrativa de HML e URLs da aplicação no alias de `develop`. Configurar `ONEDRIVE_CLIENT_ID`, `ONEDRIVE_CLIENT_SECRET`, `ONEDRIVE_REDIRECT_URI` e `ONEDRIVE_TOKEN_ENCRYPTION_KEY`. A chave é Base64 de 32 bytes aleatórios e independente da chave de MFA. Salvar segredo e chave como sensíveis, sem copiar para arquivos locais. [Variáveis Preview na Vercel](https://vercel.com/docs/environment-variables/manage-across-environments)
3. Acessar o Preview com proteção Vercel, entrar no Brookie como MASTER com MFA, usar **Conectar OneDrive**, consentir na Microsoft, selecionar **Voltar ao Brookie** e **Concluir conexão**. Sessões Brookie anteriores ao deploy precisam de um novo login. O retorno faz a troca de código após validar a mesma sessão, mantendo o cookie principal Strict.
4. Homologar com XML e imagem/PDF sintéticos, testando repetição, anexo, ausência do arquivo, outro tenant, ADMIN, MASTER e CAIXA. Desconectar remove os tokens do Brookie e mantém histórico e arquivos. Para revogar o consentimento Microsoft, usar as permissões de aplicativos da conta proprietária. Reconectar requer o mesmo drive para preservar o acesso histórico.

O OAuth está desativado no ambiente Production da Vercel. A integração real, o aceite visual autenticado do Preview, o OCR aprovado e o transporte de arquivos acima de 4 MiB seguem como gates. [Limites de Vercel Functions](https://vercel.com/docs/functions/limitations)

## Validação local

Com Node.js 22.22.3 e Prisma Client gerado, execute `rtk node --test --experimental-transform-types tests/documentos-financeiros.test.mjs`. Para incluir a integração, defina `DOCUMENTOS_TEST_DATABASE_URL` apenas no processo de teste, para um Postgres descartável em `127.0.0.1`, com banco `brookie_documentos_test` e migrations aplicadas. O teste exercita o serviço com armazenamento isolado em memória.
