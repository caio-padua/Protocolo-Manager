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

// ----- NFS-e (Nota Fiscal de Servico eletronica) — Onda 2 -----

export interface AsaasMunicipalService {
  id: string;
  description: string | null;
  issTax: number | null; // aliquota ISS (%) sugerida pelo Asaas, se houver
}

// Lista os servicos municipais cadastrados/sugeridos para a conta (para obter o
// municipalServiceId correto). `description` filtra por texto (ex.: "medicina").
export async function asaasListMunicipalServices(
  description?: string,
): Promise<AsaasMunicipalService[]> {
  const qs = description ? `?description=${encodeURIComponent(description)}` : "";
  const page = await asaasFetch(`/invoices/municipalServices${qs}`, { method: "GET" });
  const data: any[] = Array.isArray(page?.data) ? page.data : [];
  return data.map((s) => ({
    id: String(s.id ?? s.municipalServiceId ?? ""),
    description: s.description ?? s.name ?? null,
    issTax: s.issTax != null ? Number(s.issTax) : null,
  }));
}

export interface AsaasInvoiceInput {
  // Vinculo: pelo menos UM (payment OU customer OU installment).
  payment?: string;
  customer?: string;
  installment?: string;
  serviceDescription: string;
  value: number;
  effectiveDate: string; // YYYY-MM-DD
  observations?: string;
  deductions?: number;
  // Servico municipal (id da listagem) OU codigo/nome manual.
  municipalServiceId?: string;
  municipalServiceCode?: string;
  municipalServiceName?: string;
}

export interface AsaasInvoice {
  id: string;
  status: string; // SCHEDULED | SYNCHRONIZED | AUTHORIZED | PROCESSING_CANCELLATION | CANCELED | ERROR
  value: number;
  effectiveDate: string | null;
  pdfUrl: string | null;
  xmlUrl: string | null;
  rpsSerie: string | null;
  rpsNumber: string | null;
  number: string | null;
}

export async function asaasCreateInvoice(input: AsaasInvoiceInput): Promise<AsaasInvoice> {
  const body: Record<string, unknown> = {
    serviceDescription: input.serviceDescription,
    value: input.value,
    effectiveDate: input.effectiveDate,
  };
  if (input.payment) body.payment = input.payment;
  if (input.customer) body.customer = input.customer;
  if (input.installment) body.installment = input.installment;
  if (input.observations) body.observations = input.observations;
  if (input.deductions != null) body.deductions = input.deductions;
  if (input.municipalServiceId) body.municipalServiceId = input.municipalServiceId;
  if (input.municipalServiceCode) body.municipalServiceCode = input.municipalServiceCode;
  if (input.municipalServiceName) body.municipalServiceName = input.municipalServiceName;
  const raw = await asaasFetch("/invoices", { method: "POST", body: JSON.stringify(body) });
  return {
    id: String(raw?.id ?? ""),
    status: String(raw?.status ?? ""),
    value: Number(raw?.value ?? input.value),
    effectiveDate: raw?.effectiveDate ?? null,
    pdfUrl: raw?.pdfUrl ?? null,
    xmlUrl: raw?.xmlUrl ?? null,
    rpsSerie: raw?.rpsSerie ?? null,
    rpsNumber: raw?.rpsNumber ?? null,
    number: raw?.number ?? null,
  };
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

// ----- Transferencias (Onda 3) -----

export type AsaasPixKeyType = "CPF" | "CNPJ" | "EMAIL" | "PHONE" | "EVP";

export interface AsaasTransferInput {
  value: number;
  pixAddressKey: string;
  pixAddressKeyType: AsaasPixKeyType;
  description?: string;
}

export interface AsaasTransfer {
  id: string;
  status: string; // PENDING | BANK_PROCESSING | DONE | FAILED | CANCELLED | ...
  value: number;
  effectiveDate: string | null;
  transferFee: number | null;
  description: string | null;
}

function mapTransfer(raw: any): AsaasTransfer {
  return {
    id: String(raw?.id ?? ""),
    status: String(raw?.status ?? ""),
    value: Number(raw?.value ?? 0),
    effectiveDate: raw?.effectiveDate ?? raw?.dateCreated ?? null,
    transferFee: raw?.transferFee != null ? Number(raw.transferFee) : null,
    description: raw?.description ?? null,
  };
}

// Cria uma transferencia Pix (saldo Asaas -> chave Pix da conta autorizada).
// O status devolvido e SEMPRE o real do Asaas (nunca simulado).
export async function asaasCreateTransfer(input: AsaasTransferInput): Promise<AsaasTransfer> {
  const body = {
    value: input.value,
    operationType: "PIX",
    pixAddressKey: input.pixAddressKey,
    pixAddressKeyType: input.pixAddressKeyType,
    description: input.description,
  };
  const raw = await asaasFetch("/transfers", { method: "POST", body: JSON.stringify(body) });
  return mapTransfer(raw);
}

// Lista transferencias do Asaas (paginado) para o historico.
export async function asaasListTransfers(max = 100): Promise<AsaasTransfer[]> {
  const out: AsaasTransfer[] = [];
  let offset = 0;
  const limit = 100;
  while (out.length < max) {
    const page = await asaasFetch(`/transfers?offset=${offset}&limit=${limit}`, { method: "GET" });
    const data: any[] = Array.isArray(page?.data) ? page.data : [];
    for (const t of data) out.push(mapTransfer(t));
    if (!page?.hasMore || data.length === 0) break;
    offset += limit;
  }
  return out.slice(0, max);
}
