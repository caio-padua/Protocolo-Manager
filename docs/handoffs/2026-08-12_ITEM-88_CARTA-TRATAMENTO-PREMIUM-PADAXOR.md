# Carta Técnica — Item 88: Carta de Tratamento Premium PADAXOR

| Campo | Definição |
|---|---|
| **Data** | 12 de agosto de 2026 |
| **Autor** | Dr. Manus — árbitro cruzado e auditor de arquitetura |
| **Destinatário** | Dr. Replit — executor do código |
| **Status** | Diretriz visual autorizada pelo CEO; pronta para implementação com testes |
| **Escopo** | Trocar a composição visual do PDF de protocolo do paciente. Não criar tabela, rota pública ou dado clínico novo. |
| **Critério de aceite** | Capa PADAXOR, uma substância por folha A4, barras verticais, leitura em duas colunas e somente dados existentes no sistema. |

> **Missão em uma frase:** transformar o PDF de protocolo, hoje correto em conteúdo mas visualmente comprimido, numa **Carta de Tratamento Premium PADAXOR** que permita ao paciente e ao médico extrair o plano num relance — sem inventar qualquer dado clínico.

## 1. Diagnóstico honesto

O sistema já possui uma base de dados clínicos rica para o dossiê: identidade, via, dose, frequência, composição, efeitos por sistema corporal, medidores por objetivo, benefícios textuais, segurança e evidência científica pertencem ao cadastro de substâncias. [1] A rota do PDF também já une o protocolo, os itens prescritos, as sessões, os pagamentos, o paciente e o profissional antes de chamar o gerador. [2]

O gargalo não é falta de dado; é **projeção incompleta e composição visual antiga**. Hoje, a rota encaminha apenas uma parte do cadastro para o PDF, o contrato `ProtocolDocSubstance` não declara os campos de composição, via, posologia, medidores e validação humana, e o gerador usa estrelas e barras horizontais. [2] [3] Isto contraria a decisão de leitura cartesiana do CEO e reduz o espaço destinado à explicação por substância.

Há ainda uma defasagem controlada de marca: o módulo `brand.ts` e o PDF ainda registram o produto como **PAXTER**, enquanto a diretriz executiva desta missão estabelece **PADAXOR Clinical Intelligent System** como identidade clínica mostrada ao paciente. [3] [4] O item 88 deve corrigir a experiência do PDF; uma troca global de nome fora dos pontos necessários não é parte desta entrega.

| O sistema já tem | O item 88 deve fazer | O item 88 não deve fazer |
|---|---|---|
| `substances` com campos clínicos, estruturais e visuais | Projetar esses campos explicitamente no payload do documento | Criar nova tabela de substâncias ou duplicar dados |
| `protocol_items` com dose, sessões, intervalo, início e frequência | Usar a prescrição real como faixa operacional da ficha | Inferir dose, intervalo ou duração quando estiverem vazios |
| `sessions` e `substance_applications` | Alimentar selo de progresso e roteiro de sessões | Alterar regra de agendamento |
| `pdf-signer.ts` centralizado | Refatorar apenas o gerador de documento do paciente | Modificar RAS FAP, TCLE ou documentos de auditoria por efeito colateral |

## 2. Fluxo de dados aprovado

![Fluxo de dados da Carta Premium](../webdev-static-assets/fluxo_dados_carta_premium.png)

O fluxo preserva a arquitetura existente: a rota monta um **DTO explícito**, o gerador recebe esse DTO e desenha as páginas. Não haverá consulta ao banco dentro do renderizador e não haverá cálculo clínico oculto no frontend. Os campos clínicos vêm do cadastro; os campos de prescrição vêm do item do protocolo; os campos de andamento vêm do protocolo e das sessões. [1] [2]

| Origem | Responsabilidade | Destino na carta |
|---|---|---|
| `protocols` + `clients` + `professionals` | Identidade da carta, paciente, emissor, profissional, datas e progresso global | Capa e rodapé institucional |
| `protocol_items` | Dose efetivamente prescrita, sessões, intervalo, início e frequência | Faixa operacional da ficha de cada substância |
| `substances` | Conteúdo clínico cadastrado, composição, efeitos, medidores, segurança e ciência | Dossiê editorial da substância |
| `sessions` + `substance_applications` | Sequência e situação de cada sessão | Roteiro de sessões e progresso global |

