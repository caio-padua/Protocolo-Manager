/**
 * telegram-inbox-flow.ts
 *
 * Lógica pura do fluxo Telegram → Inbox do cockpit, com injeção de
 * dependências para permitir testes unitários sem banco real.
 *
 * Esta lib É o código de produção: as rotas reais (assinaturas.ts /
 * routes/telegram-inbox.ts) chamam estas funções passando as deps
 * Drizzle como argumento. Testes injetam deps em memória.
 *
 * Etapas cobertas:
 *  1. processarWebhookInbox  — webhook grava msg no inbox
 *  2. obterBadge             — GET /telegram-inbox/badge
 *  3. listarInbox            — GET /cockpit/:id/telegram-inbox
 *  4. marcarLidas            — POST /cockpit/:id/telegram-inbox/marcar-lidas
 */

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface ClienteVinculado {
  id: number;
  name: string;
  empresaId: number;
  /** Necessário para formatar CPF no repasse ao CEO. */
  cpf?: string | null;
}

export interface MensagemInbox {
  id: number;
  clienteId: number;
  empresaId: number;
  chatId: string;
  texto: string;
  recebidaEm: Date;
  lidaEm: Date | null;
}

// ── Etapa 1 — Webhook ─────────────────────────────────────────────────────────

export interface WebhookInboxDeps {
  /** Consulta o cliente pelo chatId Telegram; retorna null se não vinculado. */
  findClienteByChatId: (chatId: string) => Promise<ClienteVinculado | null>;
  /** Insere a mensagem no inbox; retorna o id gerado. */
  insertMensagem: (params: {
    empresaId: number;
    clienteId: number;
    chatId: string;
    texto: string;
  }) => Promise<{ id: number }>;
  /**
   * Notifica o CEO (fire-and-forget; falha não bloqueia o fluxo).
   * O chamador é responsável por formatar a mensagem — recebe o objeto
   * cliente completo para poder exibir nome, CPF, etc.
   */
  notificarCEO?: (
    chatIdCEO: string,
    cliente: ClienteVinculado,
    texto: string,
  ) => Promise<void>;
}

export type WebhookInboxResult =
  | { kind: "ignorado"; motivo: string }
  | { kind: "gravado"; mensagemId: number; clienteId: number }
  | { kind: "nao_vinculado" };

/**
 * processarWebhookInbox
 *
 * Ramo "cliente já vinculado" do webhook Telegram:
 *  — localiza o cliente pelo chatId
 *  — insere a mensagem no inbox
 *  — notifica o CEO (opcional / fire-and-forget)
 *
 * Comportamento de texto: `if (!texto)` — igual ao webhook de produção.
 * Isso preserva mensagens compostas apenas por espaços (raro mas possível).
 * O comportamento é intencional e documentado aqui para rastreabilidade.
 *
 * Erros no insertMensagem são propagados ao chamador; a rota de produção
 * captura com `.catch(logger.error)` para nunca falhar o Telegram (que
 * reentregaria em loop caso recebesse status != 200).
 */
export async function processarWebhookInbox(
  params: { chatId: string; texto: string; chatIdCEO?: string | null },
  deps: WebhookInboxDeps,
): Promise<WebhookInboxResult> {
  const { chatId, texto, chatIdCEO } = params;

  // Comportamento idêntico ao webhook: `if (texto)` — texto vazio ignorado,
  // espaços sozinhos são considerados mensagem válida (consistente com produção).
  if (!texto) {
    return { kind: "ignorado", motivo: "texto vazio" };
  }

  const cliente = await deps.findClienteByChatId(chatId);
  if (!cliente) {
    return { kind: "nao_vinculado" };
  }

  const { id: mensagemId } = await deps.insertMensagem({
    empresaId: cliente.empresaId,
    clienteId: cliente.id,
    chatId,
    texto,
  });

  if (chatIdCEO && deps.notificarCEO) {
    void deps.notificarCEO(chatIdCEO, cliente, texto).catch(() => {
      /* best-effort — falha não derruba o fluxo principal */
    });
  }

  return { kind: "gravado", mensagemId, clienteId: cliente.id };
}

