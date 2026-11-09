---
name: Vínculo empresarial do profissional
description: Empresa originária + até 5 empresas por profissional; agenda só abre nas empresas vinculadas; lições de implementação
---

Cada profissional tem 1 empresa originária (`professionals.empresa_id`, efetivo `?? 5`) e até 4 adicionais
(tabela `professional_empresas`). Total máximo 5. Só o dono da plataforma edita. A agenda (vínculo
profissional x local) só pode ser criada em local de empresa vinculada; o escopo de leitura é owner-aware.

**Why:** o CEO pediu que a agenda só abra nas empresas onde o profissional está cadastrado (a aba listava
os locais de todas as empresas). Regra de Ouro: nunca desligar agenda sozinho.

**How to apply:**
- Remover/trocar empresa que ainda tem agenda liberada = HTTP 409 com a lista de agendas; a tela mostra o aviso e nada some.
- Tabela nova nasce por "ensure" no boot E em arquivo .sql espelhado (teste prova equivalência); nunca `db push`.
- `tenantContext` passou a consultar `professional_empresas`: fixtures de banco descartável de testes protegidos precisam criar essa tabela.
- Drizzle `.set({})` vazio dá 500: PUT só com campo novo (ex.: `empresaOriginariaId`) precisa pular o update quando não há coluna a mudar.
- Slots 2 a 5 são compactados pelo servidor (sem lacunas): a UI trabalha por posição na lista, nunca por `ordem` salva.
- OpenAPI/orval não foi regenerado: as rotas `/professionals/:id/empresas` são chamadas por fetch direto.
- Prova de tela sem login: Playwright com respostas simuladas (`e2e/corpo-clinico-empresas.spec.ts`); não prova contra o banco real.
- Falhas pré-existentes e alheias a este tema: `concierge-admin-routes` e `telegram-inbox-enviar-isolation` já falhavam antes.
