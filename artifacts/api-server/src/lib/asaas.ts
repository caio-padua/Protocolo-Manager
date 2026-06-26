// Provedor de Pagamento — implementacao Asaas (gateway brasileiro).
// A chave vive em segredo (ASAAS_API_KEY); a base URL em ASAAS_BASE_URL
// (default producao). Nenhuma credencial e logada ou exposta ao frontend.

const ASAAS_BASE_URL = process.env.ASAAS_BASE_URL || "https://api.asaas.com/v3";

function apiKey(): string {
  const key = process.env.ASAAS_API_KEY;
  if (!key) throw new Error("ASAAS_API_KEY nao configurada no servidor.");
  return key;
}

async function asaasFetch(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      access_token: apiKey(),
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
