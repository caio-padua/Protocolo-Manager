# Vínculo empresarial do profissional (Corpo Clínico)

Data: 09/11/2026. Pedido do CEO (Dr. Caio) com duas telas de exemplo (Enf. Dayana Ludman).

## 1. Objetivo

1.1 Cada profissional passa a ter UM vínculo originário: a empresa de origem dele.
1.2 Cada profissional pode prestar serviço em até 5 empresas: 1 principal (o originário) e até 4 adicionais.
1.3 A agenda do profissional só pode ser aberta nos locais das empresas em que ele está cadastrado.
1.4 Dayana Ludman: originário = Instituto Pádua (empresa 5); só agendas do Instituto Pádua.

## 2. Modelo de dados (somente aditivo)

| Dado | Onde mora | Observação |
|---|---|---|
| Vínculo originário (posição 1) | `professionals.empresa_id` (coluna que já existe) | Fonte única. Vazio = Instituto Pádua (regra legada, igual a `locations.empresa_id` vazio). |
| Vínculos adicionais (posições 2 a 5) | tabela nova `professional_empresas` | Única por (profissional, empresa) e por (profissional, posição). Posição entre 2 e 5. |
| Agenda liberada | `location_professionals` (já existe) | Não muda de formato. Passa a ser validada contra as empresas do profissional. |

Regra de ouro: nada é apagado. A carga inicial cria os vínculos adicionais que já existem de fato
(profissional ligado a local de outra empresa), para que nenhum acesso atual se perca
(exemplo: Dr. Kleber Lemos, empresa 5, atende no local 16 da empresa 2 = Lemos vira adicional).

## 3. Regras de negócio

3.1 Só o dono da plataforma (CEO) altera vínculos (rota já exige `requirePlatformOwner`).
3.2 Empresa elegível: clínica ativa (`ativa = true`, não arquivada, tipo clinic ou genesis_seed, não dona da plataforma).
3.3 Sem repetição: a mesma empresa não ocupa duas posições.
3.4 Máximo 5 posições (1 originária + 4 adicionais).
3.5 Retirar uma empresa que ainda tem agenda liberada do profissional é recusado (409), listando as agendas. Nada é desligado sozinho.
3.6 Trocar o originário: a empresa antiga sai da lista; se ela ainda tem agenda liberada, recusa (409) pelo mesmo motivo.
3.7 Liberar agenda (`POST /professionals/:id/locations` e `POST /locations/:id/professionals`): local de empresa fora das empresas do profissional é recusado (409).
3.8 Dono da plataforma enxerga e liga agendas de TODAS as empresas do profissional; os demais, só da empresa da sessão.
3.9 O profissional aparece no Corpo Clínico de cada empresa em que está cadastrado (originária ou adicional).
3.10 O acesso (`tenantContext`) passa a reconhecer as empresas adicionais como vínculo.
3.11 Mudança de vínculo vai para o Histórico do profissional (trilha de auditoria que já existe).

## 4. Falhas previstas e como cada uma é impedida

| Falha prevista | Prevenção |
|---|---|
| Rota sem login `POST /locations/:id/professionals` contorna a regra | Passa a exigir colaborador + dono da plataforma e usa a mesma validação |
| Duas abas salvando ao mesmo tempo estouram o limite de 5 | Salvar numa transação com a linha do profissional travada (`FOR UPDATE`) |
| Empresa inativa já vinculada bloqueia qualquer salvamento | Só empresas NOVAS são validadas como ativas; as já vinculadas permanecem |
| Remover empresa deixa agenda órfã em local dessa empresa | Recusa 409 com a lista (3.5) |
| Carga inicial roda duas vezes | Idempotente: só insere o que falta |
| Carga inicial com mais de 4 empresas adicionais | Limita a 4 e avisa no log; nenhum vínculo de agenda é tocado |
| Local sem empresa (legado) | Conta como Instituto Pádua (5) |
| Tela antiga Equipe (`/cadastros/equipe`) lista todos os locais | Passa a listar só locais das empresas do profissional |
| Servidor sobe sem a tabela nova | Criação idempotente no boot, antes de aceitar requisições |

## 5. Tela

5.1 Aba DADOS: seletor "VÍNCULO ORIGINÁRIO" na faixa de identidade, salvo com o botão do rodapé.
5.2 Aba VÍNCULOS: bloco "EMPRESAS ONDE PRESTA SERVIÇO" com 5 posições fixas (Principal, Secundária, Terciária, Quaternária, Quinária). Posição 1 só espelha o originário. Posições 2 a 5 são seletores e salvam na hora, como os interruptores de agenda.
5.3 Aba VÍNCULOS: lista de agendas agrupada por EMPRESA (depois estado e zona), só das empresas dele.
5.4 Cartão da lista: selo do vínculo originário e contagem de empresas (slot fixo, "—" quando vazio).

## 6. Provas exigidas (Nível | Esperado | Obtido | Passou)

6.1 Teste em banco descartável: carga inicial idempotente, limite 5, repetição, empresa inválida, remoção bloqueada, local fora das empresas recusado, dono vê tudo.
6.2 Consulta no banco de desenvolvimento: Dayana originária = 5 e vínculos de agenda só em locais da empresa 5.
6.3 Registros do servidor sem erro após reiniciar.
6.4 Tela: o login impede a captura direta; a prova visual usa `e2e/corpo-clinico-empresas.spec.ts` (respostas simuladas, dados sintéticos). Não prova a tela contra o banco real.
6.5 Também filtrado: `cadastros/equipe` (diálogo de vínculos) mostra só clínicas das empresas do profissional.
