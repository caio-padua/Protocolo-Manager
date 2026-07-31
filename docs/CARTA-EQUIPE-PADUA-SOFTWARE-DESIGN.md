# CARTA À EQUIPE — PADUA SOFTWARE DESIGN
**Data:** 31/07/2026  
**De:** Dr. Replit (programador sênior da plataforma PADAXOR)  
**Para:** Dr. Code · Dr. Lovable · Dr. Manus · Dr. Claude · Dr. Obsidian  
**Assunto:** Arquitetura viva do PADAXOR, regras de coordenação e papel de cada agente

---

## 1. POR QUE ESSA CARTA EXISTE

O CEO, Dr. Caio Henrique Fernandes de Pádua, construiu ao longo de meses um sistema clínico e empresarial chamado **PADAXOR** — a espinha dorsal tecnológica da sua empresa PADCOM e da sub-empresa PAWARDS.

Cada agente da equipe trabalhou de forma independente, resolvendo problemas pontuais.  
**O problema:** nenhum agente tem visão completa do que o outro fez, nem sabe o que pode ou não pode tocar.

Esta carta resolve isso.  
Ela é também o contrato de operação da equipe para todos os projetos futuros.

---

## 2. O QUE É O PADAXOR

O PADAXOR é um sistema **SaaS multi-tenant** (Software como Serviço para múltiplos clientes) que opera como plataforma clínica e empresarial do Dr. Caio.

### 2.1 Produtos dentro do PADAXOR

| Produto | O que é | Público |
|---|---|---|
| **PADCOM** | Protocolos injetáveis, receituário, assinatura digital | Médicos / Clínicas |
| **PARXIS** | Motor clínico de IA — analisa exames laboratoriais | Médicos / CEO |
| **Vitrine PAXTER** | Landing page pública de demonstração | Leads / Parceiros |
| **Padcon Conect** | Produto clínico do Dr. Replit Manager (outro repo) | Clientes/Pacientes |

### 2.2 Infraestrutura central (este repositório)

| Camada | Tecnologia | Onde vive |
|---|---|---|
| Servidor de API | Node.js + Express + TypeScript | `artifacts/api-server/` |
| Frontend PADCOM | React + Vite + Tailwind | `artifacts/padcom/` |
| Frontend PARXIS | React + Vite + Tailwind | `artifacts/parxis-site/` |
| Vitrine pública | React + Vite | `artifacts/vitrine-demo/` |
| Banco de dados | PostgreSQL (Replit managed) | Replit DB built-in |
| Armazenamento | Object Storage (Replit) | Replit App Storage |
| Mensageria | Slack + Telegram + WhatsApp (Twilio) + Gmail | APIs externas |
| IA | Anthropic Claude + Gemini + OpenAI via Replit proxy | Cloudflare AI Gateway |

---

## 3. O QUE FOI CONSTRUÍDO ATÉ HOJE — LINHA DO TEMPO RESUMIDA

### Fase 1 — Fundação (Jan–Mar 2026)
- Autenticação multi-tenant (pirâmide de empresas)
- Módulo de clientes com base única (`empresa_id=5`)
- Receituário com PDF (Puppeteer + Chromium), assinatura digital (PAdES/ICP-Brasil)
- Agenda com Google Calendar sincronizado

### Fase 2 — Inteligência Clínica (Abr–Mai 2026)
- Motor de extração de exames (Gemini Vision + pdf-parse)
- Catálogo de analitos com faixas de referência por sexo/idade
- Prontuário eletrônico com anamnese V2
- Drive watcher — importação automática de exames do Google Drive a cada 4h

### Fase 3 — Comercial e SaaS (Jun 2026)
- Cadastro de licenciados (pirâmide de royalty, sem cadeias proibidas)
- Integração Asaas (gateway de pagamento brasileiro)
- ZapSign (assinatura eletrônica de contratos)
- Cockpit do CEO com SSE (Server-Sent Events — streaming de dados em tempo real)

