# Spec — Compliance com skill-layout-paxter (última spec)

**Data:** 20/07/2026
**Referência:** `.agents/skills/skill-layout-paxter/SKILL.md` (Art. 0.1 Lei do Registro)

## Checklist de revisão final (revisão como cliente)

| # | Verificar | Critério |
|---|---|---|
| 1 | Conclusão/número salta primeiro? | Saliente para KPI, Concavo para entrada |
| 2 | Classes 3D respiram? | gap mínimo 12px entre painéis |
| 3 | Cada cor tem um único significado? | ouro=acento, verde=OK, teal=status, vermelho=alerta |
| 4 | Cantos quadrados (radius 6px)? | Sem pilula infantil em botões |
| 5 | Toggle dentro de sulco? | ModoToggle usa concave-3d |
| 6 | Zero bg-teal-* como chrome? | Teal sobrevive só em STATUS badges |
| 7 | Preview NÃO usa classes Paxter? | inline styles no ReceituarioPreview (correto) |

## Novos padrões a registrar na skill (após aprovação)
- **Padrão 23 — Seletor de entidade com card-resumo:** dropdown + card-resumo abaixo mostrando dados da entidade selecionada (usado no P12 do receituário). Card usa `screen-3d` + `panel-3d-sub` para os dados.
- **Padrão 24 — Accordion de configuração:** `panel-3d` como wrapper + botão de header sem bg no hover + badge `screen-3d`.

## Paridade celular (verificar viewport 402px)
- Coluna direita (preview) some em mobile: `hidden lg:block`
- Coluna esquerda ocupa tela toda em mobile
- Grid `grid-cols-[1fr_580px]` → em mobile: `grid-cols-1`