## 3. Contrato de dados: mudança mínima e explícita

### 3.1. Não criar banco, não criar endpoint

O schema já contém os dados necessários. A alteração é somente na projeção de `GET /protocols/:id/document-pdf` e no tipo de entrada de `generateProtocolDocumentPdf`. [1] [2] Nenhuma migration Drizzle é necessária para este item.

### 3.2. Expandir o DTO do documento

Em `artifacts/api-server/src/lib/pdf-signer.ts`, ampliar `ProtocolDocSubstance`; em `artifacts/api-server/src/routes/protocols.ts`, preencher cada campo a partir de `sub` e `item`. A forma abaixo é o contrato de implementação, não uma segunda fonte de verdade.

```ts
type ScoreMap = Record<string, string | number>;

interface ProtocolDocSubstance {
  // Já existem no PDF atual ou no item prescrito.
  name: string;
  dose: string;
  color: string;
  totalSessions: number;
  intervalDays: number;
  startDate: string;
  frequency?: string | null;
  procedureType: string;

  // Já existem no cadastro; faltam no DTO do PDF atual.
  category?: string | null;
  categoryType?: string | null;
  viaUso?: string | null;
  frequenciaBase?: string | null;
  posologia?: string | null;
  posologiaEstruturada?: unknown | null;
  composicao?: string | null;
  concentrationMg?: string | null;
  volumeAmpola?: string | null;
  description?: string | null;
  mainFunction?: string | null;
  perceivedEffects?: string | null;
  timeToEffect?: string | null;
  bodySystemEffects?: ScoreMap | null;
  categoryMeters?: ScoreMap | null;
  contraindications?: string | null;
  scientificEvidence?: string | null;
  exigeValidacaoHumana?: boolean | null;

  longevityBenefit?: string | null;
  qualityOfLifeImpact?: string | null;
  sleepBenefit?: string | null;
  energyBenefit?: string | null;
  libidoBenefit?: string | null;
  physicalPerformance?: string | null;
  muscleStrength?: string | null;
  mentalClarity?: string | null;
  skinHairNails?: string | null;
  immuneSupport?: string | null;
}

interface ProtocolDocumentData {
  // Campos existentes.
  protocolId: number;
  protocolTitle: string;
  clientName: string;
  professionalName: string;
  professionalCrm?: string | null;
  unit: string;
  startDate: string;
  endDate?: string | null;
  sessions: ProtocolDocSession[];
  substances: ProtocolDocSubstance[];

  // Acrescentar para o selo de acompanhamento da capa.
  totalSessions: number;
  completedSessions: number;
}
```

> **Regra de integridade:** `posologiaEstruturada` deve ser encaminhada como JSON opaco nesta entrega. Só renderize uma versão humanizada se já existir um normalizador validado no backend. Não deduza instrução de uso a partir de texto livre.

### 3.3. Mapa completo: campo real → elemento visual

