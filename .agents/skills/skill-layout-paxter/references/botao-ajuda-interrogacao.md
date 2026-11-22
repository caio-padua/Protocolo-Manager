# Botão "?" (ajuda) e a janela de parâmetros — molde do Pulso Diário

Regra do Dr. Caio (22/11/2026): o "?" serve para MUITOS gráficos e telas. Tem um molde só.
Copiar igual. Não inventar layout, classe, texto de seção nem cor.

## Lei da ordem (CEO, 22/11/2026) — ORDEM FIXA, sem exceção
| Posição | Bloco | Conteúdo |
|---|---|---|
| 1. EM CIMA | Botões coloridos | Níveis (selos `bevel-3d pn-chip`) ou "Como dar a nota" |
| 2. No meio | Por que | O que é a medida, o que queremos medir, a importância dela (todas as janelas têm) |
| 3. Opcional | Para lembrar | pontos curtos, `pn-lista-pontos` |
| 4. EMBAIXO | Referências bibliográficas | cartões `ReferenciaLista`, SEMPRE abertos; NÃO criar faixa que recolhe/expande |

## Peças (todas já existem; só reusar)
| Peça | Arquivo (artifacts/padcom/src/pages/cockpit-cliente/) | Papel |
|---|---|---|
| Quadradinho "?" (vira "!" aberto) | `BotaoAjuda.tsx` (`btn-3d-soft pn-ajuda`) | botão no canto do painel/gráfico |
| MOLDE da janela | `JanelaAjuda.tsx` | ÚNICO componente da janela: recebe topo, porque, lembrar, referencias e impõe a ordem. Proibido montar `Dialog` do "?" na mão |
| Janelas prontas | `DiretrizesDialog.tsx` (pressão/glicemia/frequência), `NotaDialog.tsx` (`EscalaDialog`: energia/libido/sono), `AjudaPainelDialog.tsx` (médias e registros), `avaliacoes/AjudaAntropometria.tsx` | todas usam `JanelaAjuda` |
| Cartões de referência | `ReferenciaLista.tsx` (`tipo` do Pulso OU `itens` próprios) | título "Referências bibliográficas" |
| Formato de referência | `pulso-referencias.ts` (`Referencia`) | origem, titulo, autores, revista, link, serve |
| Estilo | `pulso-niveis.css` | `pn-escopo`, `pn-sec-rotulo`, `pn-texto`, `pn-tab`, `pn-chip`, `pn-lista-pontos` |
| Gráfico | `GraficoZonas.tsx` (`ajuda` = tipo do Pulso, ou `cantoExtra`) | gráfico padrão |

O Pulso do cockpit e o da Área do Cliente (PaxMed Members) usam o MESMO componente (`components/MeuPulsoCliente.tsx`): mexeu no molde, vale nos dois.

## Selos (botões coloridos)
- Faixa do Pulso: `<span className="bevel-3d pn-chip" data-nivel="normal">`.
- Faixa própria (ex.: antropometria): mesmo selo com `style={{ ["--c"]: cor }}`.
- Painel que resume várias medidas: legenda dos 5 níveis + referências de todas as medidas.
- NUNCA quadradinho de cor solto.

## Cores dos níveis (Pulso)
muito baixo azul, baixo ciano, normal verde, alto âmbar, muito alto vermelho (`--n-mb/--n-b/--n-n/--n-a/--n-ma`, com variante `.dark`). Medida sem faixa: a seção de cima continua existindo e explica por que não há faixa (nunca some).

## Conteúdo (regra de dado)
- Referências: internacionais e nacionais, mais importantes + a mais recente de cada lado; conferir o endereço aberto antes de citar; nunca de memória.
- Antropometria: lista única em `avaliacoes/referenciasAntropometria.ts`; regra em `specs/regra-ajuda-antropometria-referencias.md`.
- Faixa só entra se existir na fonte; número não conferido não entra.

## Proibido (erros já cometidos em 22/11/2026)
- Criar outro layout de janela, outra tabela com quadradinho de cor, outro cartão de referência.
- Escrever referência solta dentro do componente da tela.
- Esquecer `style color var(--pn-tinta)` e `pn-escopo` (a janela perde tema).

## Checklist
- [ ] A janela é `JanelaAjuda` (nenhum `Dialog` solto para "?").
- [ ] Ordem: botões coloridos, por que, (para lembrar), referências bibliográficas.
- [ ] Referências no formato `Referencia` do Pulso, sem recolher/expandir.
- [ ] Conferida no cockpit e na Área do Cliente, claro e escuro, 390 px e 1280 px.
- [ ] Toda janela nova de "?" no sistema inteiro (inclusive PAX FINANCE) entra neste molde.
