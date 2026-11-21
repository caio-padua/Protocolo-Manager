---
name: PAX FINANCE dominio isolado
description: Fronteira, decisoes e estado das fases do PAX FINANCE (modulo financeiro isolado, futuro SaaS).
---
Liberado pelo CEO em 21/11/2026 (saiu do standby). Fases 1 e 2 prontas; 3 a 8 pendentes. Decisoes do CEO: mesmo PostgreSQL com tabelas fin_*; "Maia" = papel de extracao documental (Gemini), 2a IA Claude (estrategia), 3a OpenAI (auditoria; sem ela = NAO AUDITADO).

**Fronteira:** codigo em artifacts/api-server/src/pax-finance/; tenant.ts e o UNICO ponto de contato com auth/clinica/modulo; empresa so da sessao; nunca tocar em payments; dinheiro em centavos bigint; esquema aditivo por ensurePaxFinanceSchema (espelho SQL em scripts/migrations/20261121_*).
**Why:** extracao futura como SaaS; payments usa real e datas texto.
**How to apply:** nova tabela fin_* leva company_id + filtro no servidor + auditoria em fin_audit_log (imutavel por gatilho). Regra tributaria aprovada e imutavel (gatilho): mudanca = nova versao. Calculo historico usa ativa OU substituida com vigencia cobrindo a data.
**Pendencias:** dados da Padumann so entram com o documento (fase 3); CPF/RG/endereco residencial nunca transcritos; envio de documento financeiro a IA bloqueado ate autorizacao de privacidade do tenant; rotas financeiras antigas possivelmente sem filtro de clinica; telas autenticadas sem captura de tela.

**PAUSADO em 21/11/2026 por ordem do CEO** (prioridade: anamnese+motor, depois monetizacao PaxMed/PaxCare). Nada apagado nem revertido; codigo, tabelas fin_*, rota /financeiro/pax-tax e menu PAX FINANCE permanecem. Retomar na Fase 3 quando o CEO mandar; D2, D4, D5, D6 seguem abertas.

## Seletor de empresa, cenário DEMO e crédito (21/11/2026)
- Troca de empresa: cabeçalho `x-fin-company` validado no servidor (vínculo em professional_empresas); precisa constar em `allowedHeaders` do CORS, senão o navegador cross-origin falha no preflight.
- PADUMANN = empresa própria na tabela `empresas` (cadastro de laboratório, pendente de validação); nunca carregar o rascunho dela em outra empresa (rota devolve 409).
- Cenário DEMO vive em `fin_scenario_month` (rótulo fixo, nunca em payments/ledger); totais sempre somados no backend.
- Crédito sem regra verificada = "REGRA DO PROGRAMA A VALIDAR", sem recomendação firme; as 3 IAs ficam "não configurado" e o toggle devolve 409.
**Why:** pedido expresso do CEO; ambiente de laboratório. **How to apply:** ao mexer em agenda/financeiro multiempresa ou nos toggles de IA.
