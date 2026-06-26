# Spec — Controle Financeiro Total + Configurações Editáveis (Loop Diamante)

Data: 26/06/2026. Autor: Dr. Replit Paxter (a mando do CEO Dr. Caio). Método: Paxter Loop.
Autonomia: 100% concedida pelo CEO (não pedir decisões; decidir defaults razoáveis e seguir).

## Objetivo (uma frase)
Entregar 3 frentes — (A) CONFIGURAÇÕES editáveis pelo CEO, (B) CONCILIAÇÃO e (C) METAS & CRESCIMENTO —
com cada ferramenta no menu e TODO valor configurável vindo de banco/cofre (nada cravado no código).

## Glossário (siglas explicadas)
- Hardcoded = valor cravado no código; só o programador muda. Objetivo: ELIMINAR.
- Gateway / Porta de Pagamento = empresa que processa o dinheiro (ex.: Asaas, Stripe).
- Conciliação = cruzar o que a porta de pagamento registrou contra o que o sistema esperava.
- ZapSign = serviço de assinatura eletrônica de documentos (o CEO já tem conta).
- A1 ICP-Brasil = certificado digital em arquivo .pfx, usado para assinar PDFs.
- app_settings = tabela chave/valor no banco para configurações NÃO sensíveis (editável na tela).
- secure_settings = tabela NOVA para segredos CIFRADOS em repouso (tokens, senha do .pfx).
- Object storage = armazenamento de arquivos protegido (onde mora o .pfx enviado pela tela).
- AES-256-GCM = algoritmo de cifragem simétrica autenticada (cifra + verifica integridade).

---

## 1. ARQUITETURA ANTI-HARDCODE (fundação das 3 frentes)

| Tipo de dado | Onde fica | Leitura no app | Edição |
|---|---|---|---|
| Config não sensível (nome empresa, metas, URLs, liga/desliga) | `app_settings` (value = JSON em texto) | resolver `getSetting(key)` com fallback p/ env | tela (Configurações) |
| Segredo (Asaas API key, webhook token, ZapSign token, senha .pfx) | `secure_settings` (cifrado AES-256-GCM) | resolver `getSecret(key)` com fallback p/ env | tela (envia em claro 1x; nunca volta em claro) |
| Arquivo .pfx (certificado) | object storage (privado) | baixa para cache temporário ao assinar | tela (upload) |

Regras invioláveis da fundação:
1. O frontend NUNCA recebe segredo em claro. A API devolve só `{ isSet: true/false, masked: "••••1234", updatedAt }`.
2. Resolver de segredo: `secure_settings` (cifrado) tem prioridade; se vazio, cai no `process.env` (compatibilidade — ASAAS_API_KEY atual continua valendo até o CEO salvar pela tela).
3. Chave de cifragem (CORRIGIDO pós-architect P0-1): em PRODUÇÃO, `APP_ENCRYPTION_KEY` é OBRIGATÓRIA — sem ela, gravar/ler segredo cifrado falha com erro claro (não cai silenciosamente). O fallback derivado de `SESSION_SECRET` (via scrypt) é permitido SOMENTE em desenvolvimento e emite warning explícito no boot. Motivo: não acoplar autenticação ao cofre e não quebrar segredos quando SESSION_SECRET rotacionar.
4. Nenhum segredo é logado (nem em erro). `req.log` nunca recebe valor de segredo.

### 1.1 Modelo de dados `secure_settings` (NOVO — CORRIGIDO P0-3)

| Coluna | Tipo | Papel |
|---|---|---|
| key | text PK | identificador do segredo (ex.: `asaas.apiKey`) |
| ciphertext | text | conteúdo cifrado (base64) |
| iv | text | vetor de inicialização (base64) — único por gravação |
| authTag | text | tag de autenticação GCM (base64) |
| keyVersion | integer | versão da chave de cifragem (default 1) — permite rotação futura |
| updatedAt | timestamp | último a salvar vence |
| updatedBy | text | quem salvou (colaborador do token), para auditoria |

