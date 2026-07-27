# CARTA AO DR. CODE — ONDA PORTAO DE ACESSO + CAPTACAO DE LEADS (PROCESSO COMPLETO)

DE: Dr. Replit Paxter
PARA: Dr. Code (Claude Code)
DATA: 27/07/2026
ASSUNTO: registro completo da onda "portao-captacao nas vitrines" — o que foi construido,
como funciona e o que ficou pronto para os proximos passos.

---

## 1. DECISAO DO CEO

O login da vitrine E a captacao de lead. Paciente: CPF + nascimento + telefone.
Dono de clinica: CNPJ + CPF + nascimento + telefone. A entrada destrava a tela e vira
uma linha no painel administrativo de verificacao. Sem precos, sem cobranca, texto honesto.

## 2. O QUE FOI CONSTRUIDO (tudo verificado por execucao real)

### 2.1 Backend (artifacts/api-server)
- Novo arquivo src/routes/vitrine-leads.ts:
  - Tabela vitrine_leads criada por SQL direto (lazy ensureTables), sem db push.
  - Colunas: id, tipo, cpf, cnpj, data_nascimento, telefone, rota_origem, user_agent,
    acessos, ultimo_acesso, contatado, contatado_em, observacao, criado_em.
  - UNIQUE (tipo, cpf) + UPSERT: reentrada soma acessos em vez de duplicar.
  - Validacao de digito verificador de CPF e CNPJ no servidor.
  - POST /api/vitrine-leads publico; GET /api/vitrine-leads e
    PATCH /api/vitrine-leads/:id/contato exigem Bearer de colaborador (requireCollaborator).
- Registro do router em src/routes/index.ts.
- /api/vitrine-leads adicionado ao BYPASS_PREFIXES do basicAuth (POST publico funciona
  em producao fail-closed).

### 2.2 Vitrine demo (artifacts/vitrine-demo)
- Novo componente src/components/AcessoGate.tsx: mascaras (CPF, CNPJ, data, telefone),
  POST na API, liberacao gravada em localStorage por tipo, erro 400 exibido sem limpar campos.
- App.tsx: as duas rotas (/ paciente e /clinica) embrulhadas pelo portao.

### 2.3 Painel administrativo (artifacts/padcom)
- Nova pagina src/pages/vitrine-leads.tsx: KPIs (pacientes, clinicas, sem contato),
  filtro por tipo, tabela com CPF/CNPJ/nascimento/telefone/acessos/ultimo acesso,
  botao Contatado/Pendente via PATCH.
- Rota /vitrine-leads em App.tsx; menu "Leads da Vitrine" no grupo Estrutura & Governanca.

## 3. PROVAS DE EXECUCAO (curl real, 27/07/2026)

- POST paciente valido -> {"ok":true}
- POST clinica valido (CPF+CNPJ com digito correto) -> {"ok":true}
- POST CPF 11111111111 -> 400 "CPF invalido"
- GET sem Bearer -> "Acesso restrito"
- GET com Bearer de colaborador -> lista com os 2 leads e contagem de acessos
- PATCH /:id/contato -> {"ok":true}
- Screenshot do portao da clinica: aprovado visualmente (navy + ouro, marca PAXTER).

## 4. GITHUB E O PRIMO LOVABLE

- Repositorio do Manager: github.com/caio-padua/Protocolo-Manager (branch main).
- Repositorio do Lovable: github.com/caio-padua/parxis-core-protocol
  (Vite + TanStack Router/Start + Supabase + shadcn; pasta .lovable; site institucional
  PARXIS com assets da marca; sem backend proprio de leads).
- Carta ao Lovable com o contrato da API: cartas/2026-07-27_DR-LOVABLE_vitrine-gate-leads.md

## 5. REGRAS QUE VALEM PARA QUALQUER MUDANCA FUTURA

1. O contrato do POST so ADICIONA campo opcional; nunca renomear os existentes.
2. Nada de preco nas vitrines sem ordem escrita do CEO.
3. Marca visivel nas vitrines: PAXTER (rebrand PADAXOR global ainda pendente de ordem).
4. Tabela vitrine_leads: ADD COLUMN sempre, DROP nunca (Regra de Ouro).

RESUMO EM 1 LINHA: portao-captacao construido e provado por curl e screenshot nas duas
vitrines, painel de verificacao no PADCOM, contrato documentado e carta ao Lovable emitida.
