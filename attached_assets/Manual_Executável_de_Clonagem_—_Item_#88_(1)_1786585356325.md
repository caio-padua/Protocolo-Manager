# Manual Executável de Clonagem — Item #88

**Data:** 12 de agosto de 2026  
**Autor:** Dr. Manus — Árbitro Cruzado / Engenheiro de Missões  
**Status:** Complemento obrigatório do handoff técnico; pronto para execução e veredito do Dr. Code  
**Escopo:** Converter a Carta de Tratamento Premium aprovada em um PDF nativo, assinado e multiclínica dentro do PADAXOR.

> **A ideia central:** não estamos “embelezando um relatório”. Estamos transformando dados clínicos já existentes em uma **carta de orientação que o paciente consegue varrer, compreender e levar de volta à consulta**. O documento precisa parecer uma peça de assinatura PADAXOR, mas deve continuar sendo emitido pela clínica responsável e clinicamente prudente.

## 1. O que o Dr. Replit deve clonar

O modelo aprovado possui uma ordem intencional. A capa cria confiança e contexto; o mapa geral explica a lógica do plano; cada substância recebe uma folha íntegra, sem disputar espaço; o roteiro final transforma o documento em próxima ação. A fidelidade deve ser julgada por essa sequência, pela estabilidade das linhas de leitura e pela legibilidade física A4 — não apenas pela presença dos mesmos textos.

| Elemento | Deve acontecer | Não pode acontecer |
|---|---|---|
| **Marca** | PADAXOR lidera a capa e identifica discretamente o canto superior direito das páginas internas. A clínica é a emissora. PADCON aparece apenas como proveniência tecnológica no rodapé. | Trocar PADAXOR por PADCON na capa, redesenhar o símbolo oficial ou colocar três marcas com o mesmo peso. |
| **Página de substância** | Uma substância começa sempre numa folha exclusiva A4, com leitura em duas colunas estáveis. | Duas substâncias na mesma folha, meia página por substância, mosaico de cards ou colunas de altura imprevisível. |
| **Gráficos** | Radar e barras verticais mostram exclusivamente dados cadastrados em escala 0–5. | Barras horizontais, gráficos decorativos sem dado, cor como único significado ou inferência de benefício. |
| **Tom clínico** | Descreve o cadastro, a prescrição e o acompanhamento individual. | Promete resultado, trata a escala como diagnóstico ou cria contraindicação/benefício inexistente. |
| **Escala** | Fonte grande, linhas finas, áreas vazias propositais e leitura por varredura. | Texto comprimido, caixa arredondada, excesso de ícones, estrelas ou linguagem de “dashboard”. |

O mockup aprovado está no checkpoint **`8fa338ba`**. O ponto de referência visual é `client/src/pages/Home.tsx` e a gramática dimensional encontra-se em `client/src/index.css`. O gerador real é `artifacts/api-server/src/lib/pdf-signer.ts`; a rota que compõe os dados é `artifacts/api-server/src/routes/protocols.ts`. [1] [2] [3]

---

## 2. Linha vermelha de arquitetura

Esta entrega **não requer migration, tabela, endpoint ou tela nova**. A execução inicial deve limitar-se a duas mudanças coordenadas: projetar um DTO de apresentação dentro de `routes/protocols.ts` e desenhá-lo dentro de `pdf-signer.ts`. O banco permanece fonte de verdade; o PDF não grava, não recalcula eficácia e não faz chamadas externas durante a renderização.

O gerador vigente trabalha em A4 nativo com `pdf-lib`, possui assinatura PAdES e já embute imagens PNG para QR/wordmark. Portanto, a clonagem deve ser uma camada de composição do documento, não um segundo sistema de PDF. [3]

> **Decisão tipográfica obrigatória.** O mockup usa **Cormorant Garamond** para hierarquia editorial e **Manrope** para rótulos e leitura funcional. O PDF atual usa fontes-padrão. Para fidelidade real, o executor deve incorporar arquivos `.ttf` licenciados das duas famílias e registrar o mecanismo de fonte incorporada no PDF. Se for escolhido `pdf-lib`, adicionar uma única integração de fonte incorporada, testada e isolada; não aceitar Helvetica como substituto silencioso na capa ou nos títulos. A assinatura digital deve continuar sendo a última operação do fluxo.

