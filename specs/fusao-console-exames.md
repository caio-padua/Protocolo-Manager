# Spec — Console de Exames (fusão das duas ferramentas de exames)

Data: 11/07/2026. Autor: Dr. Replit Paxter. Método: Paxter Loop.

## Objetivo (uma frase)

Fundir, numa ÚNICA tela mestre-detalhe, TODAS as funções das duas ferramentas de exames
hoje separadas — "Direção dos Exames" (direção + 5 faixas com cortes) e "Planilha de Faixas"
(apelidos + unidades) — sem perder nenhuma capacidade, aplicando o sistema de design Paxter (3D navy/ouro).

## Contexto (por que dá para fundir sem perder nada)

As duas ferramentas operam sobre o MESMO universo de exames e editam campos DISJUNTOS:

| Ferramenta atual | Campos que edita |
|---|---|
| Direção dos Exames (DirecaoExamesTool) | direção (maior/menor/alvo) + 5 faixas (rótulo + De/Até) + prévia com valor de teste + restaurar |
| Planilha de Faixas (PlanilhaFaixasTool) | apelidos (sinônimos) + unidades (até 5, uma padrão + fator) + unidade padrão |

Como os campos não se sobrepõem, a fusão é encaixe: reunir os dois editores no detalhe do mesmo exame.

## Atualização (12/07/2026) — ferramenta única + rótulo de faixa editável

Decisão do CEO cumprida nesta onda:

1. Passou a existir UMA única ferramenta = a mais completa (ConsoleExamesTool). As duas antigas
   (DirecaoExamesTool e PlanilhaFaixasTool) foram APAGADAS.
2. A MESMA tela aparece na Configuração (/cadastros/console-exames) e no Cockpit da Consulta
   (EvolucaoExamesPanel passou a importar/renderizar ConsoleExamesTool).
3. O NOME de cada uma das 5 faixas é editável por exame, independente (campo `faixaName` no Slot;
   `<input>` por faixa; salva via PUT /faixas com `.trim()` + fallback `ZONE_ROTULO` por direção,
   limite de 40 caracteres). A prévia e o badge de leitura exibem o nome customizado.
4. A COR das faixas continua NÃO editável — sempre derivada da severidade/posição (`ZONE_COLOR`).

## Requisitos exatos (numerados)

1. Nova tela mestre-detalhe chamada **Console de Exames**, num componente NOVO
   (`ConsoleExamesTool`), acessada pelo menu Cadastros por UMA entrada única.
2. LISTA (mestre) à esquerda: todos os exames, com busca por nome/apelido, badge de direção
   (↑ maior / ↓ menor / ◎ alvo) e selo "rev" quando já editado por um profissional.
3. DETALHE (à direita) do exame selecionado, organizado em TRÊS sub-painéis 3D empilhados:
   3.1 **IDENTIDADE** — nome do exame + até 5 apelidos editáveis + chips dos apelidos internos
       excedentes (somente leitura) + botão "Salvar apelidos".
   3.2 **MEDIDA** — unidades (até 5): rótulo + fator + marca de padrão (radio); adicionar/remover;
       botão "Salvar unidades".
   3.3 **SIGNIFICADO CLÍNICO** — direção (3 botões) + as 5 faixas + prévia com valor de teste +
       botão "Salvar faixas" + botão "Restaurar".
4. As 5 faixas ficam **EDITÁVEIS nos cortes De/Até** (borda contígua: Até de uma = De da seguinte).
5. Os RÓTULOS das 5 faixas ficam **TRAVADOS nas 5 nomenclaturas oficiais** — ALERTA, ATENÇÃO,
   INSUFICIENTE, ACEITÁVEL, EXCELENTE — exibidos como etiqueta colorida somente-leitura (cor por
   severidade), NÃO como campo de texto livre. A posição de cada nomenclatura segue a direção
   (mapa `FAIXAS_POR_DIRECAO`). Muda a direção → os rótulos se reordenam sozinhos.
6. Zero perda de função: prévia proporcional + classificação do valor de teste; restaurar faixas
   ao padrão; promoção de exame de laudo ao catálogo ao salvar apelidos/unidades (o `code` pode
   mudar e a tela precisa remapear a seleção sem perder o rascunho).
7. Reaproveitar os contratos de backend existentes, sem alterá-los:
   - `GET /api/exames-lab/catalogo-faixas` — lista rica (apelidos, unidades, zonas, direção).
   - `GET /api/exames-lab/direcoes` — enriquece grupo + contagem de laudos (merge por `code`).
   - `GET /api/exames-lab/faixas?code=` — detalhe autoritativo (refLow/refHigh para a prévia).
   - `PUT /api/exames-lab/faixas?code=` — grava direção + zonas (e `resetDirection` p/ restaurar).
   - `PUT /api/exames-lab/catalogo-faixas/aliases` — grava apelidos.
   - `PUT /api/exames-lab/catalogo-faixas/unidades` — grava unidades.
8. Design Paxter: `panel-3d` externo, `panel-3d-sub` por sub-painel, títulos em placa `bevel-3d`
   com ícone (Padrão 3), campos em borda/insert, botões `btn-3d`/`btn-3d-soft`, navy/ouro,
   cantos quadrados, MAIÚSCULO nos rótulos. Variante `.dark` herdada das classes.
9. NÃO quebrar o Cockpit: a `DirecaoExamesTool` continua existindo e embutida em
   `EvolucaoExamesPanel.tsx`. A tela nova é ADICIONAL, para o menu Cadastros.
10. O menu Cadastros passa a ter UMA entrada ("Console de Exames") no lugar das duas antigas; as
    rotas antigas `/cadastros/direcao-exames` e `/cadastros/planilha-faixas` continuam válidas e
    passam a renderizar o Console (nada de link quebrado).

## Casos extremos a tratar

1. Exame não quantitativo: sub-painéis MEDIDA e SIGNIFICADO mostram aviso "sem faixas/unidade
   numérica", sem quebrar; IDENTIDADE (apelidos) continua funcionando.
2. Promoção muda o `code` ao salvar apelidos/unidades: remapear seleção + rascunhos (reusar
   `remapCode`), e recarregar a linha para refletir `inCatalog`/novas unidades.
3. Cortes fora de ordem (não crescentes): a prévia cai no fallback de larguras iguais (não quebra).
4. Sem valor de teste: a prévia usa o ponto médio de refLow/refHigh (quando houver); senão informa
   "sem valor de referência".
5. Falha de rede em qualquer salvamento: mensagem de erro por seção, sem derrubar a tela.

## Definição de PRONTO

1. Uma única tela no menu Cadastros edita: apelidos, unidades, direção e as 5 faixas do mesmo exame.
2. Rótulos das 5 faixas travados nas 5 nomenclaturas (sem texto livre); cortes De/Até editáveis.
3. Salvar apelidos, salvar unidades e salvar faixas gravam de verdade (curl confirma persistência).
4. Cockpit continua com a ferramenta de faixas embutida funcionando (DirecaoExamesTool intacta).
5. `pnpm --filter @workspace/padcom run typecheck` verde.
6. Architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas

1. NUNCA alterar o motor/contratos do backend de exames (só consumir os endpoints existentes).
2. NUNCA remover a `DirecaoExamesTool` (Cockpit depende dela).
3. NUNCA mudar a semântica das cores das faixas nem o mapa `FAIXAS_POR_DIRECAO` (fonte única).
4. Mudança é de APRESENTAÇÃO + reunião de editores; nada de inventar campo novo fora desta spec.
