---
name: Anamnese skip-logic (modo dinamico do paciente)
description: Regras duraveis do modo dinamico da ficha /anamnese — gateways por sistema, alarme sempre visivel, ausencia != negacao.
---

# Anamnese skip-logic (modo dinamico)

A ficha do paciente (`/anamnese`, `artifacts/padcom/src/pages/anamnese.tsx`) usa skip-logic
DERIVADA no front a partir do campo `sistema` (sem coluna nova de regra no banco).

## Regras que nao se descobrem lendo so o codigo
- Gateway (pergunta-porteira) e gerado por `sistema` com 2+ perguntas; comeca FECHADO.
  **Por que:** o alvo e velocidade para paciente empresario; default fechado encolhe a ficha.
- `eSinalAlarme` NUNCA entra em grupo fechavel — sempre vira pergunta direta/visivel.
  **Por que:** revisao do architect apontou risco clinico de subtriagem (alarme escondido
  atras de porteira default "nao" passa despercebido). **Como aplicar:** ao mexer em
  `separarBloco`, manter o ramo `if (!s || p.eSinalAlarme) diretas.push(p)`.
- Fechar a porteira DEVE limpar as respostas daquele grupo do estado `respostas`.
  **Por que:** sem isso, UI diz "sem queixa" mas o submit (que filtra so por valor nao vazio)
  ainda envia respostas antigas — divergencia clinica entre tela e backend.

## Divida tecnica conhecida (decisao do CEO pendente)
- `computeMotor` trata ausencia como "nao respondido", NAO como "negado". Com skip-logic,
  grupo fechado = ausencia, entao o motor nao registra negacao explicita. Para
  comparabilidade sessao-a-sessao, avaliar gravar "negado" no payload da porteira.
  Nao implementado (evita mexer na semantica do motor sem ordem do CEO).