### 2.1 Ordem de montagem no código

O executor deve criar funções puras, pequenas e testáveis. A sugestão abaixo não é uma nova arquitetura; é uma divisão da função existente para impedir que a página de uma substância contamine a próxima.

| Ordem | Função sugerida | Entrada | Saída / responsabilidade |
|---:|---|---|---|
| 1 | `buildProtocolPresentationDto` | payload real da rota | Dados normalizados, strings seguras e números 0–5 validados. |
| 2 | `embedPresentationAssets` | `PDFDocument` | Logo PADAXOR, símbolo oficial com vidro e marca PADCON; falha explícita se o símbolo obrigatório não existir. |
| 3 | `drawCoverPage` | página, DTO, ativos, fontes | Capa azul-marinho; não usa dados inventados. |
| 4 | `drawOverviewMapPage` | página, DTO | Matriz vertical do conjunto de substâncias. |
| 5 | `drawSubstanceDossierPage` | página nova, substância, índice | Uma ficha integral por substância; retorna página extra somente quando houver overflow seguro. |
| 6 | `drawProtocolRoutePage` | página, cronograma disponível | Roteiro final; se não houver dados estruturados suficientes, renderiza orientação honesta, não tabela fictícia. |
| 7 | `addSignaturePlaceholder` | `PDFDocument` final | Mantém a assinatura PAdES como operação terminal. |

---

## 3. Sistema de coordenadas A4 — valores que não devem ser adivinhados

O mockup foi validado com página A4 física de **210 × 297 mm**, margem de impressora de 5 mm e conteúdo interno de 9 mm à esquerda/direita, 8 mm no topo e 7 mm na base. O PDF usa pontos; por isso, não converter “a olho”.

| Token | mm físicos a partir da borda A4 | pontos PDF (`mm × 72 / 25,4`) | Uso |
|---|---:|---:|---|
| `PAGE_W` | 210 | 595,28 | Largura A4. |
| `PAGE_H` | 297 | 841,89 | Altura A4. |
| `CONTENT_X` | 14 | 39,69 | Começo de todo conteúdo interno. |
| `CONTENT_TOP` | 13 | 36,85 | Linha superior do cabeçalho. |
| `CONTENT_RIGHT` | 196 | 555,59 | Limite direito do conteúdo interno. |
| `CONTENT_BOTTOM` | 285 | 807,87 | Linha inferior antes da borda A4. |
| `CONTENT_W` | 182 | 515,91 | Largura de grelha útil. |
| `CONTENT_H` | 272 | 771,02 | Altura de grelha útil. |
| `GAP_L` | 3,5–4 | 9,92–11,34 | Respiro entre colunas, nunca abaixo disso. |
| `RULE` | 0,25–0,35 | 0,71–0,99 | Linha de arquivo e divisores. |

No `pdf-lib`, a coordenada Y começa na parte inferior. Para evitar inversões e números mágicos, centralizar a conversão em uma única função: `topToY(mmFromTop) = PAGE_H - mmFromTop * PT_PER_MM`. A cada novo bloco, o renderizador deve receber um retângulo `{ x, top, width, height }`, e nunca apenas valores soltos de `x/y`.

### 3.1 Tokens de cor e materiais

| Token | Hexadecimal | Papel | Versão P&B |
|---|---|---|---|
| `NAVY` | `#16284A` | Títulos, barras, eixos e identidade interna. | Preto/azul-escuro de alto contraste. |
| `NAVY_DEEP` | `#091528` | Fundo da capa. | Preto sólido. |
| `GOLD` | `#9A7B32` | Progresso, filete de ênfase e numeração. | Cinza médio; não pode carregar significado sozinho. |
| `PAPER` | `#FFFEFA` | Fundo das páginas internas. | Branco. |
| `MARBLE` | `#FAF8F3` | Campo suave de leitura. | Cinza muito claro. |
| `LINE` | `#D7D1C3` | Grelhas, contornos e divisões. | Cinza claro. |
| `WARM` | `#70685B` | Texto auxiliar. | Cinza médio. |
| `SAFETY` | `#914D45` | Faixa de segurança, somente quando há texto de segurança real. | Cinza escuro com cabeçalho textual “SEGURANÇA”. |

