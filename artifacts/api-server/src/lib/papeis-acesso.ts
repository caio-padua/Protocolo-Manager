/**
 * Autorização no servidor por papel x clínica (Plano Mestre de Permissões, Fatia 2).
 *
 * Função pura: decide 200 (permitir), 401 (sem sessão) ou 403 (negar) a partir
 * dos papéis do profissional NA clínica da requisição. Papéis se somam (união)
 * dentro da mesma clínica; papéis de outra clínica nunca entram na conta.
 * Rota que casa uma regra e profissional sem nenhum papel = negado (fail-closed).
 */

export type Papel = "admin" | "doctor" | "nurse" | "reception" | "finance";

export interface PapeisClinica {
  admin: boolean;
  doctor: boolean;
  nurse: boolean;
  reception: boolean;
  finance: boolean;
}

export interface RegraAcesso {
  dominio: string;
  re: RegExp;
  /** Papéis que podem ler (GET/HEAD/OPTIONS). */
  leitura: Papel[];
  /** Papéis que podem escrever (demais métodos). */
  escrita: Papel[];
}

/** Rotas públicas por desenho (token próprio ou assinatura de provedor) dentro de prefixos protegidos. */
const ISENTAS = [/^\/asaas\/webhook(\/|$)/, /^\/exam-requests\/file\//];

/** Ordem importa: a primeira regra que casa decide. Caminhos sem o prefixo "/api". */
export const REGRAS: RegraAcesso[] = [
  {
    dominio: "prescricao",
    re: /^\/(prescriptions|prescription-formulas|prescription-protocols|receituario|sncr)(\/|$)/,
    leitura: ["doctor"],
    escrita: ["doctor"],
  },
  {
    dominio: "prontuario",
    re: /^\/(prontuario|mega-anamnese|exames-lab|exam-requests|exam-sets|evolucao-exames|exames-avulsos|cockpit|clinical-documents|atestados|encaminhamentos|dieta|treino|antropometria|nursing-assessments|clinical-context|radar-clinico)(\/|$)|^\/clients\/\d+\/(avaliacoes|fotos-corpo)(\/|$)/,
    leitura: ["doctor", "nurse"],
    escrita: ["doctor", "nurse"],
  },
  {
    dominio: "custos-fornecedor",
    re: /^\/(fornecedores|fornecedor-catalogos|matriz-fornecedores|precificacao)(\/|$)/,
    leitura: ["admin", "finance"],
    escrita: ["admin", "finance"],
  },
  {
    dominio: "financeiro",
    re: /^\/(payments|financial-goals|reconciliation|pax-finance|asaas|budgets)(\/|$)/,
    leitura: ["admin", "finance", "reception"],
    escrita: ["admin", "finance"],
  },
  {
    dominio: "equipe",
    re: /^\/padteam(\/|$)/,
    leitura: ["admin"],
    escrita: ["admin"],
  },
];

/** Escrita em cadastro de equipe: só administrador (leitura segue livre para a agenda). */
const EQUIPE_ESCRITA = /^\/professionals(\/\d+)?$/;

const METODOS_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);

export type Decisao =
  | { ok: true; dominio: string | null }
  | { ok: false; status: 401 | 403; dominio: string; motivo: string };

export function regraDoCaminho(path: string, metodo: string): RegraAcesso | null {
  if (ISENTAS.some((r) => r.test(path))) return null;
  const regra = REGRAS.find((r) => r.re.test(path));
  if (regra) return regra;
  if (!METODOS_LEITURA.has(metodo) && EQUIPE_ESCRITA.test(path)) {
    return { dominio: "equipe", re: EQUIPE_ESCRITA, leitura: ["admin"], escrita: ["admin"] };
  }
  return null;
}

export function decidirAcesso(entrada: {
  path: string;
  metodo: string;
  autenticado: boolean;
  donoPlataforma: boolean;
  papeis: PapeisClinica | null;
}): Decisao {
  const metodo = entrada.metodo.toUpperCase();
  const regra = regraDoCaminho(entrada.path, metodo);
  if (!regra) return { ok: true, dominio: null };
  if (!entrada.autenticado) {
    return { ok: false, status: 401, dominio: regra.dominio, motivo: "Acesso restrito: faça login de colaborador." };
  }
  if (entrada.donoPlataforma) return { ok: true, dominio: regra.dominio };
  const exigidos = METODOS_LEITURA.has(metodo) ? regra.leitura : regra.escrita;
  const p = entrada.papeis;
  const tem = !!p && exigidos.some((papel) => p[papel]);
  if (!tem) {
    return {
      ok: false,
      status: 403,
      dominio: regra.dominio,
      motivo: "Seu papel nesta clínica não permite este acesso.",
    };
  }
  return { ok: true, dominio: regra.dominio };
}
