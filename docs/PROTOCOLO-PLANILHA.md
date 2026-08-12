# PROTOCOLO DA PLANILHA DE PRODUÇÃO
**Versão:** 1.0 · 12/08/2026  
**Autor:** Dr. Replit Paxter · **Aprovado por:** CEO Dr. Caio  
**Arquivo normativo:** lido obrigatoriamente por todo LLM antes de criar ou fechar um item.

---

## 0. Regra de precedência

> Se qualquer carta, post de Slack ou spec divergir deste arquivo, **este arquivo vence**.

Para alterar: proposta escrita → aceite do CEO → commit → aviso no `#padaxor-projeto`.

---

## 1. Estrutura de colunas (ordem canônica)

| Col | Nome | O que entra |
|---|---|---|
| **A** | **Nº** | Número único do item na planilha. Nunca repetir, nunca inventar sequência paralela |
| **B** | **Data** | DD/MM/AAAA — data em que o item foi criado |
| **C** | **Hora** | HH:MM — hora da criação (opcional, preencher quando possível) |
| **D** | **Descrição** | Texto técnico do que fazer — para o LLM executor |
| **E** | **Responsável** | Dr. Replit · Dr. Code · Dr. Manus · Dr. Claude |
| **F** | **Estado** | `A FAZER` · `EM ANDAMENTO` · `AGUARDANDO #XX` · `CONCLUÍDO` |
| **G** | **Prioridade** | `P0` (crítico/bloqueador) · `P1` (próximo sprint) · `P2` (depois do P1) |
| **H** | **Depende de** | Número(s) do(s) item(s) que precisam estar CONCLUÍDOS antes |
| **I** | **Para que serve** | **1 frase em linguagem do CEO** — o problema de negócio que a tarefa resolve |
| **J** | **Módulo** | Categoria do sistema — ver seção 3 abaixo |

**As colunas I e J são obrigatórias em qualquer item novo.**  
Se um LLM não consegue preencher a coluna I em 1 frase, o item está mal especificado.

---

## 2. Regra da coluna I — "Para que serve"

### Por que existe
O CEO relatou que, após alguns dias, não consegue lembrar do que se trata o item lendo
apenas a descrição técnica (coluna D). Um novo colaborador que entre no projeto também
não consegue se orientar sem essa frase.

### Como escrever (regras)

1. **1 frase.** Máximo 2 frases em casos excepcionais.
2. **Perspectiva do CEO ou do paciente** — nunca perspectiva do desenvolvedor.
3. **Começa com o verbo de impacto** — o que o sistema passa a fazer ou impede que aconteça.
4. **Proibido jargão técnico** sem explicação: sem "CTE", "idempotência", "eventId", "polling".
5. **Teste do novo membro:** uma pessoa que nunca viu o sistema entende do que se trata?

### Exemplos

| ❌ Errado (técnico) | ✅ Correto (CEO) |
|---|---|
| Adicionar eventId obrigatório em registrarFalha + CTE atômico | Garante que o mesmo aviso do banco enviado duas vezes não penaliza o paciente duas vezes |
| Guard backend concierge-request — 403 CONCIERGE_BLOCKED | Impede que um paciente suspenso consiga agendar pelo Concierge mesmo tentando entrar diretamente pelo link |
| Bateria de 20 casos (12 abuso + 8 idempotência) | Prova que todas as regras do Concierge funcionam corretamente antes de abrir para pacientes reais |

---

## 3. Valores válidos para a coluna J — "Módulo"

| Módulo | O que cobre |
|---|---|
| **Concierge** | Agendamento premium pago, trava de escassez, penalidades |
| **Telegram** | Bot de comunicação com pacientes via Telegram |
| **WhatsApp** | Mensagens via Twilio/WhatsApp |
| **Lembretes** | Motor de lembretes automáticos de fórmulas e consultas |
| **Radar** | Busca e triagem de pacientes |
| **Anamnese** | Formulário clínico de histórico do paciente |
| **Receituário** | Emissão de receitas e documentos clínicos |
| **Cockpit** | Painel central do CEO com visão de todos os pacientes |
| **Drive** | Integração com Google Drive (watcher, importação, fotos) |
| **Exames** | Motor de extração e curadoria de resultados de exames |
| **Agenda** | Motor de horários, slots e Google Calendar |
| **Financeiro** | Asaas, cobranças, transferências, penalidades |
| **Comunicação** | Canal digital geral (e-mail, status, webhook) |
| **Royalty** | Licenciados, pirâmide de sub-licenciamento |
| **PADTEAM** | Equipe remota, hub de gestão interna |
| **Infraestrutura** | Deploy, banco de dados, segurança, scripts internos |
| **Dicionário** | Glossário, termos, sinônimos do sistema |

Se o módulo não existir na lista, criar um novo com nome em português e registrar aqui.

---

## 4. Regras de fechamento de item

Um item só muda para **CONCLUÍDO** quando o executor apresentar:

1. **Hash do commit** — ex: `a9cb27a`
2. **Saída bruta do teste colada** — não resumida, não parafraseada
3. **Confirmação da planilha atualizada** — abrindo a planilha, não por log do processo
4. **Post no `#padaxor-projeto`** com o hash

Sem os quatro, o item permanece **A FAZER** ou **AGUARDANDO**.

---

## 5. Regras que nunca mudam (Cartilha do CEO)

1. Numeração única — a da planilha. Nunca inventar sequência paralela.
2. `A FAZER` → `CONCLUÍDO` exige os quatro itens da seção 4. Prosa não fecha item.
3. Toda coluna nova é `ADD COLUMN`. Nunca `DROP COLUMN`, `DROP TABLE` ou `TRUNCATE`.
4. `brtNow()` de `lib/brt.ts` para datas. Nunca `new Date()` cru.
5. Não atribuir ao CEO confirmações que ele não deu.
6. Discordância com prova é bem-vinda — responder no ponto com saída do comando.

---

## 6. Planilha

URL: https://docs.google.com/spreadsheets/d/1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw  
Aba: **PLANILHA PRODUCAO**

---

## 7. Histórico

| Data | Mudança |
|---|---|
| 12/08/2026 | Versão 1.0. Cria estrutura canônica de 10 colunas (A-J). Adiciona obrigatoriedade das colunas I ("Para que serve") e J ("Módulo"). Backfill dos itens #74-#86. Aprovado pelo CEO Dr. Caio. |
