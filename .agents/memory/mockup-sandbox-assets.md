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
