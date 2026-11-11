import { sql } from "drizzle-orm";
import { condicaoCorpoClinico } from "./corpo-clinico.js";
import { enderecoDoRecurso, textoDoEndereco, linksDoEndereco, type ColunasEnderecoExterno } from "./agenda-endereco-externo.js";

/**
 * Ligação entre recurso do Motor de Agenda e categoria profissional.
 *
 * O campo legado `kind` continua sendo a chave que os consumidores antigos usam
 * (reserva de protocolo, Google, preferências do cliente). Ele passa a ser
 * DERIVADO da categoria no servidor e nunca aceito do navegador:
 *   - categoria do tipo médico            -> "medico"
 *   - categoria de slug "enfermagem"      -> "enfermagem"
 *   - qualquer outra categoria            -> "categoria"
 * O valor "categoria" nunca casa com os filtros antigos de médico/enfermagem,
 * portanto uma agenda de biomedicina jamais é tratada como enfermagem.
 */
export type CategoriaAgenda = { id: number; name: string; slug: string; professionalType: string; active: boolean };

export type KindDoRecurso = "medico" | "enfermagem" | "categoria";

export function kindDaCategoria(categoria: Pick<CategoriaAgenda, "slug" | "professionalType">): KindDoRecurso {
  if (categoria.professionalType === "medico") return "medico";
  if (categoria.slug === "enfermagem") return "enfermagem";
  return "categoria";
}

export type StatusCategoria = "confirmada" | "pendente";

/**
 * Apresentação do recurso. A categoria só existe quando foi GRAVADA (criação, confirmação
 * manual ou carga auditada com prova). Recurso legado sem categoria fica "pendente":
 * nada é deduzido pelo nome nem pelo tipo antigo.
 */
export function decorarRecurso<T extends { categoryId: number | null; professionalId: number | null; modality: string } & Partial<ColunasEnderecoExterno>>(
  recurso: T, categorias: CategoriaAgenda[],
) {
  const gravada = recurso.categoryId != null ? categorias.find((c) => c.id === recurso.categoryId) ?? null : null;
  const endereco = recurso.modality === "externo" ? enderecoDoRecurso(recurso) : null;
  const texto = endereco ? textoDoEndereco(endereco) : null;
  const {
    externalCep, externalLogradouro, externalBairro, externalCidade, externalUf, externalNumero, externalComplemento, ...resto
  } = recurso;
  void externalCep; void externalLogradouro; void externalBairro; void externalCidade; void externalUf; void externalNumero; void externalComplemento;
  return {
    ...resto,
    externalAddress: endereco,
    externalAddressText: texto,
    ...(texto ? linksDoEndereco(texto) : { mapsUrl: null, wazeUrl: null }),
    // Agenda externa sem endereço completo fica visível como pendente.
    externalAddressStatus: recurso.modality === "externo" ? (endereco ? "confirmado" : "pendente") : null,
    categoryName: gravada?.name ?? null,
    categoryStatus: gravada ? "confirmada" : "pendente",
    sharing: (recurso.professionalId != null ? "individual" : "compartilhada") as "individual" | "compartilhada",
  };
}

export const AGENDA_CATEGORIA_AUDITORIA_DDL = `
  CREATE TABLE IF NOT EXISTS agenda_resource_category_audit (
    id serial PRIMARY KEY,
    resource_id integer NOT NULL,
    previous_category_id integer,
    category_id integer NOT NULL,
    origin text NOT NULL,
    evidence text,
    actor_professional_id integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )`;

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows: any[] }> };

export async function carregarCategorias(executor: Executor): Promise<CategoriaAgenda[]> {
  const { rows } = await executor.execute(sql`SELECT id, name, slug, professional_type AS "professionalType", active
    FROM professional_areas ORDER BY sort_order, name`);
  return rows.map((r) => ({ id: Number(r.id), name: String(r.name), slug: String(r.slug),
    professionalType: String(r.professionalType), active: r.active === true }));
}