### 1.2 Política de acesso (CORRIGIDO P0-2)

| Regra | Como aplicar |
|---|---|
| Backend sempre protege | TODAS as rotas novas (Configurações, Conciliação, Metas), GET e mutações, passam por `requireCollaborator` no servidor — não confiar só no gate do frontend |
| Cofre nunca lê em claro p/ fora | Rotas de segredo devolvem só status/masked; valor em claro só existe em memória do servidor |

---

## 2. MENU / IA (REGRA DE OURO — toda ferramenta tem entrada)

Reestruturação do menu (Layout.tsx, constante `navigation`):

```
FINANCEIRO (vira GRUPO)
   ├── Pagamentos            (página atual /payments — mantida)
   ├── Conciliação           (NOVA — Front B)
   └── Metas & Crescimento   (NOVA — Front C)

CONFIGURAÇÕES (NOVO GRUPO, ícone engrenagem)
   ├── Dados da Empresa & Clínicas   (Front A)
   ├── Certificados Digitais         (Front A)
   ├── Assinatura Eletrônica (ZapSign) (Front A)
   └── Portas de Pagamento (Asaas/Stripe) (Front A)
```

Restrições de menu:
- O grupo "Financeiro" preserva a página de Pagamentos existente como primeiro filho (link `/payments`).
- "Configurações" é grupo novo nível 1; protegido por `CollaboratorGate` (igual `/cadastros/*`).
- Princípio "sem travas": toda tela abre mesmo sem segredo configurado (modo preview, aviso discreto).

---

## 3. FRENTE A — CONFIGURAÇÕES (base editável / anti-hardcode)

### 3.A.1 Dados da Empresa & Clínicas
- Edita: razão social, nome fantasia, CNPJ, e-mail, telefone, endereço(s), site, Instagram.
- Persistência: `app_settings` chave `company.profile` (JSON). Clínicas já existem em `locations` (link para a tela existente de Clínicas; não duplicar CRUD).
- PRONTO: salva e relê após reload; valores aparecem onde forem consumidos (sem hardcode novo).

### 3.A.2 Certificados Digitais (.pfx)
- Upload do arquivo .pfx para object storage PRIVADO em prefixo dedicado `certs/pfx/` (CORRIGIDO P0-4: NUNCA em prefixo público tipo `uploads/`; não existe rota pública que sirva `certs/pfx/`). Senha cifrada em `secure_settings` chave `certificate.password`.
- Validação no upload (CORRIGIDO P2-8): conferir extensão/tipo `.pfx` e tamanho máximo (ex.: 1 MB); EXTRAIR metadados (CPF do titular, validade notBefore/notAfter) via node-forge ANTES de ativar; só ativa se a senha abrir o .pfx.
- Mostra: nome do arquivo, CPF do titular, validade, status ativo.
- Resolver de assinatura (pdf-signer): se houver certificado configurado e válido, usa ele; senão, fallback para o `certs/assinatura.pfx` atual (NÃO quebrar assinatura existente). Se a assinatura com o cert configurado FALHAR (senha errada, cert vencido, overflow do placeholder), cair no fallback e NUNCA derrubar a geração do PDF (loga erro sem segredo).
- PRONTO: subir um .pfx válido + senha, ver CPF/validade corretos, e um PDF assinado com o cert da tela.

### 3.A.3 Assinatura Eletrônica (ZapSign)
- Edita: token da API (cifrado, `zapsign.token`), toggle liga/desliga (`zapsign.enabled` em app_settings), modelos opcionais.
- Botão "Testar conexão" valida o token contra a API do ZapSign (sem expor o token).
- Modo preview se desligado/sem token (não bloqueia a tela).
- PRONTO: salvar token, "Testar conexão" responde OK/erro claro; token nunca volta em claro.

