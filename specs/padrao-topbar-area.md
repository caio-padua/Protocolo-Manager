# Spec: Padrão único de topbar — Área do Paciente

**Data:** 20/07/2026  
**Status:** APROVADO PARA BUILD

## 1. Problema

A tela `/area` tem dois padrões de cabeçalho de painel misturados:
- `login-card-topbar` → gradiente creme-dourado (claro) / navy (escuro) — usado em alguns cards
- `border-b border-border/40` simples → fundo branco/neutro — usado em outros

O CEO exige consistência: TODOS os topbars de cards/painéis devem ter a mesma aparência.

## 2. Padrão escolhido

**`login-card-topbar`** é o padrão único para TODAS as faixas superiores de painel.

### Claro (light)
- Background: `linear-gradient(180deg, #fffdf8 0%, #f5eedd 55%, #ebe0c8 100%)`
- Border-bottom: `rgba(184, 146, 77, 0.32)`
- Inset top: branco puro; inset bottom: sombra suave navy

### Escuro (dark)
- Background: `linear-gradient(180deg, #243f64 0%, #1a3255 100%)`
- Border-bottom: `rgba(180, 145, 62, 0.32)`

## 3. Escopo — o que muda

| Componente | Linha aprox. | Mudança |
|---|---|---|
| InicioTab — PRÓXIMO ATENDIMENTO | ~989 | `border-b border-border/40` → `login-card-topbar` |
| ProtocolCard — div do título | ~1056 | `border-b border-border/40` → `login-card-topbar` |
| AgendaTab — renderSession top bar | ~1184 | `border-b border-border/40` → `login-card-topbar` |
| DocumentosTab — CategorySection button | ~1476 | `border-b border-border/40` → `login-card-topbar` |

## 4. O que NÃO muda

- A classe `login-card-topbar` em si (CSS permanece intacto)
- Topbars já corretos: InicioTab BEM-VINDO, AgendaTab SelfScheduler, EnviarTab
- Estrutura interna de qualquer componente

## 5. Critérios de aceite

- [ ] Todas as faixas superiores de card em `/area` exibem o gradiente dourado (claro) ou navy (escuro)
- [ ] Nenhuma faixa permanece com fundo branco puro
- [ ] Light e dark: consistentes entre si dentro do mesmo tema
- [ ] Zero regressão nas sessões coloridas (ProtocolCard sem `px-4 pt-4 pb-3` perdido)
