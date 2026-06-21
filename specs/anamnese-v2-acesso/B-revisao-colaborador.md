# Spec B — Tela e endpoints do colaborador para revisar a anamnese

## Objetivo (uma frase)
Dar a equipe clinica uma tela protegida (Portao do Colaborador) para LISTAR anamneses e ABRIR os achados de qualquer sessao, sem depender do token que fica no celular do paciente.

## Contexto (o que ja existe — reusar)
1. Portao do Colaborador completo: `POST /api/collaborator/login`, middleware `requireCollaborator`, token HMAC de 12h, auditoria. No front: `CollaboratorGate` + `collab-auth.ts` (injeta o Bearer em toda chamada).
2. O banco ja guarda por sessao: `anamnese_findings` (tipo diagnosticado/suspeito, rotulo, severidade, origem), `anamnese_refusals` (escopo/alvo/motivo), `anamnese_group_notes` (observacao por grupo), e `anamnese_sessions` (status, started_at, completed_at, client_id, mode).
3. Hoje os achados so saem por `GET /anamnese-v2/sessions/:token` (token do paciente). NAO existe listagem para a equipe.

## Requisitos exatos
1. **Endpoint de listagem (protegido)**: `GET /api/collaborator/anamnese/sessions` com `requireCollaborator`. Aceita filtros opcionais `clientId` e `status`. Devolve, por sessao: `id`, `clientId`, `clientName` (join em clients; "—" se anonima), `mode`, `status`, `startedAt`, `completedAt`, e contagens `{ diagnosticado, suspeito }` e `temAlarme` (se ha achado de severidade alta). Ordenar por `completedAt`/`startedAt` desc.
2. **Endpoint de detalhe (protegido)**: `GET /api/collaborator/anamnese/sessions/:id` com `requireCollaborator`. Devolve a sessao + `clientName` + `findings` (lista), `refusals` (lista) e `notes` (lista). Acesso por `id` da sessao, NAO pelo token do paciente.
3. **Protecao real**: ambos exigem token de colaborador valido; sem token -> 401. (Importante: o `collaboratorGuard` so cobre escritas; estes GET precisam de `requireCollaborator` aplicado explicitamente porque expoem PII clinica.)
4. **Tela de revisao**: nova pagina no layout administrativo, rota `/anamnese/revisao`, embrulhada por `CollaboratorGate` (login do colaborador). Conteudo:
   - **Lista** (Grade Imaginaria, Padrao 12/13 da skill): colunas FIXAS — quadradinho de cor por alerta (vermelho=tem alarme, ambar=tem suspeito, verde=so concluida sem alarme), nome do cliente (`truncate`), `StatusChip` de status (rascunho/concluida), e campos meta em slot fixo (data de conclusao, contagem de diagnosticados/suspeitos). Nunca `flex-wrap` nos dados-chave.
   - **Detalhe** (ao clicar numa linha): painel 3D com tres secoes — "Achados" (diagnosticado x suspeito, com severidade), "Recusas registradas" (o que o paciente pulou) e "Observacoes da equipe". Conclusao primeiro (achados no topo, em Saliente).
5. **Distribuicao por WhatsApp (Spec A, item 5) embutida aqui**: barra de acao no topo "Enviar Anamnese (WhatsApp)" -> escolher cliente (busca por nome via `useListClients`) -> abre `wa.me` com mensagem pronta + URL publica da anamnese. So habilita para cliente com telefone.
6. **Acesso pela navegacao**: incluir a pagina no menu lateral (sidebar) numa posicao coerente (junto de anamnese/clientes), respeitando o estilo do menu existente.

## Casos extremos a tratar
1. Sessao anonima (sem `client_id`) -> `clientName` = "—"; nao quebra a lista.
2. Sessao em rascunho (sem `completed_at`) -> aparece na lista com status rascunho; ordenar por `started_at`.
3. Sessao sem achados -> detalhe mostra "Nenhum achado" sem erro.
4. `id` inexistente no detalhe -> 404.
5. Colaborador sem token -> a pagina mostra o login do `CollaboratorGate`; os endpoints respondem 401.

## Definicao de PRONTO
1. `GET /api/collaborator/anamnese/sessions` sem token -> 401; com token de colaborador -> lista as sessoes com nome do cliente e contagens (conferir por curl com um login real de colaborador).
2. `GET /api/collaborator/anamnese/sessions/:id` -> devolve achados/recusas/observacoes da sessao; `id` invalido -> 404.
3. A pagina `/anamnese/revisao` pede login de colaborador; apos logar, lista as sessoes e abre o detalhe ao clicar.
4. O botao de WhatsApp gera link correto para um cliente com telefone.
5. Layout segue a skill Paxter (paineis 3D, Grade Imaginaria) e funciona no celular (400x720) e no desktop.
6. `typecheck` do api-server e do padcom sem erros novos.

## Linhas vermelhas
1. Nenhum endpoint de leitura clinica sem `requireCollaborator`.
2. Nao expor achados por `clientId`/`id` sem autenticacao de colaborador.
3. Seguir a Grade Imaginaria: status ao lado do ID/linha, cor pertence ao item (quadradinho), LED so para on/off — nunca para contagem.
