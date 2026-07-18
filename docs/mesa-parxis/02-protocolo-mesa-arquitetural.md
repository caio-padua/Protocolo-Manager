# Protocolo da Mesa Arquitetural Parxis

**Identificador:** `PAC-20260718-001`
**Status:** PRONTO PARA APRESENTAÇÃO — NÃO AUTORIZA CÓDIGO
**Data:** 18/07/2026
**Presidente e decisor:** Dr. Caio Henrique Fernandes Pádua
**Facilitador e relator:** Manus AI

## 1. Objetivo

A Mesa Arquitetural Parxis permite que o Replit Manager e o Replit IHE estudem a mesma proposta, respondam com evidências do próprio sistema, confrontem divergências e ajudem o CEO a decidir sem misturar repositórios nem iniciar código prematuramente.

O método aproveita três protocolos já consolidados: o Manager exige **especificar antes de construir e revisar até zero pendência**; o IHE exige **consultar o principal antes de propor reformas e responder com evidência**; ambos reservam a decisão final ao Dr. Caio.[1] [2]

> **Regra-mãe da mesa:** nenhum participante pode transformar concordância arquitetural em autorização de implementação. `ARQUITETURA_APROVADA` e `CONSTRUÇÃO_AUTORIZADA` são decisões diferentes.

## 2. Participantes e poderes

| Participante | Papel | Pode fazer | Não pode fazer nesta mesa |
|---|---|---|---|
| **Dr. Caio** | Presidente e árbitro | Definir prioridade, escolher A/B/C, aprovar fronteira e autorizar uma missão futura | Não precisa resolver detalhes de código |
| **Manus** | Facilitador e arquiteto relator | Preparar proposta, conferir evidências, comparar respostas e traduzir divergências | Alterar produção ou decidir no lugar do CEO |
| **Replit Manager** | Guardião do produto operacional | Provar estado real do Manager, identificar riscos e propor evolução local | Presumir como o IHE funciona ou alterar o IHE |
| **Replit IHE** | Guardião do motor e padrões consolidados | Provar estado real do IHE, identificar ativos reutilizáveis e contestar fronteiras | Presumir como o Manager funciona ou alterar o Manager |
| **Revisor independente** | Gate técnico futuro | Revisar implementação contra spec e testes | Autorizar negócio ou preço |

O Replit Manager e o Replit IHE têm igualdade de voz técnica. Quando divergirem, ambos apresentam evidência; Manus sintetiza consequências; o CEO decide.[2]

## 3. Canais nativos de apresentação

A proposta não dependerá apenas de texto colado em chat. Cada Replit receberá arquivos versionados no canal que já reconhece como memória durável.

| Destino | Ponto de entrada | Anexos técnicos | Resposta esperada |
|---|---|---|---|
| Manager | `cartas/AAAA-MM-DD_MANUS_<assunto>.md` | `specs/` e `docs/architecture/` | `cartas/respostas/<id>-manager-r1.md` |
| IHE | `docs/mesa-parxis/00_BRIEFING.md` | `docs/mesa-parxis/anexos/` | `docs/mesa-parxis/respostas/<id>-ihe-r1.md` |
| CEO | Síntese TDAH-friendly produzida por Manus | Matriz de concordâncias/divergências | Uma decisão por vez, com A/B/C |

O Manager já mantém cartas inter-repositórios em `cartas/` e specs como alvos escritos.[3] O IHE já utiliza documentos versionados em `docs/dr-claude/` como ponte oficial para um orquestrador externo; a mesa adota a mesma lógica em uma pasta isolada para não reescrever a Wave ativa.[4]

## 4. Pacote canônico

Os dois Replits recebem cópias idênticas destes arquivos:

| Ordem | Arquivo | Função |
|---:|---|---|
| 1 | `00_BRIEFING-CEO.md` | Resumo executivo de uma página |
| 2 | `01-fronteiras-manager-ihe-saas.md` | Hipótese de responsabilidades e integrações |
| 3 | `02-protocolo-mesa-arquitetural.md` | Regras desta mesa |
| 4 | `03-especificacao-parxis-saas-v1.md` | Arquitetura completa criada por Manus |
| 5 | `04-matriz-decisoes.md` | Pontos a aprovar, rejeitar ou reformular |
| 6 | `manifest.sha256` | Prova de que ambos analisaram o mesmo conteúdo |

