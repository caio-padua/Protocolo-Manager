---
name: Fotos de evolução corporal — privacidade e comparador
description: Decisões de armazenamento privado, substituição sem apagar e grade calibrada das fotos frente/costas/perfis.
---
Fotos corporais ficam em armazenamento PRIVADO (prefixo fotos-corpo/), servidas só por rota autenticada (cliente: token do portal; equipe: acesso profissional da mesma clínica). Nunca usar o prefixo público uploads/.
**Why:** dado sensível de saúde; `/api/storage/objects/uploads/*` é público.
**How to apply:** o front baixa por fetch com Bearer e usa blob local (img direto não leva cabeçalho). Reenvio do mesmo ângulo/data = soft delete da anterior (Regra de Ouro); índice único parcial protege corrida.
Grade do comparador só é válida com mesmo enquadramento: calibra por altura informada + linhas de cabeça/pés; sem altura = grade uniforme sem cm. Instruções de captura têm fonte única na API (lib/fotos-corpo.ts).
Tabelas novas: o boot cria (ensure) e `typecheck:libs` precisa rodar para o tsc enxergar a tabela nova de lib/db.
