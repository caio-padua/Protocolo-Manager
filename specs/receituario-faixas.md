# SPEC — Faixas Ornamentais no Motor de Prescrição
Data: 20/07/2026 | Loop: Especificar → Construir → Revisar

---

## Objetivo
Integrar o sistema de seleção de faixas ornamentais arabescas (desenvolvido no mockup-sandbox)
ao motor de prescrição real do padcom, com:
1. Registro dos 11 PNGs do PADUA Designer como modelos raster-strip
2. Menu "Configuração de Receituário" no sidebar (Configurações & Administração)
3. Tela de configuração `/configuracoes/receituario`
4. Submenu inline na tela de Prescrição (`/prescricao`) para seleção da faixa ativa

---

## Pedido 1 — 11 PNGs do PADUA Designer

**O que:** Registrar os 11 PNGs como modelos `raster-strip` no catálogo do padcom.

**Arquivos:**
- `artifacts/padcom/public/assets/arabesques/padua-01-floral-islamico.png`
- `artifacts/padcom/public/assets/arabesques/padua-02-floral-simetrico.png`
- `artifacts/padcom/public/assets/arabesques/padua-03-rinceau-flamingo.png`
- `artifacts/padcom/public/assets/arabesques/padua-04-acanto-florentino.png`
- `artifacts/padcom/public/assets/arabesques/padua-05-ogival-moghul.png`
- `artifacts/padcom/public/assets/arabesques/padua-06-rinceau-mandala.png`
- `artifacts/padcom/public/assets/arabesques/padua-07-acanto-barroco.png`
- `artifacts/padcom/public/assets/arabesques/padua-08-acanto-renascentista.png`
- `artifacts/padcom/public/assets/arabesques/padua-09-rinceau-fino.png`
- `artifacts/padcom/public/assets/arabesques/padua-10-acanto-floral.png`
- `artifacts/padcom/public/assets/arabesques/padua-11-acanto-romantico.png`

**Catalog:** `artifacts/padcom/src/lib/arabesques/models.ts`
- Total: 5 modelos inline-svg + 11 PNG raster-strip = 16 modelos

---

## Pedido 2 — Entrada no Menu

**Onde:** `Layout.tsx`, grupo "Configurações & Administração", após "Portas de Pagamento"

**Entrada:**
```
{ name: "Faixas do Receituário", href: "/configuracoes/receituario", icon: LayoutTemplate }
```

---

## Pedido 3 — Tela de Configuração

**Rota:** `/configuracoes/receituario`
**Arquivo:** `artifacts/padcom/src/pages/configuracoes/receituario.tsx`

**Seções da tela:**
1. **Cabeçalho** — título "Configuração de Faixas Ornamentais", subtítulo
2. **Seletor visual** — grid de cards com miniatura de cada modelo (thumbnail 160×50px)
   - Agrupado por categoria: Vetorial Orgânico | Vetorial Geométrico Islâmico | Imagem PADUA Designer
   - Card selecionado = borda ciano + fundo levemente azulado
3. **Preview ao vivo** — mostra o modelo selecionado aplicado a um receituário de exemplo (especial/simples)
4. **Botão "Salvar como padrão da clínica"** — persiste em localStorage(`paxter:band-model-id`)

---

## Pedido 4 — Submenu na Tela de Prescrição

**Onde:** `artifacts/padcom/src/pages/prescricao/index.tsx`
**Como:** Painel colapsável "🎨 Estilo da Faixa Ornamental" no topo da tela de prescrição
- Ao expandir: mostra o `ArabesqueModelSelector` compacto (miniaturas menores, 110×36px)
- Lê o modelo ativo do localStorage(`paxter:band-model-id`)
- Ao selecionar, salva imediatamente no localStorage (sem botão separado de salvar)
- O preview do receituário (se existir na tela) usa o modelo selecionado

**Estado:** controlado por `useState<boolean>` — abre/fecha

---

## Arquitetura

```
padcom/src/lib/arabesques/
  models.ts              → catálogo completo (16 modelos)
  InlinePatterns.tsx     → tiles SVG (5 padrões geométricos + rinceaux)
  ArabesqueBand.tsx      → motor unificado (inline-svg + raster-strip)
  ArabesqueModelSelector.tsx → seletor visual com miniaturas

padcom/src/pages/configuracoes/
  receituario.tsx        → tela de config

padcom/src/components/layout/Layout.tsx  → +1 entrada no menu
padcom/src/App.tsx                       → +1 rota + import
padcom/src/pages/prescricao/index.tsx    → +submenu collapsible
```

---

## Persistência
- Chave localStorage: `paxter:band-model-id`
- Valor: `ArabesqueModelId` (string)
- Default: `"padua-01-floral-islamico"` (primeiro PNG do PADUA, mais rico)
- Futura migração para `app_settings` no banco de dados (tech debt anotado)

---

## Critérios de aceite
- [x] 16 modelos visíveis no seletor (5 SVG + 11 PNG)
- [x] Tela `/configuracoes/receituario` abre sem erro
- [x] Menu lateral mostra "Faixas do Receituário" em Configurações
- [x] Submenu na tela Prescrição abre/fecha e muda a faixa ao selecionar
- [x] Preview ao vivo funciona (modelo reflete nos cartões do receituário)