As substâncias podem manter preenchimentos com padrões — sólido, hachura diagonal e pontilhado —, porém cada padrão precisa estar acompanhado de **letra da substância e legenda**. A impressão monocromática deve preservar a distinção sem depender de cor.

---

## 4. Tipografia — uma escala, não uma coleção de tamanhos

| Papel | Família | Tamanho A4 | Regras de uso |
|---|---|---:|---|
| Nome PADAXOR da capa | Cormorant Garamond semibold | 53 pt | Maiúsculas, espaçamento de letras controlado; é o maior texto do documento. |
| Título da capa | Cormorant Garamond semibold/itálico | 31 pt | Duas linhas no máximo; apenas a ênfase pode ser itálica. |
| Título de página interna | Cormorant Garamond semibold | 31 pt | Linha compacta; não reduzir abaixo de 28 pt. |
| Nome da substância | Cormorant Garamond semibold | 31 pt | Pode quebrar em duas linhas; a área do título aumenta, não a fonte diminui. |
| Número de destaque | Cormorant Garamond | 17–22 pt | Selo de sessões e síntese; sempre acompanhado de rótulo. |
| Corpo clínico | Manrope regular | 6,6–7,5 pt | Entrelinha 1,32–1,50; sem texto justificado. |
| Dado operacional | Cormorant Garamond bold | 12 pt | Dose, via, sessões, intervalo, duração, tempo até efeito. |
| Rótulo / eixo / legenda | Manrope bold | 4,7–6 pt | Caixa-alta, espaçamento de 0,08–0,12 em; não usar como parágrafo. |
| Rodapé | Manrope regular | 5,2–5,5 pt | Apenas proveniência, status e número da página. |

O ar é parte do layout. O executor não deve “fazer caber” diminuindo fontes. Quando o conteúdo excede a caixa, aplica-se a regra de overflow da Seção 8. Esta é a proteção contra o tipo de densidade que piora a leitura para TDAH.

---

## 5. Página 1 — capa de assinatura PADAXOR

A capa deve ser desenhada como uma peça institucional de valor alto. A clínica aparece como emissora no alto esquerdo; PADAXOR, centralizado, é a plataforma que organiza a carta; PADCON não disputa a capa e aparece apenas no rodapé.

| Zona | Retângulo alvo | Desenho e hierarquia | Dados reais |
|---|---|---|---|
| Fundo | Página inteira | `NAVY_DEEP` com luz radial azul discreta centrada aproximadamente em 57% da largura e 35% da altura. Granulação quase imperceptível é opcional. | Nenhum. |
| Cabeçalho | Topo interno, 15–18 mm | À esquerda: slot da clínica com logo, nome e unidade. À direita: `CARTA DE TRATAMENTO · 01`. | Clínica emissora, unidade, número de versão se existir. |
| Símbolo | Moldura de **48 × 36 mm** | Usar exatamente `03-loginho-vidro-sistema.png`, grande, com enquadramento central e luz/contorno ouro muito sutil. Não redesenhar o X. | Ativo oficial. |
| Assinatura do sistema | Centro da página | Kicker “SISTEMA CLÍNICO INTELIGENTE”; `PADAXOR`; subtítulo “Clinical Intelligent System”. | Texto de marca, não dado do paciente. |
| Carta | Abaixo da assinatura | “Carta do seu protocolo de cuidado.” em duas linhas, seguida por uma explicação curta. | Texto institucional fixo. |
| Identificação | Grade de três colunas, min. 15 mm | PACIENTE, PROTOCOLO e RESPONSÁVEL. Linhas verticais finas criam leitura cartesiana. | Nome do paciente, nome/identificador do protocolo, profissional/CRM. Se faltar CRM, não inventar. |
| Status | Grade `0,88 : 0,62 : 1,50`, min. 15 mm | Selo radial de sessões, contagem de dossiês e orientação de leitura. | Sessões concluídas/previstas e quantidade de substâncias. |
| Rodapé | Base da página | “Documento clínico individual…”; `tecnologia PADCON`; página 01. | Fixo + página. |

