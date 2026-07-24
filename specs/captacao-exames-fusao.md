# SPEC — Captação de Exames: Fusão e Aprimoramento (Ondas A-E)

Data: 24/07/2026. Autorizado pelo CEO Dr. Caio ("construa tudo, sem excluir nada, apenas aprimorar").

## Objetivo (uma frase)
Unificar todo o fluxo de captação de exames (pasta vigiada, importação, validação, log e evolução)
em torno de UMA pasta vigiada única e UMA tela central, com data validada pelo conteúdo do laudo,
link do Drive visível em cada documento, log de auditoria em tela existente e evolução acessível
ao cliente — sem excluir nenhuma tela ou código (Regra de Ouro).

## Requisitos exatos

### ONDA A — Pasta vigiada única com renomeio por data do laudo
A1. `WATCHED_FOLDERS` passa a ter a pasta única "EXAMES CLIENTES (SANGUE IMAGEM OUTROS)"
    (id `1Nytg2IccYs5Bw6p1U8tF1X9K-MgTzRdW`) como pasta principal tipo "misto"
    (aceita sangue, imagem e outros — classifica pelo conteúdo/extensão).
    A pasta de imagem existente (`1Z2Z-NVbC8txbdNgn4R-AaTNS7Vhnf89F`) CONTINUA vigiada (não excluir).
A2. Renomeio usa a DATA DE COLETA extraída do CONTEÚDO do laudo (collectionDate da extração),
    com dupla checagem: se a data extraída for inválida/futura/anterior a 5 anos → usa data de hoje
    e registra aviso no log. Padrão: `aa.mm.dd NOME PACIENTE.ext` (ex.: `26.07.20 CAIO PADUA.pdf`).
A3. Fluxo por arquivo: achar pasta do paciente em CLIENTES → subpasta EXAMES (ou IMAGENS p/ imagem)
    → copiar renomeado lá. Fallback: pasta vigiada. (Já existe; manter e ajustar nome/data.)
A4. Classificação "misto": PDF → tenta extração de sangue; se 0 analitos e nome sugere imagem →
    registra como imagem. Extensões jpg/png/webp → imagem direto.

### ONDA B — Armazenamento interno + downloads + link Drive visível
B1. Novo armazenamento interno: bytes do arquivo gravados em tabela `exam_document_files`
    (document_id PK/FK, file_name, mime_type, bytes bytea, size_bytes, created_at) — criada por
    SQL direto (nunca db push destrutivo). Gravar em TODAS as vias: watcher, upload clínica
    (/api/exames-lab/ingest), upload cliente (/api/client-portal/upload).
B2. `GET /api/exames-lab/documento/:id/download` → serve a cópia interna (Content-Disposition).
B3. Na Mesa de Validação (exames-cliente) e no bloco Procedência: campo insert-bevel (côncavo)
    com o LINK COMPLETO do Drive (prioridade: cópia renomeada copied_drive_id; senão source_pdf_drive_id),
    com botão copiar + 2 botões de download: "Baixar (interno)" e "Abrir no Drive".
B4. Rota `GET /api/exames-lab/documento/:id/links` → { driveUrl, copiedDriveUrl, hasInternal }.

### FUSÃO — Uma tela central (transplante, sem excluir)
F1. `exames-cliente/index.tsx` ganha 2 seções novas transplantadas (mesmo fenótipo):
    "Vigilância da Pasta Drive" (conteúdo da tela /arsenal/drive-watcher) e
    "Importação em Massa do Drive" (conteúdo da tela /importar-drive), como painéis
    colapsáveis abaixo da Mesa de Validação. Reutilizar as MESMAS rotas API.
F2. Extrair os corpos das 2 telas para componentes compartilháveis
    (`components/exames/DriveWatcherPanel.tsx`, `components/exames/ImportarDrivePanel.tsx`);
    as páginas originais passam a renderizar o mesmo componente (arquivo e rota PRESERVADOS).
F3. Menu: itens "Vigilância Drive" e "Importação do Drive" saem do menu (arquivos intactos,
    rotas de página continuam funcionando por URL direta).

### ONDA C — Log/auditoria em tempo real no Monitor do Motor
C1. `/exames/monitor` ganha seção "Auditoria em Tempo Real": tabela com colunas
    Documento | Cliente | Origem (via) | Recebido em | Extraído em | Tempo (s) | Status | Link Drive.
    Fonte: exam_documents (created_at, processed_at/updated_at, origin, status) — rota nova
    `GET /api/exames-lab/auditoria?limit=50`.
C2. Polling de 5 s (já é o padrão da tela). Sem tela nova.

### ONDA D — Velocidade sem travar o servidor
D1. Watcher processa arquivos com concorrência limitada = 2 (Promise pool) em vez de sequencial.
D2. Extração já é assíncrona por documento; garantir que rotas de upload respondem imediatamente
    (fire-and-forget) — conferir client-portal e ingest.

### ONDA E — Evolução na área do cliente
E1. A aba "EVOLUÇÃO" já existe na faixa de ícones de /area; garantir que renderiza o MESMO
    componente `EvolucaoExamesPanel` do médico (não recriar), responsivo desktop + mobile
    (overflow-x-auto na planilha, sem quebrar layout mobile).

## Casos extremos
- Data de coleta ausente no laudo → fallback hoje + aviso no log (A2).
- Paciente sem estrutura de pastas no Drive → fallback pasta vigiada (já existe).
- Arquivo duplicado (hash) → não duplicar documento; ainda assim gravar cópia interna se ausente.
- bytea grande: limitar armazenamento interno a arquivos ≤ 25 MB.
- Pasta "misto" com arquivo não suportado (docx etc.) → status pendente_revisao.

## Definição de PRONTO
1. Arquivo colocado na pasta única aparece processado com nome `aa.mm.dd NOME` e data do laudo.
2. Mesa de Validação mostra link Drive copiável + 2 downloads funcionando (curl 200).
3. Tela exames-cliente contém os painéis de Vigilância e Importação funcionais.
4. Monitor mostra auditoria com tempos por documento.
5. /area aba EVOLUÇÃO abre a planilha do médico em mobile e desktop.
6. Nenhum arquivo de tela excluído; menu sem os 2 itens fundidos.
7. Architect aprova contra esta spec.

## Linhas vermelhas
- NUNCA excluir tela/arquivo/rota existente (Regra de Ouro).
- NUNCA db push destrutivo; tabela nova por SQL direto.
- Não tocar no motor de extração Gemini (apenas consumir collectionDate).
- Manter fenótipo visual Paxter (panel-3d, insert-bevel/concave-3d).
