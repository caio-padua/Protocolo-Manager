# Carta Operacional — Item #88: Clonagem Executável da Carta de Tratamento PADAXOR

**Data:** 13 de agosto de 2026  
**Autor:** Dr. Manus — árbitro cruzado  
**Destinatários:** Dr. Replit — executor; Dr. Code — veredito técnico  
**Estado:** `AGUARDANDO EXECUÇÃO TESTADA`  
**Fonte visual aprovada:** checkpoint `8fa338ba` do projeto `protocolo-premium-mockup`  
**Escopo desta rodada:** somente o PDF emitido pelo protocolo. Não alterar `area.tsx`, banco, endpoints, assinatura digital, Drive, e-mail ou RAS/FAP neste commit.

> **Ordem inequívoca:** a tarefa não é “melhorar um PDF”. É substituir a composição atual de `generateProtocolDocumentPdf()` por uma **Carta de Tratamento Premium PADAXOR**, preservando o mesmo payload, a emissão atual e a assinatura ICP-Brasil. A fonte de verdade visual é o checkpoint acima; esta carta é a tradução executável dele.

## 1. Diagnóstico: por que ainda não houve uma entrega demonstrável

O código real já contém o motor adequado: `pdf-lib`, `QRCode`, assinatura PAdES, quebra de páginas e os dados clínicos chegam completos ao gerador. O problema não é falta de ferramenta. O PDF atual ainda está organizado como capa administrativa em verde-petróleo, tabela de benefícios com estrelas, radar global e fichas que podem quebrar em páginas de continuação. Isso é tecnicamente funcional, mas não implementa a direção aprovada: **PADAXOR navy/ouro/marfim, uma substância por folha, duas colunas estáveis, gráficos grandes e hierarquia de carta clínica**.[1]

A primeira instrução de 12/08 falava em duas fichas por A4 e em uma tela da Área do Paciente; as instruções aprovadas depois substituíram isso por **uma ficha principal por A4 no gerador PDF**. Esta carta elimina a ambiguidade: o alvo é o método `generateProtocolDocumentPdf()` em `artifacts/api-server/src/lib/pdf-signer.ts`; `routes/protocols.ts` só recebe o complemento de bindings já existentes. A auditoria rastreável da lacuna está em `auditoria_lacuna_execucao_item_88.md`.

| Decisão que vale nesta rodada | Não fazer nesta rodada |
|---|---|
| Uma substância por folha principal A4, com página de continuação somente quando segurança ou ciência excederem o limite. | Duas substâncias comprimidas na mesma folha. |
| PADAXOR é a identidade principal; clínica emissora é variável e subordinada; PADCON é proveniência técnica discreta no rodapé. | Retomar a capa dominada por Instituto Pádua, PAXTER antigo ou PADCON. |
| Barras **verticais** e radar grandes, lado a lado. | Reutilizar `drawImpactBar()` horizontal ou o quadro de estrelas. |
| Duas colunas para textos clínicos longos, com altura coordenada. | Três colunas, cards equivalentes em excesso ou informações flutuando. |
| Dados do payload real ou ausência explícita. | Texto clínico inventado, inferido ou gerado automaticamente. |

## 2. Arquivos que serão alterados — e somente eles

| Ordem | Arquivo | Alteração obrigatória | Ferramenta já disponível |
|---:|---|---|---|
| A1 | `artifacts/api-server/package.json` | Adicionar `@pdf-lib/fontkit`. | `pnpm --filter @workspace/api-server add @pdf-lib/fontkit` |
| A2 | `artifacts/api-server/assets/fonts/` | Incluir `CormorantGaramond[wght].ttf` e `Manrope[wght].ttf`. | `curl -L` apenas dos repositórios oficiais de fontes; Git mantém os binários. |
| A3 | `artifacts/api-server/assets/brand/03-loginho-vidro-sistema.png` | Copiar o símbolo oficial existente do pacote Paxter. Não redesenhar, não usar ícone substituto. | `cp paxter-pack/skills/skill-layout-paxter/references/marca/03-loginho-vidro-sistema.png ...` |
| A4 | `artifacts/api-server/build.mjs` | A ação já copia `assets/` para `dist/assets/` (linhas 131–134). Apenas garantir que não seja removida; não criar novo mecanismo de storage. | build existente com `fs/promises.cp`. |
| A5 | `artifacts/api-server/src/routes/protocols.ts` | Projetar `composicao` e `posologia` que já existem no cadastro para o DTO do PDF. Não tocar no schema. | Drizzle + mapeamento já existente. |
| A6 | `artifacts/api-server/src/lib/pdf-signer.ts` | Extrair helpers e substituir somente a composição de `generateProtocolDocumentPdf()`. Preservar `embedPadesSignature()` e o retorno `{ pdfBytes, certInfo }`. | `pdf-lib`, `QRCode`, `fs`, `path` já existentes. |
| A7 | `artifacts/api-server/src/lib/__tests__/protocol-premium-pdf.test.ts` | Criar bateria determinística da carta. | `vitest`, `pdf-lib`. |

