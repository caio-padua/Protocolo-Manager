// Cliente de API do Cartório (Documentos & Consentimento).
// Consome o motor de assinatura (Onda F) sem alterá-lo. As rotas /api/assinaturas/*
// exigem token de colaborador (Bearer); /api/clients é pública. O token HMAC do
// colaborador vive no localStorage (ver collab-auth.ts) e é injetado aqui.
import { getCollabToken } from "./collab-auth";

export interface ClienteLite {
  id: number;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
}

export interface TimelineItem {
  id: number;
  pacienteId: number;
  pacienteNome: string | null;
  tipoDoc: string;
  titulo: string | null;
  status: string;
  provedorCodigo: string | null;
  envelopeId: string | null;
  enviadoEm: string | null;
  concluidoEm: string | null;
  criadoEm: string | null;
}

export interface Template {
  id: number;
  codigo: string;
  titulo: string;
  tipoDoc: string;
  corpoHtml: string;
  placeholders: string[] | null;
  exigeMedico: boolean;
  ativo: boolean;
}

export interface EnviarInput {
  pacienteId: number;
  conteudoHtml?: string;
  templateCodigo?: string;
  tipoDoc?: string;
  titulo?: string;
  incluirMedico?: boolean;
  canais?: string[];
}

export interface EnviarResult {
  solicitacaoId: number;
  envelopeId: string;
  status: string;
  mock: boolean;
  links: { email: string; url: string }[];
  linkPaciente?: string;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = getCollabToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body) headers.set("Content-Type", "application/json");
  return fetch(path, { ...init, headers });
}

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let code = `http_${r.status}`;
    try {
      const body = await r.json();
      if (body?.error) code = String(body.error);
    } catch {
      /* sem corpo JSON */
    }
    throw new ApiError(r.status, code);
  }
  return (await r.json()) as T;
}

export async function listarClientes(busca?: string): Promise<ClienteLite[]> {
  const qs = busca && busca.trim() ? `?search=${encodeURIComponent(busca.trim())}` : "";
  const r = await fetch(`/api/clients${qs}`);
  const rows = await jsonOrThrow<ClienteLite[]>(r);
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    cpf: c.cpf ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
  }));
}

export async function listarTimeline(): Promise<TimelineItem[]> {
  const r = await authFetch("/api/assinaturas/timeline");
  const data = await jsonOrThrow<{ itens: TimelineItem[] }>(r);
  return data.itens;
}

export async function listarTemplates(): Promise<Template[]> {
  const r = await authFetch("/api/assinaturas/templates");
  const data = await jsonOrThrow<{ templates: Template[] }>(r);
  return data.templates;
}

export async function salvarTemplate(input: {
  codigo: string;
  titulo?: string;
  tipoDoc?: string;
  corpoHtml: string;
  exigeMedico?: boolean;
}): Promise<Template> {
  const r = await authFetch("/api/assinaturas/templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow<{ template: Template }>(r);
  return data.template;
}

export async function enviarParaAssinatura(input: EnviarInput): Promise<EnviarResult> {
  const r = await authFetch("/api/assinaturas/enviar", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return jsonOrThrow<EnviarResult>(r);
}
