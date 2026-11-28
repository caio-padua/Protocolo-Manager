// Carga aditiva e idempotente dos catálogos (Farmatec restante, Bio meds, Indose, Formédica) em substance_variantes/ofertas.
// Uso:  node scripts/carga-catalogos/carregar.mjs            (ensaio: faz tudo e DESFAZ no fim)
//       node scripts/carga-catalogos/carregar.mjs --aplicar  (grava de verdade)
// Regras: nunca apaga nem altera registro existente; sem estoque, sem preço de venda, sem protocolo.
// Produto sem equivalente no catálogo vira substância NOVA com disponivel=false (aguarda revisão clínica).
import { lerFonte } from "./fonte.mjs";
import { INDOSE_AGO, INDOSE_JUL } from "./indose.mjs";
import { novoPool } from "./db.mjs";

const APLICAR = process.argv.includes("--aplicar");
const EMPRESA = 5;
const JUST = "Carga dos catálogos de laboratório transcritos e conferidos pelo Dr. Caio (Farmatec, Bio meds, Indose, Formédica); registro aditivo.";

/* ---------- utilitários de texto e dose ---------- */
const sa = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const num = (s) => {
  s = String(s).trim();
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  return Number(s);
};
const r4 = (n) => Math.round(n * 10000) / 10000;
const unidadeCanon = (u) => ({ MG: "MG", MCG: "MG", G: "MG", UI: "UI", "%": "%" })[u.toUpperCase()];
const fatorUn = (u) => ({ MG: 1, MCG: 0.001, G: 1000, UI: 1, "%": 1 })[u.toUpperCase()];
export function doseChave(str) {
  const m = /^\s*(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?|\d+\.\d+)\s*(mg|mcg|g|ui|%)/i.exec(str ?? "");
  if (!m) return null;
  return `${r4(num(m[1]) * fatorUn(m[2]))}${unidadeCanon(m[2])}`;
}
const volNum = (s) => { const m = /(\d+(?:[.,]\d+)?)\s*ml/i.exec(s ?? ""); return m ? num(m[1]) : null; };
const doseTxt = (s) => String(s).replace(/(\d)\s*(mg|mcg|g|ui|%)/i, (_, n, u) => `${n}${u === "%" ? "" : " "}${u.toLowerCase() === "ui" ? "UI" : u.toLowerCase()}`);
const volTxt = (v) => `${String(v).replace(".", ",")} mL`;

/* ---------- nome ---------- */
const ALIAS = {
  "HIDROXITRIPTOFANO": "5 HTP", "L-GLUTATHION": "L-GLUTHATION", "NAC": "N-ACETIL CISTEINA",
  "MSM": "MSM - METILSULFONILMETANO", "PQQ": "PQQ - PIRROLOQUINOLINO QUINONA", "DHEA/PRASTERONA": "DHEA",
};
const nomeChave = (n) => {
  let s = sa(n).replace(/\([^)]*\)/g, " ").replace(/\*/g, " ").replace(/\bPELLET\b/g, " ").replace(/\bIMPLANTE ESTERIL\b/g, " ")
    .replace(/\s\d+(?:,\d+)?%/g, " ").replace(/[\s-]+$/g, "").replace(/\s+/g, " ").trim();
  return ALIAS[s] ?? s;
};