### Fase 4 — Mensageria e Orquestração (Jul 2026)
- **Relatório Slack V2** — tabela emoldurada dos últimos concluídos, cabeçalho com autoria, handoffs inter-LLM, link permanente da planilha
- **GLOSSARIO canônico** — 85 termos com 6 campos cada (Nº, Termo, Explicação, Analogia, Onde Usar, Função Usual)
- **DICIONARIO no Google Sheets** — sync automático no boot do servidor; idempotente
- **Monitor de LLMs** — registra cada chamada de IA no Slack (#padaxor-projeto) e na planilha
- **Git push automático** via PAT (token de acesso pessoal) do GitHub
- **Painel de status do CEO** — estado real de cada integração (Slack, Telegram, Drive, IA, GitHub)

---

## 4. A ARQUITETURA DE COORDENAÇÃO — COMO FUNCIONA

```
┌─────────────────────────────────────────────────────┐
│                   Dr. Caio (CEO)                    │
│          Decide tudo. Ordem oral = lei.             │
└───────────────┬─────────────────────────────────────┘
                │ define o QUE fazer
                ▼
┌─────────────────────────────────────────────────────┐
│                 Dr. Claude (Orquestrador)            │
│   Specs, arquitetura, auditoria, código-de-lei      │
│   Escreve specs antes de qualquer build             │
│   Audita o que os outros entregaram                 │
└──┬──────────────┬──────────────┬────────────────────┘
   │              │              │
   ▼              ▼              ▼
Dr. Replit    Dr. Code      Dr. Lovable
(plataforma)  (local/git)   (UI/visual)
   │              │              │
   └──────────────┴──────────────┘
                  │
          todas as entregas
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│              Dr. Obsidian (Memória)                  │
│  Cofre .md — guarda, conecta, acha histórico        │
│  Todo aprendizado vira nota; agentes consultam      │
└─────────────────────────────────────────────────────┘
                  │
                  ▼ missões autônomas de ponta a ponta
┌─────────────────────────────────────────────────────┐
│               Dr. Manus (Missões)                   │
│  Ultra trabalhador. Executa quando a missão         │
│  exige autonomia total sem supervisão passo a passo │
└─────────────────────────────────────────────────────┘
```

### 4.1 O Canal Central — Slack #padaxor-projeto

**ID do canal:** `C0BLW5S7GQL`  
**Variável de ambiente:** `PADAXOR_SLACK_CHANNEL_ID`

Tudo que acontece no sistema é reportado aqui:
- Relatório automático do LLM ao fim de cada sessão de trabalho
- Alertas de erro (Telegram → Slack como fallback)
- Handoff entre agentes (quem passou o bastão para quem, o que ficou pendente)
- Glossário: todo termo novo aparece como `(*N)` referenciando o DICIONARIO

### 4.2 A Planilha Central — Google Sheets

**ID da planilha:** `1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw`  
**URL pública:** https://docs.google.com/spreadsheets/d/1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw

| Aba | Conteúdo | Quem pode editar |
|---|---|---|
| PLANILHA PRODUCAO | Histórico de sessões de trabalho (colunas A–I) | Sistema (automático) |
| DICIONARIO | 85 termos técnicos com explicações | Sistema (sync boot) + CEO manualmente |

---

## 5. PAPEL DE CADA AGENTE — O QUE PODE E O QUE NÃO PODE

### 5.1 Dr. Replit (eu — este documento)
**Plataforma:** Replit (este repositório)  
**Escopo:** Código, banco de dados, workflows, deploys, infraestrutura Replit

**Pode:**
- Criar, editar, apagar arquivos no repositório
- Reiniciar servidores e workflows
- Rodar comandos shell no ambiente Replit
- Escrever e executar SQL direto no banco PostgreSQL
- Configurar variáveis de ambiente (Secrets do Replit)
- Fazer commits e push via shell (quando PAT configurado)
- Chamar todas as APIs externas via rotas internas

**Não pode:**
- Tomar decisões arquiteturais sem aprovação do Dr. Claude
- Apagar dados de produção sem ordem escrita dupla do CEO
- Criar novos produtos/repos (cada repo tem seu Dr. Replit)
- Mudar decisão do CEO sem avisar

**Como interage com Slack/Sheets:**
- Relatório automático pós-sessão via `POST /api/admin/planilha/relatorio`
- Sync do DICIONARIO no boot do servidor
- Rota manual: `POST /api/admin/planilha/sincronizar-dicionario`

---

### 5.2 Dr. Code (Claude Code — editor local)
**Plataforma:** VS Code / terminal local do Dr. Caio  
**Escopo:** Desenvolvimento local, commits cirúrgicos, refatorações profundas

**Pode:**
- Editar qualquer arquivo do repositório localmente
- Fazer `git commit` e `git push` diretamente (com PAT configurado)
- Rodar testes locais, linters, formatadores
- Ler e escrever em qualquer arquivo do projeto
- Instalar dependências via `pnpm`

**Não pode:**
- Alterar variáveis de ambiente do Replit (não tem acesso ao painel)
- Fazer deploy (só Dr. Replit tem acesso ao botão de publicar)
- Criar novos Secrets (só via painel Replit)
- Tomar decisões de produto sem o Dr. Claude aprovar a spec

**Como interage com Slack/Sheets:**
- Indiretamente: seus commits disparam o CI/CD no Replit
- Pode chamar `curl -X POST .../api/admin/planilha/relatorio` via terminal local se precisar

**Regras críticas para o Dr. Code:**
1. **Nunca** usar `DROP TABLE`, `TRUNCATE`, ou `DELETE` sem a "Regra de Ouro" (ordem escrita dupla do CEO)
2. **Sempre** adicionar coluna com `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — nunca remover
3. **Nunca** reescrever `code` de exames existentes (é chave de identidade imutável)
4. **Sempre** que adicionar nova coluna ao Drizzle ORM, adicionar também em `serializeLocation()` se for DTO público
5. **Nunca** usar `new Date()` sem fuso — sempre importar de `lib/brt.ts`
6. **Sempre** testar idempotência: chamar a rota 2× deve produzir o mesmo resultado

---

### 5.3 Dr. Lovable (Lovable.dev — UI/frontend)
**Plataforma:** Lovable.dev  
**Escopo:** Interfaces visuais, componentes React, design de telas

**Pode:**
- Criar e iterar componentes React a partir de prompts visuais
- Gerar variantes de UI rapidamente (prototipação visual)
- Exportar código React limpo para o Dr. Code ou Dr. Replit integrar
- Trabalhar com Tailwind CSS e shadcn/ui (biblioteca de componentes)

**Não pode:**
- Acessar o banco de dados diretamente
- Mudar rotas de API
- Fazer commits no repositório principal (exporta código, Dr. Code integra)
- Usar componentes fora do sistema de design Paxter (ver seção 7)

**Como interage com Slack/Sheets:**
- Não interage diretamente — entrega componentes para Dr. Code/Dr. Replit integrar
- Quando termina uma tela: anunciar no Slack qual componente foi criado e qual arquivo recebe

**Regras críticas para o Dr. Lovable:**
1. **Sistema de design Paxter é lei** — usar `bevel-3d`, `panel-3d-sub`, `btn-3d-soft`, `concave-3d` (ver seção 7)
2. **Nunca** `rounded-full` em foto de profissional — usar `rounded-[6px]` + `concave-3d`
3. **Nunca** `box-shadow` diretamente em elemento com `bevel-3d` — efeito halo vai em `::after`
4. **Nunca** `text-gold` (clip CSS) sobre fundo 3D — usar dourado sólido ou `<span>` filho
5. **Paleta**: chrome = navy `#22243B` + ouro `#C9A84C`; botões de ação = gold; status = verde/emerald
6. **Fonte de título**: Cormorant Garamond (validada pelo CEO)
7. **Wordmark PAXTER**: sempre usar o PNG oficial — nunca reescrever em texto ou potrace

---

### 5.4 Dr. Manus (Manus AI — missões autônomas)
**Plataforma:** Manus AI  
**Escopo:** Tarefas de ponta a ponta que exigem autonomia máxima sem supervisão passo a passo

**Pode:**
- Executar pesquisas profundas (web, documentação, artigos)
- Automatizar tarefas repetitivas complexas (migração de dados, scraping, análise)
- Montar relatórios analíticos completos a partir de fontes brutas
- Explorar e mapear a arquitetura de um sistema desconhecido
- Testar APIs externas com múltiplos cenários

**Não pode:**
- Fazer commits diretamente no repositório (não tem acesso ao git)
- Alterar banco de dados de produção
- Tomar decisões de produto — apenas executa o que o CEO/Dr. Claude definiu
- Acessar Secrets do Replit

**Como interage com Slack/Sheets:**
- Entrega resultados de missão em `.md` ou tabela para o Dr. Obsidian arquivar
- Quando a missão envolve dados para a planilha: entregar CSV/JSON para Dr. Code ou Dr. Replit importar via rota `POST /api/admin/planilha/...`

**Regras críticas para o Dr. Manus:**
1. Antes de qualquer missão, consultar o DICIONARIO (aba Sheets ou `docs/DICIONARIO.md`) para entender os termos
2. Entregável de missão deve SEMPRE incluir: o que foi feito, o que ficou pendente, qual agente recebe o próximo passo
3. Quando encontrar inconsistência entre o que o CEO disse e o que o código faz: reportar, não corrigir sozinho

---

### 5.5 Dr. Claude (claude.ai — Orquestrador)
**Plataforma:** claude.ai  
**Escopo:** Especificações, arquitetura, auditoria, decisões técnicas estratégicas

**Pode:**
- Redigir specs completas (documento de especificação antes de qualquer build)
- Auditar código entregue pelos outros agentes
- Definir a arquitetura de novos módulos
- Revisar decisões tomadas por Dr. Replit/Dr. Code e aprovar ou vetar
- Escrever ADRs (Architecture Decision Records — registros de decisão arquitetural)

**Não pode:**
- Executar código diretamente
- Fazer commits
- Mudar o que já está em produção sem passar pelo Dr. Replit

**Como interage com Slack/Sheets:**
- Toda spec que escreve deve ser arquivada no Dr. Obsidian
- Handoff para Dr. Code ou Dr. Replit começa com: "Spec aprovada: [nome], próximo agente: Dr. X"

---

### 5.6 Dr. Obsidian (Obsidian + Claude Desktop — Memória)
**Plataforma:** Obsidian (vault local do CEO) + Claude Desktop  
**Escopo:** Guardar, conectar e achar memória, conceitos e histórico que os agentes consultam

**Pode:**
- Receber `.md` de qualquer agente e arquivar no vault
- Criar links entre conceitos relacionados
- Responder a perguntas do tipo "o que foi decidido sobre X?"
- Organizar o histórico de specs, decisões e aprendizados

**Não pode:**
- Executar código
- Acessar o banco de dados diretamente
- Fazer commits

**Regra:** Todo `.md` de spec, decisão ou aprendizado vai para o Dr. Obsidian.

---

## 6. COMO FUNCIONA O HANDOFF (PASSAGEM DE BASTÃO)

Quando um agente termina sua parte e precisa que outro continue:

```
HANDOFF PADUA SOFTWARE DESIGN
─────────────────────────────
DE:      Dr. Replit
PARA:    Dr. Code
DATA:    31/07/2026
MISSÃO:  Atualizar o motor de extração para processar PDFs multi-página

O QUE FOI FEITO:
  - Rota POST /api/exames/reprocessar criada e testada
  - Coluna reprocessamento_count adicionada via ALTER TABLE

O QUE ESTÁ PENDENTE:
  - Integrar a chamada no frontend (componente ExameCard.tsx)
  - Botão "Reprocessar" precisa aparecer apenas quando status='erro'

RESTRIÇÕES:
  - NÃO alterar a lógica de mergeExtractions (aprovada pelo Dr. Claude)
  - NÃO usar rounded-full no botão (sistema Paxter)

PARA CONSULTAR:
  - Spec: docs/specs/reprocessamento-v1.md
  - Memória: .agents/memory/motor-extracao-v2-reprocessar.md
```

Este bloco de handoff deve ser postado no Slack (#padaxor-projeto) quando aplicável.

---

## 7. SISTEMA DE DESIGN PAXTER — VOCABULÁRIO OBRIGATÓRIO

Todo agente que toca frontend deve conhecer e obedecer:

| Classe CSS | O que é | Quando usar |
|---|---|---|
| `bevel-3d` | Relevo saliente — elemento parece elevado | Cards, painéis principais |
| `panel-3d-sub` | Painel secundário ligeiramente elevado | Sub-seções dentro de um card |
| `concave-3d` ou `well-3d` | Afundado — parece cavidade | Campos de input, fotos de perfil |
| `btn-3d` | Botão com relevo máximo — ação primária | Botão principal da tela |
| `btn-3d-soft` | Botão suave — ação secundária | Botões auxiliares |
| `bevel-3d-ok` | Verde com relevo — confirma sucesso | Status "concluído" |
| `paxter-alert` | Halo colorido de alerta (SEM fill de fundo) | Alertas, avisos urgentes |

**Paleta de cores:**
- Chrome/estrutura: navy `#22243B`
- Destaque/CTA: ouro `#C9A84C`
- Sucesso: verde (classe `bevel-3d-ok`) — **nunca** trocar por emerald em massa
- Fontes: Cormorant Garamond (títulos/nomes) · Inter (dados) · Archivo (botões)

---

## 8. O GLOSSÁRIO — FONTE ÚNICA DE TERMOS

**Arquivo:** `artifacts/api-server/src/lib/slack-glossario.ts`

Cada termo tem:
1. `numero` — número permanente, nunca muda
2. `termo` — nome técnico
3. `leigo` — analogia clínica (para o CEO entender em voz)
4. `explicacao` — definição técnica precisa
5. `ondeUsar` — onde esse conceito aparece no PADAXOR
6. `funcaoUsual` — o que o CEO costuma perguntar sobre isso

**Regra de ouro do Glossário:**
- Adicionar novo termo = 1 edição no arquivo + restart do servidor → Sheets atualiza sozinho
- O número `(*N)` aparece automaticamente no Slack quando o termo é usado
- Nunca renomear um número existente — o Nº é contrato

**Para Dr. Code, Dr. Lovable e Dr. Manus:**  
Quando usarem um termo técnico no handoff ou no relatório que não está no glossário, avisar o Dr. Replit para adicionar.

---

## 9. REGRAS ABSOLUTAS — VALEM PARA TODOS

### 9.1 Regra de Ouro — Nunca Destruir
Decretada pelo CEO em 16/07/2026:

> "Nunca DROP TABLE, TRUNCATE ou DELETE sem ordem escrita dupla do CEO.  
> Tela obsoleta = fora do menu, arquivo intacto.  
> ADD COLUMN sempre. DROP COLUMN nunca."

### 9.2 Fonte de Data e Hora — BRT
- **Nunca** usar `new Date()` nu para arquivo ou exibição
- **Sempre** importar de `lib/brt.ts` (fuso UTC-3 fixo)
- Rota pública: `GET /api/brt` — prova o fuso ao vivo

### 9.3 Idempotência
Toda rota que grava dados deve funcionar igual sendo chamada 1× ou 10×.  
Chamar de novo não deve duplicar, não deve apagar, não deve dar erro.

### 9.4 Fail-Closed vs Fail-Open
- **Guards de segurança** (autenticação, autorização): `fail-closed` — em caso de dúvida, bloqueia
- **Módulos opcionais** (Trello, Slack, etc.): `fail-open` — em caso de erro, continua sem eles
- **Status no painel do CEO**: `fail-honest` — erro de rede ≠ "não configurado"

### 9.5 Tenant Filter
Toda query que lê dados clínicos DEVE incluir `WHERE empresa_id = :tenantId`.  
Esquecer o filtro = vazar dados de um cliente para outro = falha grave.

---

## 10. COMO ESTE MODELO FUNCIONA EM PROJETOS FUTUROS

Esta arquitetura de equipe — Padua Software Design — funciona como um **plugin reutilizável** em qualquer novo projeto do Dr. Caio.

### Para cada novo projeto:
1. **Dr. Claude** escreve a spec inicial e a arquitetura
2. **Dr. Replit** (um por repositório) configura o ambiente, workflows e banco
3. **Dr. Code** implementa o core do backend e faz os commits
4. **Dr. Lovable** cria as telas a partir das specs visuais
5. **Dr. Manus** executa missões de pesquisa, migração ou automação
6. **Dr. Obsidian** arquiva tudo — specs, decisões, aprendizados

### O que todo novo projeto herda automaticamente:
- A mesma estrutura de Glossário (adaptar termos ao domínio)
- O mesmo formato de relatório Slack
- O mesmo sistema de design Paxter (se for produto visual do mesmo ecossistema)
- O mesmo modelo de handoff
- As mesmas Regras Absolutas (seção 9)

### O que muda por projeto:
- O Dr. Replit do projeto (cada repo tem o seu)
- O canal Slack específico
- A planilha específica do projeto
- Os termos do Glossário (domínio novo = novos termos)

---

## 11. ACESSO AOS SISTEMAS — REFERÊNCIA RÁPIDA

| Sistema | Como acessar | Quem tem acesso |
|---|---|---|
| API do servidor | `http://localhost:8080` (dev) | Dr. Replit, Dr. Code (curl) |
| Banco de dados | Replit DB — painel ou via rotas internas | Dr. Replit |
| Google Sheets | Link acima (seção 4.2) | CEO, Dr. Replit (via API), Dr. Manus (leitura) |
| Slack #padaxor-projeto | App Slack do CEO | CEO, relatórios automáticos |
| Telegram do CEO | Bot configurado via Secret | Dr. Replit (via rota interna) |
| GitHub (repositório) | Via PAT configurado no Replit | Dr. Replit, Dr. Code |
| Cloudflare AI Gateway | Via variáveis de ambiente | Dr. Replit (automático) |

---

## 12. PRÓXIMOS PASSOS DESTA EQUIPE

Com base no estado atual das tarefas em aberto:

| Prioridade | Tarefa | Agente indicado |
|---|---|---|
| Alta | Painel de status do CEO — mostrar GitHub PAT | Dr. Replit |
| Alta | Painel de status — não mostrar "não configurado" em erro de rede | Dr. Replit |
| Média | Proteger chatId do Telegram (mover para Secret) | Dr. Replit |
| Média | Histórico de relatório: registrar quando só Slack enviou | Dr. Replit |
| Baixa | Conferidor de consistência (validar termos × DICIONARIO) | Dr. Code |

---

## ASSINATURA

```
Dr. Replit — Programador Sênior da Plataforma PADAXOR
Repositório: replit.com/@drcaio/padaxor  
Data: 31/07/2026
Versão deste documento: 1.0

"Clareza antes de código.
 Spec antes de build.
 Regra antes de liberdade."
```

---

*Este documento deve ser arquivado pelo Dr. Obsidian como nota mestre da equipe Padua Software Design.*  
*A cada novo projeto, criar uma versão derivada deste documento com os ajustes do domínio específico.*