> **Não existe migração nesta rodada.** `composicao` e `posologia` já estão em `PATCHABLE_FIELDS` do cadastro de substâncias, mas ainda não percorrem o DTO do documento.[2] A única fiação adicional é projetá-los em memória no endpoint existente.

## 3. Comandos da primeira sequência — executar nesta ordem

```bash
cd /home/ubuntu/Protocolo-Manager
git pull --ff-only
pnpm --filter @workspace/api-server add @pdf-lib/fontkit

mkdir -p artifacts/api-server/assets/{fonts,brand}
cp paxter-pack/skills/skill-layout-paxter/references/marca/03-loginho-vidro-sistema.png \
  artifacts/api-server/assets/brand/03-loginho-vidro-sistema.png
curl -L "https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf" \
  -o artifacts/api-server/assets/fonts/CormorantGaramond-wght.ttf
curl -L "https://github.com/google/fonts/raw/main/ofl/manrope/Manrope%5Bwght%5D.ttf" \
  -o artifacts/api-server/assets/fonts/Manrope-wght.ttf

pnpm --filter @workspace/api-server typecheck
```

Se o `typecheck` falhar por tipo de `fontkit`, corrigir o import, **não** trocar a fonte final por Helvetica. O fallback Times/Helvetica só pode existir se a emissão estiver em contingência explícita e a falha for registrada; não é uma “entrega premium”.

## 4. Fundação do gerador — código e ferramentas que o Dr. Replit deve usar

### 4.1. Criar a família tipográfica incorporada

No topo de `pdf-signer.ts`, manter `PDFDocument`, `PDFPage`, `rgb`, `fs` e `path`; adicionar `import fontkit from "@pdf-lib/fontkit"`. Imediatamente antes de compor a carta, registrar e incorporar os arquivos empacotados.

```ts
type PremiumFonts = {
  sans: PDFFont;       // Manrope 400
  sansSemi: PDFFont;   // Manrope 600
  serif: PDFFont;      // Cormorant Garamond 500
  serifBold: PDFFont;  // Cormorant Garamond 700
};

async function loadPremiumFonts(pdfDoc: PDFDocument): Promise<PremiumFonts> {
  pdfDoc.registerFontkit(fontkit);
  const asset = (file: string) => fs.readFileSync(path.join(__dirname, "assets", "fonts", file));
  return {
    sans: await pdfDoc.embedFont(asset("Manrope-wght.ttf"), { subset: true }),
    sansSemi: await pdfDoc.embedFont(asset("Manrope-wght.ttf"), { subset: true }),
    serif: await pdfDoc.embedFont(asset("CormorantGaramond-wght.ttf"), { subset: true }),
    serifBold: await pdfDoc.embedFont(asset("CormorantGaramond-wght.ttf"), { subset: true }),
  };
}
```

O executor pode criar uma função `embedVariableFont(bytes, weight)` mais precisa se usar variação; o contrato visual é inegociável: **Cormorant Garamond em títulos e Manrope em leitura funcional**. Não usar Inter, fonte padrão de navegador, fonte de UI do dashboard nem texto desenhado como imagem.

### 4.2. Carregar o símbolo oficial sem fragilidade de deploy

`build.mjs` já copia `artifacts/api-server/assets/` para `dist/assets/`. Portanto, o helper deve ler sempre `path.join(__dirname, "assets", "brand", "03-loginho-vidro-sistema.png")`, envolver a leitura em `try/catch` e devolver `null` se o ativo não existir. Nesta situação, a capa ainda sai com o wordmark tipográfico; ela nunca falha ou emite um ícone falso.