// ── Etapa 2 — Badge ───────────────────────────────────────────────────────────

export interface BadgeDeps {
  /** Conta mensagens com lidaEm IS NULL para o tenant. */
  contarNaoLidas: (empresaId: number) => Promise<number>;
}

export interface BadgeResult {
  naoLidas: number;
}

/**
 * obterBadge
 *
 * Implementa a lógica de GET /telegram-inbox/badge:
 * conta mensagens não-lidas do tenant da sessão.
 */
export async function obterBadge(
  params: { empresaId: number },
  deps: BadgeDeps,
): Promise<BadgeResult> {
  const naoLidas = await deps.contarNaoLidas(params.empresaId);
  return { naoLidas };
}

// ── Etapa 3 — Listar inbox ────────────────────────────────────────────────────

export interface ListarInboxDeps {
  /** Verifica se o cliente pertence ao tenant. Null = não encontrado / cross-tenant. */
  findClienteNoTenant: (clienteId: number, empresaId: number) => Promise<{ id: number } | null>;
  /** Retorna as últimas 100 mensagens do cliente + tenant, ordenadas desc. */
  listMensagens: (clienteId: number, empresaId: number) => Promise<MensagemInbox[]>;
  /** Marca como lidas quando marcarLidas=true. */
  marcarComoLidas?: (clienteId: number, empresaId: number) => Promise<void>;
}

export type ListarInboxResult =
  | { kind: "nao_encontrado" }
  | {
      kind: "ok";
      mensagens: Array<{
        id: number;
        texto: string;
        recebidaEm: string;
        lida: boolean;
      }>;
      naoLidas: number;
    };

/**
 * listarInbox
 *
 * Implementa a lógica de GET /cockpit/:clientId/telegram-inbox.
 * naoLidas é calculado ANTES do marcar (idêntico à rota original).
 */
export async function listarInbox(
  params: { clienteId: number; empresaId: number; marcarLidas?: boolean },
  deps: ListarInboxDeps,
): Promise<ListarInboxResult> {
  const { clienteId, empresaId, marcarLidas = false } = params;

  const cliente = await deps.findClienteNoTenant(clienteId, empresaId);
  if (!cliente) {
    return { kind: "nao_encontrado" };
  }

  const mensagens = await deps.listMensagens(clienteId, empresaId);

  // naoLidas calculado ANTES do marcar (comportamento idêntico à rota original)
  const naoLidas = mensagens.filter((m) => m.lidaEm == null).length;

  if (marcarLidas && deps.marcarComoLidas) {
    await deps.marcarComoLidas(clienteId, empresaId);
  }

  return {
    kind: "ok",
    mensagens: mensagens.map((m) => ({
      id: m.id,
      texto: m.texto,
      recebidaEm: m.recebidaEm.toISOString(),
      lida: m.lidaEm != null,
    })),
    naoLidas,
  };
}

// ── Etapa 4 — Marcar lidas ────────────────────────────────────────────────────

export interface MarcarLidasDeps {
  /** Verifica se o cliente pertence ao tenant. */
  findClienteNoTenant: (clienteId: number, empresaId: number) => Promise<{ id: number } | null>;
  /** Atualiza lidaEm = NOW() onde lidaEm IS NULL; retorna quantas linhas atualizou. */
  updateLidas: (clienteId: number, empresaId: number) => Promise<number>;
}

export type MarcarLidasResult =
  | { kind: "nao_encontrado" }
  | { kind: "ok"; marcadas: number };

/**
 * marcarLidas
 *
 * Implementa a lógica de POST /cockpit/:clientId/telegram-inbox/marcar-lidas.
 * UPDATE é tenant-scoped: só toca linhas do cliente + empresa da sessão.
 */
export async function marcarLidas(
  params: { clienteId: number; empresaId: number },
  deps: MarcarLidasDeps,
): Promise<MarcarLidasResult> {
  const { clienteId, empresaId } = params;

  const cliente = await deps.findClienteNoTenant(clienteId, empresaId);
  if (!cliente) {
    return { kind: "nao_encontrado" };
  }

  const marcadas = await deps.updateLidas(clienteId, empresaId);
  return { kind: "ok", marcadas };
}
