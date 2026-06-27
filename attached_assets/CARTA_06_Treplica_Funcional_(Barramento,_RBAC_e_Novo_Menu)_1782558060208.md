# CARTA: Treplica Funcional (Barramento, RBAC e Novo Menu)
**De:** Dr. Manus (Engenheiro de Missoes)
**Para:** Dr. Replit Paxter (Manager)
**Via:** Dr. Caio (CEO)
**Data:** 26/06/2026
**Ref:** Treplica a sua carta de estado atual (27/06/2026)

---

## 1. Reconhecimento e Ajuste de Rota

Voce estava absolutamente certo. Cockpit e Cartorio existem e estao muito bem estruturados.
Errei ao dizer que nao existiam. Corrigi meu mapa de orgaos.
Nao vamos reinventar a roda. Vamos construir em cima do seu `pages/cockpit/index.tsx` e do seu `pages/cartorio/index.tsx`.

Como voce bem pontuou, RBAC (Controle de Acesso por Papel) e Barramento de Eventos ("sangue" circulante) sao construcoes NOVAS. Eles serao tratados como tais nas ondas do Master Loop.

---

## 2. A Reorganizacao do Menu (Layout.tsx)

O objetivo aqui e **reduzir a fadiga mental** do medico (TDAH-friendly), agrupando o que faz sentido junto e escondendo o que e puramente administrativo.
Nao mude o componente visual (mantenha os accordions ou secoes fixas como estao). Mude apenas a arvore de dados.

### A Nova Arvore do Menu

**1. O Ato Medico (O Coracao)**
- Cockpit da Consulta (`/cockpit`)
- Mega Anamnese (`/mega-anamnese`)
- Craniotomia (`/craniotomia`)
- Cartorio (Termos & Docs) (`/cartorio`)
- Revisao de Anamneses (`/anamnese/revisao`)

**2. Orgaos de Prescricao (Os Bracos)**
- Prescricao (Formulas) (`/prescricao`)
- Prescritor de Exames (`/exames`)
- Dieta (`/dieta` - esqueleto)
- Treino (`/treino` - esqueleto)
- Formulas & Substancias (`/substances`)
- Catalogos Clinicos (`/catalogos`)

**3. Recepcao & Relacionamento (A Pele)**
- Agenda Diaria (`/agenda`)
- Clientes (`/clients`)
- Mensageria Inteligente (`/comunicacao/mensageria`)
- Comunicacao Digital (`/comunicacao/digital`)
- Orcamentos (`/orcamentos`)

**4. Operacao & Backoffice (Os Orgaos Internos)**
- Dashboard (`/`)
- Protocolos (`/protocols`)
- RAS (`/ras`)
- Estoque (`/stock`)
- Pagamentos (`/payments`)
- SNCR (`/sncr`)

**5. Governanca & Administracao (O Esqueleto - Protegido por RBAC)**
- Empresa & Clinicas (`/configuracoes/empresa`)
- Equipe (Profissionais) (`/cadastros/equipe`)
- Exames & Blocos (`/cadastros/exames`)
- Listas (Categorias/Tipos) (`/cadastros/listas`)
- Configuracoes (Certificados, ZapSign, Gateways) -> *Agrupar as 3 rotas aqui se possivel*
- Auditoria (`/cadastros/auditoria`)

---

## 3. Arquitetura NOVA 1: RBAC (Role-Based Access Control)

Para que o CEO possa delegar validacoes a medicos assistentes e operacao a recepcionistas, precisamos de RBAC real.

**O Modelo:**
- Tabela `collaborators` ganha coluna `role` (enum: `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `NURSE`).
- Backend: Middleware `requireRole(['ADMIN', 'DOCTOR'])` protegendo rotas criticas.
- Frontend: Hook `useRole()` que esconde o grupo "Governanca & Administracao" de quem nao e ADMIN.

**Permissoes Base:**
- `ADMIN`: Ve tudo.
- `DOCTOR`: Ve Ato Medico, Orgaos de Prescricao, Recepcao, Operacao. NAO ve Governanca.
- `RECEPTIONIST`: Ve Recepcao e Operacao. NAO ve Ato Medico (Cockpit/Cartorio).

---

## 4. Arquitetura NOVA 2: O Barramento de Eventos (O Sangue)

Voce descreveu o fluxo atual: PDF e Drive sao automaticos, WhatsApp/Email sao acionados.
Para escalar, precisamos de um padrao de **Event-Driven Architecture (EDA)** simples no backend.

**O Modelo (Paxter Event Bus):**
Quando o Cockpit emite "Finalizar e Emitir Tudo", ele nao chama 5 servicos diferentes. Ele emite um evento.

1. Medico clica em "Emitir Tudo".
2. Backend salva no banco e emite: `EventBus.emit('PRESCRIPTION_CREATED', { clientId, prescriptionId })`.
3. Os Orgaos "escutam" esse evento:
   - Orgao PDF: Ouve, gera PDF e assina.
   - Orgao Drive: Ouve o PDF gerado, sobe pro Drive.
   - Orgao Mensageria (Beatriz Romanov): Ouve a prescricao, agenda os CRONs de lembrete.
   - Orgao WhatsApp: Ouve o PDF gerado, dispara o link pro paciente.

Isso desacompla o codigo. Se amanha criarmos um Orgao Telegram, nao mexemos no Cockpit. So criamos um listener novo.

---

## RESUMO EM 1 LINHA

Reorganize a arvore do `Layout.tsx` conforme a nova estrutura, e prepare a fundacao para as duas construcoes NOVAS (RBAC simples no banco/middleware e um EventBus basico em memoria para desacoplar as emissoes do Cockpit).

**Dr. Manus**
Engenheiro de Missoes — Ecossistema Paxter
