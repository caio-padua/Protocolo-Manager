import { z } from "zod";
import { pool } from "@workspace/db";
import { lerCatalogosTranscritos, type LinhaTranscricao } from "./catalogo-transcricao";

const candidatoSchema = z.object({
  origem: z.string().regex(/^farmatec-2025-09-29-p[1-9]\d*-linha[1-9]\d*$/),
  legado: z.object({ id: z.number().int().positive(), nome: z.string().min(1), doseText: z.string().min(1) }).strict(),
  farmatec: z.object({
    nome: z.string().min(1), doseTotal: z.string().min(1), volume: z.string().min(1), vias: z.string().min(1),
    embalagem: z.object({ qtd: z.number().int().positive(), tipo: z.enum(["ampola", "frasco"]) }).strict(),
    precoUnidadeCentavos: z.number().int().nonnegative().max(2147483647),
    precoCaixaCentavos: z.number().int().nonnegative().max(2147483647),
  }).strict(),
}).strict();
type Candidato = z.infer<typeof candidatoSchema>;
type Banco = typeof pool;
type Resultado = { origem: string; estado: "inserido" | "ignorado" | "pendente"; motivo?: string };

export class ImportacaoParcial extends Error {
  constructor(readonly resultados: Resultado[], readonly causa: unknown) {
    super("A importação foi interrompida; confira os itens já gravados antes de continuar.");
  }
}

function normalizarNome(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/\*.*?\*/g, "").replace(/\bAC\.\s*/g, "ACIDO ").replace(/[^A-Z0-9]+/g, "");
}
function normalizarDose(dose: string): string {
  return dose.toUpperCase().replace(/\s+/g, "");
}

function validaFonte(c: Candidato, linha: LinhaTranscricao | undefined): string | null {
  if (!linha || linha.origem !== "farmatec" || !linha.pagina || !linha.linhaNaPagina) return "Linha da fonte não encontrada.";
  const f = c.farmatec;
  const origem = `farmatec-2025-09-29-p${linha.pagina}-linha${linha.linhaNaPagina}`;
  const emb = /^(?:(?:cx\s*)?c\/\s*)?(\d+)\s*(ampolas?|frascos?)$/i.exec(linha.campos[6]);
  if (c.origem !== origem || !emb || Number(emb[1]) !== f.embalagem.qtd ||
      !emb[2].toLowerCase().startsWith(f.embalagem.tipo) ||
      linha.campos[2] !== f.nome || linha.campos[3] !== f.doseTotal || linha.campos[4] !== f.volume ||
      linha.campos[5] !== f.vias || linha.custoUnitarioCentavos !== f.precoUnidadeCentavos ||
      linha.custoEmbalagemCentavos !== f.precoCaixaCentavos ||
      f.precoUnidadeCentavos * f.embalagem.qtd !== f.precoCaixaCentavos) return "Manifesto diverge da transcrição.";
  const doseLegada = c.legado.doseText.match(/^\s*(.+?)\s*\/\s*\d+(?:[.,]\d+)?\s*ml\s*$/i);
  if (normalizarNome(c.legado.nome) !== normalizarNome(f.nome) || !doseLegada ||
      normalizarDose(doseLegada[1]) !== normalizarDose(f.doseTotal))
    return "Identidade ou dose da fonte divergem da ficha legada.";
  if (!/^\d+(?:[.,]\d+)?\s*(?:mg|g|mcg|ui)$/i.test(f.doseTotal) ||
      !/^\d+(?:[.,]\d+)?\s*ml$/i.test(f.volume) ||
      Number(f.volume.replace(/\s*ml$/i, "").replace(",", ".")) <= 0) return "Dose ou volume não inequívocos.";
  return null;
}

