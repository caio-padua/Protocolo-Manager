# Spec A — Identificacao do paciente + sessao amarrada ao cliente + WhatsApp

## Objetivo (uma frase)
Quando o paciente abre a Anamnese V2, ele se identifica por CPF + data de nascimento (como no Portal), a sessao criada fica AMARRADA ao cliente certo de forma segura, e a equipe consegue enviar o link da anamnese ao cliente por WhatsApp.

## Contexto (o que ja existe — reusar)
1. `POST /api/client-portal/identify` recebe `{ cpf, birthDate }` e devolve `{ id, name, cpf, token }`. O `token` e um HMAC de 30 minutos (`createPortalToken(clientId)` / `verifyPortalToken`).
2. `LoginScreen` em `area.tsx` ja faz exatamente essa identificacao (CPF + nascimento) — serve de molde visual.
3. O banco `anamnese_sessions` ja tem coluna `client_id` (nullable). O `POST /anamnese-v2/sessions` ja aceita `clientId`/`mode`.
4. `buildWhatsappLink(phone, message)` (formato `https://wa.me/55...?text=...`) ja existe no backend.

## Requisitos exatos
1. **Tela de identificacao na anamnese**: a rota publica `/anamnese/v2` mostra PRIMEIRO uma tela de identificacao (CPF + data de nascimento), no estilo visual do `LoginScreen` do `area.tsx` e do design Paxter (painel 3D, cantos quadrados, cores da marca). So depois de identificar e que comeca o questionario.
2. **Identificacao reusa o backend existente**: a tela chama `POST /api/client-portal/identify`; em erro mostra mensagem GENERICA ("CPF ou data de nascimento incorretos"), sem revelar se o CPF existe.
3. **Amarracao segura ao cliente (anti-IDOR)**: ao criar a sessao, o front envia o `portalToken` recebido na identificacao. O backend `POST /anamnese-v2/sessions`:
   - se vier `portalToken` valido -> grava `client_id` = cliente do token;
   - se o `portalToken` for invalido/expirado -> responde 401;
   - **NUNCA** grava `client_id` a partir de um numero cru vindo do corpo da requisicao publica (ignora `clientId` cru). A unica fonte de `client_id` no fluxo publico e o token verificado.
4. **Retomar sessao do mesmo cliente**: ao identificar, se ja existir uma sessao NAO concluida (`status = "rascunho"`) daquele `client_id`, o front retoma essa sessao (em vez de criar outra). O token da sessao continua guardado no `localStorage` (`anamnese_v2_token`) como hoje. Nota: havendo mais de um rascunho do mesmo cliente, retoma-se o de menor `id` (o mais antigo), por ordem `id` ascendente — escolha deterministica para evitar ambiguidade.
5. **Distribuicao por WhatsApp**: a equipe (logada como colaborador) consegue, a partir da tela de revisao (Spec B), escolher um cliente e gerar o link `wa.me` com uma mensagem pronta que contem a URL publica da anamnese (`<origem>/anamnese/v2`). Abre em nova aba. So aparece para cliente que tem telefone cadastrado.
6. **Demonstracao sem identificar (opcional, discreto)**: manter um caminho discreto "Entrar como demonstracao (sem identificar)" que cria sessao anonima (sem `client_id`) — preserva o uso de teste sem furar a regra anti-IDOR.

## Casos extremos a tratar
1. CPF com mascara/sem mascara e data DD/MM/AAAA vs ISO — normalizar no front (so digitos) antes de enviar (o backend ja trata ambos).
2. `portalToken` expirado entre identificar e criar a sessao (passou de 30 min) -> 401 -> front pede para identificar de novo.
3. Cliente sem telefone -> botao de WhatsApp desabilitado/oculto para aquele cliente, com aviso "sem telefone cadastrado".
4. Telefone sem DDI 55 -> `buildWhatsappLink`/helper adiciona 55.
5. Sessao ja concluida do cliente -> nao retomar; identificar pode iniciar uma nova (decisao: criar nova sessao).

## Definicao de PRONTO
1. Abrir `/anamnese/v2` mostra a tela de identificacao; identificar com CPF+nascimento corretos abre o questionario.
2. A sessao criada tem `client_id` preenchido com o cliente certo (conferir no banco) quando identificado.
3. Enviar um numero cru de `clientId` no corpo SEM token NAO amarra a sessao (continua anonima) — anti-IDOR comprovado por curl.
4. `portalToken` invalido -> 401.
5. Na tela de revisao do colaborador, escolher um cliente com telefone gera um link `wa.me` correto com a URL da anamnese.
6. `pnpm --filter @workspace/api-server run typecheck` e `pnpm --filter @workspace/padcom run typecheck` sem erros novos.

## Linhas vermelhas
1. Nao confiar em `clientId` cru do corpo publico (so via token HMAC).
2. Nao quebrar a LINHA VERMELHA da anamnese (pergunta de alarme nunca recusavel) nem o flush de rascunho ja existentes.
3. Nao mudar o motor de achados por estetica.