Cada missão específica aponta para o mesmo hash do pacote. Se um arquivo mudar, uma nova versão da mesa é criada; respostas antigas não são silenciosamente reinterpretadas.

## 5. Ciclo de deliberação

| Rodada | Quem age | Ação | Gate de saída |
|---:|---|---|---|
| **R0 — Preparação** | Manus | Congela pacote, gera hashes e cartas específicas | Arquivos válidos; zero segredo e zero dado clínico |
| **R1 — Parecer independente** | Cada Replit | Responde sem ler o parecer do outro | Evidências completas e declaração `SEM_CÓDIGO` |
| **R2 — Contraditório** | Cada Replit | Lê o parecer do primo e registra concordâncias, objeções e concessões | Cada divergência tem evidência e alternativa |
| **R3 — Síntese** | Manus | Produz matriz comum, pontos resolvidos e perguntas ao CEO | Máximo de uma pergunta bloqueante por mensagem |
| **R4 — Arbitragem** | CEO | Escolhe A/B/C ou pede nova evidência | Decisão registrada em log append-only |
| **R5 — ADR conjunto** | Manus + agentes | Converte decisões em arquitetura oficial versionada | `ARQUITETURA_APROVADA` |
| **R6 — Missões separadas** | CEO | Autoriza ou não uma spec de implementação por repositório | `CONSTRUÇÃO_AUTORIZADA` apenas no escopo indicado |
| **R7 — Construção/revisão** | Replit dono do repo | Implementa localmente e submete a revisão independente | Evidências reais; sem pendência |

### 5.1 Por que os pareceres R1 são independentes

Se um agente ler a resposta do outro antes de investigar o próprio sistema, existe risco de ancoragem e concordância superficial. Na R1, cada Replit deve consultar seu schema, rotas, runtime, decisões do CEO e histórico. Somente na R2 ocorre confronto cruzado.

### 5.2 Por que a implementação é separada

Manager e IHE são sistemas primos independentes.[3] Mesmo quando uma decisão conjunta exige trabalho nos dois lados, serão criadas duas missões com critérios próprios, ordem explícita e contrato de integração congelado. Nenhum agente fará commit no repositório do primo.

## 6. Formato obrigatório do parecer R1

```text
RE: PAC-20260718-001 / R1 / [MANAGER|IHE]
STATUS: PARECER_ARQUITETURAL_SEM_CODIGO

1. JA EXISTE
   - tabela/coluna/rota/arquivo/linha/consulta/teste

2. DECISOES DO CEO QUE DEVEM SER PRESERVADAS
   - fonte e consequência

3. CONCORDO COM
   - item da proposta + justificativa

4. DISCORDO OU PECO AJUSTE
   - item + evidência + risco + alternativa mínima

5. DUPLICIDADES OU FRONTEIRAS PERIGOSAS
   - o que não deve ser copiado ou acoplado

6. MENOR GATE 0 SEGURO
   - ações de investigação/contenção, sem feature nova

7. RESPOSTAS AS PERGUNTAS DA MISSAO
   - resposta direta, uma por uma

8. RECOMENDACAO FINAL
   - APROVAR | APROVAR_COM_RESSALVAS | REJEITAR

9. DECLARACAO
   - Nenhum código, migration, segredo, dado clínico ou configuração foi alterado.
```

Evidência válida inclui caminho e linha de código, `\d`/`information_schema`, contagem, consulta somente leitura, teste existente, commit ou decisão registrada. “Acho”, “parece” ou memória de conversa não sustentam decisão.

## 7. Formato obrigatório do contraditório R2