/** A chamada só é autorizada por execução explícita; não há rota pública. */
export async function importarFarmatec(
  db: Banco, empresaId: number, fornecedorId: number, manifesto: unknown, transcricao: string,
  autorizacao: { ator: "agente"; justificativa: string },
): Promise<Resultado[]> {
  if (!Number.isSafeInteger(empresaId) || empresaId <= 0 || !Number.isSafeInteger(fornecedorId) || fornecedorId <= 0)
    throw new Error("Clínica ou fornecedor inválido.");
  if (autorizacao?.ator !== "agente" || typeof autorizacao.justificativa !== "string" ||
      autorizacao.justificativa.trim().length < 20) throw new Error("Autorização documentada necessária.");
  const candidatos = z.array(candidatoSchema).max(500).parse(manifesto);
  if (new Set(candidatos.map(c => c.origem)).size !== candidatos.length)
    throw new Error("Manifesto possui origens repetidas.");
  const linhas = new Map(lerCatalogosTranscritos(transcricao).filter(l => l.origem === "farmatec")
    .map(l => [`farmatec-2025-09-29-p${l.pagina}-linha${l.linhaNaPagina}`, l]));
  const resultados: Resultado[] = [];
  for (const candidato of candidatos) {
    const origem = candidato.origem;
    const linha = linhas.get(origem);
    const problema = validaFonte(candidato, linha);
    if (problema || !linha) { resultados.push({ origem, estado: "pendente", motivo: problema ?? "Fonte ausente." }); continue; }
    let tentativas = 0;
    while (true) {
    const tx = await db.connect();
    try {
      await tx.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      const fornecedor = await tx.query(`SELECT f.id FROM fornecedores_cadastrados f JOIN empresas e ON e.id=f.empresa_id
        WHERE f.id=$1 AND f.empresa_id=$2 AND f.ativo=true AND e.ativa=true AND e.status='ATIVO' FOR SHARE OF f,e`,
        [fornecedorId, empresaId]);
      if (!fornecedor.rowCount) throw new Error("Fornecedor ou clínica indisponível.");
      const legado = await tx.query(`SELECT id,name,default_dose,is_blend,composicao,presentation_quantity,
        presentation_unit,ampoule_volume_ml,volume_ampola,concentration_mg FROM substances WHERE id=$1 FOR UPDATE`, [candidato.legado.id]);
      const s = legado.rows[0];
      let motivo: string | null = null;
      if (!s || s.name !== candidato.legado.nome || s.default_dose !== candidato.legado.doseText)
        motivo = "Registro legado mudou ou não existe.";
      else if (s.is_blend || s.composicao?.trim()) motivo = "Composição exige revisão.";
      else if (s.presentation_quantity != null || s.presentation_unit || s.ampoule_volume_ml != null || s.volume_ampola || s.concentration_mg)
        motivo = "Apresentação legada estruturada exige conferência.";
      const catalogo = !motivo ? await tx.query("SELECT id,name,default_dose FROM substances") : null;
      const identicos = catalogo?.rows.filter(row => normalizarNome(row.name) === normalizarNome(s.name) &&
        normalizarDose(row.default_dose ?? "") === normalizarDose(s.default_dose));
      if (!motivo && identicos?.length !== 1) motivo = "Há homônimos com a mesma dose.";
      if (motivo) {
        await tx.query("ROLLBACK");
        resultados.push({ origem, estado: "pendente", motivo }); break;
      }
      const existente = await tx.query(`SELECT o.fonte_texto,o.fornecedor_id,o.variante_id,v.substance_id,
        o.documento,o.pagina,o.linha,o.embalagem_original,o.quantidade_embalagem,o.custo_unitario_centavos,
        o.custo_embalagem_centavos,o.moeda,o.posicao,o.versao AS versao_oferta,o.fonte_data_nome_arquivo,
        v.dose_total,v.forma,v.volume_ml,v.vias_fonte,v.concentracao,v.composicao,v.subtipo_implante,v.versao AS versao_variante
        FROM substance_ofertas o JOIN substance_variantes v ON v.id=o.variante_id AND v.empresa_id=o.empresa_id
        WHERE o.empresa_id=$1 AND o.origem_chave=$2 FOR UPDATE OF o,v`, [empresaId, origem]);
      if (existente.rowCount) {
        const e = existente.rows[0], f = candidato.farmatec;
        const mesma = e.fonte_texto === linha.textoOriginal && e.fornecedor_id === fornecedorId && e.substance_id === s.id &&
          e.documento === "Farmatec — transcrição fornecida" && e.pagina === linha.pagina && e.linha === linha.linhaNaPagina &&
          e.embalagem_original === linha.campos[6] && e.quantidade_embalagem === f.embalagem.qtd &&
          e.custo_unitario_centavos === f.precoUnidadeCentavos && e.custo_embalagem_centavos === f.precoCaixaCentavos &&
          e.moeda === "BRL" && e.posicao === 1 && e.versao_oferta === 1 && e.versao_variante === 1 &&
          e.fonte_data_nome_arquivo === "2025-09-29" && e.composicao == null && e.subtipo_implante == null &&
          e.dose_total === f.doseTotal && e.forma === f.embalagem.tipo &&
          Number(e.volume_ml) === Number(f.volume.replace(/\s*ml$/i, "").replace(",", ".")) &&
          e.vias_fonte === f.vias && e.concentracao === `${f.doseTotal} / ${f.volume}`;
        await tx.query("ROLLBACK");
        resultados.push({ origem, estado: mesma ? "ignorado" : "pendente", ...(mesma ? {} : { motivo: "Origem já registrada com dados diferentes." }) });
        break;
      }
      const anteriores = await tx.query("SELECT id,dose_total,forma,volume_ml FROM substance_variantes WHERE empresa_id=$1 AND substance_id=$2 FOR UPDATE", [empresaId, s.id]);
      if (!anteriores.rowCount && normalizarDose(s.default_dose) !== normalizarDose(`${candidato.farmatec.doseTotal}/${candidato.farmatec.volume}`)) {
        await tx.query("ROLLBACK");
        resultados.push({ origem, estado: "pendente", motivo: "Primeira variante não corresponde ao volume legado." }); break;
      }
      if (anteriores.rowCount) {
        const f = candidato.farmatec;
        const volume = Number(f.volume.replace(/\s*ml$/i, "").replace(",", "."));
        if (anteriores.rows.some(a => normalizarDose(a.dose_total) !== normalizarDose(f.doseTotal) ||
            a.forma !== f.embalagem.tipo || a.volume_ml == null || Number(a.volume_ml) === volume)) {
          await tx.query("ROLLBACK");
          resultados.push({ origem, estado: "pendente", motivo: "Variante anterior exige reconciliação." }); break;
        }
      }
      const f = candidato.farmatec;
      const volume = f.volume.replace(/\s*ml$/i, "").replace(",", ".");
      const v = await tx.query(`INSERT INTO substance_variantes(empresa_id,substance_id,dose_total,forma,volume_ml,vias_fonte,concentracao)
        VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [empresaId, s.id, f.doseTotal, f.embalagem.tipo, volume, f.vias, `${f.doseTotal} / ${f.volume}`]);
      const oferta = await tx.query(`INSERT INTO substance_ofertas(empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,fonte_data_nome_arquivo,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos)
        VALUES($1,$2,$3,1,$4,$5,$6,$7,$8,$9,'2025-09-29',$10,$11,$12) RETURNING *`,
        [empresaId, v.rows[0].id, fornecedorId, origem, "Farmatec — transcrição fornecida", linha.pagina, linha.linhaNaPagina, linha.campos[6],
          linha.textoOriginal, f.embalagem.qtd, f.precoUnidadeCentavos, f.precoCaixaCentavos]);
      const motivoAuditoria = autorizacao.justificativa.trim();
      await tx.query(`INSERT INTO substance_variante_historico(empresa_id,variante_id,ator_tipo,justificativa,depois)
        VALUES($1,$2,'agente',$3,$4::jsonb)`, [empresaId, v.rows[0].id, motivoAuditoria, JSON.stringify(v.rows[0])]);
      await tx.query(`INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,justificativa,depois)
        VALUES($1,$2,'agente',$3,$4::jsonb)`, [empresaId, oferta.rows[0].id, motivoAuditoria, JSON.stringify(oferta.rows[0])]);
      await tx.query("COMMIT");
      resultados.push({ origem, estado: "inserido" });
      break;
    } catch (erro) {
      await tx.query("ROLLBACK");
      if (typeof erro === "object" && erro !== null && "code" in erro && erro.code === "40001" && ++tentativas < 3) continue;
      throw new ImportacaoParcial(resultados, erro);
    } finally { tx.release(); }
    }
  }
  return resultados;
}
