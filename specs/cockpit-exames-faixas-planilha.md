# SPEC — Cockpit da Consulta / Aba EVOLUÇÃO de Exames: cinco faixas, planilha nítida, gráfico no topo

Autor: Dr. Replit Paxter · Data: 11/07/2026 · Método: Paxter Loop (spec ANTES de construir → architect até zero pendência)

## 1. Objetivo (conclusão primeiro)

Transformar a aba EVOLUÇÃO de exames do Cockpit da Consulta (`/cockpit-cliente`) na parte "carro-chefe" que o CEO
pediu: mostrar o resultado de cada exame classificado em CINCO faixas (no número E no gráfico), com a planilha
legível, nomes e botões em relevo (up bevel), tendência no rodapé do gráfico, coluna mais recente fixável para
comparar, gráfico no perfil superior, e um bloco editável no final para cadastrar/ajustar as faixas por exame.

## 2. Estado atual verificado na fonte (não inventar)

| O que existe hoje | Onde | Situação |
|---|---|---|
| Planilha de evolução (nome congelado à esquerda, datas rolam) | `artifacts/padcom/src/pages/cockpit/panels/EvolucaoExamesPanel.tsx` | Só 4 status crus: dentro/acima/abaixo/conferência |
| Gráfico por exame (recharts, LineChart) | mesmo arquivo, componente `CartaoGrafico` | 1 zona verde única (ref mín–máx); fica À DIREITA (ao lado) |
| Tendência (subiu/caiu/estável) | mesmo arquivo | LED ao LADO da linha e no topo do cartão do gráfico |
| Motor de faixas (backend) | tabela `exam_analyte_ranges` + `persist.ts` (`classifyByRef` + faixas internas) | Motor JÁ prefere faixa interna à referência do laudo; porém NENHUMA faixa foi cadastrada → cai no fallback |
| Fonte dos dados da tela | `GET /api/exames-lab/evolucao/:clientId` | Devolve status + refLow/refHigh; NÃO devolve as 5 faixas |

Conclusão: o motor de faixas está pela metade. Falta (a) cadastrar as faixas, (b) o endpoint devolver a faixa de
cada valor, (c) a tela pintar as 5 faixas no número e no gráfico, (d) um bloco editável para o CEO manter as faixas.

## 3. Modelo das CINCO faixas (motor do IHE, verificado na fonte; editável por exame)

Rastreamento à exaustão CONCLUÍDO no repositório `caio-padua/Integrative-Health-Engine` (branch `replit-agent`).
Fontes verificadas: `artifacts/api-server/src/lib/laboratorio/motorClassificacaoIntegrativa.ts` (o motor),
`artifacts/api-server/src/db/migrations/026_exames2_5zonas.sql` (as 5 zonas + nomes editáveis),
`artifacts/clinica-motor/src/pages/pacientes/exames-grafico.tsx` (render + cores).

Regra do IHE (cópia fiel): a zona normal [mínimo, máximo] é dividida em TRÊS terços iguais
(INFERIOR / MÉDIO / SUPERIOR). Cada exame tem uma DIREÇÃO (`terco_excelente` no IHE = `direction` no Manager):
qual terço é o "excelente". Isso é o que varia de exame para exame e é editável.

| Posição do valor | direction=higher_better | direction=lower_better | direction=target (meio) | Cor padrão |
|---|---|---|---|---|
| abaixo do mínimo | ALERTA | ATENÇÃO | ALERTA | ALERTA verm. `#b4413c` / ATENÇÃO laranja `#c17a2b` |
| terço inferior | INSUFICIENTE | EXCELENTE | SUFICIENTE | ver rótulo |
| terço médio | SUFICIENTE | SUFICIENTE | EXCELENTE | ver rótulo |
| terço superior | EXCELENTE | INSUFICIENTE | SUFICIENTE | ver rótulo |
| acima do máximo | ATENÇÃO | ALERTA | ATENÇÃO | ver rótulo |

Paleta dos rótulos: ALERTA `#b4413c` (vermelho) · ATENÇÃO `#c17a2b` (laranja) · INSUFICIENTE `#d0a53f` (âmbar) ·
SUFICIENTE `#7a9a4a` (verde-oliva) · EXCELENTE `#3f7a3f` (verde forte).

Origem REAL da direção (Art.47, zero dado inventado):
1. `exam_analyte_catalog.direction` (higher_better / lower_better / target) se preenchida.
2. senão, casar pelo nome com `direcao_favoravel_exame` (tabela transmutada do IHE, já com dados:
   SUBIR_BOM→higher_better, DESCER_BOM/INFERIOR→lower_better).
3. senão, `target` (meio = excelente), neutro — e o CEO ajusta no bloco editável.