/* ---------- vias e classificação de substância nova ---------- */
const viasTxt = (v) => {
  const s = sa(v);
  const lista = [];
  if (/\bEV\b|ENDOVEN/.test(s)) lista.push("EV");
  if (/\bIM\b|INTRAMUSC/.test(s)) lista.push("IM");
  if (/\bSC\b|SUBCUT/.test(s)) lista.push("SC");
  if (/\bID\b|INTRADERM/.test(s)) lista.push("ID");
  if (/TOPIC/.test(s)) lista.push("TÓPICO");
  const ex = /EXCLUSIV/.test(s) && lista.length === 1;
  return ex ? `Uso exclusivo ${lista[0]}` : lista.join(" / ") || String(v).trim();
};
const procDe = (v) => { const s = sa(v); return /\bIM\b/.test(s) ? "im" : /\bEV\b/.test(s) ? "iv" : /\bSC\b/.test(s) ? "sc" : "im"; };
const OVERRIDE_CLASSE = {
  CITICOLINA: ["NEUROCOGNITIVO", "Nootropico"], MELATONINA: ["NEUROCOGNITIVO", "Nootropico"], FINASTERIDA: ["DERMATOLOGICO", "Dermatologico"],
  SILICIO: ["DERMATOLOGICO", "Mineral"], "PEPTIDEO DE COBRE (GHK-CU)": ["DERMATOLOGICO", "Dermatologico"], CURCUMINA: ["ORTOMOLECULAR", "Antioxidante"],
  RESVERATROL: ["ORTOMOLECULAR", "Antioxidante"], MOROSIL: ["METABOLICO", "Metabolico"], METILFOLATO: ["VITAMINICO", "SIMPLES"],
  "HMB (HIDROXIMETILBUTIRATO)": ["METABOLICO", "Aminoacido"], TIRZEPATIDA: ["METABOLICO", "metabolismo"], "BETA ALANINA": ["METABOLICO", "Aminoacido"],
};
function classificar(nome, controlado, implante) {
  if (implante || controlado || /TESTOSTERONA|NANDROLONA|ESTANOZOLOL|OXANDROLONA/.test(nome)) return ["GERAL", "Hormonio"];
  if (OVERRIDE_CLASSE[nome]) return OVERRIDE_CLASSE[nome];
  if (/^VITAMINA/.test(nome)) return ["VITAMINICO", "SIMPLES"];
  if (/^L-|GLUTAMINA|TAURINA|ARGININA/.test(nome)) return ["ORTOMOLECULAR", "Aminoacido"];
  return ["ORTOMOLECULAR", "SIMPLES"];
}

/* ---------- composição de blend ---------- */
const arrumaNome = (n) => n.replace(/\bVit\.?\s*(?=[A-Z0-9])/g, "Vitamina ").replace(/([A-Za-z])-\s+(?=[A-Za-z])/g, "$1-").replace(/\s+/g, " ").replace(/^[\s:–-]+|[\s,;]+$/g, "").trim();
function splitTopo(t) {
  const out = []; let nivel = 0, cur = "";
  for (const ch of t) {
    if (ch === "(") nivel++; if (ch === ")") nivel--;
    if ((ch === "+" || ch === "/") && nivel === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur); return out.map((x) => x.trim()).filter(Boolean);
}
export function componentes(texto) {
  const re = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(mg|mcg|g|UI|%)(?![A-Za-z])/gi;
  const comps = [];
  for (const peca of splitTopo(texto)) {
    let ini = 0, m, achou = false;
    re.lastIndex = 0;
    while ((m = re.exec(peca))) {
      achou = true;
      const nome = arrumaNome(peca.slice(ini, m.index));
      comps.push({ nome, dose: doseTxt(`${m[1]} ${m[2]}`) });
      ini = m.index + m[0].length;
    }
    const resto = arrumaNome(peca.slice(ini));
    if (!achou) comps.push({ nome: resto, dose: null }); else if (resto.length > 2) comps.push({ nome: resto, dose: null });
  }
  return comps.filter((c) => c.nome);
}
const compTxt = (cs) => cs.map((c) => (c.dose ? `${c.nome} ${c.dose}` : c.nome)).join(" + ");
const ALIAS_COMP = { RIBOFLAVINA: "VITAMINAB2", DPANTENOL: "VITAMINAB5" };
const assinatura = (texto) => componentes(texto).map((c) => {
  let n = sa(c.nome).replace(/\([^)]*\)/g, "").replace(/[^A-Z0-9]/g, "");
  n = ALIAS_COMP[n] ?? n;
  return `${n}:${c.dose ? doseChave(c.dose) : ""}`;
}).sort().join("|");

