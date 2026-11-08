# Seleção de agendas e detalhes dos compromissos

## Objetivo

Permitir escolher uma, várias ou todas as agendas da empresa na tela de Agenda
Diária, sem alterar eventos do Google, e consultar detalhes de um compromisso
com identidade comprovada. Preservar as sessões injetáveis do sistema e sua
distinção entre aplicações do dia e próximas aplicações.

## Contrato e limites

- A seleção identifica agendas pelo identificador do local, nunca pelo nome ou
  pela cor. Agendas da empresa sem eventos no período continuam selecionáveis.
- A seleção atua sobre compromissos importados; sessões clínicas só podem ser
  associadas a uma agenda quando um vínculo persistido provar essa associação.
  Sessões sem vínculo não são ocultadas nem atribuídas por palpite.
- Títulos pessoais continuam protegidos pelo servidor. Nenhum compromisso
  importado será associado a uma pessoa por correspondência de nome.
- Na lista, clicar no compromisso abre seus dados já retornados de forma
  somente leitura. Compromissos importados sem vínculo comprovado com sessão
  não exibem aplicações nem controles clínicos falsos.
- Para sessão legítima, reaproveitar o cartão existente e as aplicações já
  classificadas pelo motor. Itens futuros ficam visíveis, mas não confirmáveis.
- Falha de carregamento, ausência de calendários e filtro sem resultado são
  estados diferentes. Contagens refletem o período e a busca.
- Preservar contexto da empresa e limpar seleção ao trocar de identidade.

## Riscos e verificações

| Falha | Efeito | Barreira e teste |
| --- | --- | --- |
| Agendas com nomes iguais | Evento na agenda errada | Identificador numérico e teste de colisão. |
| Troca de empresa ou período | Seleção antiga esconde dados | Identidade no estado e reconciliação de identificadores. |
| Agenda vazia | Usuário não consegue selecioná-la | Listagem independente de haver compromissos. |
| Evento importado sem vínculo | Dados clínicos errados | Não inferir pessoa ou sessão pelo título. |
| Título pessoal sensível | Exposição indevida | Preservar anonimização no servidor e acesso autenticado. |
| Protocolo revalidado | Apagamento de sessões existentes | Não chamar rotina destrutiva na criação real. |
| Apresentação no catálogo não equivale a prescrição | Dose clínica inventada | Médico informa dose e via antes de emitir. |
| Calendário só filtra Google | Indução a erro | Identificar explicitamente o alcance e manter sessões sem vínculo. |
| Consolidação semanal altera o dia de intervalos diferentes | Sessão a cada 15 dias vira sessão em outro dia | Bloquear uso real do fluxo até corrigir o motor e comprovar as datas exatas. |
| Motor de validação usa 09:00 fixo | Horário solicitado de 10:00 é ignorado | Não criar o protocolo real por esta rotina enquanto não houver horário informado e validado. |

## Aceite

Testar seleção individual, múltipla, todas e nenhuma; listas de período vazio,
nomes iguais e troca de empresa; leitura de detalhes sem mutação; e separação
entre substâncias do dia e futuras. Verificar em computador e celular, com
acesso autenticado quando disponível.

## Estado da entrega em 07/11/2026

**BLOQUEADA — não homologada.** O filtro implementado alcança somente os
compromissos importados; a seleção global de empresa não é propagada por esta
tela e as sessões clínicas ainda não têm filtro integrado. A revisão independente
identificou também nomes pessoais expostos, nomes iguais indistinguíveis e
contagem sem busca; foram alterados o mascaramento, a distinção por código e a
contagem. Falta comprovar esses ajustes em uma revisão independente e em
interações autenticadas reais. A captura sem autenticação mostra somente a
mensagem de acesso negado, não o funcionamento com dados reais.

O agendamento e a emissão de receita solicitados permanecem não realizados:
validar o protocolo atualmente remove sessões existentes, fixa 09:00 e
consolida datas por semana, podendo contrariar os intervalos informados.
Além disso, a emissão clínica requer uma sessão autenticada legítima; não
usar identidade forjada ou contornar essa exigência.
