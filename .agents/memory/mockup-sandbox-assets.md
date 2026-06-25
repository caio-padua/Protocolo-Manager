---
name: Mockup-sandbox — imagens via import, não via BASE_URL
description: Por que imagens em componentes do laboratório de mockups devem ser importadas, não montadas a partir de import.meta.env.BASE_URL
---

# Imagens em componentes do mockup-sandbox: importe o asset

Em componentes de preview do `artifacts/mockup-sandbox`, referencie imagens com
`import SYM from "../../../assets/x.png"` (Vite resolve a URL final com o base correto),
NUNCA montando o caminho à mão como `` `${import.meta.env.BASE_URL}images/x.png` ``.

**Why:** o servidor do laboratório roda com `base = "/__mockup"`. Caminhos construídos a
partir de `import.meta.env.BASE_URL` podem sair SEM a barra final (gerando
`/__mockupimages/x.png`). Esse caminho errado cai no fallback do SPA, que responde o
`index.html` com HTTP 200. O `curl` parece "200 OK", mas o `<img>` recebe HTML em vez do PNG
e renderiza o ícone de imagem quebrada. Diagnóstico enganoso: 200 no curl não prova que o
asset foi servido (pode ser o HTML do SPA). Confirme pelo `Content-Type` e tamanho.

**How to apply:** ao criar qualquer mockup que use imagem/símbolo, copie o arquivo para
`artifacts/mockup-sandbox/src/assets/` e importe-o no componente. Reserve `public/` só para
casos sem build (e mesmo assim valide o Content-Type, não só o código 200).

## Screenshot app_preview: path é relativo ao previewPath do artefato
A ferramenta de screenshot (app_preview) JÁ prefixa o previewPath do artefato. Para o mockup-sandbox
(previewPath `/__mockup`), passe `path:"/preview/<pasta>/<Componente>"` — NÃO inclua `/__mockup`.
Incluir resulta em URL duplicada `/__mockup/preview/__mockup/preview/...` → "No component found"
(falso negativo). Validação real: `curl localhost:80/__mockup/preview/<pasta>/<Comp>` deve dar 200.

## Verificar mockup: use app_preview, NÃO external_url (Firecrawl cacheia)
O screenshot `external_url` passa por serviço externo (Firecrawl) que CACHEIA a página: após editar
um componente (HMR aplicado), ele devolve o render ANTIGO, dando falso negativo ("não mudou nada").
**Why:** confiei no external_url e vi a versão velha mesmo com o arquivo já salvo e o Vite com HMR ok.
**How to apply:** para validar mockup recém-editado, use `app_preview` (artifact_dir_name=mockup-sandbox,
path=/preview/<pasta>/<Comp>) que bate direto no proxy localhost:80, sem cache externo.

## getCanvasState omite shapes quando o board está cheio (vão p/ peripheralClusters)
`getCanvasState` retorna OBJETO {focusedShapes, blurryShapes, peripheralClusters, focusedOmittedCount,
blurryOmittedCount,...}. Com muitas formas no board, shapes reais (até iframes 1280x800) podem NÃO
aparecer em focused/blurry — caem em peripheralClusters (que voltam como objetos vazios, sem coords).
Logo, "lista vazia" do read NÃO prova que a forma não existe. A prova autoritativa de existência é o
retorno de `applyCanvasActions update` (errorCode SHAPE_NOT_FOUND) ou o `presentArtifact` (status presented).
**How to apply:** para empilhar nova entrega, derive a posição do RITMO conhecido dos selos (ex.: coluna
x fixa, espaçamento y fixo entre entregas) em vez de depender do read; confirme criação pelo applied/errors.