### 5.1 Selo radial de acompanhamento

O selo é o objeto memorável da capa. Ele não é um adorno: substitui uma tabela burocrática por uma leitura imediata do acompanhamento. Use círculo de **15 mm** em impressão, traço de 4 unidades visuais, início em 12 horas e sentido horário. O valor central é `sessões concluídas`; a legenda abaixo é `de sessões previstas`.

| Cenário | Renderização obrigatória |
|---|---|
| `totalSessions > 0` | Progresso = `clamp(completed / total, 0, 1)`. Mostrar `02 / de 06`, por exemplo. |
| `totalSessions = 0` ou ausente | Anel de trilho sem avanço; texto central `—`; legenda `cronograma a definir`. |
| `completed > total` | Clampar no anel, preservar auditoria no log e renderizar `revisar cronograma` em vez de afirmar uma fração incorreta. |

---

## 6. Página 2 — mapa geral de ênfases

O mapa é uma matriz, não um painel de BI. Ele responde, em uma varredura: **quais substâncias estão no protocolo e em quais áreas cadastrais elas possuem ênfase registrada**.

1. Mantenha cabeçalho interno de 16 mm: eyebrow à esquerda, título serifado `Mapa de ênfases` e wordmark PADAXOR no canto superior direito.
2. A área de explicação e legenda ocupa duas colunas `1,5 : 1`, com 8 mm entre elas. O parágrafo esquerdo explica a escala; a legenda direita lista `A, B, C…` com nome e padrão de cada substância.
3. A matriz mede **90 mm no mínimo** de altura. Reserve 28 px/38 px equivalentes para título Y e rótulos 0–5; o restante é campo cartesiano.
4. O eixo X utiliza apenas sistemas para os quais exista dado em ao menos uma substância; a ordem canônica é: Longevidade, Cardiovascular, Muscular, Metabolismo, Neurológico, Ossos & articulações.
5. Cada cluster contém barras verticais por substância; altura é `valor/5 × altura útil`. Dado ausente é `—`, nunca uma barra de altura zero. A barra zero só existe se o banco tiver registrado explicitamente `0`.
6. A faixa de síntese permanece abaixo, com as três maiores somas cadastradas. Ela é uma soma de cadastro, **não** uma recomendação nem aferição do estado do paciente.
7. A nota de transparência fica em faixa marfim com filete ouro, no fim da página, antes do rodapé.

---

## 7. Páginas de substância — o coração da carta

Cada substância começa em **uma página A4 exclusiva**, sem partilhar o espaço com a substância seguinte. A folha precisa ser lida de cima para baixo em quatro faixas e da esquerda para a direita em dois campos estáveis. Essa estabilidade elimina o “salto visual” provocado por blocos com quantidade variável de itens.

### 7.1 Grelha vertical da ficha

| Faixa | Altura alvo | Conteúdo | Regra de clonagem |
|---|---:|---|---|
| 1. Identidade | 21 mm | Número da ficha, nome, tipologia/procedimento e marca PADAXOR. | Marca sempre no canto superior direito; título pode crescer para duas linhas. |
| 2. Faixa operacional | 28 mm | Dose prescrita, via, sessões, intervalo, duração, tempo até efeito. | Grade 3 × 2; todas as células têm a mesma largura e bordas. |
| 3. Intenção + radar | 53–56 mm | À esquerda, três blocos narrativos; à direita, radar grande e escala do catálogo. | Colunas `1,02 : 0,98`; não empilhar radar abaixo do texto. |
| 4. Leitura visual | 42 mm | Barras verticais à esquerda; medidores à direita. | Colunas 1 : 1; títulos na mesma linha-base. |
| 5. Conhecimento clínico | 68–72 mm | Composição/posologia, benefícios, segurança, ciência/indicação. | Grade 2 × 2; não retornar à grade de três colunas. |
| 6. Rodapé | 8–10 mm | Emissor, tecnologia PADCON e página. | Fixado no fundo da folha. |

