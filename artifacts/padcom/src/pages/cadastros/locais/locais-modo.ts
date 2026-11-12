// Modo visual de um local de atendimento (Padrao 27 da skill skill-layout-paxter).
//   SEDE     = presencial no MESMO endereco da empresa
//   EXTERNO  = presencial em OUTRO endereco (rotulo visual "Local externo")
//   ONLINE   = atendimento online sem endereco fisico
//   DEFINIR  = modalidade ainda nao informada (rotulo visual "Indefinido")
// Valores internos (enum) e contratos permanecem inalterados; so os rotulos mudam.
import { Building2, MapPinned, Video, HelpCircle, type LucideIcon } from "lucide-react";

export interface LocalAtendimento {
  id: number; name: string; address: string | null; type: string;
  color: string; active: boolean; googleCalendarId: string | null;
  phone: string | null; cep: string | null; logradouro: string | null;
  numero: string | null; complemento: string | null; bairro: string | null;
  cidade: string | null; estado: string | null; zona: string | null;
  empresaId: number | null; empresaNome: string | null;
  modalidade: "presencial" | "online" | null;
  mesmoEnderecoEmpresa: boolean;
  enderecoEmpresa: string | null;
  agendaPapel: PapelAgenda | null;
  observacaoLocal: string | null;
  nomeEspaco: string | null;
  professionals?: Array<{ id: number; name: string; role: string }>;
}

export type PapelAgenda = "local" | "online" | "externo" | "home_care" | "pessoal" | "geral";
export const PAPEIS_AGENDA: Array<{ valor: PapelAgenda; rotulo: string; explicacao: string }> = [
  { valor: "local", rotulo: "Sede", explicacao: "Atende na clínica" },
  { valor: "online", rotulo: "Online", explicacao: "Atende online" },
  { valor: "externo", rotulo: "Outro local", explicacao: "Atende em espaço fora da clínica" },
  { valor: "home_care", rotulo: "Home Care", explicacao: "Atende no endereço do paciente" },
  { valor: "pessoal", rotulo: "Pessoal", explicacao: "Compromissos particulares" },
  { valor: "geral", rotulo: "Geral", explicacao: "Agendamentos diversos" },
];

export type ModoLocal = "sede" | "externo" | "online" | "definir";

export function modoDoLocal(l: Pick<LocalAtendimento, "modalidade" | "mesmoEnderecoEmpresa">): ModoLocal {
  if (l.modalidade === "online") return "online";
  if (l.modalidade === "presencial") return l.mesmoEnderecoEmpresa ? "sede" : "externo";
  return "definir";
}

export const MODO_META: Record<ModoLocal, {
  rotulo: string; explicacao: string; Icon: LucideIcon;
  fundo: string; texto: string; borda: string;
}> = {
  sede: {
    rotulo: "Sede", explicacao: "Presencial, no endereço da própria empresa", Icon: Building2,
    fundo: "#e3e9f4", texto: "#16284a", borda: "#16284a",
  },
  externo: {
    rotulo: "Local externo", explicacao: "Presencial, fora do endereço da empresa", Icon: MapPinned,
    fundo: "#f6ecd2", texto: "#7a5a12", borda: "#b8892b",
  },
  online: {
    rotulo: "Online", explicacao: "Atendimento online; endereço, se houver, é só referência", Icon: Video,
    fundo: "#e4f1f4", texto: "#0e5866", borda: "#3c9aac",
  },
  definir: {
    rotulo: "Indefinido", explicacao: "Modalidade ainda não informada", Icon: HelpCircle,
    fundo: "#fdf1d6", texto: "#92560a", borda: "#d99a2b",
  },
};

export const ORDEM_MODOS: ModoLocal[] = ["sede", "externo", "online", "definir"];

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/** Instituto Padua sempre no comeco; demais em ordem alfabetica estavel. */
export function ehInstitutoPadua(nome: string | null | undefined): boolean {
  return semAcento(nome ?? "").includes("instituto padua");
}
export function compararEmpresas(a: { nome: string; id?: number | null }, b: { nome: string; id?: number | null }): number {
  const pa = ehInstitutoPadua(a.nome) ? 0 : 1;
  const pb = ehInstitutoPadua(b.nome) ? 0 : 1;
  if (pa !== pb) return pa - pb;
  const n = a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  return n !== 0 ? n : (a.id ?? 0) - (b.id ?? 0);
}
