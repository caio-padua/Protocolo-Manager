# Spec — Redesign da Marcação de Consulta (DNA de menu agrupado)

Loop Paxter. Decisões travadas pelo CEO Dr. Caio em 01/07/2026.
Tela real: `artifacts/padcom/src/pages/agendar.tsx` (rota pública `/agendar`).

## Objetivo (uma frase)
Reestruturar o MENU de entrada da marcação de consulta para o layout agrupado em dois níveis
definido pelo CEO, com a mesma organização nos dois temas (só a cor muda entre claro e escuro),
sem tocar no motor de agenda nem no pagamento.

## Layout definido (o alvo)
Menu de entrada passa a ter TRÊS itens no primeiro nível:

```
[ Dr. Caio — cartão EXCLUSIVO (destaque máximo) ]      -> abre fluxo "drcaio" (concierge)
CORPO CLÍNICO
[ Médicos Assistentes (agrupador) ]                     -> abre fluxo "assistente" (lista de médicos)
OUTROS SERVIÇOS
[ Outras Categorias (agrupador) ]                       -> abre sub-tela "outras"
        |
        +-- [ Aplicação de Injetáveis ]  -> /anamnese/v2
        +-- [ Procedimento Estético ]    -> abre fluxo "estetico"
```

Diferença por tema (aprovada pelo CEO):
- CLARO = pele Editorial: cartão do Dr. Caio claro com fio de ouro; irmãos claros.
- ESCURO = pele Carteira: cartão do Dr. Caio navy "black card" com selo DIRETOR e botão CONCIERGE; irmãos navy.
- Os agrupadores e cartões irmãos têm o MESMO layout nos dois temas; só a cor adapta.

## Requisitos exatos
1. O menu (`flow === "menu"`) mostra, nesta ordem: cabeçalho + título "Como podemos ajudar?",
   cartão Dr. Caio (destaque), rótulo "CORPO CLÍNICO", agrupador "Médicos Assistentes",
   divisória "OUTROS SERVIÇOS", agrupador "Outras Categorias".
2. Injetáveis e Estética SAEM do primeiro nível e passam a viver atrás do agrupador "Outras Categorias".
3. Nova sub-tela `flow === "outras"`: botão voltar + título "Outras Categorias" + dois cartões
   (Aplicação de Injetáveis -> `/anamnese/v2`; Procedimento Estético -> `flow "estetico"`).
4. Cartão do Dr. Caio é MAIOR e MAIS LARGO que os irmãos; os agrupadores/irmãos têm todos o
   MESMO tamanho entre si (requisito do CEO).
5. No tema ESCURO, o cartão do Dr. Caio usa o tratamento navy "black card": selo DIRETOR, ícone
   coroa em poço, botão de ouro "CONCIERGE EXCLUSIVO", rodapé "ACESSO PRIORITÁRIO / AGENDA PROTEGIDA".
   No CLARO usa o tratamento editorial (fio de ouro + "ATENDIMENTO EXCLUSIVO" + chevron).
6. As frases editáveis do site (getPhrase: btnDrCaio, btnEstetico, etc.) continuam alimentando os
   textos dos cartões — NÃO trocar por texto fixo.
7. O botão de tema (sol/lua) continua no cabeçalho e alterna claro/escuro (useScreenTheme).
8. Todos os destinos de clique atuais continuam funcionando: Dr. Caio -> drcaio; Assistentes ->
   assistente; Injetáveis -> /anamnese/v2; Estético -> estetico.

## Casos extremos a tratar
- Voltar de "outras" para "menu" sem perder estado (botão voltar).
- Tema escuro e claro renderizam sem quebra de contraste (texto legível nos dois).
- Sem vídeo de apresentação (videoItem ausente): layout não quebra.
- Cartões com nome longo (frase do site grande): truncar sem estourar o cartão.

## Definição de PRONTO
- Menu real em `/agendar` mostra o layout de 3 itens agrupados descrito acima.
- "Outras Categorias" abre a sub-tela com Injetáveis + Estética e ambos navegam certo.
- Screenshot do menu no CLARO e no ESCURO conferido visualmente (Dr. Caio destacado, irmãos iguais).
- Nenhuma linha vermelha violada.
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas (NUNCA tocar)
- Motor de agenda (`useGetAgendaSlots`, `/api/scheduling/agenda/slots`) e sua lógica.
- Pagamento/concierge (`useCreateConciergeCharge`, `useGetSchedulingPaymentStatus`, Asaas) e o cartão
  "Via Concierge" dentro do fluxo drcaio.
- Contrato/endpoints de scheduling (`useCreateSchedulingRequest`, `useUpdateSchedulingRequest`).
- Banco de dados e qualquer schema. Esta onda é SÓ apresentação do menu de entrada.

## Escopo do "todas as telas subsequentes" (staging do loop)
- ITERAÇÃO 1 (esta): menu de entrada + sub-tela "Outras Categorias". É o "layout que definimos".
- ITERAÇÕES seguintes (após aprovação, cada uma seu próprio passo do loop): passar o DNA (rótulos de
  seção em ouro, cartões irmãos uniformes, cabeçalho padrão) às telas subsequentes do fluxo
  (drcaio, assistente, estetico) mantendo motor/pagamento intactos.
