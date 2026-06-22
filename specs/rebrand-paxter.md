# Spec — Retificação de marca PAXTER em todas as telas e documentos

## Objetivo (uma frase)
Substituir a marca antiga "Padcon Conect / PADCON / PAWARDS" pela identidade **PAXTER** (sistema clínico) em TODAS as telas e documentos do app `artifacts/padcom` + `artifacts/api-server`, com o símbolo dourado em harmonia visual por fundo, logos clicáveis nas áreas de cliente, e a assinatura "desenvolvido pela PADCON" + QR code nos documentos emitidos.

## Modelo de marca (fonte da verdade — confirmado nos documentos do próprio sistema)
| Entidade | O que é | Onde aparece | Texto canônico |
|---|---|---|---|
| PAXTER | O sistema clínico (produto comercial) | Quase todas as telas (ao menos o símbolo) e topo dos documentos | Wordmark "PAXTER" + símbolo (paxter-symbol.png). Tagline EN: "Clinical Intelligence" |
| PADCON · Advanced Systems Architecture | A empresa que DESENVOLVE o Paxter | Rodapés de telas de cliente e documentos emitidos | "Desenvolvido pela PADCON" / "PADCON · Advanced Systems Architecture" |
| Instituto Pádua | A clínica que opera | Documentos clínicos/jurídicos (cabeçalho da clínica) | "Instituto Pádua" (substitui "Clínica Padua") |

Regras de bom senso (decisão do CEO 22/06/2026, delegada ao agente):
1. Internamente (telas de equipe/admin) NÃO precisa da frase/tagline — basta o símbolo + wordmark "PAXTER".
2. A frase "desenvolvido pela PADCON" entra em: telas voltadas ao cliente (rodapé) e documentos emitidos.
3. O símbolo deve estar em harmonia visual; em fundo claro o dourado some — usar tratamento de medalhão (ver Requisito 2).
4. Em telas de interação com o cliente o logo é CLICÁVEL (data-bind pronto p/ abrir o site da Paxter quando existir).
5. Documentos emitidos (RAS, RAS FAP, prescrição, evento Google) ganham assinatura PAXTER + PADCON; alguns ganham QR code pequeno apontando ao site da Paxter.

## Requisitos exatos

### R1 — Componente central de marca (PaxterLogo)
1.1 Criar componente único `PaxterLogo` (substitui `PadconLogo`) reutilizado em todo o app.
1.2 Props: `size` (sm|md|lg), `showText` (bool), `tone` ("dark" p/ fundo escuro | "light" p/ fundo claro), `href` (string opcional — quando presente, o logo vira link clicável que abre o site da Paxter em nova aba).
1.3 Render: símbolo (paxter-symbol.png) + wordmark "PAXTER" + subtítulo opcional "Motor Clínico · Protocolos Injetáveis".
1.4 Fonte única do site: constante `PAXTER_SITE_URL` num único arquivo (`lib/brand.ts`), com valor placeholder e comentário — trocar 1 linha quando o site existir.

### R2 — Harmonia do símbolo por fundo (medalhão)
2.1 Em fundo ESCURO (splash, sidebar): símbolo dourado direto, com glow (como já está na /entrada).
2.2 Em fundo CLARO (telas internas e cabeçalho de documentos): símbolo dourado sobre um MEDALHÃO navy (quadrado arredondado 6–8px, gradiente navy + anel dourado fino) para o dourado saltar — padrão de luxo, não dourado solto apagado.
2.3 Cantos quadrados (6–8px) conforme skill-layout-paxter; nada de pílula.

### R3 — Sidebar / Layout (telas internas)
3.1 `Layout.tsx` usa `PaxterLogo` (tone dark, sidebar navy) no lugar do `PadconLogo`, mantendo "Motor Clínico · Protocolos Injetáveis".

### R4 — Dashboard
4.1 Subtítulo "Visão geral operacional — Padcon Conect" → "— Paxter".

### R5 — Telas de cliente (logo CLICÁVEL + rodapé Padcon)
Aplicar PaxterLogo (tone light, medalhão, `href`) no cabeçalho e rodapé com "desenvolvido pela PADCON":
5.1 `area.tsx` — header logado (badge "P" → símbolo Paxter), header de login ("PADCON CONECT" → "PAXTER · ÁREA DO PACIENTE"), rodapé "Clínica Padua — Padcon Conect" → "Instituto Pádua · Paxter — desenvolvido pela Padcon".
5.2 `portal.tsx` — "PADCON CONECT" (título) + rodapé.
5.3 `anamnese.tsx` e `anamnese-v2/revisao.tsx` e `mega-anamnese` — título "PADCON CONECT" + rodapé.
5.4 `abertura.tsx` (site institucional) — todos os wordmarks "Padcon Conect" → "PAXTER"; rodapé "desenvolvido pela PADCON"; links de marca clicáveis.