| Elemento visual | Fonte primária | Binding exato | Regra de exibição |
|---|---|---|---|
| Clínica emissora | `protocol.unit` | `data.unit` | Renderizar nome. A logomarca é **slot reservado** enquanto não houver configuração de imagem por tenant. |
| Produto principal | Ativo oficial de marca | arquivo `03-loginho-vidro-sistema.png` | Embutir como PNG no servidor; não redesenhar e não gerar um substituto. |
| Título da carta | `protocols.title` | `data.protocolTitle` | Subtítulo editorial da capa. |
| Paciente | `clients.name` | `data.clientName` | Exibir na capa. CPF completo somente se a política de entrega impressa justificar; em distribuição digital, aplicar máscara. |
| Médico | `professionals.name`, `crm` | `data.professionalName`, `data.professionalCrm` | Linha de responsabilidade clínica. |
| Início e vigência | `protocols.startDate`, `endDate` | `data.startDate`, `data.endDate` | Datas da capa; omitir fim quando nulo. |
| Selo de progresso | `protocols.completedSessions`, `totalSessions` | `data.completedSessions / data.totalSessions` | Anel ouro fosco; `0/0` vira “A programar”, sem divisão por zero. |
| Dose | `protocol_items.dose` | `sub.dose` | Nunca substituir por `defaultDose`. |
| Via | `substances.viaUso` com fallback | `sub.viaUso ?? sub.procedureType` | Exibir apenas quando não vazio. |
| Ritmo | `protocol_items.frequency`, `intervalDays` | `sub.frequency`, `sub.intervalDays` | Prescrição do protocolo vence `frequenciaBase` do catálogo. |
| Ciclo | `protocol_items.totalSessions` | `sub.totalSessions` | Exibir como “N sessões”. |
| Tempo percebido | `substances.timeToEffect` | `sub.timeToEffect` | Texto do cadastro, sem promessa adicional. |
| Identificação clínica | `name`, `category`, `categoryType`, `description` | campos homônimos | Omitir blocos sem conteúdo. |
| Intenção terapêutica | `mainFunction`, `perceivedEffects` | campos homônimos | Chamar de “intenção clínica” e “experiência esperada”; não criar diagnóstico. |
| Composição | `composicao`, `concentrationMg`, `volumeAmpola` | campos homônimos | Quebrar `composicao` por vírgula/ponto e vírgula com o parser já existente; manter texto original se o parse falhar. [5] |
| Radar | `bodySystemEffects` | mapa chave → score 0–5 | Usar no máximo seis dimensões de maior valor; chave desconhecida recebe rótulo derivado, não ícone inventado. |
| Barras verticais do mapa | `bodySystemEffects` de todas as substâncias | coleção normalizada por sistema | Eixo Y fixo de 0 a 5; série por substância, padrão monocromático imprimível. |
| Medidores temáticos | `categoryMeters` | ordem `emagrecimento`, `hipertrofia`, `recuperacao_muscular`, `neurocognicao` | Omitir medidor inexistente; preservar esta ordem canônica. [5] |
| Benefícios | nove campos textuais de benefício | lista filtrada de valores não vazios | Usar texto íntegro, com quebra de linha; não reduzir a bolinhas. |
| Segurança | `contraindications`, `exigeValidacaoHumana` | campos homônimos | Cartão com borda, não alarme colorido. Ausência não significa “sem contraindicação”. |
| Ciência | `scientificEvidence` | `sub.scientificEvidence` | Texto cadastrado, sem pontuação artificial por estrela. |
| Roteiro | `sessions` + aplicações disponíveis | `data.sessions` | Data, número, situação e substâncias programadas. |

Os rótulos clínicos de `bodySystemEffects` e a ordem dos medidores já possuem uma definição de apresentação no cadastro. Extraia os valores puros para um módulo sem React compartilhável; **não importe `shared.tsx` no servidor**, pois ele contém componentes visuais. [5]

## 4. Layout aprovado para A4

### 4.1. Parâmetros físicos e linguagem visual

A saída é A4 retrato — **210 × 297 mm** — com área segura interna de 16 mm nas laterais, 15 mm no topo e 16 mm no rodapé. A prévia do mockup já foi gerada pelo Chromium com seis páginas A4 em 594,96 × 841,92 pt, sem quebra de uma substância entre folhas. [6]

| Token | Uso |
|---|---|
| `#16284A` navy | identidade, títulos, linhas e gráfico principal |
| `#9A7B32` ouro fosco | progresso, número de ordem, filetes e foco visual |
| `#FFFEFA` marfim | fundo de leitura e impressão econômica |
| `#D7D1C3` cinza quente | grades, divisórias e estrutura |
| Cormorant Garamond | títulos editoriais e dados de grande escala |
| Manrope | rótulos, valores funcionais e tabela |

