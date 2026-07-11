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

## 3. Modelo das CINCO faixas (semântica ditada pelo CEO; editável por exame)

Zona de referência normal = intervalo [mínimo, máximo] do exame. Esse intervalo normal é dividido em TRÊS terços.

| Ordem | Faixa | Onde o valor cai | Cor (padrão) | Rótulo |
|---|---|---|---|---|
| 1 | ALERTA | abaixo do mínimo | Vermelho `#b4413c` | ALERTA |
| 2 | SUFICIENTE (baixa) | terço inferior da zona normal | Verde-oliva `#8a9a3f` | SUFICIENTE |
| 3 | EXCELENTE | terço central da zona normal | Verde forte `#3f7a3f` | EXCELENTE |
| 4 | SUFICIENTE (alta) | terço superior da zona normal | Verde-oliva `#8a9a3f` | SUFICIENTE |
| 5 | ATENÇÃO | acima do máximo | Âmbar-laranja `#c17a2b` | ATENÇÃO |

Regras:
- São CINCO faixas com QUATRO cores (SUFICIENTE aparece dos dois lados do meio).
- Padrão = trisecção da zona normal. É um PADRÃO editável: cada exame pode ter min/máx próprios por faixa no
  bloco editável (tabela `exam_analyte_ranges`), então nenhuma semântica clínica fica chumbada no código.
- Art.47 (zero dado inventado): a faixa é DERIVADA do mínimo/máximo reais do exame por regra escrita e visível;
  exame sem referência mínima/máxima continua "conferência" (cinza), nunca ganha faixa fantasia.
- "Rastrear à exaustão como o IHE" (ponto 8): a busca automática no repositório do IHE não retornou as regras por
  código. Portanto o padrão é a trisecção acima + cadastro editável; se depois o CEO trouxer as faixas exatas do
  IHE, elas entram pelo bloco editável sem retrabalho.

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