Os valores são alvos de design. O código precisa preservar a âncora do rodapé e manter as faixas 1–4 integralmente na mesma página; a faixa 5 é a única que pode continuar em página complementar quando o conteúdo seguro não couber.

### 7.2 Faixa operacional — leitura de prescrição

| Coluna 1 | Coluna 2 | Coluna 3 |
|---|---|---|
| Dose prescrita | Via | Sessões concluídas / previstas |
| Intervalo | Duração | Tempo até efeito |

O rótulo usa Manrope em caixa-alta; o valor usa Cormorant maior. Cada célula tem borda externa e divisórias claras, com 2,6 mm de padding. **Nunca** reposicionar um item porque outro campo está vazio: exibem-se `Não informado` ou `A definir` conforme a semântica do campo. O paciente encontra sempre a mesma informação na mesma posição.

### 7.3 Campo esquerdo — explicação humana

Este campo contém três faixas de mesma altura, fundo marfim suave e um único filete ouro à esquerda:

| Ordem | Título fixo | Binding | Guardrail |
|---:|---|---|---|
| 1 | O QUE É | `substance.description` | Relatar apenas o texto cadastrado; se não houver, “Descrição não cadastrada para esta apresentação.” |
| 2 | FUNÇÃO NO SEU PLANO | `substance.mainFunction` | Exibir como finalidade de cuidado, sem converter em promessa. |
| 3 | O QUE PODE SER PERCEBIDO | `substance.perceivedEffects` | Manter marcadores de individualidade; não aplicar LLM de reescrita em tempo de PDF. |

### 7.4 Campo direito — radar e escala do catálogo

O radar recebe no mínimo três valores disponíveis de `bodySystemEffects`/impactos normalizados. Use raio de **39 mm** no papel, quatro anéis discretos e pontos dourados. O polígono é azul-marinho com transparência baixa. A legenda em duas colunas apresenta `valor + rótulo`. O radar não deve normalizar dados ausentes como zero.

O campo estreito ao lado é a “escala clínica” existente no catálogo. Ele deve mostrar apenas `starRating/5`, com número grande serifado, e a frase **“registro disponível no catálogo clínico”**. Não renderizar estrelas, medalhas ou linguagem de avaliação do produto. Caso a escala não exista, mostrar “escala não cadastrada”; não calcular uma.

### 7.5 Leitura visual — barras à esquerda, medidores à direita

| Lado | Construção | Fonte do dado | Sem dados |
|---|---|---|---|
| Esquerdo | Gráfico vertical com cinco linhas horizontais e rótulo X/Y explícito. Colunas seguem a ordem canônica dos sistemas. | `bodySystemEffects` normalizado em 0–5. | Coluna omitida do gráfico individual, nota `sem sistema cadastrado` se nenhuma existir. |
| Direito | Lista de medidores com rótulo, cinco quadrados e `n/5` à direita. | Medidores de catálogo: emagrecimento, hipertrofia, recuperação muscular, neurocognição. | Painel continua presente; texto `Nenhum medidor adicional foi cadastrado`. |

O lado esquerdo e o direito devem ter a mesma altura, mínimo de **42 mm**. Não empilhar um painel no outro para “economizar” espaço. A equivalência visual permite comparar informação com movimentos oculares curtos.

### 7.6 Conhecimento clínico — grade 2 × 2