A trisecção usa o mínimo/máximo REAIS do laudo (`exam_results.ref_low/ref_high`). Exame sem mínimo/máximo continua
"conferência" (cinza), nunca ganha faixa fantasia. As faixas são um PADRÃO editável: se houver linhas em
`exam_analyte_ranges` para o analito, elas mandam (o servidor já prefere faixa interna — `persist.ts`).

## 4. Escopo de tela (aba EVOLUÇÃO)

### 4.1 Faixas no número (planilha) — ponto 1 e 2
- Cada célula da planilha pinta a FAIXA do valor: tarja lateral grossa + leve tinta de fundo na cor da faixa.
- O NÚMERO em si fica em navy forte e negrito (nítido), não mais colorido/apagado; a cor vive na tarja/fundo.
- Aumentar peso/tamanho da fonte do valor e o contraste (fim do "apagado").

### 4.2 Faixas no gráfico — ponto 1
- Substituir a zona verde única por CINCO `ReferenceArea` empilhadas (alerta/suficiente/excelente/suficiente/atenção)
  nas cores da tabela do item 3, com baixa opacidade, de modo que a linha do exame cruze as faixas.

### 4.3 Nome do exame em UP BEVEL — ponto 3
- A coluna congelada do nome do exame passa a ser um painel em relevo (`bevel-3d`/`screen-3d`), não texto chapado.

### 4.4 Botões das faixas em BEVEL — ponto 4
- Os botões de "acender/filtrar" viram botões em relevo (`btn-3d`/`bevel-3d`) e passam a listar as CINCO faixas
  (ALERTA, SUFICIENTE, EXCELENTE, ATENÇÃO), não os status antigos.

### 4.5 Tendência no rodapé do gráfico — ponto 5
- A tendência (subindo/descendo/estável) sai do lado e vira uma "bolinha" (selo em relevo) no RODAPÉ do cartão
  do gráfico, com seta e cor. A coluna de tendência na planilha permanece opcional.

### 4.6 Fixar coluna(s) para comparar — ponto 6
- A coluna mais recente fica FIXA (congelada) por padrão.
- Cada cabeçalho de coluna ganha um botão "fixar" (alfinete) em relevo; colunas fixadas permanecem visíveis
  enquanto as demais rolam, permitindo comparar duas ou mais datas lado a lado.

### 4.7 Gráfico no PERFIL SUPERIOR — ponto 7 (DECISÃO A/B/C do CEO)
- Opção A (padrão recomendado): gráficos abertos ocupam uma faixa no TOPO em largura total; a planilha fica
  embaixo. Clicar num exame adiciona o gráfico no topo. Planilha e gráfico sempre visíveis.
- Opção B: ao clicar no nome do exame, escolher "abrir EMBAIXO" ou "abrir AO LADO".
- Opção C: cortina sanfona — por padrão só o gráfico (topo, largura total); ao clicar, uma sanfona revela as
  colunas/valores daquele exame.
- Esta é a única decisão que fica pendente da palavra do CEO; o restante da spec independe dela.

### 4.8 Bloco editável no final — ponto 9
- No fim da aba, um bloco "Subcadastro de Faixas do Exame": escolhe o exame e edita as 5 faixas (nome, mínimo,
  máximo, cor, ordem). Salva na tabela `exam_analyte_ranges`. É a "parte editável" que o CEO procurava.

## 5. Backend

| Item | Ação |
|---|---|
| `GET /api/exames-lab/evolucao/:clientId` | Acrescentar, por célula, a FAIXA calculada (nome+cor) além do status atual; e por analito as bordas das 5 faixas para desenhar as zonas do gráfico. Nunca remover campos existentes (contrato). |
| Faixas por exame (CRUD) | `GET/PUT /api/exames-lab/faixas/:analyteCode` lendo/gravando `exam_analyte_ranges`; validação Zod; sem auth nova (padrão single-tenant do app). |
| Semente de faixas | Ao calcular, se o exame tem mínimo/máximo e não há faixa cadastrada, derivar as 5 por trisecção (em memória; só grava quando o CEO salvar no bloco editável). |

## 6. Fora de escopo (não fazer nesta onda)
- Não mexer nas demais abas do cockpit (Prescrição/Injetáveis/Implantes/Documentos/Anamnese).
- Não mexer no motor de extração por IA nem na conferência humana (C1/C2).
- Não inventar faixas para exame sem mínimo/máximo (fica "conferência").

## 7. Verificação (Definition of Done)
- As 5 faixas aparecem no número (tarja/fundo) e no gráfico (5 zonas), com números nítidos.
- Nome do exame e botões em relevo; tendência no rodapé do gráfico; coluna recente fixa + alfinete para fixar mais.
- Gráfico no topo conforme a opção escolhida pelo CEO.
- Bloco editável salva e relê as faixas por exame (curl GET/PUT + screenshot).
- typecheck dos arquivos tocados limpo; validação por curl + screenshot (typecheck GLOBAL do repo é pré-quebrado).
- Architect (code_review) sem pendência severa.