```ts
async function embedPadaxorSymbol(pdfDoc: PDFDocument) {
  try {
    const bytes = fs.readFileSync(path.join(__dirname, "assets", "brand", "03-loginho-vidro-sistema.png"));
    return await pdfDoc.embedPng(bytes);
  } catch (error) {
    console.warn({ error }, "padaxor_symbol_unavailable");
    return null;
  }
}
```

### 4.3. Tokens: substituir a paleta, não misturá-la

Apagar o uso visual de `PETROL`, `COVER_BG`, `CYAN`, `STAR_FILL` e `STAR_EMPTY` **dentro da carta premium**. Eles podem continuar no RAS/FAP. Criar estes tokens locais ao documento:

| Token | Valor RGB de `pdf-lib` | Uso |
|---|---|---|
| `NAVY` | `rgb(22/255, 40/255, 74/255)` | Capa, títulos, contornos principais, assinatura interna. |
| `GOLD` | `rgb(154/255, 123/255, 50/255)` | Linhas de 0,75 pt, pontos de dado, destaque de sessão e selo. |
| `IVORY` | `rgb(250/255, 248/255, 243/255)` | Fundo de páginas internas e campos de respiro. |
| `INK` | `rgb(31/255, 39/255, 52/255)` | Corpo de texto, contraste para P&B. |
| `MIST` | `rgb(224/255, 218/255, 205/255)` | Divisores, trilhos e zonas secundárias. |
| `STATUS_CYAN` | `rgb(51/255, 135/255, 157/255)` | Só estado operacional confirmado; nunca cor decorativa. |

## 5. Geometria que deve ser clonada — nenhuma decisão fica subjetiva

O motor usa A4 `595,28 × 841,89 pt`. Manter `MARGIN = 50 pt` (17,64 mm), logo área útil horizontal de `495,28 pt` (174,72 mm). Reservar `40 pt` para o rodapé e não desenhar conteúdo clínico abaixo de `y = 62 pt`.

| Elemento | Caixa de desenho em pt (x, y, largura, altura) | Tipografia e regra |
|---|---|---|
| Cabeçalho interno | `(50, 775, 495, 36)` | Linha superior ouro 0,75 pt; wordmark `PADAXOR` em Manrope semibold 9 pt, canto superior direito; `Clinical Intelligent System` 5,8 pt abaixo. |
| Faixa hero da substância | `(50, 703, 495, 58)` | Nome em Cormorant 27 pt; via em Manrope 8 pt; número da ficha `03 / 05` 7 pt; sem caixas arredondadas. |
| Faixa de prescrição | `(50, 626, 495, 58)` | Dois campos estáveis de 240 pt: esquerda `Dose + Via + Sessões`; direita `Intervalo + Tempo até efeito`; label 6,5 pt e valor 12 pt. |
| Mapa de sistemas | `(50, 363, 235, 238)` | Seis barras **verticais** máximo; título 8 pt; escala Y `0–5`; rótulo gira apenas se exceder 11 caracteres. |
| Radar da substância | `(310, 363, 235, 238)` | Raio `72 pt`, sete eixos no máximo; legenda `apoio/foco/foco principal`; não indica garantia de resultado. |
| Textos clínicos, coluna esquerda | `(50, 102, 235, 237)` | `Composição e função` no alto; `Segurança` abaixo; título 8 pt; corpo 8,8 pt com leading 12 pt. |
| Textos clínicos, coluna direita | `(310, 102, 235, 237)` | `Benefícios cadastrados` no alto; `Ciência` abaixo; mesmas métricas e linhas de base da coluna esquerda. |
| Rodapé | `(50, 22, 495, 22)` | `Emitido por: {unit} · PADAXOR Clinical Intelligent System · Tecnologia PADCON · Página N de M`; Manrope 5,8 pt. |

> **Regra de leitura TDAH-friendly:** o eixo esquerdo nunca muda de lugar; o mapa está sempre à esquerda, o radar sempre à direita, textos de composição/segurança ficam sempre à esquerda, benefícios/ciência sempre à direita. Não mover nenhum bloco “para preencher buraco”. Um dado ausente preserva a caixa e recebe a expressão `Não cadastrado para esta substância`.

## 6. Páginas que serão desenhadas, em ordem rígida

### Página 1 — Capa de assinatura