| Quadrante | Conteúdo | Regras |
|---|---|---|
| Superior esquerdo | **Composição & posologia**; ingredientes; concentração; volume; ritmo; dose-base; observação. | `composition` é lista, não parágrafo inventado. Mostrar cada item em linha quando o separador ultrapassar uma linha. |
| Superior direito | **Benefícios cadastrados**. | Máximo visual de quatro microblocos em 2 × 2. Se houver mais, a página complementar recebe o restante, sem reduzir fonte. |
| Inferior esquerdo | **Segurança**. | Filete `SAFETY` e texto real de contraindicação/precaução. Informação ausente vira “Orientações de segurança não cadastradas — confirme com a equipe antes da sessão.” |
| Inferior direito | **Ciência & indicação**. | Texto de evidência disponível e a observação fixa de individualização; sem classificar força de evidência se o banco não trouxer essa classificação. |

---

## 8. Regras para conteúdo variável — onde PDFs normalmente quebram

O layout não pode depender de uma substância “bonita” de demonstração. A regra é manter o paciente seguro e o papel calmo quando os dados são incompletos, excessivos ou contraditórios.

| Condição | Regra determinística | Resultado proibido |
|---|---|---|
| Nome longo | Quebra em até duas linhas; conserva tamanho 31 pt; desloca as faixas abaixo pelo incremento medido. | Reduzir o título a tamanho de corpo ou sobrepor a marca. |
| `description`, `mainFunction` ou `perceivedEffects` extensos | Medir texto com a fonte incorporada. Até o limite da faixa, renderizar; o excedente vai para `Complemento da ficha` após a folha principal. | Cortar frase no meio, reduzir abaixo de 6,6 pt ou esconder sem aviso. |
| Mais de quatro benefícios | Quatro na folha principal; os demais entram no complemento com cabeçalho “Benefícios cadastrados — continuação”. | Trocar a grade por três colunas ou omitir benefícios. |
| Composição extensa | Converter a lista em linhas; preservar cada ingrediente. Se exceder a caixa, mover a composição completa para complemento e deixar indicação “ver continuação”. | Fundir ingredientes em texto ilegível. |
| Segurança extensa | Segurança tem precedência; cresce verticalmente e desloca ciência/indicação para complemento. | Truncar precaução, colocar fonte microscópica ou deslocar segurança para longe da composição. |
| Menos de três eixos | Substituir radar por estado neutro: `MAPA 0–5 · dados insuficientes para radar`. | Desenhar polígono com pontos inventados. |
| Valores inválidos | Converter com `Number`; aceitar somente inteiro de 0–5. Rejeitar/registrar fora dessa faixa no DTO. | Renderizar barra acima do teto, número negativo ou `NaN`. |
| Sessões sem total | Selo e célula mostram `A definir`; não dividir por zero. | `Infinity`, `NaN`, percentual falso. |
| Sete ou mais substâncias | Capa + mapa + uma página principal por substância + roteiro. Cabeçalhos e numeração são recalculados dinamicamente. | Reusar número de página, comprimir dossiers ou quebrar uma ficha entre dois itens. |

> **Princípio de overflow:** uma substância pode ganhar uma página complementar quando isso for clinicamente necessário; ela nunca deve dividir sua página principal com outra substância. A regra de “uma substância por folha” existe para impedir condensação, não para autorizar truncamento de segurança.

---

## 9. Binding: ordem de precedência e semântica

O modelo deve ser abastecido por dados já existentes. Quando houver uma configuração base da substância e uma prescrição individual do protocolo, a prescrição individual vence; o cadastro base completa apenas o que a prescrição não especifica. A rota deve expor essa decisão no DTO antes de chamar o PDF.

