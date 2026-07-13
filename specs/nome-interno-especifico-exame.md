# Spec — Nome interno (code) específico e fatiado para exames NOVOS

Decisão do CEO (Dr. Caio), 13/07/2026. Confirmada três vezes na conversa.

## Objetivo

Exames que NASCEM no sistema (descobertos automaticamente de um laudo, ou
promovidos pela triagem com a ação "novo") devem receber um **nome interno**
(`code`) específico e fatiado — o "genótipo" fixo — em vez do formato antigo,
que apenas tirava acento e minusculava (mantendo espaços e pontuação).

Exemplo canônico do CEO:

| Nome padrão (na tela) | Nome interno (genótipo fixo) |
|---|---|
| Vitamina D 25-OH (Calcidiol) | vitamina-d-25oh-calcidiol |
| Vitamina D 1,25-OH (Calcitriol) | vitamina-d-1-25oh-calcitriol |
| Vitamina B12 (Cobalamina) | vitamina-b12-cobalamina |
| Ferro Sérico | ferro-serico |
| Testosterona Livre | testosterona-livre |
| Hemoglobina Glicada (HbA1c) | hemoglobina-glicada-hba1c |
| PSA Livre | psa-livre |

## Regras do gerador `slugInterno`

1. Tira acento (NFD + remove diacríticos) e passa a minúsculo.
2. Parênteses `( )` viram separador — o conteúdo (o sinônimo bioquímico) permanece.
3. Vírgula entre dígitos vira hífen: `1,25` → `1-25`.
4. Forma da molécula cola: dígito seguido de espaço/hífen e letra junta: `25-OH`/`25 OH` → `25oh`.
5. Qualquer outro separador (espaço, pontuação, barra) vira hífen.
6. Colapsa hífens repetidos e apara hífens das pontas.

## Ponto único de aplicação

`createDiscoveredExam` em `artifacts/api-server/src/lib/exam-extraction/triagem.ts`
é o ÚNICO lugar onde um exame genuinamente novo nasce de um laudo. Ele atende:

- Descoberta automática (faxina que cria `origin="descoberto"`).
- Triagem, ação "novo" (`POST /exames-lab/triagem/:id/resolver`), que chama esta função.

Trocar `chaveFaixa(display)` por `slugInterno(display)` apenas aqui cobre os dois
caminhos.

## Linhas vermelhas (zero perda, zero regressão)

1. NÃO reescrever nenhum `code` já existente (amarram milhares de resultados).
2. NÃO tocar a semente `seed-analitos.ts` (base oficial dos exames existentes).
3. NÃO tocar `chaveFaixa`: ela continua sendo o normalizador de COMPARAÇÃO usado
   no casamento de grafias. `slugInterno` é papel DIFERENTE (gera identidade).
4. O casamento de grafia crua com o catálogo (por nome + apelidos) acontece ANTES
   de `createDiscoveredExam`; só grafias sem match chegam aqui. Logo, o formato
   novo do code não cria duplicata dos exames existentes.
5. `onConflictDoNothing` no `code` é preservado (idempotência no mesmo lote).

## PRONTO (como validar)

- `slugInterno` reproduz exatamente a tabela do CEO (teste puro dos 7 exemplos).
- `pnpm --filter @workspace/api-server run typecheck` sem novos erros nos arquivos
  tocados (zones.ts / triagem.ts).
- Revisão do architect até PASS.

## Dívida técnica registrada (não bloqueia esta onda)

Colisão semântica de `code` em `createDiscoveredExam`: quando o slug gerado colide
com um exame DIFERENTE já existente, `onConflictDoNothing` trata como o mesmo e
absorve a grafia como apelido do existente. Esse risco JÁ existia antes (com
`chaveFaixa`) — não é regressão desta onda. Hardening futuro: validar se o cadastro
existente é de fato o mesmo exame antes de absorver o sinônimo automaticamente.
