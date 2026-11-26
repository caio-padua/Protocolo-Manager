# Checklist de republicação segura — Permissões por papel e clínica

O agente NÃO publica. Quem publica é o Dr. Caio, pelo botão Publish do Replit.

## 1. Antes de publicar
1. Rodar `PORT=5000 BASE_PATH=/ pnpm run build` e conferir código 0.
2. Rodar no api-server: `pnpm exec vitest run src/tests/papeis-acesso.test.ts src/tests/papeis-empresa-api.test.ts src/tests/papeis-bateria-final.test.ts` (esperado: 124 testes, 0 falhas).
3. Rodar no padcom: `pnpm exec vitest run src/lib/transmutacao.test.ts` (esperado: 32).
4. Decidir `HOMOLOGACAO_PERMISSOES` em `artifacts/padcom/src/lib/transmutacao.ts`: true = telas bloqueadas riscadas; false = somem.

## 2. Risco principal: profissionais sem papel
1. Ficam BLOQUEADOS nos cinco domínios protegidos até o Admin atribuir papel (decisão 4.3).
2. Em desenvolvimento são os ids 9, 10, 11, 16, 18, 19, 20, 24, 25. Em PRODUÇÃO a lista pode ser outra: conferir com consulta SOMENTE LEITURA na tabela `professional_papeis_empresa` antes de publicar.
3. Se a tabela não existir na produção, ela precisa ser criada ANTES (o publicar não copia banco de desenvolvimento). Nunca copiar dados de desenvolvimento para produção.
4. Quem usa o sistema hoje em produção deve ter papel cadastrado na sua clínica antes da publicação; senão perde acesso (403).

## 3. Depois de publicar
1. Entrar como CEO: acesso total esperado.
2. Entrar com um profissional com papel conhecido e abrir uma tela de cada domínio: liberada ou 403 conforme a tabela da seção 4 da referência.
3. Conferir o Seletor de Transmutação (só o CEO o vê).
4. Olhar o log de produção por 403 inesperados nas primeiras horas.

## 4. Como voltar atrás
1. Painel de checkpoints do Replit: restaurar o checkpoint anterior à publicação.
2. Nenhum dado é apagado por esta entrega; o guarda só recusa acesso.

## 5. Limitações conhecidas
1. Agenda, estoque e comunicação: regras só visuais.
2. Administrador não médico fica sem prontuário (decisão 4.2 = A).
3. Simulação visual não concede nem retira acesso real.
4. 158 testes antigos de outras áreas já falhavam antes desta entrega.