| Elemento visual | Prioridade de origem | Transformação permitida | Transformação proibida |
|---|---|---|---|
| Nome, categoria e tipo de procedimento | Catálogo da substância | `trim`, substituição de nulo por rótulo honesto. | Renomear produto para criar apelo comercial. |
| Dose, via, sessões, intervalo e duração | Item individual do protocolo; fallback cadastral somente se previsto | Formatação de unidade/data. | Somar doses, inferir frequência ou preencher “padrão” sem origem. |
| Descrição/função/efeitos | Catálogo | Quebra de linha e limpeza de espaço. | Expandir com IA, adicionar efeito ou alterar ressalvas clínicas. |
| Impactos e medidores 0–5 | Catálogo | Normalizar chave e validar 0–5. | Média, previsão ou uso como dado do paciente. |
| Composição e posologia | Catálogo + prescrição quando existir texto individual | Transformar lista em linhas. | Concatenar elementos nulos como se fossem ativos. |
| Contraindicações e ciência | Catálogo | Preservar integralmente. | Resumir de modo que retire condição clínica; atribuir grau de evidência sem campo. |
| Clínica/profissional/paciente | RAS/protocolo/empresa | Mascaramento opcional em cópia administrativa. | Usar dado de outra clínica ou de outro paciente. |

O documento técnico anterior contém a tabela campo-a-campo do schema e da rota. Este manual não a substitui: ele define **como cada dado ocupa o espaço e como o espaço reage quando o dado varia**. [1]

---

## 10. Kaizen — o que eu exigiria como paciente depois de receber esta carta

Como paciente, eu não pediria mais cor ou mais gráficos. Eu pediria **menos incerteza entre a consulta e a próxima sessão**. A carta deve responder quatro perguntas em menos de um minuto: “o que compõe meu plano?”, “o que acontece agora?”, “o que devo observar ou perguntar?” e “como obtenho ajuda com segurança?”.

As melhorias abaixo não devem ser jogadas no mesmo commit da clonagem. São ondas do próprio item #88, sem criar numeração paralela de tarefa. Cada uma precisa de fonte de dados, teste e aprovação clínica antes de aparecer ao paciente.

| Onda Kaizen | Entrega para o paciente | Valor real | Dependência / trava |
|---|---|---|---|
| **0 — fidelidade** | Carta clonada, A4, assinável e rastreável. | Clareza imediata sem alterar conduta. | Concluir a bateria 88-A–88-K. |
| **1 — próxima ação** | Bloco “Próxima sessão” com data, local, preparo confirmado e contato oficial da clínica. | Reduz no-show e ansiedade pós-consulta. | DTO de sessão estruturada; não usar texto livre ambíguo. |
| **2 — perguntas inteligentes** | Três perguntas contextualizadas, editáveis pelo profissional, sobre objetivo, observação e dúvida. | Ajuda o paciente a participar, sem aconselhamento automatizado. | Campos aprovados pela equipe; não gerar pergunta clínica por LLM no PDF. |
| **3 — transparência e versão** | Rodapé com data/hora de emissão, versão do protocolo e identificador curto. | Evita o paciente seguir documento antigo. | Versão do protocolo e timezone confiáveis. |
| **4 — QR seguro** | QR para portal autenticado com versão viva, nunca para conteúdo clínico exposto. | Permite continuidade sem anexos confusos. | URL opaca, expiração, autenticação e autorização; jamais CPF/ID em URL. |
| **5 — preparo e pós-sessão** | Orientações específicas aprovadas pelo clínico. | Aumenta previsibilidade e segurança. | Novos campos clínicos com autoria, revisão e versionamento; não inventar a partir da substância. |
| **6 — acessibilidade** | Versão de alto contraste, leitura ampliada e linguagem simples revisada. | Atende diferentes condições de leitura e reduz carga cognitiva. | Auditoria de contraste e revisão humana do conteúdo. |
| **7 — trilha de dúvidas** | Canal de contato, classificação de urgência e registro do retorno da equipe. | O paciente sabe como pedir ajuda sem procurar informação aleatória. | Fluxo de mensageria, SLA e regras clínicas explícitas. |

### 10.1 Melhorias que parecem boas, mas ficam proibidas por enquanto

| Ideia | Por que não entra agora |
|---|---|
| “Pontuação de saúde” do paciente | Confundiria impacto cadastral da substância com diagnóstico ou prognóstico individual. |
| Cor verde/vermelha para “bom/ruim” | Não há dado clínico individual para sustentar o semáforo e ele é ruim em impressão P&B. |
| Texto gerado automaticamente sobre benefício | Pode introduzir alegação clínica não cadastrada ou incompatível com a indicação. |
| QR com dados do paciente | Aumenta risco de privacidade e de acesso não autorizado. |
| Tela de aceite automática dentro do PDF | Não equivale a consentimento nem substitui o fluxo jurídico já existente no Cartório. |

