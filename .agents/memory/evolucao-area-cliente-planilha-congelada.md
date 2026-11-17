---
name: Evolução da Área do Cliente — planilha congelada e nomes de upload
description: Armadilhas do cabeçalho sticky com rolagem lateral, gráfico inicial e onde mora o nome original do upload.
---

Cabeçalho da planilha (datas + "Faixinha de cor") congelado = bloco `sticky` FORA da moldura `overflow-x-auto`, com `top: var(--paxter-topbar-h)` (publicada por area.tsx a partir da altura real da faixa superior) e rolagem lateral sincronizada nos dois sentidos.

**Why:** sticky vertical não funciona dentro de ancestral com overflow-x; número fixo de pixels quebraria no banner de pré-visualização admin e em telas diferentes.

**How to apply:** mexeu na largura das colunas/linhas da planilha? A largura do cabeçalho vem de `larguraConteudo` (ResizeObserver do corpo); testes em e2e/evolucao-planilha-congelada.spec.ts.

Modo cliente abre sozinho o gráfico do exame com mais coletas (layout "topo", um gráfico por linha: container é max-w-lg, o grid xl:3 colunas espremia o cartão).

Nome do upload: `/api/client-portal/upload` renomeia para o padrão ANTES de ingerir; o nome original só sobrevive porque `startExamIngestion` recebe `originalFileName` e o grava na cópia interna (`exam_document_files.file_name`). Documentos antigos (anteriores a essa mudança) não têm o original recuperável.

**Why:** não existe coluna de nome original em `exam_documents`; evitou-se mudar o esquema.
