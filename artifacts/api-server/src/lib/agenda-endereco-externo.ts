import { z } from "zod/v4";

/**
 * Endereço de uma agenda EXTERNA (espaço físico diferente da sede, ex.: assistente contratado que atende
 * em outro endereço). Vive na própria agenda. O CEP preenche rua, bairro, cidade e UF no navegador;
 * a pessoa digita só número e complemento. O servidor confere tudo de novo.
 */
export const enderecoExternoSchema = z.object({
  cep: z.string().trim(),
  logradouro: z.string().trim().min(1, "Informe o logradouro (o CEP preenche sozinho).").max(200),
  bairro: z.string().trim().min(1, "Informe o bairro (o CEP preenche sozinho).").max(120),
  cidade: z.string().trim().min(1, "Informe a cidade (o CEP preenche sozinho).").max(120),
  uf: z.string().trim().length(2, "UF deve ter 2 letras."),
  numero: z.string().trim().min(1, "Informe o número (ou S/N).").max(20),
  complemento: z.string().trim().max(120).nullable().optional(),
});
export type EnderecoExterno = z.infer<typeof enderecoExternoSchema> & { complemento?: string | null };

export type ColunasEnderecoExterno = {
  externalCep: string | null; externalLogradouro: string | null; externalBairro: string | null;
  externalCidade: string | null; externalUf: string | null; externalNumero: string | null; externalComplemento: string | null;
};

// A vírgula separa as partes do endereço no texto do evento; dentro de um campo ela vira espaço.
const limpar = (v: string) => v.replace(/[,\n\r]+/g, " ").replace(/\s+/g, " ").trim();

export function normalizarEnderecoExterno(entrada: unknown):
  | { ok: true; endereco: EnderecoExterno } | { ok: false; error: string } {
  const r = enderecoExternoSchema.safeParse(entrada);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Endereço externo inválido." };
  const cep = r.data.cep.replace(/\D/g, "");
  if (cep.length !== 8) return { ok: false, error: "CEP deve ter 8 números." };
  if (!/^[A-Za-z]{2}$/.test(r.data.uf)) return { ok: false, error: "UF deve ter 2 letras." };
  const complemento = r.data.complemento ? limpar(r.data.complemento) : null;
  return {
    ok: true,
    endereco: {
      cep: `${cep.slice(0, 5)}-${cep.slice(5)}`, logradouro: limpar(r.data.logradouro), bairro: limpar(r.data.bairro),
      cidade: limpar(r.data.cidade), uf: r.data.uf.toUpperCase(), numero: limpar(r.data.numero),
      complemento: complemento || null,
    },
  };
}

export function colunasDoEndereco(e: EnderecoExterno): ColunasEnderecoExterno {
  return {
    externalCep: e.cep, externalLogradouro: e.logradouro, externalBairro: e.bairro, externalCidade: e.cidade,
    externalUf: e.uf, externalNumero: e.numero, externalComplemento: e.complemento ?? null,
  };
}

export function enderecoDoRecurso(r: Partial<ColunasEnderecoExterno>): EnderecoExterno | null {
  if (!r.externalCep || !r.externalLogradouro || !r.externalBairro || !r.externalCidade || !r.externalUf || !r.externalNumero) return null;
  return {
    cep: r.externalCep, logradouro: r.externalLogradouro, bairro: r.externalBairro, cidade: r.externalCidade,
    uf: r.externalUf, numero: r.externalNumero, complemento: r.externalComplemento ?? null,
  };
}

/** Formato "Rua, número - complemento, bairro, cidade - UF, CEP 00000-000": é o que o bloco ENDEREÇO do evento entende. */
export function textoDoEndereco(e: EnderecoExterno): string {
  const numero = e.complemento ? `${e.numero} - ${e.complemento}` : e.numero;
  return `${e.logradouro}, ${numero}, ${e.bairro}, ${e.cidade} - ${e.uf}, CEP ${e.cep}`;
}

export function linksDoEndereco(texto: string) {
  const q = encodeURIComponent(texto);
  return { mapsUrl: `https://www.google.com/maps/search/?api=1&query=${q}`, wazeUrl: `https://waze.com/ul?q=${q}` };
}

/** Texto do endereço externo de uma agenda, ou nulo se a agenda não é externa ou o endereço está incompleto. */
export function textoExternoDaAgenda(r: Partial<ColunasEnderecoExterno> & { modality: string }): string | null {
  if (r.modality !== "externo") return null;
  const e = enderecoDoRecurso(r);
  return e ? textoDoEndereco(e) : null;
}
