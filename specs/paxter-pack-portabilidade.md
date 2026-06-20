# Spec — Paxter Pack (portabilidade dupla A+B, certificacao e auditoria)

## Objetivo

Empacotar o "sistema operacional Paxter" (as skills de metodo e design) num PACK portavel,
certificado e auditavel, para que qualquer sistema novo (primo) nasca identico, com casa-mestra
DUPLA: cofre Obsidian (A, controle humano) e repositorio GitHub (B, controle versionado).

## Contexto (fonte-da-verdade)

- Fonte VIVA das skills = `.agents/skills/` (paxter-loop/ + skill-layout-paxter/).
- O Pack e um ESPELHO GERADO dessa fonte, nunca o contrario. Editar skill -> regerar pack.
- Decisao do CEO (20/06/2026): adotar A e B juntos.

## Requisitos exatos

1. Criar a pasta `paxter-pack/` na raiz, auto-contida, com:
   1.1. `skills/` — copia canonica das skills vivas: `paxter-loop/SKILL.md`,
        `paxter-loop/CODIGO-PAXTER.md`, `skill-layout-paxter/SKILL.md` e `skill-layout-paxter/references/*`.
   1.2. Selo de certificacao em DOIS formatos da MESMA informacao, gerados juntos pelo build:
        - `manifest.json` — FONTE CANONICA de maquina (nome, versao semver, data, lista de arquivos
          com hash SHA-256 completo e linhas). E o que a auditoria consome.
        - `MANIFEST.md` — VISTA HUMANA derivada do `manifest.json`: tabela com hash SHA-256 (16
          primeiros caracteres) e linhas. O hash certifica que o conteudo bruto nao mudou.
   1.3. `README.md` — o que e o pack; o que e fonte viva x espelho; como SEMEAR um sistema novo;
        como sincronizar com o cofre Obsidian (A); como publicar no GitHub (B).
   1.4. `SEED.md` — checklist objetivo (passo a passo, texto exato) para um sistema novo nascer
        Paxter-certificado: copiar `paxter-pack/skills/` para `.agents/skills/` do novo repo,
        copiar o MAPA DA MEMORIA para o `replit.md`, rodar a auditoria.

2. Script de CONSTRUCAO/CERTIFICACAO: `scripts/src/paxter-pack-build.ts`
   2.1. Le as skills vivas em `.agents/skills/`, copia para `paxter-pack/skills/`.
   2.2. Recalcula o hash SHA-256 de cada arquivo e (re)escreve `MANIFEST.md`.
   2.3. Aceita a versao por argumento (ex.: `--version 1.0.0`); se ausente, mantem a atual e marca
        a data de regeneracao.
   2.4. npm script `paxter:pack` em `scripts/package.json`.

3. Script de AUDITORIA: `scripts/src/paxter-pack-audit.ts`
   3.1. Compara um diretorio-alvo de skills (default: `.agents/skills/` deste repo) contra o selo
        do pack, usando o `manifest.json` como fonte canonica (o `MANIFEST.md` e a vista humana
        equivalente, derivada do mesmo build).
   3.2. Para cada arquivo do manifesto, classifica: OK (hash igual), MODIFICADO (existe, hash
        diferente), FALTANDO (nao existe no alvo). Lista tambem EXTRA (no alvo, fora do manifesto).
   3.3. Imprime um relatorio em TABELA (Densidade B) e termina com codigo de saida != 0 se houver
        qualquer drift (para servir de "selo" em automacao futura).
   3.4. npm script `paxter:audit` em `scripts/package.json` (aceita `--target <dir>`).

4. Os 4 pilares do pedido do CEO ficam cobertos e nomeados no README:
   - ARQUITETURA = o conteudo das skills (Codigo Paxter + Layout + Loop).
   - DESENVOLVIMENTO = SEED.md (como um sistema novo nasce) + build (como atualizar o pack).
   - CERTIFICACAO = MANIFEST.md com versao + hashes (o "selo").
   - AUDITORIA = paxter-pack-audit (acusa drift entre um sistema e o selo).

## Casos extremos a tratar

- Skill viva editada apos gerar o pack -> auditoria deve acusar MODIFICADO (drift), e `paxter:pack`
  deve zerar o drift ao regerar.
- Normalizacao de fim de linha: o hash usa o conteudo bruto do arquivo (documentar no README que
  diferenca de quebra de linha conta como modificacao).
- Nao duplicar verdade: README deixa explicito que `.agents/skills/` e a FONTE; `paxter-pack/` e
  ESPELHO gerado (banner "NAO EDITAR A MAO" no topo do MANIFEST).
- `references/` pode ganhar arquivos novos -> o build varre a pasta recursivamente, nao lista fixa.

## Definicao de PRONTO

- `paxter-pack/` existe com `skills/`, `MANIFEST.md`, `README.md`, `SEED.md`.
- `pnpm --filter @workspace/scripts run paxter:pack` regenera o pack sem erro e o MANIFEST traz
  versao + hash de todos os arquivos.
- `pnpm --filter @workspace/scripts run paxter:audit` roda e mostra a tabela; ao editar 1 caractere
  de uma skill viva a auditoria acusa MODIFICADO; ao rodar `paxter:pack` de novo, a auditoria volta
  a 100% OK.
- `pnpm --filter @workspace/scripts run typecheck` passa (os 2 scripts novos compilam).
- architect aprova requisito por requisito.

## Linhas vermelhas (nao cruzar)

- O agente NAO cria repositorio GitHub nem da push — isso e ato do CEO pela aba Git (regra ja
  vigente). O pack so DEIXA PRONTO o conteudo para o CEO publicar.
- O agente NAO escreve no cofre Obsidian — produz a pasta `paxter-pack/` para o CEO copiar/sincronizar.
- `.agents/skills/` continua a fonte viva; o pack e espelho — nunca inverter o sentido.
- Nao tocar no app clinico (`artifacts/`), no motor de calculo nem no banco. Isto e so tooling/docs.

## Handoff humano (o que fica para o CEO fazer)

- B (GitHub): criar o repositorio (sugestao de nome: `paxter-pack`) e dar push de `paxter-pack/`
  pela aba Git.
- A (Obsidian): copiar/sincronizar `paxter-pack/` para uma pasta do cofre do Dr. Obsidian.
