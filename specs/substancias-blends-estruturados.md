# Spec — Blends estruturados no cadastro de substâncias

Data: 28/09/2026

## Objetivo

Transformar a composição de um blend de texto livre em dados estruturados, sem
perder o blend como uma única unidade comercial de estoque, preço e protocolo.

## Requisitos exatos

1. A substância comercial terá um indicador explícito `É um blend`.
2. O cadastro continuará aceitando as vias:
   - Endovenoso (IV);
   - Intramuscular (IM);
   - Subcutâneo (SC);
   - Implante.
3. O cadastro de uma substância/blend terá apresentação comercial:
   - quantidade da apresentação;
   - unidade da apresentação;
   - volume total da ampola em mililitros.
4. Um blend terá componentes em linhas estruturadas, cada um com:
   - ordem;
   - nome do componente;
   - vínculo opcional com outra substância do catálogo;
   - dose numérica, quando conhecida;
   - unidade da dose;
   - quantidade de unidades/ampolas, quando aplicável;
   - observação.
5. A composição textual antiga será preservada como legado e fallback visual.
6. No protocolo, um blend continuará sendo selecionado como UM item comercial,
   sem criar quatro aplicações independentes automaticamente.
7. No estoque, preço, sessões e agenda, o blend continuará contando como uma
   unidade comercial. A tela poderá mostrar os componentes apenas como detalhe.
8. O cadastro exibirá o resumo do blend:
   - “1 ampola”;
   - “2 mL”;
   - lista dos componentes e suas doses.
9. A edição não apagará nem fundirá registros duplicados. Nomes repetidos
   continuarão com identificadores próprios até revisão humana.
10. A lista existente será corrigida de forma conservadora:
    - ADEK será marcado como blend;
    - ADEK terá 1 ampola de 2 mL;
    - ADEK terá quatro componentes estruturados com os dados confirmados nos
      prints;
    - registros chamados exatamente “BLEND” serão marcados como blends quando
      já possuírem composição, mas seus componentes não receberão doses
      inventadas.
11. A tela de lançamento deverá incluir SC nos filtros de injetáveis.
12. O catálogo não deverá transformar automaticamente uma composição textual em
    dose clínica quando a dose não estiver explícita.

## Casos extremos

1. Componente sem substância correspondente no catálogo: permitir nome livre.
2. Dose desconhecida: mostrar “dose não informada”, nunca zero.
3. Volume desconhecido: mostrar “—”, nunca 0 mL.
4. Blend com mais de uma ampola: manter quantidade separada do volume por ampola.
5. Dois blends com o mesmo nome: usar o identificador e a composição para
   diferenciar, sem apagar nenhum.
6. Blend de implante, IV, IM ou SC: a mesma estrutura deve funcionar para todas
   as vias.
7. Registros antigos com somente `composicao`: conservar o texto e sinalizar a
   necessidade de revisão estruturada.

## Definição de PRONTO

1. A estrutura de dados existe sem DROP, TRUNCATE ou exclusão de registros.
2. A tela permite ativar/desativar o indicador de blend.
3. A tela permite adicionar, editar e remover componentes estruturados.
4. A ADEK aparece como 1 ampola, 2 mL e quatro componentes.
5. Um blend continua sendo uma única opção no lançador de protocolo.
6. SC aparece na opção correta do lançador.
7. Um registro sem blend continua funcionando exatamente como antes.
8. A lista mostra duplicidades de nome sem fingir que são a mesma substância.
9. A rota de leitura e a de gravação funcionam com dados reais.
10. A tela é conferida visualmente em desktop e em largura móvel.
11. O log do servidor sobe sem erro depois da alteração.

## Linhas vermelhas

- Nunca apagar ou fundir substâncias existentes automaticamente.
- Nunca inventar dose, concentração, volume ou quantidade.
- Nunca transformar componentes de um blend em aplicações clínicas separadas
  sem decisão explícita.
- Nunca alterar o motor de criação de protocolo por estética.
- Manter a composição textual antiga como backup legível.