1. Desenhar `NAVY` em toda a página.
2. No canto superior esquerdo, desenhar uma caixa de clínica emissora `170 × 42 pt`: texto variável `data.unit`, com fallback `CLÍNICA EMISSORA`; não embutir logotipo de uma clínica específica.
3. Centralizar o PNG oficial a `160 × 160 pt`, com centro aproximado em `(297, 575)`. Não aplicar sombra programática, filtro ou brilho adicional: o próprio ativo contém vidro/brilho.
4. Centralizar `PADAXOR` em Manrope semibold 42 pt e `Clinical Intelligent System` em Manrope 10 pt abaixo. PADAXOR é maior que o nome da clínica.
5. Usar Cormorant Garamond 28 pt para `Carta de Tratamento` e Cormorant 20 pt para `data.protocolTitle`.
6. Desenhar abaixo um **selo radial de acompanhamento**: círculo ouro de raio 44 pt, sessões concluídas no centro, `concluídas / previstas` em Manrope 8 pt. Usar `data.sessions.filter(s => s.status === "completed" || s.status === "done")` e `data.sessions.length`. Se nenhum status estiver concluído, mostrar `0 / total`; não inventar progresso.
7. No rodapé: paciente, profissional, início e versão de emissão. O CPF e o e-mail não são elementos hero; se a política exigir identificação, usar somente CPF mascarado `***.***.***-XX` e e-mail mascarado.
8. PADCON só aparece em 6 pt no rodapé como `Tecnologia PADCON`. Não repetir em títulos.

### Página 2 — Sumário clínico de varredura

1. Fundo `IVORY`, cabeçalho interno e título `Leitura do seu plano` em Cormorant 25 pt.
2. Na esquerda, usar o mapa vertical consolidado dos sistemas com maior impacto entre as substâncias. Reutilizar `bodySystemEffects`, aplicar `impactNum()` e reter apenas os seis maiores valores positivos.
3. Na direita, usar o radar consolidado atual, porém com `radius = 98 pt`, rótulos 7 pt e o disclaimer sob o gráfico. O radar expressa prioridade de composição do protocolo, não probabilidade de benefício.
4. Abaixo, quatro campos em duas colunas: `Início`, `Término` (ou `A definir`), `Sessões previstas`, `Substâncias do plano`. Não usar a matriz antiga de estrelas nem tabela com 9 dimensões.

### Páginas 3..N — Uma ficha por substância

Para **cada** item de `data.substances`, chamar `drawSubstancePremiumPage(pdfDoc, context, sub, index, total)`. A função adiciona uma página própria antes de desenhar; nunca reutiliza o cursor da substância anterior. O conteúdo clínico inclui os campos abaixo.

| Zona visual | Campo real já entregue | Apresentação e ausência |
|---|---|---|
| Título | `name` | Nome em 27 pt; obrigatório. |
| Prescrição | `dose`, `procedureType`, `totalSessions`, `intervalDays`, `timeToEffect` | Duas colunas de leitura; `timeToEffect` ausente vira `Conforme avaliação profissional`. |
| Composição | `composicao` **após A5**, `description`, `categoryType` | Prioridade: composição, depois descrição, depois categoria; nenhuma concatenação de texto inventado. |
| Função | `mainFunction` | Corpo da coluna esquerda; se ausente, aviso de cadastro. |
| Benefícios cadastrados | `longevityBenefit`, `qualityOfLifeImpact`, `sleepBenefit`, `energyBenefit`, `libidoBenefit`, `physicalPerformance`, `muscleStrength`, `mentalClarity`, `skinHairNails`, `immuneSupport`, `perceivedEffects` | Listar até cinco itens não vazios com marcador quadrado ouro 3 pt. Não usar estrelas. |
| Mapa de sistemas | `bodySystemEffects` | Barras verticais 0–5; selecionar os seis maiores valores; manter ordem decrescente e eixo fixo. |
| Radar | `bodySystemEffects` + dimensões de benefício já existentes | Derivar por substância, não pelo conjunto inteiro. Valor é foco visual, não eficácia. |
| Segurança | `contraindications` | Texto integral; não truncar; se exceder a zona, criar `Ficha de segurança — {name}` em nova página. |
| Ciência | `scientificEvidence` | Texto integral; não fazer claim adicional; overflow gera `Ficha de ciência — {name}`. |
| Posologia | `posologia` **após A5** | Se houver, entra em `Prescrição complementar` na página de continuação; nunca compactar a capa. |

