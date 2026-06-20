# Spec — Onda 8.2: Portão do Colaborador (login por colaborador + auditoria)

Decisão do CEO (Dr. Caio) em 20/06/2026: o login é POR COLABORADOR (opção B), não senha única
de equipe. Motivo declarado: precisaremos de AUDITORIA — saber quem entrou e o que fez.

## Objetivo

Proteger a Central de Cadastro (Bloco A) com login individual por colaborador e registrar uma
trilha de auditoria (quem entrou, quando, e quais escritas fez). Reaproveitar o HMAC já usado no
portal do cliente para assinar o token de sessão — sem inventar mecanismo de auth além do necessário.

Sigla: HMAC = Hash-based Message Authentication Code (assinatura criptográfica que prova que o token
foi emitido pelo sistema e não foi adulterado).

## Identidade e credenciais

| Item | Decisão |
|---|---|
| Quem é o colaborador | Um registro da tabela `professionals` (já tem `name`, `role`, `category`, `active`) |
| Como loga | `loginUsername` (novo, único) + senha |
| Como a senha é guardada | HASH com `scrypt` (node:crypto) + salt aleatório; NUNCA texto puro |
| Sessão | Token HMAC assinado (escopo "collab"), validade 12 horas, carrega professionalId + role |
| Papel (role) | Vem do `professionals.role` (ex.: medico_01, enfermeira_01, adm_01) — base da auditoria por papel |

## Primeiro acesso (bootstrap)

Problema do ovo-e-galinha: sem ninguém logado, ninguém cadastra a primeira senha.

Passo A (sistema sem nenhuma senha cadastrada) -> Passo B (tela "Criar primeiro acesso": escolher um
profissional + definir usuário e senha) -> Passo C (endpoint de bootstrap só funciona enquanto NÃO
existir nenhuma credencial) -> Passo D (a partir daí, o bootstrap fica desligado e o acesso é só por login).

## Auditoria (a razão da opção B)

Tabela nova `collaborator_audit`: registra cada evento relevante.

| Campo | Conteúdo |
|---|---|
| professionalId | Quem (nulo em tentativa de login falha) |
| professionalName | Nome no momento do evento (snapshot, sobrevive a renome) |
| action | login_ok / login_fail / write |
| method | GET/POST/PUT/PATCH/DELETE (nas escritas) |
| path | rota acessada |
| detail | dados extras (jsonb) |
| ip | IP de origem |
| createdAt | data/hora |

Regra: toda ESCRITA nas rotas protegidas gera um registro `write` com o professionalId do token.

## O que fica protegido

| Alvo | Regra |
|---|---|
| Escritas de `site-content` (POST/PATCH) | exigem token de colaborador |
| Escritas de `cadastros` (POST/PUT/PATCH) | exigem token de colaborador |
| 6 telas `/cadastros/*` no frontend | só abrem com login; sem login → tela de entrada |
| Leituras (GET) de site-content | continuam públicas (o paciente consome os textos/vídeos) |

## Endpoints (API)

| Método e rota | Função | Protegido? |
|---|---|---|
| POST /api/collaborator/login | usuário+senha → token | não (gera o token) |
| GET /api/collaborator/me | dados do colaborador logado | sim |
| POST /api/collaborator/bootstrap | cria a 1ª credencial (só se nenhuma existir) | não (auto-desliga) |
| POST /api/collaborator/credentials | define/reseta usuário+senha de um profissional | sim |
| GET /api/collaborator/audit | últimos eventos de auditoria | sim |

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| Sem login → Central de Cadastro bloqueada | Abrir /cadastros/* sem token → tela de entrada |
| Com login → acessa | Login válido → telas abrem |
| Escrita protegida sem token → 401 | POST /api/site-content sem token → 401 |
| Auditoria registra login e escrita | Logar + editar um texto → ver os 2 eventos em /api/collaborator/audit |
| Senha nunca em texto puro | Ler o código: só hash scrypt persiste |
| Nada quebrou no resto do admin | Abrir Dashboard/Agenda atuais |

## Linhas vermelhas

- Reaproveitar o HMAC do portal (SESSION_SECRET para assinar); não criar segredo novo.
- Senha só com hash (scrypt + salt); nunca texto puro; comparação com timingSafeEqual.
- Não tocar no motor de injetáveis/RAS FAP nem nas 4 entradas do paciente.
- Validar por runtime/screenshot (typecheck global pré-quebrado).
- Comunicar em Densidade B; fechar com "RESUMO EM 1 LINHA".
