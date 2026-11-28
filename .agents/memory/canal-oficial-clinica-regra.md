---
name: Canal oficial da clínica (celular + bot Telegram)
description: Regra do toggle que marca um cadastro de cliente como o celular oficial da empresa licenciada; CNPJ sempre da empresa da sessão.
---

Regra (decisão do CEO, 18/11/2026): o cadastro marcado como "celular oficial da empresa" representa o número da própria clínica, que conversa com o bot do Telegram. Ao ligar, ele assume SOMENTE o CNPJ e os dados da empresa da sessão, nunca de outra empresa.

- CPF continua como CPF (não vira CNPJ, não é sobrescrito); CNPJ e dados da empresa aparecem em painel próprio, somente leitura; selo de identificação fora do painel, no cabeçalho.
- Só campos de comunicação (número, WhatsApp, Telegram) ficam editáveis; o restante fica cinza. Só o CEO liga/desliga; um canal ativo por empresa (índice único parcial); empresa A nunca altera B.
- Logos (símbolo e logo) por empresa NÃO existem no banco: mostrar "não cadastrado na empresa", nunca inventar.
- CNPJs do banco de desenvolvimento são FICTÍCIOS (CEO, 02/11/2026); o CNPJ verdadeiro da Paduccia só o CEO tem. Convenção: Instituto Padua = Paduccia Clínica Médica = Clínica Padua; Instituto Padilha é outra empresa (13).
- Pendências conhecidas: auditoria (quem/quando/antes/depois), bloqueio dos campos pessoais no servidor, permissão por CEO de cada clínica, recusar ligar com histórico clínico (cadastro 44 já está ligado com protocolos, exames e mensagens).

**Why:** o mesmo erro (mistura de cadastro de pessoa com número da clínica no Telegram) se repetiria em cada clínica licenciada.
**How to apply:** ao mexer em cadastro de cliente, Central Telegram ou empresas, ler isto antes; texto explicativo da regra vive no painel do toggle (edit.tsx, data-testid canal-clinica-regra).

Atualização 18/11/2026: o CEO ordenou deixar o cadastro 44 LIGADO (assume a empresa 5) e implementar tudo. Feito: auditoria (tabela canal_clinica_auditoria), bloqueio de dados pessoais também no servidor (403 em PUT/PATCH), ligar com histórico clínico exige confirmação explícita (409 HISTORICO_CLINICO + botão), nada é convertido ou apagado. Permissão segue isPlatformOwner; "CEO por clínica licenciada" ainda não existe como papel. O 44 foi ligado antes da auditoria, então não há linha de auditoria dessa ligação.
