# KAIZEN-001 — Motor de Extração de Exames (Onda 23/07/2026)

**Tipo:** Kaizen de Qualidade — Melhoria Contínua
**Iniciado por:** CEO Dr. Caio Henrique Fernandes Pádua
**Executor:** Dr. Replit Paxter
**Data:** 23/07/2026
**Status:** IMPLEMENTADO

---

## DIAGNÓSTICO — O que estava errado

| Nº | Problema | Impacto | Raiz |
|----|----------|---------|------|
| P1 | Arquivo renomeado com a DATA DE HOJE (processamento), não com a DATA DO EXAME (coleta) | Nome do arquivo mente ao usuário e ao Drive | `buildNewName` chamada antes da extração Gemini |
| P2 | Painel de origem como título dominante no top bar — polui a leitura principal | CEO não encontra a informação correta de imediato | Origem estava no top bar como primeiro dado |
| P3 | Campos de origem variavam entre cards — sem posição fixa | Olho do CEO buscava a informação em lugares diferentes | Ausência de grade imaginária para o painel de origem |
| P4 | Analito: só o nome extraído do PDF era exibido (raw) | Não era possível ver o nome canônico do sistema | JOIN com catálogo ausente na query |
| P5 | Conversão de unidade: "orig: 150" como sub-linha abaixo do valor | Quebraba alinhamento vertical da grade | Sub-linha criava altura variável por linha |
| P6 | Watcher rodava a cada 4 horas | CEO colocou exame na pasta vigiada e esperou horas sem resultado | Intervalo configurado em 4h sem run imediato no boot |
| P7 | Clone do arquivo ia para pasta errada | `copiedDriveId = null` em todos os registros | Assinatura errada em `ensureClientFolderStructure` |

---

## MELHORIAS IMPLEMENTADAS

### K1 — Data de coleta no nome do arquivo
**Antes:** `26.07.23 EXAME SANGUE HASSAN ALI AWADA.pdf` (data de hoje)
**Depois:** `21.07.26 EXAME SANGUE HASSAN ALI AWADA.pdf` (data de coleta real)
**Arquivo:** `artifacts/api-server/src/lib/drive-watcher.ts`
**Lógica:** `buildNewName` passa a receber `collectionDate` da extração Gemini; fallback = `createdTime` do Drive; último fallback = data atual.

### K2 — Painel de Classificação com campos fixos de origem
**Antes:** LED + label de origem no top bar como primeiro item visual
**Depois:** `ClassificationPanel` (bevel-3d saliente) no canto esquerdo da ZONA 2, com TODOS os 5 canais sempre presentes em posição fixa — o canal ativo acende o LED e recebe checkmark verde
**Canais sempre visíveis:**
- Portal do Cliente (upload pelo próprio cliente)
- Drive · Aspirador (watcher automático)
- Importação em Massa (importação histórica)
- Upload pela Clínica (avulso pela equipe)
- Demonstração (dado de teste)

### K3 — Analito bi-linha: nome canônico / nome extraído
**Antes:** Uma linha com `analyteNameRaw` (exatamente como o PDF tinha)
**Depois:** Linha 1 = `canonicalName` (display_name do catálogo, em bold navy); Linha 2 = `ext: {analyteNameRaw}` (apenas quando diferente do canônico, em italic muted)
**API:** `GET /exames-lab/resultados` passou a fazer LEFT JOIN com `exam_analyte_catalog` e retorna `canonicalName`

### K4 — Conversão de unidade: alinhamento vertical por coluna
**Antes:** Sub-linha `orig: 150` abaixo do valor (quebrava altura da linha)
**Depois:** Linha única alinhada — Col 2 mostra apenas valor canônico; Col 3 mostra `{origVal} {origUnit}` em azul muted (a "leitura original"); Col 4 mostra `{unitCanon}` em navy bold; Col 5 mostra `→` (seta de conversão). Borda esquerda azul fina identifica linhas com conversão.

### K5 — Watcher: intervalo 5 minutos + run imediato no boot
**Antes:** `setInterval(runDriveWatcher, 4h)` — watcher só rodava 4h após o boot
**Depois:** `runDriveWatcher()` no boot (imediato) + `setInterval(5 min)` — qualquer arquivo colocado na pasta vigiada é processado em no máximo 5 minutos

### K6 — Clone corrigido: pasta pessoal do cliente
**Antes:** `ensureClientFolderStructure(clientId)` — passava número onde a função espera `(name, cpf)`; clone ia para pasta "5278" inexistente
**Depois:** Busca `name + cpf` no banco antes de chamar; clone vai para `EXAMES` pessoal do cliente (ou `IMAGENS` para laudos de imagem)

---

## RETROATIVO PENDENTE (próxima onda)

| Item | Descrição |
|------|-----------|
| R1 | Renomear arquivos já processados com data errada — `buildNewName` retroativo via `POST /api/exames-lab/retroativo/corrigir-datas` |
| R2 | Renomear clones no Drive com nome antigo (via `drive.files.update`) |

---

## PRÓXIMOS KAIZENS (backlog)

| ID | Ideia | Prioridade |
|----|-------|------------|
| K-002 | Retroativo: corrigir datas de todos os nomes de arquivo já errados | Alta |
| K-003 | Motor de aspiraçao: notificar CEO via Telegram quando novo exame entra | Média |
| K-004 | Badge "KAIZEN" no card indicando versão do motor que processou | Baixa |
| K-005 | Conferência automática C1 quando confiança >= 95% | Média |

---

**RESUMO EM 1 LINHA:** Kaizen-001 corrige 6 problemas estruturais do motor de extração de exames — data certa no nome, painel de origem com campos fixos, nome canônico do analito, conversão alinhada verticalmente, watcher a cada 5 min e clone na pasta correta.