Os elementos são ortogonais, com cantos de no máximo 2 pt no PDF. Não usar pílulas, gradientes chamativos, sombra pesada, estrelas, nem barras horizontais. Para impressão monocromática, os grupos de barra devem se diferenciar por preenchimento sólido, hachura e pontilhado — não apenas por cor.

### 4.2. Página 1 — capa de assinatura

| Zona | Altura orientativa | Conteúdo | Hierarquia |
|---|---:|---|---|
| Cabeçalho | 22 mm | slot da clínica emissora à esquerda; número do documento à direita | Clínica subordinada; documento discreto |
| Símbolo | 42 mm | ativo oficial de vidro/brilho PADAXOR | Maior objeto visual da página |
| Wordmark | 20 mm | **PADAXOR** + *Clinical Intelligent System* | Marca principal |
| Título | 25 mm | “Carta de seu protocolo de cuidado” + título real | Editorial, legível a distância |
| Identificação | 35 mm | paciente, profissional, início | Três colunas fixas |
| Progresso | 26 mm | selo radial + sessões previstas + substâncias | Selo é leitura principal |
| Rodapé | 12 mm | clínica emissora; “Tecnologia PADCON” secundária | PADCON nunca concorre com PADAXOR |

A capa não é tabela administrativa. A grade de dados existe, porém o selo radial, o símbolo e o wordmark constituem os marcos visuais. O cálculo do anel é somente `completedSessions / totalSessions`, limitado ao intervalo 0–1. Se houver mais concluídas do que previstas por dado inconsistente, limitar visualmente em 100% e registrar diagnóstico no log, sem esconder o problema.

### 4.3. Página 2 — mapa de ênfases do protocolo

A página começa com uma explicação curta: “Uma visão comparativa das ênfases registradas para cada substância do seu plano.” À esquerda fica a matriz de barras verticais com eixo Y 0–5 e no eixo X os sistemas; à direita fica uma legenda textual das substâncias, com número e padrão visual. Abaixo, uma faixa de três achados em ordem decrescente de intensidade — cada achado mostra o sistema, a substância e o score bruto.

O gráfico só deve apresentar sistemas que tenham ao menos uma pontuação positiva em uma substância. Se não houver `bodySystemEffects` em todo o protocolo, substituir por nota neutra: “Os marcadores por sistema ainda não foram cadastrados para este protocolo.” Não desenhar gráfico vazio.

### 4.4. Uma substância por folha inteira

Cada `ProtocolDocSubstance` que possua conteúdo clínico gera uma página nova. Esta regra é inegociável: usar `pdfDoc.addPage()` no início de cada dossiê e remover a lógica de continuação `(CONT.)` para esta versão. Se uma seção exceder a altura disponível, reduzir conteúdo pela regra de prioridade abaixo; **não empurrar a segunda metade para outra folha**.

| Ordem vertical | Área | Conteúdo | Regra de altura |
|---:|---|---|---|
| 1 | Cabeçalho | nome, categoria, ordem, marca PADAXOR no canto superior direito | 18 mm |
| 2 | Faixa operacional | dose, via, sessões, intervalo, frequência e tempo até efeito | 26 mm, seis células de largura fixa |
| 3 | Intenção e experiência | descrição, função principal e efeitos percebidos | 38 mm, coluna esquerda |
| 4 | Radar e medidores | radar de sistemas e medidores temáticos | 62 mm, lado a lado à direita |
| 5 | Mapa de sistemas | barras verticais do item | 38 mm, coluna esquerda |
| 6 | Composição e benefícios | uma coluna para composição/benefícios, outra para segurança/ciência | 58 mm, **duas colunas**, nunca três |
| 7 | Rodapé | clínica, paginação, tecnologia PADCON | 10 mm |

**Regra de compressão segura:** o conteúdo clínico não recebe fonte menor que 8,5 pt e os valores de prescrição não recebem fonte menor que 10 pt. Quando a composição ou os textos clínicos ultrapassarem o espaço, respeitar esta ordem: (1) permitir até três linhas por benefício; (2) transformar composição longa em lista de duas colunas; (3) mover o texto completo para um anexo clínico posterior somente se esse anexo for uma decisão explícita. Jamais cortar silenciosamente uma contraindicação ou evidência.

