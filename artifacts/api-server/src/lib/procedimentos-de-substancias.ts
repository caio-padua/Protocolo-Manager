import type { pool } from "@workspace/db";
import { doseSugeridaProduto } from "../../../../lib/procedimentos-shared/src/index";

type Pool = typeof pool;

export type SubstanciaOrigem = {
  id: number; name: string; procedureType: string; defaultDose: string | null; isBlend: boolean | null;
  composicao: string | null; doctorParticipation: boolean | null; durationSeconds: number | null;
  concentrationMg: string | null; volumeAmpola: string | null; presentationQuantity: number | null;
  presentationUnit: string | null; ampouleVolumeMl: number | null;
  components: { componentName: string; doseValue: number | null; doseUnit: string | null }[];
};

const TOKEN_DOSE = /^[0-9][0-9.,+]*(?:MG|MCG|G|UI|IU|AMP|%)(?:\/[0-9][0-9.,]*(?:MG|MCG|G|UI))?$/;

/** Primeira quantidade da dose cadastrada, sem volume nem texto de pellets: "100 MG / 2 ML" -> "100MG". */
export function tokenDoseDaSubstancia(defaultDose: string | null | undefined): string | null {
  const bruto = (defaultDose ?? "").split("—")[0].split(" - ")[0];
  const semVolume = bruto.replace(/\s*\/\s*[0-9][0-9.,]*\s*ml\s*$/i, "");
  const token = semVolume.replace(/\s+/g, "").toUpperCase();
  return TOKEN_DOSE.test(token) ? token : null;
}