/* ---------- banco ---------- */
const pool = novoPool();
const cli = await pool.connect();
const relatorio = [];
const cont = { inserido: 0, anexado: 0, ignorado: 0, pendente: 0, substNova: 0, variNova: 0 };
const log = (fonte, chave, produto, estado, extra = {}) => { relatorio.push({ fonte, chave, produto, estado, ...extra }); if (cont[estado] !== undefined) cont[estado]++; };

let catalogo = []; // substâncias (memória), inclui as criadas nesta execução
async function carregarCatalogo() {
  const r = await cli.query("SELECT id,name,default_dose,is_blend,procedure_type FROM substances");
  catalogo = r.rows.map((s) => ({ ...s, nk: nomeChave(s.name), dk: doseChave(s.default_dose), vol: volNum(s.default_dose), implante: s.procedure_type === "implant" }));
}
async function fornecedor(nome, campos) {
  const f = await cli.query("SELECT id FROM fornecedores_cadastrados WHERE empresa_id=$1 AND lower(btrim(nome))=lower(btrim($2))", [EMPRESA, nome]);
  if (f.rowCount) return f.rows[0].id;
  const ins = await cli.query(`INSERT INTO fornecedores_cadastrados(empresa_id,nome,razao_social,site,fabricante,fornecedor,fonte,ativo)
    VALUES($1,$2,NULL,$3,$4,true,$5,true) RETURNING *`, [EMPRESA, nome, campos.site ?? null, campos.fabricante ?? null, campos.fonte]);
  await cli.query(`INSERT INTO fornecedor_historico(empresa_id,fornecedor_id,ator_tipo,justificativa,depois) VALUES($1,$2,'agente',$3,$4::jsonb)`,
    [EMPRESA, ins.rows[0].id, JUST, JSON.stringify(ins.rows[0])]);
  console.log("Fornecedor criado:", nome, "id", ins.rows[0].id);
  return ins.rows[0].id;
}

async function criarSubstancia({ nome, doseTxtDefault, vias, controlado, implante, blend, composicaoNomes }) {
  const [cat, tipo] = blend ? ["ORTOMOLECULAR", "Blend"] : classificar(nome, controlado, implante);
  const r = await cli.query(`INSERT INTO substances(name,category,color,procedure_type,category_type,sub_categoria,default_dose,via_uso,disponivel,is_blend,composicao)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10) RETURNING id,name,default_dose,is_blend,procedure_type`,
    [nome, cat, implante ? "#2E5E5E" : "#3D7A7A", implante ? "implant" : procDe(vias), tipo, blend ? "COMPOSTO" : "SIMPLES",
      doseTxtDefault ?? null, implante ? "SUBCUTANEO" : viasTxt(vias), !!blend, composicaoNomes ?? null]);
  const s = r.rows[0];
  const novo = { ...s, nk: nomeChave(s.name), dk: doseChave(s.default_dose), vol: volNum(s.default_dose), implante: s.procedure_type === "implant" };
  catalogo.push(novo); cont.substNova++;
  return novo;
}

/** Acha (ou cria) a substância de um produto simples. */
async function substanciaSimples({ nome, alvoNome, nomeSub, dose, vol, vias, controlado, implante }) {
  const dk = doseChave(dose); const v = vol ? volNum(vol) : null;
  const nk = nomeChave(alvoNome ?? nome);
  const cand = catalogo.filter((s) => !s.is_blend && s.implante === !!implante && s.nk === nk && s.dk === dk && (implante || (s.vol ?? null) === v));
  if (cand.length > 1) return { erro: `Ambíguo: ${cand.length} substâncias iguais (${cand.map((c) => c.id).join(", ")}).` };
  if (cand.length === 1) return { s: cand[0], nova: false };
  const nomeNovo = nomeSub ?? (ALIAS[sa(nome)] && catalogo.some((c) => c.nk === nk) ? catalogo.find((c) => c.nk === nk).name : sa(nome));
  const dd = implante ? `${doseTxt(dose).toUpperCase()} — pellet (quantidade a definir)` : `${doseTxt(dose).toUpperCase()} / ${String(v).replace(".", ",")} ML`;
  const s = await criarSubstancia({ nome: implante ? `${nomeNovo} PELLET` : nomeNovo, doseTxtDefault: dd, vias, controlado, implante });
  return { s, nova: true };
}

