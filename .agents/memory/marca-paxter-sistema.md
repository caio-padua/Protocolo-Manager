---
name: Marca PAXTER e o sistema; clinica so no receituario
description: Quem aparece no topo das telas (sistema vs clinica) e regra para nao clonar referencias de marca erradas
---

# PAXTER = o sistema; Instituto Padua = so receituario

Regra de marca (decisao do CEO Dr. Caio, reafirmada em 24/06/2026):

- **PAXTER** e o NOME DO SISTEMA (produto comercial). Aparece no topo de TODAS as telas do
  sistema, INCLUSIVE as telas voltadas ao cliente/paciente (marcacao, portal, area). Motivo do CEO:
  "a clinica CONTRATOU o sistema" — nao se coloca o nome da clinica dentro do sistema.
- **PADCON** = empresa que desenvolve o Paxter (assinatura discreta, rodape).
- **Instituto Padua** = a clinica que opera. Aparece SOMENTE nos receituarios. Nao colocar o nome da
  clinica no cabecalho de telas do sistema.

**Why:** errei duas vezes propondo "Instituto Padua" no topo da tela de marcacao; o CEO corrigiu com
irritacao por repeticao. brand.ts ja documenta isso (PAXTER=produto, Instituto Padua=clinica que opera),
mas a leitura certa e: tela = sistema = PAXTER; clinica so no receituario.

**How to apply:** ao construir/redesenhar qualquer tela do app, manter PAXTER no cabecalho. So usar
"Instituto Padua" em documento de receituario. Nunca sugerir trocar o cabecalho por marca de clinica.

## Formato/layout do nome (vetor, nao fonte)
O nome PAXTER na logo deve ser VETOR (SVG paths derivado da imagem de referencia), nunca `<h1>PAXTER</h1>`
nem fonte tipo Cinzel imitando. Fonte oficial de marca do app: `artifacts/padcom/src/lib/brand.ts`
(strings) + componente vetor `artifacts/padcom/src/components/branding/PaxterLogo.tsx`. Specs do CEO:
attached_assets "INSTRUCAO TECNICA ... VETORIZACAO DA LOGO PAXTER".

## Anti-contaminacao de mockups
O mockup-sandbox acumulou muitas copias de cabecalho com formato de nome errado (navy/ouro frio,
`<h1>PAXTER</h1>`, tagline EN "Clinical Intelligence System"). Eu clonava sempre a errada
(marcacao/MarcarConsulta.tsx). Em 24/06/2026 apaguei o lixo de rascunho: pastas marcacao/, agendar-paxter/,
paxter-nome/, paxter-fx/, tagline-sidebar/, _hist_* e arquivos soltos HistClara_*/HistEscura_*.
Sandbox carrega componente sob demanda (App.tsx le um map por path) — apagar pasta nao quebra build,
so some do preview. Antes de clonar um cabecalho como referencia, conferir se nao e formato velho/errado.

## Tagline (pendente)
CEO disse que "Clinical Intelligence System" tambem nao e a frase certa, mas ainda NAO ditou a correta.
brand.ts tem taglineEn="Clinical Intelligence System" e subtitulo PT="Motor Clinico · Protocolos Injetaveis".
Nao trocar/ apagar a tagline em producao sem o CEO ditar a frase certa.
