# Onda 3 — Cockpit da Consulta: consolidação fiel, catálogo por categoria, crachá clínico

## Objetivo (uma frase)
Fazer o Cockpit da Consulta (/cockpit-cliente) reproduzir FIELMENTE as telas
originais (Prescrição, Injetáveis, Prescritor de Exames) de forma embutida na
mesma tela, com catálogo de injetáveis por categoria, períodos só os da
mensageria, seleção de cliente que não some, e um cabeçalho tipo "crachá clínico"
do paciente — tudo sob o sistema de design Paxter (skill-layout-paxter).

## Estado atual verificado (fonte-da-verdade)
- Shell: `artifacts/padcom/src/pages/cockpit-cliente/index.tsx`.
- Prescrição no cockpit = `pages/cockpit/panels/PrescricaoFormulasPanel.tsx`
  (REIMPLEMENTAÇÃO que divergiu da original `pages/prescricao/index.tsx`).
- Injetáveis/Implantes = `pages/cockpit/panels/Injetaveis.tsx` + `LancadorInline.tsx`
  (REIMPLEMENTAÇÃO da original `pages/protocols/new.tsx`).
- Exames = `PedidosExamesPanel` + `ExamesEnviadosPanel` (NÃO mostra as faixas/blocos
  do Prescritor de Exames `pages/exames/index.tsx`, que lê `/api/cadastros/blocos`).
- Seleção de cliente: `useState` — some ao sair da rota (BUG relatado).
- Períodos hoje: 22 textos livres em `prescricao/data.ts` (`PERIODOS`).
- Períodos canônicos da mensageria (tabela `periodos_dia`, 9): JE Jejum, IM Início
  da Manhã, MM Meio da Manhã, AL Almoço, IT Início da Tarde, MT Meio da Tarde,
  NO Noite, FN Final da Noite, CE Ceia.
- `clients` tem `photoUrl` (text) e `fichaClinica` (jsonb) — usáveis no crachá.

## Requisitos exatos
1. INJETÁVEIS POR CATEGORIA: no seletor de substância do Lançador (aba Injetáveis),
   TODAS as substâncias do catálogo aparecem, agrupadas/filtráveis por categoria de
   via: Intramuscular (IM), Endovenoso/Intravenoso (IV), Subcutâneo (SC) e Implante.
   Botões de categoria no mesmo padrão visual das categorias de fórmula.
2. PRESCRIÇÃO IDÊNTICA: a aba Prescrição do cockpit deve ser visual e funcionalmente
   idêntica à tela original `/prescricao` (mesmas categorias, mesmo catálogo, mesma
   montagem da receita), porém embutida (sem navegar para fora).
3. PERSISTÊNCIA DO CLIENTE: o cliente selecionado NÃO some ao sair da tela e voltar.
   Persistir a seleção (localStorage e/ou URL) e reidratar ao reabrir o cockpit.
4. FAIXAS DE EXAMES: a aba Exames mostra as faixas/blocos do Prescritor de Exames
   (`/api/cadastros/blocos`) com os botões para selecionar os exames de cada faixa,
   idêntico ao original `/exames`, embutido.
5. PERÍODOS SÓ DA MENSAGERIA: onde se escolhe o período da prescrição, oferecer
   SOMENTE os 9 períodos canônicos de `periodos_dia` (vinculados aos lembretes),
   não a lista de 22 textos livres. Ordem = coluna `ordem`.
6. REMOVER SÍMBOLO PAXTER REDUNDANTE do cabeçalho do cockpit (a marca já está no
   sistema; não repetir o símbolo dentro do cockpit).
7. CRACHÁ CLÍNICO NO CABEÇALHO: nome do paciente em destaque, alinhado à esquerda,
   com espaço de FOTO (usa `photoUrl`; se vazio, silhueta neutra) e CAMPOS FIXOS de
   patologias diagnosticadas + principais características de saúde. Campo sem dado
   fica VAZIO ("—"), nunca some (Padrão 12 da skill). Campos fixos definidos na
   seção "Decisão do CEO" abaixo.
8. TELAS IDÊNTICAS, INLINE: as telas importadas (Prescrição, Injetáveis, Exames)
   devem ser idênticas às originais, na mesma tela do cockpit. Arquitetura:
   reusar o componente real com modo embutido (`clientId`/`embedded`) em vez de
   reimplementar — assim "idêntico" é garantido por ser o MESMO código.
9. LAYOUT MÉDICO (skill-layout-paxter): aplicar painéis/sub-painéis 3D, placas de
   título (Padrão 3), grade imaginária (Padrão 12/13), respiro entre peças
   (Padrão 8). Atuar como médico: o cockpit tem que servir a decisão clínica num
   relance.

## Decisão do CEO (campos fixos do crachá clínico) — A DEFINIR
Default recomendado (visão médica): FOTO | NOME (grande) + IDADE + SEXO |
campos fixos: ALERGIAS, PATOLOGIAS/COMORBIDADES (diagnósticos), MEDICAÇÕES
CONTÍNUAS, TIPO SANGUÍNEO, e um resumo de HÁBITOS (tabagismo/álcool). Fonte:
`fichaClinica` (jsonb) + achados da anamnese. Aguardando confirmação do CEO.

## Casos extremos
- Cliente sem `photoUrl`: silhueta neutra (não quebra layout).
- Cliente sem `fichaClinica`/anamnese: todos os campos fixos mostram "—".
- Substância sem via classificada: cai numa categoria "Outros" (não some).
- Período legado (texto livre já salvo) continua exibível, mas a ESCOLHA nova só
  oferece os 9 canônicos.
- Sair e voltar: reidratar cliente sem exigir reseleção.

## Definição de PRONTO
- Aba Prescrição idêntica à `/prescricao` (screenshot lado a lado).
- Aba Injetáveis com todas as substâncias por categoria IM/IV/SC/Implante.
- Aba Exames com faixas/blocos + botões idênticos ao `/exames`.
- Escolha de período oferece só os 9 canônicos.
- Cliente persiste após navegar e voltar (teste real).
- Símbolo Paxter redundante removido do cabeçalho do cockpit.
- Crachá clínico com foto + campos fixos (vazios quando sem dado).
- Layout sob a skill; architect sem pendência grave.

## Linhas vermelhas
- NÃO mudar o motor de cálculo/payload de salvar por estética (regra-mãe da skill).
- NÃO alterar os 9 períodos canônicos nem a lógica de lembretes/mensageria.
- NÃO tocar no motor de anamnese nem no contrato do Cartório.
- Marca visível ao cliente continua PAXTER (não reverter marca).
