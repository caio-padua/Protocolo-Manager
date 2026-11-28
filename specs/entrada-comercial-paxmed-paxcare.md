# Entrada comercial PAXMED/PAXCARE: contatos, leads, convites e convite de médico pelo cliente

Regra mestra (decisão do CEO): todo backend e todo dado ficam no Manager. O Lovable é só a tela.
Sem gravação dupla. Legado (Supabase, Railway antigo) preservado.

## 1. Matriz de controles (origem, destino, estado real)

| Tela Lovable            | Ação                         | Destino no Manager                    | Estado hoje                                   | Teste |
|-------------------------|------------------------------|---------------------------------------|-----------------------------------------------|-------|
| PAXMED Home             | "Quero contratar"            | POST /api/vitrine-contatos            | Existe; agora guarda consentimento e repetição | vitest banco descartável |
| PAXMED /convite         | pedir convite (médico)       | POST /api/vitrine-convites            | Existe, testado (5/5)                         | vitest + e2e |
| PAXMED /convite         | consultar protocolo          | POST /api/vitrine-convites/status     | Existe, testado                               | vitest |
| Vitrines demo           | login = captação             | POST /api/vitrine-leads               | Existe                                        | smoke |
| PAXCARE /medicos        | adesão médica                | prévia local no Lovable               | PENDENTE no Lovable: chamar /api/vitrine-convites ou o convite abaixo | — |
| Lovable /login (paciente)| entrar                      | /api/area-paciente/login (cpf+senha)  | Lovable chama /api/patient/login (não existe): AJUSTE NO LOVABLE | — |
| Lovable /login (profissional) | entrar                 | /api/collaborator/login               | Existe                                        | — |
| Cliente (App)           | convidar médico              | POST /api/area-paciente/paxcare/convites-medico | NOVO                          | vitest |
| Cliente (App)           | revogar convite/acesso       | DELETE .../convites-medico/:id        | NOVO                                          | vitest |
| Médico (colaborador)    | ver e aceitar convite        | GET/POST /api/collaborator/paxcare/convites/:token | NOVO                             | vitest |
| Médico                  | ler cofre do convite aceito  | GET /api/collaborator/paxcare/convites-aceitos/:id/cofre | NOVO                   | vitest |
| CEO                     | acompanhar                   | GET /api/ceo/paxcare/convites-medico  | NOVO (tela /paxcare-convites-medico)          | vitest + tela |
| CEO                     | contatos / leads / convites  | telas /vitrine-contatos, /vitrine-leads, /convites-paxmed | Existem          | — |

## 2. Convite de médico pelo cliente (PAXCARE)

1. O cliente (token do portal, nunca id enviado no corpo) informa nome, e-mail, CRM e UF do médico, escopo (histórico, exames, documentos), validade do convite (1 a 30 dias) e prazo do acesso (1 a 365 dias).
2. O servidor gera um token aleatório de 32 bytes, guarda só o hash SHA-256 e devolve o link UMA vez. Nenhuma mensagem é enviada (envio real fica pendente de autorização de canal).
3. O médico entra como colaborador. Só aceita se o e-mail E o número do conselho do cadastro dele coincidirem com os do convite. Divergência = 403 genérico, sem revelar qual campo.
4. Aceito: acesso individual do médico (não da clínica), limitado ao escopo e ao prazo. Convite com empresa só aceita se o médico for vinculado àquela empresa.
5. Revogação pelo cliente vale na leitura seguinte. Expirado/revogado/recusado nunca lê.
6. Auditoria em tabela própria (criou, visualizou, aceitou, recusou, revogou, tentativa negada), sem guardar o token.
7. O CEO vê contagem por status e a lista com e-mail mascarado; nunca vê token nem conteúdo do cofre.

## 3. Impacto e falhas previstas

| Falha prevista                         | Tratamento |
|----------------------------------------|------------|
| Token vazado em log                    | só hash no banco; log sem token |
| Médico errado aceita                   | e-mail + conselho obrigatórios |
| Convite aceito duas vezes (corrida)    | UPDATE condicional em status pendente |
| Cliente A convida e B lê               | todas as consultas filtram por client_id do token |
| Clínica confundida com médico          | acesso individual separado de paxcare_vinculos |
| Tentativa de adivinhar token           | limite por IP e token de 256 bits |
| Contato repetido por duplo clique      | mesma chave (e-mail + necessidade) em 10 min não grava de novo |

## 4. Contato da vitrine

Passa a gravar `consentimento` (booleano enviado pelo Lovable; ausência fica nula e é exibida como "não informado") e evita repetição em 10 minutos. O Lovable hoje não envia consentimento: ajuste listado.