### R6 — Documentos emitidos (api-server) — PAXTER + PADCON + QR
6.1 `ras.ts` (HTML e-mail/modelo): "PAWARDS · Clinical Intelligence System" → "PAXTER · Clinical Intelligence"; manter "PADCON · Advanced Systems Architecture"; "Padcon Conect" → "Paxter"; "Clínica Padua" → "Instituto Pádua".
6.2 `ras-fap.ts` (PDF paisagem): wordmark de marca "PAWARDS" → "PAXTER" (mantendo "PADCON" ao lado); taglines EN preservadas; rodapé "PADCON · ADVANCED SYSTEMS ARCHITECTURE" mantido.
6.3 `prescricao/index.tsx` (print): wordmark "Padcon Conect" → "PAXTER" + assinatura "desenvolvido pela PADCON".
6.4 `google-calendar.ts`: "Developed by: Pawards MedCore" → "Developed by: Padcon · Paxter".
6.5 QR code: gerar QR pequeno apontando `PAXTER_SITE_URL` no RODAPÉ do RAS e do RAS FAP (documentos que circulam com médicos/farmácias). Usar lib `qrcode` (gerar dataURL/buffer). NÃO mexer no motor de grade do RAS FAP nem no payload — só acrescentar o selo no rodapé.

### R7 — Identidade do app (metadados)
7.1 `index.html`: `<title>` "PADCOM — Protocolos Injetáveis" → "PAXTER — Protocolos Injetáveis"; `apple-mobile-web-app-title` "Padcon Conect" → "Paxter".
7.2 `manifest.webmanifest`: `name`/`short_name` → "Paxter" (mantém cores navy já ajustadas).
7.3 NÃO renomear chaves internas técnicas (`padcom_collab_token`, classes CSS `.paxter-*`, rota `/pawards` de demo, nomes de pacote `@workspace/padcom`) — são identificadores técnicos, não marca visível. (Linha vermelha.)

## Casos extremos a tratar
- Dourado apagado em fundo claro → medalhão navy (R2).
- Logo clicável sem site ainda → `PAXTER_SITE_URL` placeholder + abre em nova aba; nunca quebrar navegação interna.
- QR: se a lib falhar, documento ainda é gerado SEM QR (best-effort, nunca derrubar a emissão).
- Telas que herdam do componente central não devem ter wordmark hardcoded duplicado.
- Paridade celular x desktop (skill-layout-paxter `revisao-final.md`).

## Definição de PRONTO
| Critério | Como conferir |
|---|---|
| Nenhuma tela mostra "Padcon Conect/PADCON/PAWARDS" como marca do PRODUTO | grep + varredura visual tela a tela |
| Símbolo Paxter presente e legível (medalhão em fundo claro) | screenshot mobile+desktop de cada tela tocada |
| Logos de cliente clicáveis (data-bind pronto) | inspeção do href/handler |
| Documentos com PAXTER + "desenvolvido pela PADCON"; RAS/RAS FAP com QR | gerar documento e conferir |
| App title/manifest = Paxter | view-source / DevTools |
| Aprovação do architect requisito por requisito | Fase 3 do loop |
| Comunicação final ao CEO em Densidade B | replit.md Art.37-51 |

## Linhas vermelhas (não cruzar)
- NÃO alterar o motor de grade do RAS FAP (`ras-fap.ts`) nem `/api/budgets/calculate` nem payloads — só apresentação/selo.
- NÃO renomear identificadores técnicos (tokens de storage, classes `.paxter-*`, pacote `@workspace/padcom`, rota `/pawards`).
- NÃO remover relevo 3D nem cantos quadrados (skill-layout-paxter).
- Instituto Pádua (clínica) ≠ Padcon (empresa) ≠ Paxter (sistema) — nunca trocar os papéis.

## Ondas de execução
1. Onda 1 — Núcleo: `lib/brand.ts` + `PaxterLogo` + medalhão + sidebar + dashboard + metadados (title/manifest).
2. Onda 2 — Telas de cliente: area, portal, anamnese(s), abertura (logo clicável + rodapé Padcon).
3. Onda 3 — Documentos: ras.ts, ras-fap.ts, prescricao, google-calendar + QR code.
4. Onda 4 — Varredura final tela a tela (médico/paciente), screenshots, architect, correções.
