# CARTA PARA TODOS OS COLABORADORES — PROTOCOLO DA PLANILHA
**Data:** 12/08/2026  
**De:** CEO Dr. Caio Pádua (via Dr. Replit Paxter)  
**Para:** Dr. Code · Dr. Manus · Dr. Claude · Dr. Replit · qualquer LLM futuro  
**Assunto:** Nova regra obrigatória — colunas "Para que serve" e "Módulo"

---

Leia do início ao fim antes de criar ou fechar qualquer item na planilha.  
Documento normativo completo: `docs/PROTOCOLO-PLANILHA.md`

---

## O PROBLEMA QUE ESTA REGRA RESOLVE

O CEO relatou que, após alguns dias, não consegue lembrar do que se trata
um item lendo apenas a descrição técnica da coluna D. Um novo colaborador
que entre no projeto também não consegue se orientar.

Causa: a coluna de descrição era escrita por LLMs para LLMs — linguagem
técnica, sem contexto de negócio.

---

## A SOLUÇÃO — DUAS COLUNAS NOVAS (já existem na planilha)

| Coluna | Nome | O que é |
|---|---|---|
| **I** | **Para que serve** | 1 frase em linguagem do CEO — o problema de negócio |
| **J** | **Módulo** | Categoria do sistema — Concierge, Telegram, Radar, etc. |

**Ambas são OBRIGATÓRIAS em qualquer item novo.**

---

## COMO ESCREVER A COLUNA I

**Regras:**
1. Máximo 1 frase (2 em casos excepcionais)
2. Perspectiva do CEO ou do paciente — nunca do desenvolvedor
3. Começa com verbo de impacto
4. Proibido jargão técnico sem explicação (sem CTE, eventId, polling, idempotência)
5. Teste: um novo membro lê e entende sem perguntar?

**Exemplos:**

| ❌ Errado | ✅ Correto |
|---|---|
| Adicionar eventId obrigatório em registrarFalha + CTE atômico | Garante que o mesmo aviso do banco enviado duas vezes não penaliza o paciente duas vezes |
| Guard backend 403 CONCIERGE_BLOCKED | Impede que paciente suspenso agende pelo Concierge mesmo tentando entrar direto pelo link |
| Bateria de 20 casos (12 abuso + 8 idempotência) | Prova que as regras do Concierge funcionam antes de abrir para pacientes reais |

**Se não couber em 1 frase → o item está mal especificado. Reescreva.**

---

## VALORES VÁLIDOS PARA A COLUNA J

Concierge · Telegram · WhatsApp · Lembretes · Radar · Anamnese ·
Receituário · Cockpit · Drive · Exames · Agenda · Financeiro ·
Comunicação · Royalty · PADTEAM · Infraestrutura · Dicionário

Se precisar de módulo novo: criar com nome em português e registrar em
`docs/PROTOCOLO-PLANILHA.md` via commit + aviso no Slack.

---

## COMO ISSO AFETA O SEU TRABALHO

**Ao CRIAR um item novo:**
- Preencher A, B, D, E, F, G, H como antes
- **Preencher I (Para que serve) e J (Módulo) — obrigatório**
- Item sem I não está registrado corretamente

**Ao FECHAR um item (CONCLUÍDO):**
- Confirmar que I está preenchida
- Os 4 requisitos de fechamento continuam valendo:
  1. Hash do commit
  2. Saída bruta do teste colada
  3. Planilha confirmada aberta
  4. Post no #padaxor-projeto com hash

**Ao AUDITAR trabalho de outro agente:**
- Verificar se I e J estão preenchidas
- Se I estiver em linguagem técnica → pedir reescrita

---

## O QUE NÃO MUDA

A estrutura das colunas A-H continua idêntica. Esta carta apenas adiciona
I e J como obrigatórias. Nenhuma coluna foi removida ou renomeada.

---

## ONDE LER A NORMA COMPLETA

`docs/PROTOCOLO-PLANILHA.md` — commit no repositório principal.  
Planilha: https://docs.google.com/spreadsheets/d/1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw

---

— CEO Dr. Caio Pádua  
Instituto Pádua · PADCOM · PAWARDS
