// Modo visual de um local de atendimento (Padrao 27 da skill skill-layout-paxter).
//   SEDE     = presencial no MESMO endereco da empresa
//   EXTERNO  = presencial em OUTRO endereco (sala alugada, coworking, domicilio fixo)
//   ONLINE   = atendimento remoto sem endereco fisico
//   DEFINIR  = modalidade ainda nao informada (nunca presumida)
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

export type PapelAgenda = "local" | "remoto" | "externo" | "pessoal" | "geral";
export const PAPEIS_AGENDA: Array<{ valor: PapelAgenda; rotulo: string; explicacao: string }> = [
  { valor: "local", rotulo: "Local", explicacao: "Atende na clínica" },
  { valor: "remoto", rotulo: "Remoto", explicacao: "Atende online" },
  { valor: "externo", rotulo: "Externo", explicacao: "Atende em espaço fora da clínica" },
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
    rotulo: "Sede", explicacao: "Presencial, no endereço da empresa", Icon: Building2,
    fundo: "#16284a", texto: "#f2d98a", borda: "#16284a",
  },
  externo: {
    rotulo: "Outro endereço", explicacao: "Presencial, fora do endereço da empresa", Icon: MapPinned,
    fundo: "#f6ecd2", texto: "#7a5a12", borda: "#b8892b",
  },
  online: {
    rotulo: "Online", explicacao: "Atendimento remoto (endereço, se houver, é só referência)", Icon: Video,
    fundo: "#e6ecf7", texto: "#16284a", borda: "#5b7bb5",
  },
  definir: {
    rotulo: "A definir", explicacao: "Modalidade ainda não informada", Icon: HelpCircle,
    fundo: "#fdf1d6", texto: "#92560a", borda: "#d99a2b",
  },
};

export const ORDEM_MODOS: ModoLocal[] = ["sede", "externo", "online", "definir"];

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}
