# Demanda 2 — Procedência da sugestão + abrir/baixar o laudo original

Loop: Paxter Loop (Especificar → Construir → Revisar). Opção escolhida pelo CEO: C — a mais
completa e robusta (abrir no Google Drive E baixar pelo próprio sistema). Fica na tela de
configuração de exames (Console de Exames), tanto na Sala de Triagem quanto no detalhe do exame.

## Objetivo
Para cada grafia sugerida (na Sala de Triagem) e para cada exame do catálogo (no detalhe), mostrar
DE ONDE a grafia veio: quais clientes, em quais arquivos de laudo, com qual valor cru e data — e
permitir CONFERIR o laudo original de duas formas: abrir no Google Drive (nova aba) e baixar pelo
sistema (robusto, funciona sem estar logado na conta Google).

## Modelo de dados verificado (nada muda no schema)
- `exam_analyte_triagem`: item da fila é um CLUSTER (dedup por `normKey`); guarda `sampleName`.
- `exam_results`: `analyteNameRaw` (grafia crua), `analyteCode` (null se não resolvido), `valueRaw`,
  `unitRaw`, `clientId`, `examDocumentId`, `collectionDate`, `createdAt`.
- `exam_documents`: `fileName`, `sourcePdfDriveId` (id do arquivo no Drive, pode ser null),
  `sourcePath` (pasta de origem), `collectionDate`, `createdAt`, `clientId`.
- `clients`: `name`.
- Helpers existentes reutilizados: `normalizeAnalyteName` (persist.ts) e `driveDownloadFile(fileId)`
  (google-drive.ts). NENHUM endpoint novo de escrita; NENHUMA mudança no motor de triagem/cálculo.

## Requisitos (exatos)

### Backend (rotas novas de LEITURA e uma de download)
1. `GET /api/exames-lab/triagem/:id/procedencia` — carrega o item pela id, obtém seu `normKey`,
   encontra todas as linhas de `exam_results` cujo `normalizeAnalyteName(analyteNameRaw) === normKey`,
   junta `exam_documents` + `clients`, AGRUPA por `examDocumentId` (um arquivo aparece uma vez) e
   devolve a lista de procedência.
2. `GET /api/exames-lab/catalogo/:code/procedencia` — mesma lista, porém para um exame do catálogo:
   `exam_results` onde `analyteCode === code`, agrupado por `examDocumentId`.
3. Shape de cada item devolvido (idêntico nas duas rotas):
   `{ examDocumentId, clientId, clientName, fileName, sourcePdfDriveId, sourcePath, valueRaw,
     unitRaw, grafiaCrua, collectionDate, createdAt, driveUrl }`.
   `driveUrl` só é preenchido quando há `sourcePdfDriveId` (formato
   `https://drive.google.com/file/d/{id}/view`); caso contrário, null.
4. `GET /api/exames-lab/documento/:docId/arquivo?inline=0|1` — baixa o arquivo pelo sistema:
   carrega o documento; se não tiver `sourcePdfDriveId`, responde 404 com mensagem clara; senão usa
   `driveDownloadFile`, define `Content-Type` pela extensão do `fileName` (pdf→application/pdf,
   jpg/jpeg→image/jpeg, png→image/png, senão application/octet-stream) e `Content-Disposition`
   attachment (ou inline quando `inline=1`) com o `fileName`, e envia os bytes.

### Frontend (Console de Exames — dois lugares)
5. Na Sala de Triagem, cada card ganha o botão "Procedência" que abre/fecha, logo abaixo do card,
   um painel com a lista de arquivos de origem (cliente, nome do arquivo, valor cru + unidade, data)
   e, por arquivo, dois botões: "Abrir no Drive" (link em nova aba, só quando há driveUrl) e "Baixar"
   (link para a rota de download do sistema, só quando há sourcePdfDriveId).
6. No detalhe do exame selecionado do catálogo, um bloco "Procedência" com a MESMA lista (buscada por
   `code`) e os mesmos dois botões por arquivo.
7. Estados de carregando, vazio ("nenhuma origem encontrada") e "arquivo não está no Drive" (quando
   sem sourcePdfDriveId) são explícitos. A procedência aberta é por card/exame e reseta ao trocar.

## Casos extremos
- Documento sem `sourcePdfDriveId`: mostra a linha (cliente/arquivo/valor) mas sem os botões, com o
  aviso "arquivo não está no Drive".
- Mesma grafia em vários arquivos do mesmo cliente: cada arquivo é uma linha (agrupado por documento).
- Trocar de exame no catálogo fecha a procedência aberta (Requisito 7).

## Definição de PRONTO
- No card da grafia (ex.: Frutosamina antes de virar exame), clico em "Procedência" e vejo cliente +
  arquivo + valor cru + data; clico em "Abrir no Drive" e o laudo abre em nova aba; clico em "Baixar"
  e o sistema entrega o PDF/imagem.
- No detalhe de um exame do catálogo, o bloco "Procedência" lista os arquivos de origem com os mesmos
  dois botões.
- Nenhuma mudança no motor de triagem/cálculo; nenhuma rota de escrita nova; schema intacto.

## Linhas vermelhas
- NÃO tocar no motor de triagem/cálculo nem nas rotas de escrita existentes.
- NÃO mexer no seletor de apelido manual nem no botão "Tornar quantitativo" (Demanda 1).
- NÃO logar token/segredo do Drive; a rota de download usa o helper existente.
- A rota de download NÃO serve arquivo fora de `exam_documents` (só por `docId` válido).
