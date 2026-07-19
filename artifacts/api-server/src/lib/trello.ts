/**
 * PAXTER — Biblioteca Trello (PADTEAM)
 * 8 funções canônicas para gerenciar cards no board de demandas.
 * Chaves via secrets: TRELLO_API_KEY, TRELLO_TOKEN, TRELLO_BOARD_ID
 */

function getConfig(): { key: string; token: string; boardId: string } {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const boardId = process.env.TRELLO_BOARD_ID;
  if (!key || !token || !boardId) {
    throw new Error("Trello não configurado: defina TRELLO_API_KEY, TRELLO_TOKEN e TRELLO_BOARD_ID nos secrets.");
  }
  return { key, token, boardId };
}

async function trelloFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const { key, token } = getConfig();
  const sep = path.includes("?") ? "&" : "?";
  const url = `https://api.trello.com/1${path}${sep}key=${key}&token=${token}`;
  const res = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers ?? {}) } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Trello HTTP ${res.status}: ${txt}`);
  }
  return res.json();
}

/** Lista todas as listas do board configurado */
export async function listLists(): Promise<{ id: string; name: string; pos: number }[]> {
  const { boardId } = getConfig();
  return trelloFetch(`/boards/${boardId}/lists`) as Promise<{ id: string; name: string; pos: number }[]>;
}

/** Lista cards de uma lista específica */
export async function listCards(listId: string): Promise<{ id: string; name: string; desc: string; due: string | null; labels: { color: string; name: string }[] }[]> {
  return trelloFetch(`/lists/${listId}/cards`) as Promise<{ id: string; name: string; desc: string; due: string | null; labels: { color: string; name: string }[] }[]>;
}

/** Cria um card numa lista */
export async function createCard(params: {
  listId: string;
  name: string;
  desc?: string;
  due?: string;
  labelColor?: string;
}): Promise<{ id: string; url: string }> {
  const body: Record<string, string> = { idList: params.listId, name: params.name };
  if (params.desc) body.desc = params.desc;
  if (params.due) body.due = params.due;
  return trelloFetch("/cards", {
    method: "POST",
    body: JSON.stringify(body),
  }) as Promise<{ id: string; url: string }>;
}

/** Atualiza nome/desc/due de um card */
export async function updateCard(cardId: string, params: { name?: string; desc?: string; due?: string | null }): Promise<void> {
  await trelloFetch(`/cards/${cardId}`, { method: "PUT", body: JSON.stringify(params) });
}

/** Move um card para outra lista */
export async function moveCard(cardId: string, listId: string): Promise<void> {
  await trelloFetch(`/cards/${cardId}`, { method: "PUT", body: JSON.stringify({ idList: listId }) });
}

/** Arquiva (deleta logicamente) um card */
export async function archiveCard(cardId: string): Promise<void> {
  await trelloFetch(`/cards/${cardId}`, { method: "PUT", body: JSON.stringify({ closed: true }) });
}

/** Adiciona comentário a um card */
export async function addComment(cardId: string, text: string): Promise<void> {
  await trelloFetch(`/cards/${cardId}/actions/comments`, { method: "POST", body: JSON.stringify({ text }) });
}

/** Lê um card pelo ID */
export async function getCard(cardId: string): Promise<{ id: string; name: string; desc: string; idList: string; due: string | null; url: string }> {
  return trelloFetch(`/cards/${cardId}`) as Promise<{ id: string; name: string; desc: string; idList: string; due: string | null; url: string }>;
}
