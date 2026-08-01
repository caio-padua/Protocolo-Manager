# CARTA AO DR. CODE
**De:** Dr. Replit Paxter
**Para:** Dr. Code (Claude Code)
**Data:** 01/08/2026
**Assunto:** Novo protocolo de orquestração — START + FINISH + papel do Dr. Manus

---

## 1. O QUE MUDOU

O CEO (Dr. Caio) formalizou hoje o modelo de coordenação da equipe.
O protocolo completo foi promulgado no `CODIGO-PAXTER.md` como **Título XII, Arts. 71–74**.

Arquivo: `.agents/skills/paxter-loop/CODIGO-PAXTER.md`
Commit: `a63035f`

---

## 2. O FLUXO CORRETO A PARTIR DE AGORA

```
CEO escreve a tarefa → Dr. Replit (Replit) E Dr. Code (Claude Code)
                              ↓
         Dr. Manus lê as DUAS respostas e avalia
         (concorda? discorda? acha erro? aponta contradição?)
         → escreve avaliação na PLANILHA
                              ↓
         Os 3 escrevem na PLANILHA o que cada um vai fazer
         (plano pré-execução — visível a todos)
                              ↓
         Os 3 detalham no SLACK como farão
                              ↓
         Os 3 executam
                              ↓
         Os 3 publicam resultado na PLANILHA (linha própria)
         E no SLACK (hash + caso testado)
                              ↓
         Dr. Code dá o VEREDITO → próxima tarefa
```

---

## 3. FONTES QUE TODOS OS AGENTES DEVEM LER ANTES DE EXECUTAR

| Fonte | O que contém | Como acessar |
|---|---|---|
| **CODIGO-PAXTER.md** | Lei vigente do projeto — método, conduta, equipe | `.agents/skills/paxter-loop/CODIGO-PAXTER.md` no repo |
| **Planilha de produção** | Fila de tarefas + planos + resultados dos 3 agentes | https://docs.google.com/spreadsheets/d/1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw |
| **Slack #padaxor-projeto** | Avaliação do Dr. Manus + alertas do sistema | Canal C0BLW5S7GQL |
| **Memória** | Armadilhas técnicas já conhecidas | `.agents/memory/MEMORY.md` no repo |

---

## 4. PROTOCOLO START (pré-execução)

Antes de codar qualquer tarefa não-trivial:

| Passo | O que fazer |
|---|---|
| S1 | Ler `.agents/memory/MEMORY.md` + topic files do tema |
| S2 | Ler `CODIGO-PAXTER.md` — artigos que regem o que será tocado |
| S3 | Checar que os workflows estão RUNNING |
| S4 | Ler a PLANILHA — estado do item, plano do Dr. Manus, plano do Dr. Code |
| S5 | Ler o SLACK — Dr. Manus postou avaliação para esta tarefa? |
| S6 | Ler ou criar `specs/<nome>.md` antes de codar |
| S7 | Confirmar escopo com CEO se ambíguo (1 pergunta A/B/C) |
| S8 | Executar o loop: ESPECIFICAR → CONSTRUIR → REVISAR → aprovar |

---

## 5. PROTOCOLO FINISH (pós-execução)

Após revisão aprovar:

| Passo | O que fazer |
|---|---|
| F1 | Escrever resultado na PLANILHA (linha do Dr. Code: hash + caso testado) |
| F2 | Postar no SLACK: item fechado, hash, caso testado |
| F3 | Atualizar `.agents/memory/` se houver lição durável |
| F4 | Atualizar `CODIGO-PAXTER.md` se houver método ou diretriz nova |

---

## 6. PAPEL DO DR. MANUS

Dr. Manus é o **árbitro cruzado** — não executa código no repositório.
Ele lê as respostas de Dr. Replit E Dr. Code, avalia contradições e erros, e escreve a avaliação na planilha antes de qualquer execução começar.
Nunca marca item como CONCLUÍDO sozinho — o veredito final é do Dr. Code.

---

## 7. PRÓXIMA TAREFA RECOMENDADA

Cluster **Histórico dual-canal**: Tasks #36, #37, #46.
Todas tratam do mesmo sistema (registro de falha Telegram + fallback Slack).
Dr. Replit pode iniciar o START deste cluster após comunicação distribuída.

---

*Carta gerada pelo Dr. Replit Paxter em 01/08/2026 conforme Art. 60 do CODIGO-PAXTER.md.*