### Páginas finais — agenda, financeiro e termos

Não redesenhar estes dados nesta rodada. Mantê-los depois das fichas, preservando a assinatura e o texto legal já implementados. Somente aplicar `drawDocHeaderBrand()` e `drawDocFooter()` com as novas strings PADAXOR/PADCON em todas as páginas internas. O QR atual fica no rodapé apenas se a URL for institucional e autenticada; não criar QR para dados clínicos, CPF ou rota administrativa.

## 7. Helpers obrigatórios no `pdf-signer.ts`

| Helper a criar ou substituir | Entrada | Saída verificável | Não fazer |
|---|---|---|---|
| `drawPremiumCover()` | `data`, fontes, símbolo | Uma página navy, clínica subordinada, símbolo e selo radial. | Reusar `coverFields` em lista administrativa. |
| `drawDocHeaderBrand()` | página, fontes | Wordmark `PADAXOR` fixo no topo direito de toda página interna. | Exibir PAXTER antigo. |
| `drawDocFooter()` | página, fontes, número, total, clínica | Rodapé discreto com PADCON como proveniência. | Inserir QR sensível ou texto acima de 6 pt. |
| `drawVerticalSystemMap()` | `bodySystemEffects`, retângulo | Até seis barras verticais, eixo 0–5 e rótulos legíveis. | Chamar `drawImpactBar()` horizontal. |
| `deriveRadarDimensionsForSubstance()` | um `ProtocolDocSubstance` | Sete dimensões no máximo, escala 0–3. | Usar o array inteiro do protocolo na ficha individual. |
| `drawSubstancePremiumPage()` | substância, índice, total | Uma página principal determinística. | Vazar o cursor da substância para a próxima. |
| `drawOverflowPage()` | título, texto, tipo | Página interna com header/footer e texto integral. | Truncar contraindicação, ciência ou nota de segurança. |
| `maskCpf()` / `maskEmail()` | dados pessoais | Dados minimizados na capa. | Exibir CPF/e-mail integrais como elemento visual. |

## 8. Binding mínimo que precisa entrar em `routes/protocols.ts`

Na construção atual do objeto `substances` (linhas 285–315), adicionar apenas estas duas projeções, entre `categoryType` e `unitPrice`:

```ts
composicao: sub?.composicao ?? undefined,
posologia: sub?.posologia ?? undefined,
```

Em `ProtocolDocSubstance`, adicionar as duas propriedades opcionais. Não criar tabela, coluna, endpoint ou chamada assíncrona adicional. Todos os outros bindings exigidos pela carta já existem no mapper atual.[3]

## 9. Conteúdo variável: regras que impedem um PDF bonito de se tornar perigoso

| Situação | Comportamento obrigatório | Motivo |
|---|---|---|
| Campo curto vazio | Reservar a zona e escrever `Não cadastrado para esta substância`. | A grelha permanece estável e o médico identifica lacuna de cadastro. |
| Benefícios em excesso | Mostrar até cinco na ficha; os restantes seguem para `Benefícios complementares` na continuação. | Não reduzir tipografia nem criar terceira coluna. |
| `contraindications`, `scientificEvidence`, `composicao` ou `posologia` excedem 420 caracteres | Criar página de continuação com mesmo header/footer e título explícito. | Segurança e ciência não podem ser truncadas. |
| Mais de seis sistemas | Selecionar seis maiores, informar `+N sistemas cadastrados` no rodapé do gráfico. | Mantém legibilidade do eixo cartesiano. |
| Menos de três eixos disponíveis | Mostrar estado vazio do radar, não desenhar polígono enganoso. | Não cria falsa precisão. |
| Protocolo com 0 substâncias | Emitir capa e página `Plano sem substâncias cadastradas`; não lançar erro de renderização. | Fail-safe administrativo. |
| Falha de símbolo/QR | Logar aviso e continuar sem o ativo. | Documento clínico não pode deixar de ser emitido por branding. |

## 10. Bateria de aceite — nenhuma etapa fecha com “parece bonito”

