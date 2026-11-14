---
name: Classificação e nível (plano) do cliente
description: Níveis Prata/Ouro/Platinum/Diamond (campo clients.plano), classificação A–D, e o que ainda não está definido.
---

O nível do cliente (coluna `clients.plano`) é, nesta ordem: **prata, ouro, platinum, diamond**.
Entrada = prata. Decisão do responsável em 14/11/2026; substitui Bronze/Platina/Noir
(o desenho antigo de 08/11/2026 com Bronze deixou de valer). Nomes e paleta moram em um
único módulo da interface (`padcom/src/lib/nivel-cliente.ts`); o contrato aceita só esses
quatro valores (OpenAPI → zod). A classificação (A–D, padrão D no banco) é atributo distinto
do nível; a nota "E" da decisão de 08/11/2026 não está no banco (divergência não resolvida).

Os critérios de progressão, descontos por classificação e privilégios por nível NÃO foram
definidos nem implementados: nada no código promove o cliente de nível.

**Why:** o CEO quis eliminar "Bronze" (percepção de inferioridade) e uma escada luminosa
(prata cinza, ouro dourado, platinum perolado, diamond azul-cristal) com termos em
português nos degraus iniciais e internacionais nos superiores.

**How to apply:** não reintroduzir bronze/platina/noir. "BRONZE" em `ras-fap.ts`/`ras.ts` é um
TEMA DE COR do documento RAS, outro conceito — não renomear. Ao mexer em valores aceitos,
mudar OpenAPI, rodar o codegen e conferir que `lib/api-zod/src/index.ts` continua exportando
só `./generated/api` (o codegen acrescenta `generated/types` e quebra o barrel). A migração
é idempotente e converte só bronze→prata e platina→platinum. Não apresentar falha de leitura
como um nível; valor ausente ou antigo vira "—".
