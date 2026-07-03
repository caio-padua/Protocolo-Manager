---
name: Ferramenta de lembrete por período do IHE (fonte para portar ao Manager)
description: Onde vive e como funciona o motor de lembrete cronobiológico do IHE (LEMBRETE_PRESCRICAO_REVO) que o CEO mandou trazer ao Manager. Consultar ao especificar/portar mensageria por período.
---

# Lembrete por período (cronobiológico) — ferramenta REAL do IHE

Repo primo: `github.com/caio-padua/Integrative-Health-Engine` (público via raw). Branch `main`
tem o código limpo; regras validadas em `.agents/memory/mensageria-cronobiologica.md` (branch
`ver-l2-dr-claude`). Cópia baixada em `.local/ihe-ref/` desta sessão.

Arquivos-fonte no IHE:
- `artifacts/api-server/src/services/whatsappTemplates.ts` → template `LEMBRETE_PRESCRICAO_REVO`.
- `artifacts/api-server/src/services/prescricaoLembreteService.ts` → motor + worker (setInterval 60s).
- `lib/db/src/schema/prescricoesLembrete.ts` → tabelas `prescricoes_lembrete` + `prescricao_lembrete_envios`.
- `artifacts/api-server/src/db/migrations/075_periodos_dia_subdivisao_horarios.sql` → os 9 períodos.

## Regra de ouro (o que o CEO quer)
Disparo é **POR JANELA/PERÍODO, nunca por fórmula**. Várias fórmulas na mesma janela = **UMA
mensagem** listando tudo ("paciente empresário não é incomodado a toda hora"). Nunca ANTES do
horário; sai no horário ou até `tolerância` (5 min) depois. Madrugada 00:00–04:59 fica VAZIA.

## 9 períodos canônicos (`periodos_dia`, sigla SEMPRE maiúscula)
JE Jejum 05:00–06:59 · IM Início da Manhã 07:00–08:59 (café) · MM Meio da Manhã 09:00–10:59 ·
AL Almoço 11:00–13:29 · IT Início da Tarde 13:30–15:59 · MT Meio da Tarde 16:00–17:59 ·
NO Noite 18:00–19:59 (jantar) · FN Final da Noite 20:00–22:29 · CE Ceia 22:30–23:59.

## Nomenclatura da mensagem
Saudação por HORA (Bom dia/tarde/noite) + tratamento por GÊNERO (Sr./Sra./primeiro nome).
Por período: `⬛ *Período:* _nome_`; tipo `tomar`→`🟩 *Programado* para administrar`,
`nao_tomar`→`🟨 *NÃO TOMAR*`. Cada fórmula: cor + `*nome*`, ativoPrincipal — dose, Horário,
observacaoRefeicao, Posologia. Rodapé do IHE é "PAWARDS - Instituto Padua / Developed by Pawards
MedCore" → **no Manager trocar por marca PAXTER** (regra de rebrand: trocar texto visível, não os identificadores).

## Modelo de dados
`prescricoes_lembrete`: pacienteId, (unidadeId — some no Manager single-tenant), ativo,
`periodos` jsonb (`{nome,tipo,formulas[{nome,ativoPrincipal,dose,horario,observacaoRefeicao,posologia}]}`),
`horariosEnvio` jsonb string[], observacao. Idempotência em `prescricao_lembrete_envios` por
UNIQUE (prescricaoLembreteId, janela=`YYYY-MM-DD HH:MM`); status PENDENTE→ENVIADO/FALHOU;
claim (insert onConflictDoNothing) ANTES do envio. Falha gera alerta interno à equipe.

## Vocabulário de posologia (decisão de domínio do CEO, não derivável do código)
Posologia = dose + VIA + frequência + período + observação (a VIA nunca falta). Frequência = INTERVALO
em DIAS (não vezes/dia). Tomada = como usa durante o dia. Dose ≠ cápsula (dose=princípio ativo em mg;
farmácia desdobra em cápsulas).

## Adaptações ao portar (Manager)
Manager é single-tenant (sem unidades/JWT — ver admin-api-sem-auth) e usa `clients` (não `pacientes`),
fuso BRT fixo. Já existe motor SIMPLES `mensageria.ts` (3 períodos, 1 msg por fórmula) — o rico do IHE
substitui essa lógica. "Carta de Encantamento" (matriz período×cenário, opt-in default off) é feature
extra do IHE, avaliar em fase separada.