---

## 11. Bateria de aceite ampliada — a definição objetiva de “clonado”

| Grupo | Caso | Evidência mínima |
|---|---|---|
| Marca | Símbolo oficial aparece na capa e wordmark PADAXOR no canto superior direito das internas. | PDF aberto + teste de presença de asset. |
| Geometria | Capa, mapa, três fichas e roteiro resultam em páginas A4 sem corte. | PDF com dimensões 595,28 × 841,89 e inspeção visual. |
| Ficha | Três substâncias ocupam três folhas principais distintas. | Número de páginas e início de página por substância. |
| Dados | Prescrição individual vence fallback cadastral. | Fixture com valores divergentes e asserções textuais. |
| Nulos | Radar com dois eixos usa estado neutro; medidor vazio usa mensagem honesta. | Fixture de dados esparsos. |
| Limites | `-1`, `6`, `NaN` e string não numérica não viram gráfico. | Teste unitário do normalizador. |
| Conteúdo longo | Segurança longa cria complemento; não reduz a tipografia de segurança. | Fixture com texto acima da caixa e inspeção do PDF. |
| P&B | Padrões, letras e rótulos distinguem as substâncias em impressão monocromática. | PDF impresso/simulado em escala de cinza. |
| Segurança | Nenhuma página contém linguagem de promessa ou dado inventado. | Snapshot textual e revisão humana. |
| Assinatura | PDF continua aceitando placeholder e assinatura PAdES. | Teste do fluxo atual de assinatura. |
| Regressão | PDF antigo e outros documentos do `pdf-signer.ts` continuam verdes. | `pnpm --filter @workspace/api-server test` + casos dedicados. |

---

## 12. Sequência de execução recomendada ao Dr. Replit

1. Fazer `git pull`, ler a carta técnica-base e este manual; confirmar que o commit não mistura rename global de PAXTER.
2. Criar fixtures de três substâncias: simples, implante e blend; acrescentar uma fixture de dados ausentes e outra de conteúdo longo.
3. Extrair o DTO de apresentação na rota sem alterar o contrato já consumido por outras telas.
4. Preparar fontes incorporadas e ativos locais; falhar de forma legível se o ativo obrigatório estiver ausente em ambiente de deploy.
5. Criar helpers de coordenadas, wrapping e boxes antes de desenhar qualquer página.
6. Implementar capa; validar símbolo, selo e hierarquia de marcas.
7. Implementar mapa; validar escala 0–5 e padrões P&B.
8. Implementar uma ficha de substância e só então generalizar para N fichas.
9. Implementar overflow complementar, rodapé fixo e roteiro final com dados reais.
10. Rodar bateria, gerar PDF de evidência, validar assinatura e publicar hash + saída verde no Slack.

> **Critério final de qualidade:** se o paciente abrir no celular, imprimir em preto e branco ou voltar ao documento semanas depois, ele deve reencontrar a mesma informação no mesmo lugar, sem precisar interpretar um gráfico como promessa, sem perder uma orientação de segurança e sem confundir quem emite a carta com quem fornece a tecnologia.

## Referências

[1] [Carta Técnica — Item #88: Protocolo Premium PADAXOR](https://github.com/caio-padua/Protocolo-Manager/blob/main/docs/handoffs/2026-08-12_ITEM-88_CARTA-TRATAMENTO-PREMIUM-PADAXOR.md)  
[2] [Projeção real do payload — protocols.ts](https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/api-server/src/routes/protocols.ts) — o mockup visual validado encontra-se no projeto de mockup; esta rota é a fonte do payload real.  
[3] [Gerador PDF e assinatura PAdES — pdf-signer.ts](https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/api-server/src/lib/pdf-signer.ts)