### 3.A.4 Portas de Pagamento (Asaas / Stripe)
- Asaas: API key (`asaas.apiKey` cifrado), webhook token (`asaas.webhookToken` cifrado), ambiente (produção/sandbox em `asaas.baseUrl`), toggle.
- Stripe: chaves (cifradas), toggle. (Stripe pode ficar como "em breve" se não houver conta; menu/tela existem.)
- Botão "Testar conexão" Asaas (GET leve autenticado). Mostra a URL do webhook a usar.
- A lib `asaas.ts` passa a ler a key/baseUrl pelo resolver (DB cifrado -> env). Webhook valida token pelo resolver.
- PRONTO: salvar API key Asaas pela tela, "Testar conexão" OK, e uma cobrança criada usando a key da tela.

---

## 4. FRENTE B — CONCILIAÇÃO

- Submenu Financeiro -> Conciliação.
- Backend: endpoint que lista cobranças do Asaas (GET /payments da API Asaas, com período) e cruza com a
  tabela `payments` local por `asaasChargeId`.
- Classificação por linha:

| Situação | Significado |
|---|---|
| BATE | existe no Asaas e no sistema, status coerente |
| DIVERGE | existe nos dois mas status diferente (ex.: Asaas pago, sistema pendente) |
| FALTA NO SISTEMA | existe no Asaas, não há linha local |
| SOBRA NO SISTEMA | existe linha local com asaasChargeId que não retorna do Asaas |

- Ações: "Atualizar status do sistema pelo Asaas" (resolver DIVERGE), "Importar" (resolver FALTA), tudo idempotente.
- Filtros: período (mês), status. Resumo no topo: totais por situação + valor.

Mapa de status Asaas -> status local (CORRIGIDO P1-5):

| Status Asaas | Status local |
|---|---|
| RECEIVED, CONFIRMED, RECEIVED_IN_CASH | paid |
| PENDING, AWAITING_RISK_ANALYSIS | pending |
| OVERDUE | overdue |
| REFUNDED, REFUND_REQUESTED, CHARGEBACK_REQUESTED, CHARGEBACK_DISPUTE, DELETED | cancelled |

Janela temporal (CORRIGIDO P1-5): o período (mês) é calculado em America/Sao_Paulo (início/fim do dia BRT), passando ao Asaas o intervalo de datas correspondente; nada de drift UTC.

Paginação (CORRIGIDO P1-5): consumir a API do Asaas com offset/limit até `hasMore=false` (não confiar em uma página só).

SOBRA NO SISTEMA sem falso positivo (CORRIGIDO P1-6): uma linha local com `asaasChargeId` que não apareceu na listagem do período só é marcada SOBRA após checagem direta `GET /payments/{id}` no Asaas retornar inexistente; se existir mas fora da janela, rotular "fora do período", não SOBRA.

- Casos extremos: Asaas fora do ar (mostra erro claro, não quebra a tela); cobrança manual (sem asaasChargeId) NÃO entra na conciliação Asaas.
- PRONTO: tela lista e classifica corretamente cobranças reais; ação de resolver atualiza o sistema e a linha muda para BATE.

---

## 5. FRENTE C — METAS & CRESCIMENTO

- Submenu Financeiro -> Metas & Crescimento.
- Tabela NOVA `financial_goals`:

| Coluna | Tipo | Papel |
|---|---|---|
| id | serial | chave |
| periodType | text | 'month' \| 'semester' \| 'year' |
| periodKey | text | '2026-06' (mês) \| '2026-S1' (semestre) \| '2026' (ano) |
| targetAmount | numeric(12,2) | meta de faturamento (CORRIGIDO P1-7: numeric, não float) |
| note | text | observação opcional |
| updatedAt | timestamp | último a salvar vence |

- Único por (periodType, periodKey).
- Realizado (CORRIGIDO P1-7 — regra de reconhecimento): SOMA em SQL (evita drift de float) de `payments` com `status = 'paid'` no período, MENOS estornos/chargebacks (status `cancelled` que tinham sido pagos, quando identificável). Data de reconhecimento = `paidAt`; se nulo, `dueDate`. Arredondar a 2 casas de forma determinística na exibição.
- Dashboard:

