/**
 * Seletor de Transmutação (Fatia 3) — SIMULAÇÃO VISUAL, exclusiva do CEO.
 * Não concede nem retira acesso real: o servidor continua decidindo (ver docs/permissoes).
 * Os cinco domínios que o servidor já protege vêm de /api/ceo/permissoes/mapa (regra real);
 * agenda, estoque/catálogos, comunicação e administração são regras SÓ visuais desta tela.
 */
import { useSyncExternalStore } from "react";

/** Interruptor central. true = telas bloqueadas ficam visíveis com cadeado; false = somem do menu. */
export const HOMOLOGACAO_PERMISSOES = true;

export interface PerfilSimulado {
  id: string;
  rotulo: string;
  /** id do perfil no mapa do servidor; null = visão CEO (sem simulação). */
  mapaId: string | null;
}

export const PERFIS_SIMULADOS: PerfilSimulado[] = [
  { id: "ceo", rotulo: "Dashboard Geral (Visão CEO da Plataforma)", mapaId: null },
  { id: "admin-padua", rotulo: "Admin Instituto Pádua (Médico + Admin)", mapaId: "medico-admin" },
  { id: "empresario", rotulo: "Simular: Empresário Admin Não-Médico", mapaId: "admin-nao-medico" },
  { id: "associado", rotulo: "Simular: Médico Associado (Sem Financeiro)", mapaId: "medico-associado" },
  { id: "enfermagem", rotulo: "Simular: Enfermagem", mapaId: "enfermagem" },
  { id: "recepcao", rotulo: "Simular: Recepção (Somente Leitura)", mapaId: "recepcao" },
  { id: "financeiro", rotulo: "Simular: Gerente Financeiro (Sigilo Médico)", mapaId: "financeiro" },
  { id: "kleber", rotulo: "Simular: Dr. Kleber (Admin + Médico — Instituto Lemos)", mapaId: "medico-admin" },
];

export interface PerfilMapaFront {
  id: string;
  papeis: { admin: boolean; doctor: boolean; nurse: boolean; reception: boolean; finance: boolean };
  dominios: { dominio: string; ler: boolean; escrever: boolean }[];
}

// ── Estado global mínimo (sessionStorage): sobrevive à navegação, morre ao fechar a aba ──
const CHAVE = "padcom_transmutacao_perfil";
const ouvintes = new Set<() => void>();
function ler(): string {
  try { return sessionStorage.getItem(CHAVE) ?? "ceo"; } catch { return "ceo"; }
}
export function definirPerfilSimulado(id: string): void {
  try { sessionStorage.setItem(CHAVE, id); } catch { /* sem armazenamento: segue sem persistir */ }
  ouvintes.forEach((f) => f());
}
export function usePerfilSimuladoId(): string {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; },
    ler,
    () => "ceo",
  );
}

// ── Classificação das telas por domínio ──
type Dominio =
  | "livre" | "agenda" | "prontuario" | "prescricao" | "financeiro" | "custos-fornecedor"
  | "equipe" | "estoque" | "comunicacao" | "ceo" | "admin";

const REGRAS_HREF: [RegExp, Dominio][] = [
  [/^\/$/, "livre"],
  [/^\/(agendar|agendar-antigo|agenda|central-telegram|pit-stop|clients)(\/|$|\?)/, "agenda"],
  [/^\/(radar-clinico|medicacoes-adesao|cockpit|cockpit-anamnese|mega-anamnese|anamnese|craniotomia|cartorio|exames|exames-hub|exames-cliente|procedencia-exames|importar-drive|sinapses-clinicas|dieta|treino|central-pesquisa|arsenal)(\/|$|\?)/, "prontuario"],
  [/^\/cadastros\/(cadastro-exames|console-exames|config-exames)(\/|$)/, "prontuario"],
  [/^\/(prescricao|sncr|receituario-automatico|pedidos-medicos|modelo-receituario)(\/|$|\?)/, "prescricao"],
  [/^\/(financeiro|payments|orcamentos)(\/|$|\?)/, "financeiro"],
  [/^\/(fornecedores|matriz-fornecedores|substances)(\/|$|\?)/, "custos-fornecedor"],
  [/^\/(padteam|professionals|cadastros\/equipe)(\/|$|\?)/, "equipe"],
  [/^\/(stock|catalogos|portfolio-clinico|protocols|procedimentos|ras|pharmacies)(\/|$|\?)/, "estoque"],
  [/^\/comunicacao(\/|$)/, "comunicacao"],
  [/^\/(ceo|prova-de-valor|vitrine-leads|agentes|hierarquia|cadastros\/(empresas|empresas-licenciadas|governanca))(\/|$|\?)/, "ceo"],
];

export function dominioDoHref(href: string): Dominio {
  const achado = REGRAS_HREF.find(([re]) => re.test(href));
  return achado ? achado[1] : "admin";
}

/** Regras SÓ visuais (não existem no servidor ainda): quais papéis veem cada área. */
const VISUAIS: Partial<Record<Dominio, (keyof PerfilMapaFront["papeis"])[]>> = {
  agenda: ["admin", "doctor", "nurse", "reception"],
  estoque: ["admin", "finance"],
  comunicacao: ["admin", "doctor"],
  admin: ["admin"],
};

export function simulaPodeVer(perfil: PerfilMapaFront | null, href: string): boolean {
  const dom = dominioDoHref(href);
  if (dom === "livre") return true;
  if (!perfil) return false; // perfil sem mapa carregado: fecha (nunca abre por engano)
  if (dom === "ceo") return false;
  const visual = VISUAIS[dom];
  if (visual) return visual.some((p) => perfil.papeis[p]);
  return perfil.dominios.some((d) => d.dominio === dom && d.ler);
}
