---
name: Autorização por papel x clínica no servidor
description: guard global de papéis por clínica (Fatia 2 do Plano Mestre de Permissões) e armadilhas de teste
---
Regra: papéis vêm de professional_papeis_empresa para (profissional da sessão, clínica do tenantContext); união na mesma clínica; sem linha = 403; sem sessão = 401; CEO passa.
**Why:** governança antiga só existia na tela; routers financeiros/clínicos não negavam no servidor.
**How to apply:** nova rota sensível entra na matriz de lib/papeis-acesso.ts (spec em specs/permissoes-fatia-2-servidor.md). Prova HTTP real: scripts/prova-papeis-http.ts. 403 sem campo "dominio" no corpo vem de trava própria da rota (ex.: fornecedores só proprietário), não do guard.
Linha de base: 158 testes do api-server já falhavam antes do guard (27 arquivos); comparar sempre com git checkout do app.ts.