export type DecisaoRecurso =
  | { ok: true; kind: KindDoRecurso; categoryId: number; googleCalendarId: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

type Entrada = { categoryId: number; locationId?: number | null; professionalId?: number | null; empresaId: number; modality?: string };

/**
 * `locations` guarda dois tipos de registro: espaço físico (sem papel) e espaço com agenda Google
 * (agenda_papel local/remoto/externo/pessoal/geral). Registros distintos NUNCA são fundidos, mesmo no
 * mesmo endereço. Para atender, só servem os espaços sem papel ou com papel local/remoto/externo:
 * "pessoal" é a agenda privada de um profissional e "geral" só agrega leitura.
 */
const PAPEIS_QUE_ATENDEM = new Set(["local", "remoto", "externo"]);
const PAPEIS_POR_MODALIDADE: Record<string, (papel: string | null) => boolean> = {
  // Sede = a sede da clínica (valor gravado "local"); Remoto = atendimento online (valor "online").
  online: (p) => p === "remoto",
  local: (p) => p === null || p === "local",
  // Externo = espaço físico diferente da sede (ex.: assistente contratado que atende em outro endereço).
  externo: (p) => p === "externo",
  // Valor legado, não oferecido mais em telas novas.
  domiciliar: () => true,
};
const ROTULO_MODALIDADE: Record<string, string> = { local: "Sede", externo: "Externo", online: "Remoto", domiciliar: "Domiciliar" };

/** Compatibilidade entre modalidade e papel do registro de local, usada na criação e quando a modalidade muda. */
export async function validarModalidadeComLocal(
  executor: Executor, locationId: number, modality: string,
): Promise<{ ok: true } | { ok: false; status: 404 | 409; error: string }> {
  const local = await executor.execute(sql`SELECT name, agenda_papel FROM locations WHERE id=${locationId}`);
  if (!local.rows.length) return { ok: false, status: 404, error: "Sede da agenda não encontrada." };
  const papel: string | null = local.rows[0].agenda_papel ? String(local.rows[0].agenda_papel) : null;
  const compativel = PAPEIS_POR_MODALIDADE[modality];
  if (compativel && !compativel(papel)) {
    return { ok: false, status: 409, error: `A modalidade ${ROTULO_MODALIDADE[modality] ?? modality} não combina com "${local.rows[0].name}" (papel ${papel ?? "sem papel"}).` };
  }
  return { ok: true };
}

/**
 * Valida, dentro da transação do chamador, que categoria, local e profissional são reais,
 * ativos e compatíveis entre si e com a clínica da sessão. Não concede permissão: a
 * autorização sobre o local continua no guard de escrita da agenda.
 */
export async function validarRecursoDeCategoria(executor: Executor, entrada: Entrada): Promise<DecisaoRecurso> {
  const categorias = await carregarCategorias(executor);
  const categoria = categorias.find((c) => c.id === entrada.categoryId);
  if (!categoria || !categoria.active) return { ok: false, status: 404, error: "Categoria profissional não encontrada ou inativa." };

  // Agenda NOVA não exige outra agenda como "local": o vínculo com um registro de local é opcional (legado).
  let googleCalendarId: string | null = null;
  if (entrada.locationId != null) {
    const local = await executor.execute(sql`SELECT id, name, empresa_id, google_calendar_id, agenda_papel FROM locations
      WHERE id=${entrada.locationId} AND active='true'`);
    if (!local.rows.length || Number(local.rows[0].empresa_id) !== entrada.empresaId) {
      return { ok: false, status: 404, error: "Sede da agenda não encontrada nesta clínica." };
    }
    const papel: string | null = local.rows[0].agenda_papel ? String(local.rows[0].agenda_papel) : null;
    if (papel !== null && !PAPEIS_QUE_ATENDEM.has(papel)) {
      return { ok: false, status: 409, error: `"${local.rows[0].name}" é uma agenda de papel ${papel}; ela não serve para atendimento. Escolha uma agenda de sede, externa ou remota.` };
    }
    const compativel = entrada.modality ? PAPEIS_POR_MODALIDADE[entrada.modality] : undefined;
    if (compativel && !compativel(papel)) {
      return { ok: false, status: 409, error: `A modalidade ${ROTULO_MODALIDADE[entrada.modality!] ?? entrada.modality} não combina com "${local.rows[0].name}" (papel ${papel ?? "sem papel"}).` };
    }
    googleCalendarId = local.rows[0].google_calendar_id ? String(local.rows[0].google_calendar_id) : null;
  }

  if (entrada.professionalId != null) {
    const prof = await executor.execute(sql`SELECT p.id, p.area_id FROM professionals p
      WHERE p.id=${entrada.professionalId} AND p.active AND ${condicaoCorpoClinico(entrada.empresaId)}`);
    if (!prof.rows.length) return { ok: false, status: 404, error: "Profissional não encontrado nesta clínica." };
    if (prof.rows[0].area_id == null || Number(prof.rows[0].area_id) !== categoria.id) {
      return { ok: false, status: 409, error: `O profissional não pertence à categoria ${categoria.name}.` };
    }
  }
  return {
    ok: true, kind: kindDaCategoria(categoria), categoryId: categoria.id,
    googleCalendarId,
  };
}
