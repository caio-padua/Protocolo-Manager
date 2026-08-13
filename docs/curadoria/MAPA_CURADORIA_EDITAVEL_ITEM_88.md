# Mapa de Curadoria Editável — Carta de Tratamento Premium PADAXOR

**Status:** proposta de orquestração; nenhuma informação clínica foi alterada.

## 1. Diagnóstico sem ambiguidades

> **Consigo acessar o GitHub e o código real.** O repositório privado `caio-padua/Protocolo-Manager` contém o schema, a tela de edição, a API e o gerador da Carta Premium. Contudo, as **linhas do catálogo vivo de substâncias não estão versionadas no GitHub**; elas residem no banco de dados. Logo, é possível desenhar uma curadoria fiel à fiação, mas não é seguro escrever textos para “todas as substâncias” antes de receber um export somente-leitura do catálogo atual.

A cadeia real já existe e não precisa de uma ferramenta paralela:

```text
SubstanceEditForm.tsx
  → PATCH /substances/:id
  → substancesTable
  → GET /protocols/:id/carta-pdf
  → buildCartaTratamentoDto()
  → generateProtocolLetterPdf()
  → PDF assinado
```

A tela informa que ajustes no cadastro entram no material do cliente; essa promessa hoje é verdadeira apenas para parte dos campos. A auditoria abaixo separa **o que já chega à Carta** do que a clínica consegue editar, mas o PDF ainda ignora.

## 2. Matriz de campos: editar, transportar e explicar

| Campo existente e editável | Controle atual | Carta atual | Função para a paciente | Decisão Kaizen |
|---|---|---:|---|---|
| `name` | texto | Sim | Identifica a substância. | Manter curto; permitir até duas linhas no título. |
| `procedureType` | seleção IV/IM/implante | Sim | Explica a via no quadro operacional. | Usar nomenclatura clínica clara, sem jargão isolado. |
| `timeToEffect` | texto | Sim | Alinha expectativa de tempo. | Redigir como intervalo/possibilidade, nunca garantia. |
| `description` | texto | Sim | Responde “o que é?”. | Dois a quatro períodos leigos, sem alegação de cura. |
| `mainFunction` | texto | Sim | Responde “por que está no meu plano?”. | Uma função no contexto do plano, em voz de decisão compartilhada. |
| `perceivedEffects` | texto | Sim | Responde “o que posso observar?”. | Efeitos possíveis, variabilidade explícita e orientação para contatar a equipe se necessário. |
| `contraindications` | texto | Sim | Segurança e alertas. | Campo obrigatório quando houver risco relevante; separar alerta, contexto e ação. |
| `scientificEvidence` | texto | Sim | Explica o que a ciência sustenta. | Linguagem proporcional à certeza + fonte/DOI/URL no registro técnico. |
| `bodySystemEffects` | escala 0–5 por sistema | Sim | Radar e barras de ênfase. | É **ênfase do catálogo**, não medição do corpo da paciente; manter legenda. |
| 10 benefícios por área | textos | Sim | Materializa os benefícios cadastrados e quatro medidores textuais. | Curar só áreas pertinentes; deixar vazio é preferível a criar texto genérico. |
| `starRating` | estrelas 0–5 | Sim | Hoje aparece como escala do catálogo. | Não chamá-la de eficácia nem de avaliação da paciente; manter somente se houver definição clínica documentada. |
| `composicao` | texto | **Não** | Deveria explicar os ativos de um blend. | **Lacuna P1 de fiação:** passar para rota e `compositionRaw` do DTO; sem nova coluna. |
| `posologia` | texto | **Não** | Poderia diferenciar instrução geral do cadastro da prescrição individual. | **Lacuna P1:** transportar; PDF deve priorizar a dose do item do protocolo. |
| `categoryMeters` | escala 0–5 | **Não** | São os medidores estruturados prometidos pela UI. | **Lacuna P1:** transportar e usar no quadro direito; substituir inferência por rótulo de benefício. |
| `concentrationMg`, `volumeAmpola` | texto | **Não** | Contexto técnico quando clinicamente apropriado. | Transportar apenas se o médico determinar que é útil ao paciente; não substituir dose prescrita. |
| `defaultDose`, `intervalDays`, `durationMinutes` | texto/número | Parcial | Orientam cadastro e logística. | A Carta deve continuar usando a prescrição do protocolo; exibir duração só se a unidade quiser. |
| `category`, `categoryType`, `color`, `unit` | seleção/texto | Não | Organização interna ou visual. | Não devem preencher texto clínico automaticamente. |

## 3. O que uma paciente deveria receber — e o que já pode ser produzido

A surpresa que importa não é uma “curiosidade” decorativa. É a paciente abrir a Carta e perceber, em menos de um minuto, que alguém organizou o cuidado para ela: **o que é, por que está no plano, como acompanha o ritmo, o que pode perceber, onde existe cautela e quando precisa falar com a equipe**.

