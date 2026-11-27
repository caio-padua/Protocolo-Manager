# Contratos das telas com o Manager

Verificado no código de `artifacts/api-server/src/routes` em 27/11/2026. Lista só rotas que existem. Onde o formato de resposta não foi conferido, está marcado "a conferir". Nenhuma integração aqui está declarada concluída.
Arquitetura: [lovable-manager.md](lovable-manager.md).

Convenções gerais:

- Prefixo `/api`. A tela usa o endereço do Manager configurado por ambiente, nunca endereço fixo no código.
- Corpo em JSON (`Content-Type: application/json`).
- Rotas públicas têm limite por IP em memória e devolvem 429 quando excedido.
- Segredos e chaves nunca vão no navegador.
- Cabeçalho `X-Request-Id`: o Manager hoje NÃO o aceita nem o devolve em chamadas feitas de outra origem (verificado em resposta de pré-verificação local). Decisão pendente antes de o Lovable enviá-lo.
- Origens: a lista do servidor inclui `paxmed.com.br`, `www.paxmed.com.br`, `paxcare.com.br`, `www.paxcare.com.br`, `paxmed.lovable.app`, `padaxor.lovable.app` e `lovable.app`. A prévia `id-preview--eb745d14-....lovable.app` NÃO está na lista.

## 1. Contato (público)

`POST /api/vitrine-contatos`

| Campo | Obrigatório | Regra no servidor |
|---|---|---|
| nome | sim | 2 a 120 caracteres |
| email | sim | formato válido, vira minúsculo |
| telefone | não | até 20 caracteres |
| clinica | sim | mínimo 2 |
| especialidade | sim | mínimo 2. Enviar valor fixo, não texto traduzido |
| volume_protocolos | não | texto até 100 |
| necessidade | sim | 5 a 2000 |
| source | não | texto livre até 200 (o Lovable usa `paxmed-homepage`) |
| utm | não | objeto, sanitizado |

Resposta: 200 `{ ok: true }`; 400 `{ error }`; 429; 500. Consentimento não é recebido nem gravado. Duplicidade não é tratada.
Painel: `GET /api/vitrine-contatos` e `PATCH` de contato (exigem colaborador).

## 2. Leads do portão de demonstração (público)

`POST /api/vitrine-leads`

| Campo | Obrigatório | Regra |
|---|---|---|
| tipo | sim | `paciente` ou `clinica` |
| nome | sim | validado |
| cpf | sim | 11 dígitos válidos |
| cnpj | só se tipo clinica | 14 dígitos válidos |
| telefone | sim | DDD + número |
| rotaOrigem ou source | não | mesmo campo |
| utm | não | objeto sanitizado |

Resposta: 200 `{ ok: true }`. Mesmo CPF no mesmo tipo atualiza e soma acessos (não duplica). A liberação visual do portão no Lovable é local e não protege dado privado.
Painel: `GET /api/vitrine-leads`, `PATCH /api/vitrine-leads/:id/contato` (colaborador).

## 3. Convite PAXMED

`POST /api/vitrine-convites` (público, 5 por minuto por IP)

| Campo | Obrigatório | Regra |
|---|---|---|
| nome | sim | 3 a 120 |
| email | sim | válido, vira minúsculo |
| crm | sim | 3 a 8 dígitos (só formato, sem consulta ao conselho) |
| uf | sim | 2 letras, vira maiúsculo |
| especialidade | sim | 2 a 120 |
| clinica | não | até 160 |
| cidade | sim | 2 a 120 |
| mensagem | não | até 1000 |
| consentimento | sim | precisa ser o valor booleano `true` |

Resposta: 201 `{ ok: true, protocolo: "PXM-XXXX-XXXX" }`; 400; 429; 500.

`POST /api/vitrine-convites/status` (público, 10 por 10 minutos por IP): corpo `{ protocolo, email }`. Resposta `{ found: false }` ou `{ found: true, status, criadoEm, atualizadoEm }`. Valores de `status`: `recebida`, `em_analise`, `aprovada`, `lista_espera`, `recusada`. Protocolo e e-mail juntos; erro de formato é 400.