| Campo | Conteúdo |
|---|---|
| Concordância incorporada | Ponto do parecer do primo que melhora a proposta |
| Objeção mantida | Divergência, evidência e impacto |
| Concessão | Posição anterior que o agente aceita alterar |
| Experimento decisório | Teste ou consulta capaz de resolver a divergência |
| Pergunta ao CEO | Somente se for decisão clínica, comercial ou de prioridade |
| Fronteira final proposta | Responsável, contrato e fallback |

O R2 não é competição. Seu objetivo é retirar ambiguidades antes de o CEO decidir.

## 8. Matriz de decisão do CEO

Manus devolverá no máximo uma decisão bloqueante por mensagem no seguinte padrão:

| Opção | Decisão | Benefício | Custo/risco |
|---|---|---|---|
| **A** | Formulação objetiva | Consequência positiva | Consequência negativa |
| **B** | Formulação objetiva | Consequência positiva | Consequência negativa |
| **C** | Adiar e coletar evidência | Evita decisão prematura | Posterga a onda |

A recomendação de Manus será explícita, mas o voto final pertence ao CEO. A decisão entra em `DECISION_LOG.md` com data, autor, evidências consideradas e impacto.

## 9. Estados da mesa

| Estado | Significado |
|---|---|
| `DRAFT` | Pacote em preparação |
| `READY_FOR_COUNCIL` | CEO autorizou apresentar, sem código |
| `R1_WAITING_MANAGER` / `R1_WAITING_IHE` | Parecer independente pendente |
| `R2_CROSS_REVIEW` | Pareceres trocados para contraditório |
| `NEEDS_MANUS_SYNTHESIS` | Respostas completas |
| `NEEDS_CEO_DECISION` | Uma decisão bloqueante preparada |
| `ARCHITECTURE_APPROVED` | Direção aprovada; ainda sem código |
| `BUILD_NOT_AUTHORIZED` | Estado padrão após aprovação arquitetural |
| `BUILD_AUTHORIZED_SCOPED` | CEO autorizou missão específica em repo específico |
| `CLOSED` | Decisões e ADR publicados |

Não existe transição automática de `ARCHITECTURE_APPROVED` para `BUILD_AUTHORIZED_SCOPED`.

## 10. Linhas vermelhas

| Linha vermelha | Motivo |
|---|---|
| Não incluir senha, token, certificado ou prontuário | Segurança e LGPD |
| Não rodar migration, seed, `db:push` ou escrita em banco | Mesa é análise, não execução |
| Não alterar `main` nem publicar sem autorização | Preserva reversibilidade |
| Não tratar tabela de um repo como canônica no outro | Mantém sistemas primos independentes |
| Não copiar o domínio comercial do IHE para o Manager sem análise | Evita replicar dívida e semântica divergente |
| Não usar `platform owner` como bypass clínico | Mantém isolamento entre clínicas |
| Não declarar “feito” sem prova de fluxo real | Evita código-zumbi, regra já consolidada no IHE.[2] |

## 11. Critérios de pronto da mesa

A mesa estará pronta para execução somente quando os dois pareceres R1, os dois contraditórios R2, a síntese de Manus e as decisões do CEO estiverem versionados; cada fronteira tiver um dono; cada integração tiver contrato, versão, idempotência e fallback; e qualquer missão de implementação estiver separada por repositório, com spec e autorização próprias.

**RESUMO EM 1 LINHA:** os dois Replits investigam separadamente, confrontam evidências, Manus sintetiza e o CEO decide; só depois nasce uma missão de código específica e autorizada.

## Referências

[1]: https://github.com/caio-padua/Protocolo-Manager/blob/main/.agents/skills/paxter-loop/SKILL.md "Paxter Loop: especificar, construir e revisar"
[2]: https://github.com/caio-padua/Integrative-Health-Engine/blob/replit-agent/MANIFESTO_DR_REPLIT.md "Hierarquia, evidência, arbitragem e prova de fluxo no IHE"
[3]: https://github.com/caio-padua/Protocolo-Manager/blob/main/replit.md "Mapa de memória, cartas e conceito de sistemas primos independentes"
[4]: https://github.com/caio-padua/Integrative-Health-Engine/blob/replit-agent/docs/dr-claude/README.md "Ponte oficial versionada do IHE para orquestração externa"
