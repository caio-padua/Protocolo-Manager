# Paxter Pack — sistema operacional Paxter, portavel e certificado

O Paxter Pack e o "molde Padcon / Dr. Caio" empacotado: leva o METODO (Codigo Paxter + Paxter Loop)
e o DESIGN (skill de layout) para qualquer sistema novo, com casa-mestra DUPLA e selo de certificacao.

## Fonte viva x espelho (regra de ouro)

- **Fonte viva** = `.agents/skills/` deste repositorio. E onde se EDITA.
- **Espelho** = esta pasta `paxter-pack/skills/`. E GERADA pelo build. NUNCA editar a mao.
- Editou uma skill? Rode o build de novo para o selo voltar a bater.

## Como o selo funciona (hash sobre conteudo bruto)

O selo guarda o hash SHA-256 do CONTEUDO BRUTO de cada arquivo. Qualquer diferenca de bytes conta
como modificacao — inclusive diferenca de FIM DE LINHA (LF x CRLF) ou linha em branco a mais no
final. A auditoria le o `manifest.json` (fonte canonica de maquina); o `MANIFEST.md` e a mesma
informacao em formato humano (tabela), derivada do `manifest.json` pelo mesmo build.

## Os 4 pilares

| Pilar | O que e | Onde vive |
|---|---|---|
| ARQUITETURA | o conteudo das skills (Codigo Paxter, Paxter Loop, Layout) | `paxter-pack/skills/` |
| DESENVOLVIMENTO | como um sistema novo nasce e como o pack se atualiza | `SEED.md` + `paxter:pack` |
| CERTIFICACAO | selo com versao + hash SHA-256 de cada arquivo | `MANIFEST.md` + `manifest.json` |
| AUDITORIA | compara um sistema contra o selo e acusa diferenca | `paxter:audit` |

## Casa-mestra dupla (decisao do CEO em 20/06/2026: A e B)

- **A — Cofre Obsidian (Dr. Brain)**: backup-mestre controlado por voce. Copie/sincronize a pasta
  `paxter-pack/` para uma pasta do cofre. E o seu cofre independente de plataforma.
- **B — Repositorio GitHub** (sugestao de nome: `paxter-pack`): mestre versionado. Cada sistema
  novo SEMEIA a partir dele. O push e feito por VOCE pela aba Git (o agente nao da push).

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm --filter @workspace/scripts run paxter:pack` | regenera o espelho + o selo a partir da fonte viva |
| `pnpm --filter @workspace/scripts run paxter:pack -- --version 1.1.0` | regenera marcando uma versao nova |
| `pnpm --filter @workspace/scripts run paxter:audit` | audita as skills DESTE repo contra o selo |
| `pnpm --filter @workspace/scripts run paxter:audit -- --target <pasta-skills>` | audita OUTRO sistema |

## Limite honesto (o que o agente NAO faz)

- Nao cria repositorio GitHub nem da push — isso e ato seu pela aba Git.
- Nao escreve no cofre Obsidian — entrega esta pasta pronta para voce copiar/sincronizar.

RESUMO EM 1 LINHA: edite a skill na fonte viva, rode `paxter:pack` para selar, leve o pack ao
Obsidian (A) e ao GitHub (B), e use `paxter:audit` para garantir que todo sistema esta no molde.