### 4.5. Cabeçalho e rodapé internos

Nas páginas internas, aplicar no canto superior direito: **PADAXOR** em navy e `Clinical Intelligent System` em ouro fosco. No rodapé, imprimir `Emitido por: {unit} · Tecnologia PADCON · Página N de M` em tamanho discreto. O rodapé atual usa “Instituto Padua · Paxter - desenvolvido pela Padcon”; ele deve ser substituído nesta carta. [3]

## 5. Plano de implementação no repositório real

| Onda | Arquivo | Alteração precisa | Não tocar |
|---:|---|---|---|
| 1 | `artifacts/api-server/src/routes/protocols.ts` | Ampliar o `map` de `protocolItems` no endpoint `document-pdf` com todos os campos da seção 3.2; acrescentar `totalSessions` e `completedSessions` do protocolo ao DTO. | Não modificar criação, edição ou exclusão de protocolos. |
| 1 | `artifacts/api-server/src/lib/pdf-signer.ts` | Ampliar interfaces; criar função pura de normalização de scores 0–5 e de seleção de até seis eixos para o radar. | Não mudar a assinatura de outros geradores de PDF. |
| 2 | `pdf-signer.ts` | Embutir o arquivo oficial `03-loginho-vidro-sistema.png` uma vez por documento, com fallback textual PADAXOR se a leitura falhar. | Não gerar logotipo por IA e não usar ativo de origem incerta. |
| 2 | `pdf-signer.ts` | Substituir a capa atual e `drawDocHeaderBrand`/`drawDocFooter` para a hierarquia PADAXOR → clínica → PADCON. | Não alterar o branding do RAS FAP nesta entrega. |
| 3 | `pdf-signer.ts` | Trocar `drawImpactBar` por `drawVerticalSystemMatrix`; retirar `drawStars` da capa, do mapa e da ficha do paciente. | Não apagar a função se outro documento ainda a utiliza. |
| 3 | `pdf-signer.ts` | Renderizar exatamente uma folha por substância com quatro áreas: intenção, gráficos, composição/benefícios, segurança/ciência. | Não manter o fluxo de continuação da ficha. |
| 4 | módulo puro compartilhável | Extrair rótulos e ordem de medidores para constante sem JSX ou manter cópia intencional documentada no servidor. | Não importar componente React no processo Node. |
| 4 | testes do PDF | Criar bateria de regressão do contrato e de paginação. | Não declarar o item concluído só com screenshot. |

### 5.1. Atenção ao nome de marca

No PDF de paciente do item 88, a string exibida passa a ser `PADAXOR` e a tag é `Clinical Intelligent System`. O arquivo central de marca ainda expõe `PAXTER`; para evitar uma refatoração global involuntária, criar uma constante local de apresentação do documento, documentando a transição, ou adicionar um alias **sem apagar** a constante legado até que a mudança corporativa completa seja aprovada e testada. [4]

### 5.2. Atenção ao ativo visual

O símbolo oficial está em:

```text
paxter-pack/skills/skill-layout-paxter/references/marca/03-loginho-vidro-sistema.png
```

Ele deve ser copiado para um caminho de runtime do `api-server` versionado e carregado com tratamento best-effort. A ausência do arquivo não pode impedir emissão clínica: renderizar o wordmark textual PADAXOR e emitir log estruturado `protocol_pdf_brand_asset_missing`.

## 6. Segurança, conteúdo e privacidade

O documento destina-se ao paciente, portanto a riqueza de informação não autoriza exposição operacional. Os campos `stockQuantity`, `stockUnit`, `pricePerUnit`, `unitPrice`, `lineTotal`, `codigoPadcom` e `blocoId` existem no banco, mas ficam fora da ficha de substância. [1] O total financeiro, se a clínica optar por mantê-lo, deve continuar isolado em página financeira própria e não aparecer na leitura terapêutica.

