---
name: Licença fail-closed, link de exame v1 e estados comerciais
description: decisões de segurança de módulos, links de exame e telas informativas de plano
---
- Módulo: servidor e menu fail-closed (erro de banco = 503/menu trancado); `modulos_ativos` vazio/null = acesso total (legado), só `false` bloqueia.
- Link de exame v1 (30 dias, amarrado a documento+pessoa, revogável); emissão só liga com EXAME_LINK_NOVO=1; política dos legados = 90 dias da ativação explícita, uma vez, só dono. Lista do app do cliente devolve acesso de 1 dia.
- Máscara de log precisa cobrir qualquer URL com token no caminho.
- Telas de plano só informam (Plano atual / Recurso disponível / Conhecer planos / Em breve); falha do /api/menu = nenhum estado afirmado.
**Why:** pedidos do Dr. Caio de não fingir compra, cobrança ou proteção.
**How to apply:** nova tela comercial reutiliza EstadoRecursoBadge; teste com page.route prova só a tela, não o servidor.
- Falhas de teste "antigas" só se chamam assim após comparar com a base (worktree); mocks de rota precisam acompanhar middlewares novos (pré-cadastro, recálculo).
