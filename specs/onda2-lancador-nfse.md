# Spec Onda 2 — Lançador de NFS-e (Nota Fiscal de Serviço) com data-bind

## Objetivo
Tela premium no Financeiro que cria/agenda uma NFS-e (Nota Fiscal de Serviço eletrônica)
no Asaas a partir de uma cobrança ou cliente já existente, com DATA-BIND (os campos da nota
são puxados do protocolo/cliente/cobrança, sem digitação manual), alíquota ISS pré-aplicada
(serviço médico em São Paulo = 2%) e visual Paxter (navy/ouro, vidro, 3D).

## Contexto fiscal (fonte da verdade — pesquisa 28/06/2026)
- ISS (Imposto Sobre Serviços) de serviços médicos no MUNICÍPIO de São Paulo = **2%** (a menor faixa).
- Códigos de serviço (Lei Complementar 116/2003, lista anexa):
  - **4.01** Medicina e biomedicina.
  - **4.03** Hospitais, clínicas, laboratórios e congêneres (recomendado p/ a clínica).
  - **4.08** Fisioterapia/fonoaudiologia; **4.06** Enfermagem.
- Clínica do CEO = Tatuapé (município de São Paulo), então 2% e código 4.03/4.01.

## Contexto técnico Asaas (fonte da verdade)
- Endpoint: `POST /v3/invoices` — cria e AGENDA a nota para a data `effectiveDate`.
- Vínculo (pelo menos UM obrigatório): `payment` (id da cobrança) OU `installment` OU `customer` (nota avulsa).
- Campos obrigatórios: `serviceDescription`, `value`, `effectiveDate`.
- Serviço municipal: `municipalServiceId` (da listagem do Asaas) OU `municipalServiceCode` + `municipalServiceName` manual.
- Opcionais: `deductions`, `observations`, retenções de impostos (taxes).
- Listagem de serviços municipais: `GET /v3/invoices/municipalServices?description=` (para obter o id).
- Header `access_token` (mesmo da lib `asaas.ts`); base `/v3`.

## Pré-requisitos REAIS para emissão (só o CEO seta no painel Asaas — DOCUMENTAR, não bloqueia o build)
- Inscrição Municipal regular + homologação na prefeitura de São Paulo (webservice NFS-e).
- Certificado digital A1 e-CNPJ (.pfx/.p12) OU usuário/senha/token da prefeitura.
- Emissão **só para Pessoa Jurídica** (a clínica é PJ — OK). Asaas NÃO emite NFS-e de PF.
- Configurar em: painel Asaas → Notas Fiscais → Configurações → "Iniciar a configuração".

## Requisitos exatos
1. **Menu**: novo item no grupo "Financeiro" do sidebar: "Lançador de NFS-e" → rota `/financeiro/nfse`. Ícone coerente (FileText/Receipt). Registrado no `App.tsx` dentro do `<Layout>`.
2. **Cabeçalho (marca)**: mesmo padrão da Onda 1 — `PaxterLogo variant="appHeader" tone="dark"` sobre hero navy, título "Lançador de NFS-e".
3. **Origem da nota (data-bind) — TODOS os campos visíveis, nada some**:
   - **Seleção da cobrança**: escolher uma cobrança existente do cliente (de `payments` com `asaasChargeId`). Ao escolher, a tela PUXA automaticamente: cliente, valor (`amount`), descrição (do `payment`/protocolo), vencimento.
   - **Modo avulso**: se não houver cobrança, permitir nota avulsa por cliente (vínculo `customer`), puxando o cliente do cadastro.
   - **Valor (R$)**: data-bound (somente leitura por padrão; editável só com aviso claro).
   - **Descrição do serviço**: data-bound do protocolo/cobrança (editável).
   - **Data de emissão (`effectiveDate`)**: default = hoje.
   - **Serviço municipal**: seletor com default código 4.03 (clínica) / 4.01 (medicina); mostra alíquota ISS 2%.
4. **Selo honesto de configuração fiscal**: chip que lê o status da config de NFS-e da conta (se a API permitir checar) ou, no mínimo, um aviso fixo honesto: "Emissão real exige config fiscal no Asaas (ver doc)". NUNCA dizer "pronto para emitir" sem comprovação.
5. **Ação "Agendar NFS-e"**: chama endpoint novo `POST /asaas/invoice/launch` (requireCollaborator) que: (a) resolve o vínculo (payment/customer); (b) chama `asaasCreateInvoice`; (c) devolve o status e os dados da nota (id, status Asaas). Trata erro do Asaas de forma honesta (ex.: "conta sem config fiscal" → mensagem clara, não fingir sucesso).
6. **Resultado honesto**: painel mostra o retorno do Asaas (id da nota, status: SCHEDULED/AUTHORIZED/ERROR), com a mensagem real do Asaas em caso de falha. Nunca simular.
7. **Contrato/consistência**: seguir o MESMO padrão da Onda 1 (fetch direto + Bearer do colaborador via `getCollabToken`), pois o módulo Asaas usa fetch direto (consistência > dogma).

## Casos extremos a tratar
- Conta Asaas sem configuração fiscal → Asaas retorna erro → mostrar a mensagem real (doc de config), NÃO fingir emissão.
- Cliente PF / sem CNPJ do emissor → a nota é do EMISSOR (clínica PJ); o cliente pode ser PF (tomador). Mas se o Asaas recusar, mostrar erro honesto.
- Cobrança sem `asaasChargeId` (cobrança não-Asaas) → não permitir vincular como `payment`; oferecer modo avulso por `customer`.
- Valor < mínimo / vazio → bloquear no front e no back.
- Asaas fora do ar → 502, erro claro, sem fingir.

## Definição de PRONTO
- Item no menu Financeiro + rota funcionando.
- Tela com marca Paxter, todos os campos visíveis, data-bind real puxando cliente/valor/descrição da cobrança selecionada.
- `asaasCreateInvoice` + listagem de serviços municipais cabeados na lib `asaas.ts`.
- Endpoint `POST /asaas/invoice/launch` protegido por `requireCollaborator`.
- Doc de configuração fiscal entregue (o que o CEO precisa setar no Asaas).
- architect (Paxter Loop, Fase 3) aprova requisito por requisito, zero pendência.
- Screenshot da tela.
- NÃO exigir emissão fiscal real (depende da config do CEO) — mas a integração tem de estar 100% cabeada e testável (chamada chega ao Asaas e o erro/sucesso real é exibido).

## Linhas vermelhas
- NÃO alterar `POST /asaas/charge`, `/asaas/charge/launch` nem o webhook.
- NÃO inventar alíquota nem código de serviço — usar os pesquisados (2%, 4.03/4.01).
- NÃO simular emissão de nota; status sempre real do Asaas.
- NÃO logar nem expor tokens/segredos.
- NÃO inventar letras da marca; usar `PaxterLogo`.
