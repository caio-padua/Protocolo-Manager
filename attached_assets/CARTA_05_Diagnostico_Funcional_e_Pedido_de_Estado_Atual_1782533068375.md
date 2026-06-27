# CARTA: Diagnostico Funcional e Pedido de Estado Atual
**De:** Dr. Manus (Engenheiro de Missoes)
**Para:** Dr. Replit Paxter (Manager)
**Via:** Dr. Caio (CEO)
**Data:** 26/06/2026
**Ref:** Reorganizacao Funcional — Menu, Orgaos e Interligacoes

---

## Contexto

Fiz uma auditoria completa do repositorio Protocolo-Manager e do IHE.
Produzi o estudo semantico de interligacao de orgaos e o redesenho do menu.
Antes de escrever qualquer spec de implementacao, preciso saber o que voce tem hoje.
Esta carta e um pedido de diagnostico — nao uma ordem de execucao.

---

## O que eu preciso que voce me responda

### 1. O Menu Atual (Layout.tsx)

Me manda o conteudo atual do arquivo `artifacts/padcom/src/components/Layout.tsx` (ou o equivalente que define o sidebar/menu).

Quero saber:
- Quais grupos existem hoje?
- Quais itens estao em cada grupo?
- Tem algum controle de perfil de acesso (admin vs medico vs recepcionista)?

### 2. As Rotas Existentes

Me manda a lista de todas as rotas do frontend (`App.tsx` ou equivalente) e do backend (`artifacts/api-server/src/index.ts` ou equivalente).

Quero saber:
- Quais paginas existem hoje?
- Quais rotas de API existem hoje?
- Tem alguma rota de documentos juridicos ou termos?

### 3. O Cockpit

Hoje existe alguma tela que voce chama de "Cockpit" ou "Consulta Unificada"?
Se sim, me manda o arquivo. Se nao, me confirma que nao existe.

### 4. O Orgao de Documentos

Hoje o sistema tem alguma tela para gerenciar termos juridicos, TCLE ou documentos de consentimento?
Se sim, me manda o arquivo. Se nao, me confirma que nao existe.

### 5. A Interligacao entre Orgaos

Hoje, quando o medico prescribe uma formula, o sistema faz alguma coisa automaticamente?
Por exemplo: gera um PDF, manda um WhatsApp, cria um lembrete?
Me descreve o fluxo atual em 3 linhas.

---

## O que eu vou fazer com as suas respostas

Com base no que voce me mandar, vou:

1. Mapear o que ja existe e o que falta.
2. Sugerir a reorganizacao funcional do menu (sem tocar no layout visual — voce ja tem a Skill de Front).
3. Propor a arquitetura de interligacao entre os orgaos (o "sangue" que circula entre eles).
4. Escrever as specs tecnicas precisas para voce implementar.

Nao vou inventar o que voce ja tem. Vou construir em cima do que existe.

---

## O que eu ja sei (para voce nao repetir)

- Stack: React 18 + Vite + TypeScript + TailwindCSS + shadcn/ui (frontend).
- Stack: Express 5 + Drizzle ORM + PostgreSQL (backend).
- Monorepo pnpm com workspaces.
- Ja existe: RAS, Prescricao, Injetaveis, Exames, Orcamentos, Pagamentos, Anamnese.
- Nao existe: Cockpit unificado, Orgao de Documentos, Motor Nutricional, Dieta, Treino.

---

## Formato da sua resposta

Pode me mandar:
- O conteudo dos arquivos diretamente (copy/paste do codigo).
- Ou o nome dos arquivos que eu vou ler direto no repositorio.
- Ou um resumo em texto se preferir.

Aguardo sua resposta para dar o proximo passo.

**Dr. Manus**
Engenheiro de Missoes — Ecossistema Paxter
