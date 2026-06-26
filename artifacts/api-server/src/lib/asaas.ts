// Provedor de Pagamento — implementacao Asaas (gateway brasileiro).
// A chave e a base URL sao resolvidas pelo cofre/config (DB) com fallback ao
// ambiente: cofre cifrado (asaas.apiKey) -> env ASAAS_API_KEY; config
// (asaas.baseUrl) -> env ASAAS_BASE_URL -> producao. Nenhuma credencial e
// logada ou exposta ao frontend.

import { getSecret, getSetting } from "./secure-settings.js";

const DEFAULT_BASE_URL = "https://api.asaas.com/v3";

async function resolveApiKey(): Promise<string> {
  const key = await getSecret("asaas.apiKey");
  if (!key) throw new Error("Chave do Asaas nao configurada. Defina em Configuracoes > Portas de Pagamento.");
  return key;
}

async function resolveBaseUrl(): Promise<string> {
  const fromDb = await getSetting("asaas.baseUrl");
  return (fromDb && fromDb.trim()) || process.env.ASAAS_BASE_URL || DEFAULT_BASE_URL;
}

async function asaasFetch(path: string, init?: RequestInit): Promise<any> {
  const [key, baseUrl] = await Promise.all([resolveApiKey(), resolveBaseUrl()]);
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      access_token: key,
      "Content-Type": "application/json",
      "User-Agent": "PaxterManager",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.errors?.[0]?.description || `Asaas erro HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export interface AsaasCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  phone?: string | null;
}

export async function asaasCreateCustomer(input: AsaasCustomerInput): Promise<{ id: string }> {
  const body = {
    name: input.name,
    cpfCnpj: input.cpfCnpj.replace(/\D/g, ""),
    email: input.email || undefined,
    mobilePhone: input.phone ? input.phone.replace(/\D/g, "") : undefined,
  };
  return asaasFetch("/customers", { method: "POST", body: JSON.stringify(body) });
}

export interface AsaasChargeInput {
  customerId: string;
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
}

export interface AsaasCharge {
  id: string;
  invoiceUrl: string;
  billingType: string;
  status: string;
  value: number;
}

export async function asaasCreateCharge(input: AsaasChargeInput): Promise<AsaasCharge> {
  const body = {
    customer: input.customerId,
    billingType: "UNDEFINED", // pagina hospedada: cliente escolhe PIX/boleto/cartao
    value: input.value,
    dueDate: input.dueDate,
    description: input.description,
  };
  return asaasFetch("/payments", { method: "POST", body: JSON.stringify(body) });
}

export async function asaasGetCharge(id: string): Promise<AsaasCharge> {
  return asaasFetch(`/payments/${id}`, { method: "GET" });
}

export interface AsaasChargeListItem {
  id: string;
  status: string;
  value: number;
  dueDate: string | null;
  invoiceUrl: string | null;
  customer: string | null;
  description: string | null;
}

// Lista cobrancas do Asaas (pagina a pagina). Usado pela Conciliacao.
// `max` limita o total varrido para nao estourar a janela em contas grandes.
export async function asaasListCharges(max = 300): Promise<AsaasChargeListItem[]> {
  const out: AsaasChargeListItem[] = [];
  let offset = 0;
  const limit = 100;
  while (out.length < max) {
    const page = await asaasFetch(`/payments?offset=${offset}&limit=${limit}`, { method: "GET" });
    const data: any[] = Array.isArray(page?.data) ? page.data : [];
    for (const c of data) {
      out.push({
        id: String(c.id),
        status: String(c.status ?? ""),
        value: Number(c.value ?? 0),
        dueDate: c.dueDate ?? null,
        invoiceUrl: c.invoiceUrl ?? null,
        customer: c.customer ?? null,
        description: c.description ?? null,
      });
    }
    if (!page?.hasMore || data.length === 0) break;
    offset += limit;
  }
  return out;
}