| Situação de dado | Comportamento obrigatório |
|---|---|
| Campo clínico nulo ou vazio | Omitir seu bloco inteiro; não mostrar traço como se fosse informação clínica. |
| Score textual não numérico | Normalizar com `Number`; se inválido, não plotar e registrar chave inválida. |
| Score fora de 0–5 | Limitar apenas na visualização a 0–5; registrar anomalia para correção do cadastro. |
| Sem contraindicação cadastrada | Exibir “Informação de segurança não cadastrada neste material”; **não** exibir “Sem contraindicações”. |
| `exigeValidacaoHumana === true` | Mostrar “Requer validação clínica individual” na área de segurança. |
| CPF em PDF distribuído por canal digital | Usar máscara por padrão, salvo norma interna explícita contrária. |

## 7. Bateria de aceite obrigatória

| ID | Caso determinístico | Resultado esperado |
|---|---|---|
| 88-A | Protocolo com três substâncias e todos os campos | Capa + mapa + exatamente uma ficha A4 por substância; nenhum `CONT.`. |
| 88-B | Substância com descrição, função e benefícios vazios | A ficha mantém dose e demais dados existentes; blocos clínicos vazios não aparecem. |
| 88-C | `bodySystemEffects` com seis chaves válidas e scores 0–5 | Radar com até seis eixos, matriz vertical com eixo Y fixo de 0 a 5. |
| 88-D | `categoryMeters` parcial | Exibe apenas os medidores existentes, na ordem canônica; sem espaço vazio decorativo. |
| 88-E | Composição com vírgulas, ponto e vírgula e doses | Itens separados preservando nome e dose; se parser não reconhecer, texto original permanece visível. |
| 88-F | Campo de segurança vazio | Nenhuma afirmação falsa de segurança; aparece estado neutro definido na seção 6. |
| 88-G | 0 sessões previstas | Capa exibe “A programar”; não produz `NaN`, infinito ou selo quebrado. |
| 88-H | 8 sessões concluídas de 6 previstas | Selo visual limitado a 100%; log de inconsistência emitido. |
| 88-I | PDF gerado com ativo de marca indisponível | Documento emite com wordmark textual e log best-effort; não retorna erro 500. |
| 88-J | Inspeção textual do PDF | Não contém `PAXTER`, `Estrelas`, nem “barra horizontal”; contém `PADAXOR` e crédito PADCON discreto. |
| 88-K | Prévia A4 de 4–6 substâncias | Não há corte, sobreposição, página vazia nem duas substâncias na mesma folha. |

A aprovação do item exige: teste automatizado verde, hash de commit, PDF de evidência A4 e confirmação de que a rota ainda responde aos protocolos existentes. A prévia visual do mockup já demonstrou a direção com capa, mapa, três dossiês e roteiro em seis páginas A4. [6]

## 8. Fora de escopo deliberado

Esta implementação não cria configuração de logomarca por tenant, não altera o RAS FAP, não muda o modelo de segurança clínica, não recalcula evidência científica e não executa uma substituição global de PAXTER em todos os sistemas PADCON. Esses assuntos podem ser analisados em item próprio após o PDF de protocolo estar verde.

## 9. Entrega esperada do Dr. Replit

O retorno deve conter o hash do commit, o diff dos dois arquivos centrais, a saída da bateria 88-A a 88-K e uma prévia PDF A4 de protocolo sintético com ao menos três substâncias. Se surgir campo ausente no modelo real, interromper a implementação daquele binding específico e registrar a lacuna — não preencher com texto de exemplo.

---

## Referências

[1]: https://github.com/caio-padua/Protocolo-Manager/blob/main/lib/db/src/schema/substances.ts "Schema real de substances"
[2]: https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/api-server/src/routes/protocols.ts "Rota de protocolos e montagem do PDF"
[3]: https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/api-server/src/lib/pdf-signer.ts "Gerador PDF atual"
[4]: https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/padcom/src/lib/brand.ts "Strings de marca atuais"
[5]: https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/padcom/src/pages/substances/shared.tsx "Rótulos, parser de composição e ordem de medidores"
[6]: ./validacao_layout_a4_v2.md "Evidência de validação desktop, celular e A4 do mockup"
