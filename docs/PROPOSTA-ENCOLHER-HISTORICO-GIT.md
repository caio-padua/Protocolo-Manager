# Proposta — Encolher o histórico do Git (SÓ PROPOSTA, aguarda ordem escrita do CEO)

Data da medição: 14/08/2026

## Situação

| Medida | Valor em 14/08/2026 |
|---|---|
| `attached_assets/` no disco | 1.019 MB (1.132 arquivos) |
| Arquivos de anexo versionados no Git | 1.157 |
| Peso do histórico (`size-pack`) | 979,59 MB |
| Pasta `.git` | 991 MB |

Já feito (Task 281, sem destruir nada):
- `attached_assets/` entrou no `.gitignore` — anexos novos não entram mais em commits;
- os 1.157 anexos saíram do **índice** (`git rm --cached`) — continuam no disco e no histórico antigo.

Resultado: o problema **para de crescer**, mas o histórico continua carregando ~980 MB
de prints/PDFs antigos em cada clone, fetch e clique no painel Git.

## O que resolveria de verdade (exige reescrever histórico)

Reescrever o histórico removendo os blobs de `attached_assets/` (ferramenta recomendada:
`git filter-repo --path attached_assets --invert-paths`). Estimativa: `size-pack` cai de
~980 MB para dezenas de MB.

### Consequências (por isso exige ordem escrita — Regra de Ouro)

1. **Todos os hashes de commit mudam.** O remoto (GitHub) precisa de `push --force`.
2. Qualquer clone antigo (outro primo, outra máquina) fica divergente e precisa re-clonar.
3. Os anexos somem do histórico do Git **para sempre** — por isso o passo 0 abaixo é obrigatório.
4. Checkpoints do Replit anteriores à reescrita podem não casar mais com o histórico novo.

### Plano de execução proposto (quando e se o CEO ordenar por escrito)

0. **Backup completo antes de tudo**: cópia de `attached_assets/` + `git bundle` do repo
   inteiro para o Object Storage (nada é perdido, só sai do histórico ativo).
1. Congelar trabalho: nenhuma task agent rodando, working tree limpa.
2. `git filter-repo --path attached_assets --invert-paths` (preserva todo o resto).
3. `git gc --aggressive --prune=now` e medir o novo `size-pack`.
4. `push --force` para o GitHub (PAT já configurado).
5. Avisar os primos (IHE etc.) para re-clonarem.

Tempo estimado: ~30 min de execução + validação.

## Decisão pendente

- [ ] CEO autoriza por escrito a reescrita do histórico (com backup do passo 0)
- [ ] CEO prefere conviver com os ~980 MB históricos (opção válida: o crescimento já foi estancado)