| Necessidade da paciente | Bloco que já pode usar dados existentes | Campo curado | Regra de conteúdo |
|---|---|---|---|
| “O que estou recebendo?” | **O que é** | `description` | Definição breve, sem transformar a carta em bula. |
| “Por que isso está aqui?” | **Função no seu plano** | `mainFunction` | Relacionar ao objetivo clínico do plano, não prometer desfecho. |
| “O que eu posso notar?” | **O que pode ser percebido** | `perceivedEffects` | Relatar possibilidades e variação individual. |
| “Quando faz sentido acompanhar?” | **Tempo até efeito** e sessões | `timeToEffect`, itens do protocolo e sessões | Dar horizonte de acompanhamento; não induzir mudança autônoma de dose. |
| “Onde ela atua no plano?” | Radar + barras verticais | `bodySystemEffects` | Mostrar 0–5 como ênfase editorial do catálogo. |
| “O que torna isto seguro?” | **Segurança** | `contraindications` | Dizer o que informar à equipe antes de mudar qualquer coisa. |
| “O que já se sabe?” | **Ciência & indicação** | `scientificEvidence` | Explicar força/limite da evidência em linguagem proporcional. |
| “O que há no blend?” | **Composição & posologia** | `composicao`, dose/via/intervalo do protocolo | Requer a pequena lacuna de transporte P1, não novo schema. |
| “Como está meu plano completo?” | Roteiro final + selo radial | sessões, substâncias e datas | Informar progresso sem tratar progresso como resultado clínico. |

### Itens que seriam ótimos, mas não existem como dado estruturado hoje

Preparação pré-sessão, contato de urgência, próxima data, instrução pós-procedimento, efeitos adversos para monitorar, metas compartilhadas e consentimento detalhado seriam valiosos à paciente. **Eles não devem ser improvisados nos campos atuais**. Entram apenas numa onda futura se houver campo próprio, autoria clínica, revisão, versionamento e comportamento para ausência de dado.

## 4. Política de linguagem e evidência

A literatura institucional destaca que a evidência e a segurança de suplementos variam amplamente; interações com medicamentos, condições clínicas e procedimentos podem importar, e produtos comercializados podem divergir dos avaliados em estudos [1] [2]. A comunicação de evidência deve ajustar a força do verbo ao grau de certeza: termos como “pode” e “provavelmente” não são fraqueza editorial; são precisão [3].

| Certeza revisada pelo médico | Linguagem permitida no catálogo | Linguagem vedada |
|---|---|---|
| Alta | “Há evidência consistente de que…” | “Garante”, “cura”, “resolve definitivamente”. |
| Moderada | “Provavelmente contribui para…” | “Comprovadamente elimina”. |
| Baixa | “Pode contribuir para…; os estudos ainda são limitados.” | “É indicado para tratar…”, sem contexto. |
| Muito baixa/incerta | “Ainda não há segurança científica suficiente para concluir…” | Qualquer promessa de benefício. |

A referência técnica pode constar no fim de `scientificEvidence` em padrão curto e verificável: `Base: Diretriz/Autor, ano; PMID/DOI/URL. Revisão clínica: AAAA-MM-DD.` O PDF pode apresentar apenas a síntese paciente; a referência integral fica disponível no cadastro e em anexo técnico quando solicitado.

## 5. Ondas de execução: melhorar sem perder controle

| Onda | Escopo | Dependência | Evidência de aceite |
|---|---|---|---|
| **0 — Inventário** | Export somente-leitura e anonimizado do catálogo, sem paciente. | Dr. Replit. | JSON validado, total de itens, `updatedAt`, lista dos utilizados em protocolos ativos. |
| **1 — Fiação mínima** | Passar `composicao`, `posologia` e `categoryMeters` pela rota e DTO existentes. | Dr. Replit; revisão Dr. Code. | Diff pequeno, testes de DTO e PDF de uma substância com cada campo. |
| **2 — Curadoria piloto** | Curar 5 substâncias prioritárias do catálogo real. | Manus pesquisa; médico responsável aprova. | Matriz fonte→texto→campo, revisão assinada e alteração reversível. |
| **3 — Produção por coorte** | Curar as demais por categoria clínica. | Aprovação por lote. | Sem campos de segurança vazios; referências e data de revisão. |
| **4 — Kaizen paciente** | Avaliar perguntas recorrentes e utilidade da carta, sem dados sensíveis. | Dono clínico e produto. | Métrica definida antes, feedback consentido e nenhuma inferência clínica automática. |

## 6. O que deve acontecer agora

1. Dr. Replit entrega o **export somente-leitura** solicitado, sem dados de paciente.
2. Eu classifico o catálogo real em grupos de pesquisa, localizo a evidência primária/secundária aplicável e devolvo uma **matriz por substância**: fonte, nível de evidência, texto proposto, campo editável, alerta de segurança e data de revisão.
3. O médico responsável aprova, corrige ou rejeita cada texto. Nenhum LLM publica conteúdo clínico diretamente no catálogo.
4. Dr. Replit aplica somente o lote aprovado via fluxo já existente; o sistema registra diff/backup e gera cartas de teste.
5. Dr. Code arbitra: se uma substância perdeu dado, alterou uma dose, omitiu segurança ou excedeu o espaço do PDF, o lote retorna.

## Referências

[1] [NCCIH — Using Dietary Supplements Wisely](https://www.nccih.nih.gov/health/using-dietary-supplements-wisely)

[2] [NCCIH — Dietary and Herbal Supplements](https://www.nccih.nih.gov/health/dietary-and-herbal-supplements)

[3] [CDC — Communicating Findings from the GRADE Certainty Assessment](https://www.cdc.gov/acip-grade-handbook/hcp/chapter-11-communicating-findings-from-the-grade-certainty-assessment/index.html)

[4] [NIH Office of Dietary Supplements — Fact Sheets](https://ods.od.nih.gov/factsheets/list-all/)