| Código | Dado de entrada | Asserção mecânica ou visual | Evidência que o Dr. Replit entrega |
|---|---|---|---|
| 88-A | 1 substância com todos os campos | PDF contém capa, sumário e exatamente uma ficha principal para a substância. | Teste Vitest + PDF. |
| 88-B | 6 substâncias | Cada nome inicia uma página própria; nenhuma segunda ficha inicia na mesma página. | PDF A4 renderizado. |
| 88-C | 8 sistemas com valores 0–5 | Mapa mostra seis barras verticais, escala Y e `+2 sistemas cadastrados`. | Imagem da página. |
| 88-D | 2 sistemas e 1 benefício | Radar não desenha polígono fictício; mostra estado vazio explicado. | Teste + imagem. |
| 88-E | Contraindicação com 800 caracteres | Texto integral em continuação, sem corte e com cabeçalho PADAXOR. | Extração de texto do PDF. |
| 88-F | Todos os textos opcionais nulos | As zonas permanecem na grelha e exibem ausência explícita; geração não lança. | Teste. |
| 88-G | CPF/e-mail reais | Capa contém valores mascarados; o PDF não expõe os valores integrais na capa. | Teste de texto. |
| 88-H | 0/5 sessões concluídas | Selo usa `0/5`; nunca mostra 5/5 por inferência. | Teste. |
| 88-I | Status de três sessões concluídas de cinco | Selo mostra `3/5`. | Teste. |
| 88-J | Impressão em escala de cinza | Navy, ouro e texto preservam contraste e rótulos continuam compreensíveis sem cor. | Screenshot/print preview P&B. |
| 88-K | Documento final | `pnpm --filter @workspace/api-server typecheck` e `test` verdes; assinatura e upload ao Drive continuam no fluxo. | Saída literal dos comandos + hash. |

## 11. Divisão de trabalho e checkpoints antiambiguidade

| Checkpoint | Dono | Entrega atômica | Comando/prova | Ainda não pode fazer |
|---|---|---|---|---|
| **A — Fundação** | Dr. Replit | Fontkit, fontes, ativo, tokens e helpers sem mudar páginas. | `typecheck` verde + prova que `dist/assets` contém três ativos. | Mexer no endpoint, paginação ou assinatura. |
| **B — Capa e identidade** | Dr. Replit | `drawPremiumCover`, header/footer PADAXOR. | PDF de fixture com capa e 1 página interna. | Alterar conteúdo clínico. |
| **C — Ficha principal** | Dr. Replit | Barras verticais, radar individual, duas colunas, uma substância/página. | 88-A, B, C, D, F, H, I. | Compactar overflow ou esconder ausências. |
| **D — Segurança e regressão** | Dr. Replit | Overflow, bindings `composicao/posologia`, testes, assinatura e fluxo. | 88-E, G, J, K + hash. | Marcar #88 como concluído. |
| **Veredito** | Dr. Code + Dr. Manus | Revisar diff e todas as provas. | Parecer na planilha/Slack. | Aprovar por screenshot isolado. |

## 12. Linhas vermelhas — falha automática de aceite

Uma entrega é devolvida sem debate se qualquer uma destas condições ocorrer: uso de PAXTER em vez de PADAXOR no documento premium; substituição do símbolo oficial; fonte Helvetica/Times como versão final; barra horizontal; estrela de eficácia; duas fichas comprimidas na mesma A4; texto clínico truncado; dado médico inventado; QR com informação clínica em URL; novo schema/migração; alteração de fluxo de assinatura; falta de hash e PDF de evidência.

## 13. Mensagem final que o Dr. Replit deve devolver ao canal

```text
ITEM #88 — CHECKPOINT {A|B|C|D}
Commit: {hash}
Arquivos: {lista exata}
Ferramentas: {pdf-lib / fontkit / ativos}
Provas: {comandos e resultado}
PDF de evidencia: {nome/caminho}
Pendencias: {nenhuma ou lista objetiva}
Pedido ao Dr. Code: {veredito especifico}
```

> **Resumo em uma linha:** Dr. Replit deve construir o PDF premium no motor já existente, em quatro checkpoints com prova, sem criar infraestrutura nova, sem alterar regras clínicas e sem considerar o item #88 concluído antes de hash + testes + PDF A4 revisado.

## Referências

[1]: https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/api-server/src/lib/pdf-signer.ts "Gerador PDF real: motor, capa, radar, fichas e assinatura"
[2]: https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/api-server/src/routes/substances.ts "Campos editáveis do cadastro de substâncias"
[3]: https://github.com/caio-padua/Protocolo-Manager/blob/main/artifacts/api-server/src/routes/protocols.ts "Projeção real de dados do protocolo para o PDF"