Gestão (titular da plataforma): `GET /api/vitrine-convites?status=` e `PATCH /api/vitrine-convites/:id/status` com `{ status }`. Aprovar só muda o status.

Testado: sim, em banco descartável, com dados sintéticos.

## 4. Login de profissional (médico, clínica)

`POST /api/collaborator/login`: corpo `{ identifier (ou username), password }`. Aceita e-mail, CPF ou usuário. 400 se vazio; 401 se inválido. Formato exato da resposta (`token`, dados do profissional, expiração): a conferir antes de integrar.
Recuperação: `POST /api/collaborator/password-recovery/request` e `.../complete`. O contrato descrito pelo Lovable (`password-recovery` com `{email}`) é diferente e não existe.

## 5. Login e sessão do paciente

| Rota | Função |
|---|---|
| `POST /api/area-paciente/login` | corpo `{ cpf, password }`; resposta `{ id, name, cpf, token }` ou `{ mustChangePassword: true }` |
| `POST /api/area-paciente/pre-cadastro`, `/definir-senha`, `/trocar-senha` | primeiro acesso e senha |
| `POST /api/area-paciente/sessao/iniciar` (Bearer do paciente), `/renovar`, `/encerrar` | sessão por cookie; o token de renovação não volta no corpo |

A rota `POST /api/patient/login` usada pela aba Paciente do `/login` do Lovable NÃO existe no Manager. Recomendação a decidir: a aba apenas encaminha para `/area` do Manager.

## 6. Planos PaxCare

| Rota | Quem | Função |
|---|---|---|
| `GET/POST /api/paxcare/planos`, `PATCH /:id`, `POST /:id/ativar`, `POST /:id/encerrar` | dono da plataforma | gestão de planos |
| `GET /api/area-paciente/paxcare/planos` | paciente | planos ativos com `termoHash` |
| `GET /api/area-paciente/paxcare/assinatura` | paciente | assinatura ativa e consumo |
| `POST /api/area-paciente/paxcare/assinatura` | paciente | corpo `{ planoId, aceite: true, termoHash }`; 409 se a oferta mudou ou já há plano ativo |
| `DELETE /api/area-paciente/paxcare/assinatura` | paciente | cancela |

Cobrança fica `pendente_integracao` (não cobra automaticamente).

## 7. Cofre e compartilhamento clínico

Paciente: `GET/POST /api/area-paciente/paxcare/cofre` (POST em multipart; PDF, JPG ou PNG até 8 MB, tipo conferido pelos bytes), `GET .../cofre/:itemId/arquivo`, `DELETE .../cofre/:itemId` (remoção lógica), `GET .../clinicas`, `POST/PATCH/DELETE .../vinculos`.
Clínica (colaborador): `GET /api/collaborator/paxcare/compartilhados`, `GET .../clientes/:clientId/cofre`, `GET .../cofre/:itemId/arquivo`. A permissão é conferida a cada leitura; revogar vale na leitura seguinte.
Não existe: convite do médico pessoa física (tela `/medicos` do PAXCARE é prévia).

## 8. Saúde

`GET /api/health`, `GET /api/brt`: existem. Resposta 200 não prova login nem gravação.

## 9. Testes futuros (a criar, com dados sintéticos e banco descartável)

| Fluxo | Prova esperada |
|---|---|
| Contato | gravar e reler pelo painel; 400 por campo; 429 |
| Leads | repetição soma acesso; CPF inválido recusado |
| Convite | já testado; repetir a partir do Lovable com origem real |
| Login profissional | sucesso, 401, usuário desativado, bloqueio |
| Paciente | login, sessão, renovação, encerramento |
| Planos | aceite com hash, oferta alterada gera 409 |
| Cofre | outro paciente e outra clínica não leem; revogação bloqueia |
| CORS | pré-verificação com `X-Request-Id` e origem do Lovable |

## 10. O que NÃO está concluído

Nenhuma tela do Lovable foi comprovadamente ligada ao Manager em produção. Nada foi migrado do Supabase. Nenhum domínio foi apontado. Nada foi publicado.
