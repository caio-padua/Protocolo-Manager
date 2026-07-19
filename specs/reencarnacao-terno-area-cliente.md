# Spec: Reencarnação Terno — Área do Cliente

**Data:** 19/07/2026
**Arquivo-alvo:** `artifacts/padcom/src/pages/area.tsx`, `artifacts/padcom/src/index.css`, `artifacts/padcom/public/sw.js`

---

## Objetivo

Restaurar a identidade visual "terno" na tela `/area` do Padcon Conect — tecido claro no modo claro,
azul marinho risca de giz no modo escuro — com assinatura de rodapé PAXTER (esq) + PADCON (dir).
Corrigir o service worker para forçar atualização de cache. Parxis-site intocado.

---

## Requisitos

### R1 — CSS `.leva-fabric` no `artifacts/padcom/src/index.css`

Adicionar a classe `.leva-fabric` e suas variantes dark ao final do arquivo `index.css`.
Código exato copiado do sandbox `_group.css` linhas 247–266:

```css
/* ===== TECIDO TERNO (fundo da Área do Cliente) ===== */
.leva-fabric {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background-image:
    repeating-linear-gradient(90deg, rgba(138,109,47,0.10) 0px, rgba(138,109,47,0.10) 1px, transparent 1px, transparent 22px),
    repeating-linear-gradient(0deg, rgba(15,28,53,0.05) 0px, rgba(15,28,53,0.05) 1px, transparent 1px, transparent 5px),
    repeating-linear-gradient(90deg, rgba(15,28,53,0.04) 1px, transparent 1px, transparent 5px);
  opacity: 0.7;
}
.dark .leva-fabric {
  background-image:
    repeating-linear-gradient(90deg, rgba(176,208,245,0.16) 0px, rgba(176,208,245,0.16) 1px, transparent 1px, transparent 4px),
    repeating-linear-gradient(90deg, rgba(0,0,0,0.22) 1px, transparent 1px, transparent 4px),
    repeating-linear-gradient(0deg, rgba(176,208,245,0.13) 0px, rgba(176,208,245,0.13) 1px, transparent 1px, transparent 4px),
    repeating-linear-gradient(0deg, rgba(0,0,0,0.24) 1px, transparent 1px, transparent 4px);
  opacity: 0.9;
}
```

### R2 — Fundo terno aplicado em AMBAS as visões do `area.tsx`

**Visão login** (`LoginShell` e todas as sub-shells de login):
- O wrapper mais externo usa `relative` + cor de fundo por tema:
  - Claro: `#f3ecdd`
  - Escuro: `#0d1f3a`
- Primeiro filho dentro do wrapper: `<div className="leva-fabric" aria-hidden="true" />`
- Todo o conteúdo existente envolto em `<div className="relative z-10 flex flex-col min-h-screen">`

**Visão logada** (`AreaPage`):
- O wrapper mais externo (`themeClass area-elite`) recebe `relative` + cor de fundo por tema
- Primeiro filho: `<div className="leva-fabric" aria-hidden="true" />`
- Todo o conteúdo existente (header, main, nav) envolto em `<div className="relative z-10 flex flex-col min-h-screen">`

Regra: `leva-fabric` é camada `z-index:0`; conteúdo é `z-index:1` (ou `z-10`). Header sticky e
bottom nav continuam acima normalmente pois são `z-20`.

### R3 — Barra de assinatura de rodapé (nova)

Componente `TernoFooter` adicionado ao final do `area.tsx`:

```
┌────────────────────────────────────┐
│ [PaxterSymbolGlass]  PAXTER        │ ← esq
│                     [logo-padcon]  │ ← dir
└────────────────────────────────────┘
```

- Linha separadora topo: `1px solid rgba(138,109,47,0.20)` (claro) / `rgba(176,208,245,0.10)` (escuro)
- Fundo: `rgba(255,255,255,0.45)` (claro) / `rgba(13,31,58,0.70)` (escuro)
- Altura: `py-2 px-4`
- Esquerda: `<PaxterSymbolGlass size={20} tone="dark" />` + texto "PAXTER" em fonte Cinzel
  com gradiente ouro (`mt-wordmark` do sandbox), tracking `0.28em`, tamanho `11px`
- Direita: `<img>` — claro usa `/logo-padcon-color.png`, escuro usa `/logo-padcon-white.png`,
  height `16px`, object-fit `contain`
- `TernoFooter` aparece:
  - Em `LoginShell`: como último elemento dentro do `<main>`, abaixo dos links existentes
  - Em `AreaPage` logado: dentro de `<main>`, depois de todo o conteúdo das tabs
    (o `pb-24` já garante espaço antes do nav fixo)

### R4 — CSS `.mt-wordmark` no `index.css`

Adicionar junto com `.leva-fabric` (linhas 339–348 do sandbox):
```css
.mt-wordmark {
  font-family: 'Cinzel', 'Playfair Display', serif;
  letter-spacing: 0.28em;
  background: linear-gradient(180deg, #f6e6b0 0%, #d8b667 46%, #a8823c 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
```

### R5 — Service Worker: bump do cache

Em `artifacts/padcom/public/sw.js`:
- Alterar `"padcon-conect-v2"` para `"padcon-conect-v3"` — força limpeza do cache antigo em todos
  os dispositivos que tenham o app instalado.

### R6 — Nota sobre o ícone do celular (não é bug de código)

O domínio do Replit rotacionou desde a instalação — por isso o ícone não abre mais.
Solução: o CEO deve acessar o app pelo novo URL no celular e reinstalar o ícone (menu do browser →
"Adicionar à tela inicial"). O manifest e o service worker estão corretos.

---

## Linhas Vermelhas (NUNCA violar)

- NUNCA tocar `artifacts/parxis-site/` — nem um byte
- NUNCA remover tabs, autenticação, lógica funcional do `area.tsx`
- NUNCA mudar APIs ou rotas
- NUNCA apagar classes CSS existentes — só ADICIONAR `.leva-fabric` e `.mt-wordmark`
- NUNCA usar DROP/TRUNCATE/DELETE em banco de dados

---

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| Fundo creme + textura de tecido no claro | Screenshot mobile `/area` modo claro |
| Fundo navy + risca de giz no escuro | Screenshot mobile `/area` modo escuro |
| PAXTER (símbolo + nome ouro) no canto esq do rodapé | Visual no screenshot |
| Logo PADCON no canto dir do rodapé | Visual no screenshot |
| Abas (Início / Protocolos / Agenda / Documentos / Enviar) funcionando | Navegação no screenshot logado |
| Login ainda funciona (CPF + data) | Sem regressão na tela de acesso |
| Cache bumped para v3 | `grep "padcon-conect-v3" sw.js` |
| parxis-site intocado | `git diff --name-only \| grep parxis` = vazio |
