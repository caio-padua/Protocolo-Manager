import { setAuthTokenGetter } from "@workspace/api-client-react";

// Sessao do Portao do Colaborador (Onda 8.2). O token HMAC fica no localStorage
// e e injetado em toda chamada via setAuthTokenGetter (o backend so exige nas
// rotas protegidas; nas demais o cabecalho e ignorado).
const TOKEN_KEY = "padcom_collab_token";
const PROF_KEY = "padcom_collab_prof";
export const COLLAB_EVENT = "collab-auth-changed";

export interface CollabProfessional {
  id: number;
  name: string;
  role: string;
}

export function getCollabToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getCollabProfessional(): CollabProfessional | null {
  try {
    const raw = localStorage.getItem(PROF_KEY);
    return raw ? (JSON.parse(raw) as CollabProfessional) : null;
  } catch {
    return null;
  }
}

export function setCollabSession(token: string, prof: CollabProfessional): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PROF_KEY, JSON.stringify(prof));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(COLLAB_EVENT));
}

export function clearCollabSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROF_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(COLLAB_EVENT));
}

// Chamado uma vez no App: registra o getter que injeta o Bearer em cada fetch.
export function registerCollabTokenGetter(): void {
  setAuthTokenGetter(() => getCollabToken());
}