/** Nome do procedimento: nome limpo da substância + dose (ex.: "COENZIMA Q10 100MG", "GESTRINONA 50MG"). */
export function nomeProcedimentoDeSubstancia(s: Pick<SubstanciaOrigem, "name" | "defaultDose" | "isBlend" | "composicao">): string {
  const original = s.name.trim();
  const generico = original.toUpperCase() === "BLEND";
  if (generico) {
    const composicao = s.composicao?.replace(/\s+/g, " ").trim();
    return (composicao ? `BLEND ${composicao}` : "BLEND").toUpperCase().slice(0, 200);
  }
  const limpo = original
    .replace(/^implante\s+(?:de\s+)?/i, "")
    .replace(/\s+pellets?\s*$/i, "")
    .replace(/[\s*\-–—]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  // Composto com nome próprio (ex.: ADEK): a dose é uma lista, nunca vira sufixo.
  const token = s.isBlend === true ? null : tokenDoseDaSubstancia(s.defaultDose);
  const jaTem = token != null && limpo.replace(/\s+/g, "").includes(token);
  return (token && !jaTem ? `${limpo} ${token}` : limpo).slice(0, 200);
}

const ROTULO_VIA: Record<string, string> = {
  implant: "IMPLANTE", iv: "ENDOVENOSO", im: "INTRAMUSCULAR", sc: "SUBCUTANEO",
};

/** Garante nomes únicos: sufixo da via quando só a via difere; sufixo do cadastro quando ainda repetir. */
export function atribuirNomesUnicos(
  origens: SubstanciaOrigem[],
  nomesExistentes: Iterable<string> = [],
): Map<number, string> {
  const chave = (n: string) => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const base = new Map(origens.map((o) => [o.id, nomeProcedimentoDeSubstancia(o)]));
  const contagem = new Map<string, number>();
  for (const nome of base.values()) contagem.set(chave(nome), (contagem.get(chave(nome)) ?? 0) + 1);
  const ocupados = new Set([...nomesExistentes].map(chave));
  const final = new Map<number, string>();
  for (const o of origens) {
    let nome = base.get(o.id)!;
    if ((contagem.get(chave(nome)) ?? 0) > 1 || ocupados.has(chave(nome))) {
      const rotulo = ROTULO_VIA[o.procedureType];
      // BLEND repetido não se distingue pela via: vai direto para o sufixo do cadastro.
      if (rotulo && !nome.startsWith("BLEND")) nome = `${nome} (${rotulo})`.slice(0, 200);
    }
    final.set(o.id, nome);
  }
  const usados = new Map<string, number>();
  for (const nome of final.values()) usados.set(chave(nome), (usados.get(chave(nome)) ?? 0) + 1);
  for (const o of origens) {
    const nome = final.get(o.id)!;
    if ((usados.get(chave(nome)) ?? 0) > 1 || ocupados.has(chave(nome))) {
      const sufixo = ` #${o.id}`;
      final.set(o.id, `${nome.slice(0, 200 - sufixo.length)}${sufixo}`);
    }
  }
  return final;
}

export class GeracaoProcedimentosErro extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type ResultadoGeracao = {
  criados: number; jaExistentes: number; implantes: number; semDoseSegura: number;
  nomesRenomeadosPorColisao: number;
};

/** Cria um procedimento por substância ainda sem procedimento, sem apagar nem alterar nada existente. */
export async function gerarProcedimentosDeSubstancias(pool: Pool, empresaId: number): Promise<ResultadoGeracao> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE procedimentos_clinicos IN SHARE ROW EXCLUSIVE MODE");

    const padrao = await client.query<{ enf_local: number | null; med_local: number | null }>(`
      SELECT (SELECT r.location_id FROM agenda_resources r JOIN locations l ON l.id = r.location_id AND l.empresa_id = d.empresa_id
                WHERE r.id = d.enfermagem_resource_id AND r.active) AS enf_local,
             (SELECT r.location_id FROM agenda_resources r JOIN locations l ON l.id = r.location_id AND l.empresa_id = d.empresa_id
                WHERE r.id = d.medico_resource_id AND r.active) AS med_local
      FROM client_clinic_agenda_defaults d WHERE d.empresa_id = $1`, [empresaId]);
    const enfLocal = padrao.rows[0]?.enf_local ?? null;
    const medLocal = padrao.rows[0]?.med_local ?? null;
    if (!enfLocal || !medLocal) {
      throw new GeracaoProcedimentosErro(422,
        "Defina as agendas padrão de enfermagem e de médico da clínica antes de gerar os procedimentos.");
    }
    const areas = await client.query<{ id: number; slug: string }>(
      "SELECT id, slug FROM professional_areas WHERE active = TRUE AND slug IN ('enfermagem','medicina')");
    const enfArea = areas.rows.find((a) => a.slug === "enfermagem")?.id;
    const medArea = areas.rows.find((a) => a.slug === "medicina")?.id;
    if (!enfArea || !medArea) throw new GeracaoProcedimentosErro(422, "Áreas Enfermagem e Medicina precisam estar ativas.");

    const origens = (await client.query<SubstanciaOrigem>(`
      SELECT s.id, s.name, s.procedure_type AS "procedureType", s.default_dose AS "defaultDose", s.is_blend AS "isBlend",
        s.composicao, s.doctor_participation AS "doctorParticipation", s.precise_duration_seconds AS "durationSeconds",
        s.concentration_mg AS "concentrationMg", s.volume_ampola AS "volumeAmpola",
        s.presentation_quantity AS "presentationQuantity", s.presentation_unit AS "presentationUnit",
        s.ampoule_volume_ml AS "ampouleVolumeMl",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('componentName', c.component_name, 'doseValue', c.dose_value,
          'doseUnit', c.dose_unit) ORDER BY c.sort_order, c.id) FROM substance_blend_components c
          WHERE c.substance_id = s.id), '[]'::jsonb) AS components
      FROM substances s
      WHERE NOT EXISTS (SELECT 1 FROM procedimento_produtos pp JOIN procedimentos_clinicos p ON p.id = pp.procedimento_id
        WHERE pp.produto_id = s.id AND pp.ativo AND p.empresa_id = $1)
      ORDER BY s.id`, [empresaId])).rows;
    const total = (await client.query<{ n: string }>("SELECT count(*) AS n FROM substances")).rows[0].n;

    const existentes = (await client.query<{ nome: string }>(
      "SELECT nome FROM procedimentos_clinicos WHERE empresa_id = $1", [empresaId])).rows.map((r) => r.nome);
    const nomes = atribuirNomesUnicos(origens, existentes);

    let implantes = 0, semDoseSegura = 0, renomeados = 0;
    for (const o of origens) {
      const implante = o.procedureType === "implant" || o.doctorParticipation === true;
      if (implante) implantes++;
      if (nomeProcedimentoDeSubstancia(o) !== nomes.get(o.id)) renomeados++;
      // Dose só quando a regra segura do cadastro a confirma; nunca inventada.
      const dose = doseSugeridaProduto({ ...o, components: o.components }) ?? null;
      if (!dose) semDoseSegura++;
      const criado = await client.query<{ id: number }>(
        `INSERT INTO procedimentos_clinicos (empresa_id, nome, tipo, descricao, ativo, duracao_segundos, dose)
         VALUES ($1,$2,$3,$4,TRUE,$5,$6) RETURNING id`,
        [empresaId, nomes.get(o.id), implante ? "medico" : "enfermagem",
          `Gerado automaticamente da substância #${o.id} do cadastro. A dose e a equipe devem ser conferidas pelo médico.`,
          o.durationSeconds && o.durationSeconds > 0 ? o.durationSeconds : null, dose]);
      const procedimentoId = criado.rows[0].id;
      await client.query("INSERT INTO procedimento_produtos (procedimento_id, produto_id, ativo) VALUES ($1,$2,TRUE)",
        [procedimentoId, o.id]);
      await client.query("INSERT INTO procedimento_equipes (procedimento_id, area_id, location_id, origem) VALUES ($1,$2,$3,'substancia_enfermagem')",
        [procedimentoId, enfArea, enfLocal]);
      if (implante) {
        await client.query("INSERT INTO procedimento_equipes (procedimento_id, area_id, location_id, origem) VALUES ($1,$2,$3,'substancia_participacao_medica')",
          [procedimentoId, medArea, medLocal]);
      }
    }
    await client.query("COMMIT");
    return {
      criados: origens.length, jaExistentes: Number(total) - origens.length, implantes,
      semDoseSegura, nomesRenomeadosPorColisao: renomeados,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
