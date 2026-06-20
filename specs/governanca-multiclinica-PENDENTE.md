# Spec — Governanca, Area do Colaborador e Multi-clinica (BRACO PENDENTE)

Data: 20/06/2026
Autor: Dr. Replit Paxter
Status: **PENDENTE / PARADO DE PROPOSITO** (decisao do CEO Dr. Caio em 20/06/2026)
Metodo: Paxter Loop (Especificar -> Construir -> Revisar)

## Por que este escopo esta PARADO (ler primeiro)

O CEO decidiu GUARDAR este escopo escrito, mas NAO construi-lo agora, para nao derivar do foco
imediato: operacionalizar AINDA HOJE o auto-reagendamento da cliente (ver
`specs/auto-reagendamento-cliente.md`). Este arquivo e a "semente" — quando o CEO mandar retomar,
o agente comeca daqui sem reinventar. Nada aqui deve ser implementado sem ordem expressa do CEO.

Referencia visual: organograma no Canvas, ENTREGA 7 (selo "7"), cores da marca.

## Objetivo (uma frase)

Preparar o caminho para o Padcon Conect virar um SaaS MULTI-CLINICAS, com um CENTRO DE COMANDO que
delega as clinicas (filiais), governanca por PAPEL + ESCOPO (RBAC) e validacao opcional de
agendamento por funcionario — deixando os "bracos" prontos hoje, sem reescrever amanha.

Siglas:
- RBAC (Role-Based Access Control) = controle de acesso por cargo: UM app de colaborador; cada cargo
  ve so o que foi liberado.
- Multi-tenant (multi-inquilino) = varias clinicas no mesmo sistema, com dados isolados entre si.
- Allowlist = lista do que pode (oposto de lista de bloqueio).
- Auditoria = trilha de quem fez o que e quando.

## Arquitetura proposta (a "minha solucao" aprovada no papel)

1. Camada ORGANIZACAO (tenant) acima das `locations` (unidades). Hoje = 1 organizacao (Clinica Padua
   / PADCOM) com varias unidades (Tatuape, Mooca, Domiciliar). Amanha = N organizacoes (ex.: clinica
   da Dra. Fernanda) sob um CENTRO DE COMANDO.
2. Tudo escopado por `organization_id` (isolamento por linha): uma clinica NUNCA enxerga dado de
   outra. O Centro de Comando e o escopo de topo do MESMO RBAC (nao um sistema separado).
3. RBAC = (pessoa, papel, escopo). Papel = medico/enfermeira/secretaria(adm)/financeiro (ja existe o
   campo `role` em `professionals`). Escopo = organizacao inteira (centro de comando), uma clinica,
   ou uma unidade.
4. UM app de colaborador (rota futura, ex.: `/colaborador`): cada pessoa loga e ve so o que o
   papel+escopo permitem. O CEO configura permissoes numa tela de governanca. NAO criar varias telas
   soltas por cargo.

## Fluxo de validacao de agendamento (governanca)

- Liga/desliga POR agenda: "esta agenda exige validacao?".
- SE NAO: confirma na hora (comportamento atual) -> Google Calendar + e-mail/WhatsApp.
- SE SIM: o pedido da cliente vira SOLICITACAO PENDENTE (nao confirma) -> cai na fila do funcionario
  responsavel (ex.: secretaria) -> ela AUTORIZA (confirma) ou SUGERE outro horario (volta a cliente).
- Tudo com AUDITORIA: quem autorizou e quando.
- Conceito novo: entidade "solicitacao de agendamento" com status pendente/aprovada/sugerida/recusada,
  separada da sessao confirmada. A sessao so e criada/movida quando aprovada.

## Agendas reais do Google + liberacao por cliente

- A lista de agendas selecionaveis passa a ESPELHAR as agendas reais do Google Calendar
  (AGENDA GERAL, AGENDA MEDICO, AGENDA ENFERMAGEM).
- Cada recurso agendavel mapeia para uma agenda do Google.
- Allowlist POR cliente, configurada na tela de cadastro do cliente: quais agendas aquele cliente
  pode marcar. Guardar no cliente (ex.: coluna jsonb `allowed_calendars` / `allowed_resource_ids`).

## Ondas (quando o CEO mandar retomar)

- ONDA 3: agendas do Google reais + liberar por cliente no cadastro.
- ONDA 4: fluxo de validacao (solicitacao pendente + auditoria; liga/desliga por agenda).
- ONDA 5: Area do Colaborador (RBAC papel + escopo) + acoes AUTORIZAR / SUGERIR.
- BRACO multi-clinica: camada ORGANIZACAO semeada junto da Onda 5, DORMENTE ate o CEO ligar o
  Centro de Comando.

Cada onda = sua propria spec + revisao do architect antes de dar por pronta.

## "Bracos prontos" — o que semear sem ativar (Kaizen)

Quando autorizado: adicionar as costuras (seams) dormentes — coluna `organization_id` nas tabelas de
negocio e o ESCOPO no modelo de acesso — sem construir a tela do Centro de Comando. Hoje roda como 1
organizacao (zero mudanca para o usuario); ligar a 2a clinica vira configuracao, nao obra.

## Linhas vermelhas (NUNCA)

- NAO construir nada deste arquivo sem ordem expressa do CEO (esta PARADO de proposito).
- NAO misturar este braco com a operacionalizacao do reagendamento (foco de hoje).
- Ao retomar: NAO inventar tag/prefixo de origem (regra dos sistemas primos); dado nativo do sistema.

RESUMO EM 1 LINHA: escopo da governanca + multi-clinica guardado como semente PENDENTE; retomar so
por ordem do CEO, comecando pela camada Organizacao + RBAC por escopo, sem reescrever o que ja existe.