| Bloco | Conteúdo |
|---|---|
| Cartões | Meta x Realizado do mês/semestre/ano correntes + % atingido |
| Barra de progresso | % atingido por período (cap visual em 100%, rótulo mostra real) |
| Crescimento | Variação % período a período (mês vs mês anterior; semestre; ano) |
| Edição de metas | Form para definir/editar metas por período (grava em financial_goals) |

- Casos extremos: sem meta cadastrada (mostra "definir meta", não quebra); divisão por zero; meses sem faturamento (0).
- PRONTO: cadastrar meta de um mês, ver meta x realizado e % corretos com dados reais; crescimento calculado.

---

## 6. CONTRATO-FIRST (workflow obrigatório do repo)
1. Definir endpoints em `lib/api-spec/openapi.yaml`.
2. `pnpm --filter @workspace/api-spec run codegen` (gera hooks em api-client-react + zod em api-zod).
3. Implementar rotas em `artifacts/api-server/src/routes/*` e registrar em `routes/index.ts`.
4. Páginas em `artifacts/padcom/src/pages/*`, usando hooks gerados; rotas em `App.tsx`; menu em `Layout.tsx`.
- Não mudar `info.title` do OpenAPI (controla nomes gerados).
- Server valida entrada/saída com os zod gerados; nunca `console.log` (usar `req.log`).

---

## 7. CASOS EXTREMOS GERAIS
- Segredo ausente: telas abrem em preview, ações reais avisam "configure em Configurações".
- Migração de schema: `secure_settings` e `financial_goals` são tabelas NOVAS (não tocam existentes); push dev.
- Idempotência: salvar segredo duas vezes não duplica; conciliar duas vezes não cria linha dobrada.
- Permissão: rotas de Configurações/Financeiro sob `requireCollaborator` (PII/segredo).
- Compatibilidade: ASAAS_API_KEY/ASAAS_WEBHOOK_TOKEN em env continuam válidos via fallback do resolver.

---

## 8. LINHAS VERMELHAS (NUNCA violar)
1. NÃO tocar o motor de cálculo de orçamentos (`/api/budgets/calculate`) nem o motor de desmembramento.
2. NÃO alterar o motor do RAS / RAS FAP nem o índice único `payments_asaas_charge_id_uq`.
3. NÃO quebrar a assinatura PAdES existente — só ESTENDER com cert configurável + fallback ao .pfx atual.
4. NÃO quebrar o webhook Asaas atual — só trocar a fonte do token (env -> resolver com fallback).
5. NUNCA expor segredo ao frontend nem logar segredo.
6. NÃO mudar marca/identificadores técnicos (UID .ics, colunas, package, tokens) — só o que a spec pede.

---

## 9. DEFINIÇÃO DE PRONTO (do loop inteiro)

| Critério | Conferido por |
|---|---|
| 3 frentes construídas, cada uma com entrada no menu | navegação real |
| Tudo configurável vem de app_settings/secure_settings/object storage (nada novo hardcoded) | leitura do diff |
| Segredo nunca volta ao frontend em claro | leitura do código + resposta da API |
| Asaas/cert/zapsign lidos pelo resolver (DB cifrado -> env) | runtime |
| Conciliação classifica e resolve com dados reais | screenshot + teste |
| Metas x realizado e crescimento corretos com dados reais | screenshot + teste |
| Linhas vermelhas intactas | architect |
| Revisão architect de cada front | zero pendência |
| Validado por execução real + screenshots (regra ródio aplicada) | capturas |

## RESUMO EM 1 LINHA
Três frentes (Configurações editáveis, Conciliação e Metas & Crescimento), cada uma no menu, com todo
segredo/valor vindo de banco cifrado/cofre/arquivo protegido — zero hardcode — definidas por escrito e
prontas para architect e construção, com linhas vermelhas e definição de pronto travadas.