/** Variante e oferta. Devolve {ok} ou {erro}. */
async function gravarOferta({ fornId, subst, doseTotal, forma, volume, viasFonte, concentracao, composicao, assin, oferta }) {
  const vs = await cli.query("SELECT id,dose_total,forma,volume_ml,composicao FROM substance_variantes WHERE empresa_id=$1 AND substance_id=$2", [EMPRESA, subst.id]);
  const vol = volume === null ? null : Number(volume);
  const existente = vs.rows.find((x) => {
    if (x.forma !== forma || (x.volume_ml === null ? null : Number(x.volume_ml)) !== vol) return false;
    return assin ? assinatura(x.composicao ?? x.dose_total) === assin : doseChave(x.dose_total) === doseChave(doseTotal);
  });
  let varId, nova = false;
  if (existente) varId = existente.id;
  else {
    const v = await cli.query(`INSERT INTO substance_variantes(empresa_id,substance_id,dose_total,forma,volume_ml,vias_fonte,concentracao,composicao)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [EMPRESA, subst.id, doseTotal, forma, vol, viasFonte, concentracao ?? null, composicao ?? null]);
    varId = v.rows[0].id; nova = true; cont.variNova++;
    await cli.query(`INSERT INTO substance_variante_historico(empresa_id,variante_id,ator_tipo,justificativa,depois) VALUES($1,$2,'agente',$3,$4::jsonb)`,
      [EMPRESA, varId, JUST, JSON.stringify(v.rows[0])]);
  }
  const of = await cli.query("SELECT fornecedor_id,posicao FROM substance_ofertas WHERE variante_id=$1", [varId]);
  if (of.rows.some((x) => x.fornecedor_id === fornId)) throw new Error("Este laboratório já tem oferta nesta apresentação (possível duplicata na fonte).");
  const usadas = new Set(of.rows.map((x) => x.posicao));
  let pos = 1; while (usadas.has(pos)) pos++;
  if (pos > 5) throw new Error("Apresentação já tem 5 ofertas.");
  const o = await cli.query(`INSERT INTO substance_ofertas(empresa_id,variante_id,fornecedor_id,posicao,origem_chave,documento,pagina,linha,embalagem_original,fonte_texto,fonte_data_nome_arquivo,quantidade_embalagem,custo_unitario_centavos,custo_embalagem_centavos,produto_fonte)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [EMPRESA, varId, fornId, pos, oferta.chave, oferta.documento, oferta.pagina, oferta.linha, oferta.embOrig, oferta.texto, oferta.data, oferta.qtd, oferta.unit, oferta.caixa, oferta.produto]);
  await cli.query(`INSERT INTO substance_oferta_historico(empresa_id,oferta_id,ator_tipo,justificativa,depois) VALUES($1,$2,'agente',$3,$4::jsonb)`,
    [EMPRESA, o.rows[0].id, JUST, JSON.stringify(o.rows[0])]);
  return { varId, pos, variNova: nova };
}

async function linhaSegura(fonte, chave, produto, fn) {
  const ja = await cli.query("SELECT 1 FROM substance_ofertas WHERE empresa_id=$1 AND origem_chave=$2", [EMPRESA, chave]);
  if (ja.rowCount) { log(fonte, chave, produto, "ignorado", { motivo: "já registrada" }); return; }
  await cli.query("SAVEPOINT linha");
  const antesNova = cont.substNova, antesVar = cont.variNova;
  const antesCat = catalogo.length;
  try {
    const r = await fn();
    if (r?.erro) throw new Error(r.erro);
    await cli.query("RELEASE SAVEPOINT linha");
    log(fonte, chave, produto, r.pos > 1 ? "anexado" : "inserido", { subst: r.subst, variante: r.varId, posicao: r.pos, substanciaNova: r.nova || undefined });
  } catch (e) {
    await cli.query("ROLLBACK TO SAVEPOINT linha");
    cont.substNova = antesNova; cont.variNova = antesVar; catalogo.length = antesCat;
    log(fonte, chave, produto, "pendente", { motivo: e.message });
  }
}

const caixaUnit = (caixa, qtd) => Math.round((caixa * 100) / qtd);
const limpaNome = (n) => n.replace(/\*[^*]*\*/g, "").replace(/\*+/g, "").replace(/\s+/g, " ").trim();

/* ================= EXECUÇÃO ================= */
await cli.query("BEGIN");
try {
  await carregarCatalogo();
  const fonte = lerFonte();
  const fFarmatec = (await cli.query("SELECT id FROM fornecedores_cadastrados WHERE empresa_id=$1 AND nome ILIKE 'FARMATEC%'", [EMPRESA])).rows[0].id;
  const fBio = (await cli.query("SELECT id FROM fornecedores_cadastrados WHERE empresa_id=$1 AND nome ILIKE 'Bio meds%'", [EMPRESA])).rows[0].id;
  const fForm = (await cli.query("SELECT id FROM fornecedores_cadastrados WHERE empresa_id=$1 AND nome ILIKE 'Formedica%'", [EMPRESA])).rows[0].id;
  const fIndose = await fornecedor("Indose Produtos Farmacêuticos", { fabricante: null, fonte: "Portfólios Julho/2025 e Agosto/2025 fornecidos pelo Dr. Caio; razão social e CNPJ não informados nos arquivos." });

  /* ---- 1) Farmatec: as 32 linhas de blends/especiais ainda não carregadas ---- */
  const MAPA_FARMATEC = { "1:12": 209, "1:13": 210, "1:14": 178, "1:17": 182, "1:24": 188, "2:1": 193, "2:4": 196, "2:5": 197, "2:14": 18, "2:15": 19,
    "2:19": 23, "2:30": 34, "3:1": 35, "3:2": 36, "3:3": 37, "3:11": 45, "3:14": 48, "3:33": 66, "3:34": 67, "4:15": 84, "4:16": 85, "4:17": 86,
    "4:18": 87, "4:19": 88, "4:20": 89, "5:1": 90, "5:2": 91, "5:3": 92, "5:4": 93, "5:11": 99, "5:25": 112, "6:11": 128 };
  const EXPL = { "3:11": "Inositol 200 mg + Taurina 200 mg", "3:14": "L-Arginina 1 g + Lidocaína 20 mg", "5:11": "Rutina 50 mg + Benzopirona 0,15 mg", "6:11": "Vitamina D3 600.000 UI + Vitamina K2 MK7 1300 mcg" };
  for (const l of fonte.farmatec) {
    const k = `${l.pagina}:${l.linha}`; if (!(k in MAPA_FARMATEC)) continue;
    const chave = `farmatec-2025-09-29-p${l.pagina}-linha${l.linha}`;
    await linhaSegura("Farmatec", chave, limpaNome(l.nome), async () => {
      const subst = catalogo.find((s) => s.id === MAPA_FARMATEC[k]);
      if (!subst) return { erro: "Substância de destino não existe." };
      const semDose = /^[-–]$/.test(l.dose.trim());
      const simples = !semDose && !subst.is_blend;
      const comp = !simples && !semDose ? (EXPL[k] ?? compTxt(componentes(l.dose))) : null;
      const doseTotal = simples ? l.dose.trim() : comp ?? "não informada";
      const vol = volNum(l.volume);
      return { subst: subst.id, ...(await gravarOferta({
        fornId: fFarmatec, subst, doseTotal, forma: l.tipo, volume: vol, viasFonte: l.vias, concentracao: simples ? `${doseTotal} / ${l.volume}` : null,
        composicao: comp, assin: comp ? assinatura(comp) : null,
        oferta: { chave, documento: "Farmatec — transcrição fornecida", pagina: l.pagina, linha: l.linha, embOrig: l.embOrig, texto: l.texto, data: "2025-09-29", qtd: l.qtd, unit: l.unit, caixa: l.caixa, produto: limpaNome(l.nome) },
      })) };
    });
  }

  /* ---- 2) Bio meds ---- */
  const porPagina = {};
  for (const b of fonte.bio) {
    const n = (porPagina[b.pagina] = (porPagina[b.pagina] ?? 0) + 1);
    const chave = `bio-meds-2026-07-16-p${b.pagina}-l${n}`;
    await linhaSegura("Bio meds", chave, b.nome, async () => {
      const dados = { fornId: fBio, forma: b.tipo, volume: volNum(b.volume), viasFonte: viasTxt(b.vias) };
      const oferta = { chave, documento: "Bio meds Brasil — catálogo (PDF criado em 16/07/2026)", pagina: b.pagina, linha: n, embOrig: b.embOrig, texto: b.texto, data: "2026-07-16", qtd: b.qtd, unit: caixaUnit(b.caixa / 100, b.qtd), caixa: b.caixa, produto: b.nome };
      const bl = /^(ADEK2|PILL FOOD)/i.exec(b.nome);
      if (bl) {
        const subst = catalogo.find((s) => s.id === (/ADEK2/i.test(b.nome) ? 210 : 84));
        const textoComp = /ADEK2/i.test(b.nome) ? b.dose : b.dose;
        const comp = compTxt(componentes(textoComp));
        return { subst: subst.id, ...(await gravarOferta({ ...dados, subst, doseTotal: comp, composicao: comp, assin: assinatura(comp), concentracao: null, oferta })) };
      }
      const r = await substanciaSimples({ nome: b.nome, dose: b.dose, vol: b.volume, vias: b.vias, controlado: /TESTOSTERONA/i.test(b.nome) });
      if (r.erro) return r;
      const nomeSub = r.s.name;
      void nomeSub;
      const g = await gravarOferta({ ...dados, subst: r.s, doseTotal: doseTxt(b.dose), concentracao: `${doseTxt(b.dose)} / ${volTxt(volNum(b.volume))}`, oferta });
      return { subst: r.s.id, nova: r.nova, ...g };
    });
  }

  /* ---- 3) Indose ---- */
  const rodarIndose = async (lista, docNome, data, prefixo) => {
    for (const x of lista) {
      const chave = `${prefixo}-p${x.p}-l${x.n}`;
      await linhaSegura(docNome.includes("Julho") ? "Indose (Julho)" : "Indose", chave, x.nome, async () => {
        const embOrig = `Box com ${x.qtd} ${x.tipo === "frasco" ? "frascos" : "ampolas"}`;
        const oferta = { chave, documento: docNome, pagina: x.p, linha: x.n, embOrig,
          texto: `${x.p} | ${x.n} | ${x.nome} | ${x.blend ?? x.dose} | ${x.vol} | ${x.vias} | ${embOrig} | R$ ${x.caixa},00`, data, qtd: x.qtd, unit: caixaUnit(x.caixa, x.qtd), caixa: x.caixa * 100, produto: x.nome };
        const dados = { fornId: fIndose, forma: x.tipo, volume: volNum(x.vol), viasFonte: viasTxt(x.vias) };
        if (x.blend) {
          const comp = compTxt(componentes(x.blend));
          let subst = x.sub ? catalogo.find((s) => s.id === x.sub) : catalogo.find((s) => s.is_blend && s.name === x.novoBlend);
          if (!subst) subst = await criarSubstancia({ nome: x.novoBlend, vias: x.vias, blend: true, composicaoNomes: componentes(x.blend).map((c) => sa(c.nome)).join(", ") });
          const g = await gravarOferta({ ...dados, subst, doseTotal: comp, composicao: comp, assin: assinatura(comp), concentracao: null, oferta });
          return { subst: subst.id, ...g };
        }
        const r = await substanciaSimples({ nome: x.nome, alvoNome: x.alvoNome, nomeSub: x.nomeSub, dose: x.dose, vol: x.vol, vias: x.vias, controlado: x.controlado });
        if (r.erro) return r;
        const g = await gravarOferta({ ...dados, subst: r.s, doseTotal: doseTxt(x.dose), concentracao: `${doseTxt(x.dose)} / ${x.vol.replace("mL", " mL")}`, oferta });
        return { subst: r.s.id, nova: r.nova, ...g };
      });
    }
  };
  await rodarIndose(INDOSE_AGO, "Indose — portfólio Agosto/2025", "2025-08", "indose-2025-08");
  await rodarIndose(INDOSE_JUL, "Indose — portfólio Julho/2025 (item que não consta em Agosto/2025)", "2025-07", "indose-2025-07");

  /* ---- 4) Formédica: preços históricos 05/2022 (página 5 do PDF de preços) ---- */
  let ordem = 0;
  for (const p of fonte.implPrecos) {
    ordem++;
    const chave = `formedica-precos-2022-05-${p.codigo}`;
    if (/DIVERG|N[ÃA]O REPETE/i.test(p.texto)) { log("Formédica", chave, p.nome, "pendente", { motivo: "Divergência interna na fonte; não conciliada automaticamente (aguarda conferência)." }); continue; }
    if (/CONSULTAR/i.test(p.preco)) { log("Formédica", chave, p.nome, "pendente", { motivo: "Sem preço na fonte (CONSULTAR); nenhum valor inventado." }); continue; }
    const m = /^(.*?)\s+([\d.,]+)\s*(MG|UI)\b/i.exec(p.nome.replace(/\s+IMPLANTE EST[ÉE]RIL/i, ""));
    if (!m) { log("Formédica", chave, p.nome, "pendente", { motivo: "Não foi possível ler nome e dose." }); continue; }
    const caixa = Math.round(num(p.preco.split("--")[0].replace(/[^\d.,]/g, "")) * 100);
    await linhaSegura("Formédica", chave, p.nome, async () => {
      const dose = `${m[2]} ${m[3]}`;
      const r = await substanciaSimples({ nome: m[1], dose, implante: true, controlado: /TESTOSTERONA|ESTANOZOLOL|OXANDROLONA/i.test(m[1]) });
      if (r.erro) return r;
      const g = await gravarOferta({ fornId: fForm, subst: r.s, doseTotal: doseTxt(dose), forma: "implante", volume: null, viasFonte: "SC", concentracao: null,
        oferta: { chave, documento: "Formédica — preços históricos 05/2022 (TABELA FORMEDICA PRECOS 05_22.pdf, p. 5)", pagina: 5, linha: ordem, embOrig: p.apres, texto: p.texto, data: "2022-05", qtd: 1, unit: caixa, caixa, produto: p.nome } });
      return { subst: r.s.id, nova: r.nova, ...g };
    });
  }

  /* ---- fim ---- */
  if (APLICAR) { await cli.query("COMMIT"); console.log("\nGRAVADO (COMMIT)."); }
  else { await cli.query("ROLLBACK"); console.log("\nENSAIO: nada foi gravado (ROLLBACK)."); }
} catch (e) {
  await cli.query("ROLLBACK"); console.error("FALHA GERAL — nada gravado:", e); process.exitCode = 1;
} finally { cli.release(); await pool.end(); }

console.log("\nContagens:", JSON.stringify(cont));
const porFonte = {};
for (const r of relatorio) { const f = (porFonte[r.fonte] ??= { inserido: 0, anexado: 0, ignorado: 0, pendente: 0 }); f[r.estado]++; }
console.table(porFonte);
console.log("\nSubstâncias novas (indisponíveis):");
for (const r of relatorio.filter((x) => x.substanciaNova)) console.log(" -", r.fonte, "|", r.produto, "| subst", r.subst);
console.log("\nPendentes:");
for (const r of relatorio.filter((x) => x.estado === "pendente")) console.log(" -", r.fonte, "|", r.chave, "|", r.produto, "|", r.motivo);
console.log("\nAnexadas como 2ª+ oferta:");
for (const r of relatorio.filter((x) => x.estado === "anexado")) console.log(" -", r.fonte, "|", r.produto, "| subst", r.subst, "var", r.variante, "pos", r.posicao);
