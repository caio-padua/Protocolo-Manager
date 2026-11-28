import { cnpjValido } from "./entidades";

/**
 * DOCUMENTOS OFICIAIS (puro, sem banco, sem IA): leitura deterministica do texto de cada ato oficial.
 * Cada documento tem seu leitor; nada e inventado: sem evidencia no texto, o campo fica ausente (nunca "chutado").
 * Dados pessoais (CPF, RG, nascimento, endereco residencial) saem separados em `sensiveis` e nunca entram em `publicos`.
 */
export const SLOTS = ["cnpj_rfb", "certidao_jucesp", "contrato_social"] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_ROTULO: Record<Slot, string> = {
  cnpj_rfb: "Comprovante de Inscrição e Situação Cadastral (CNPJ, Receita Federal)",
  certidao_jucesp: "Certidão de Inteiro Teor (Junta Comercial, JUCESP)",
  contrato_social: "Contrato social / Ato constitutivo assinado",
};
/** Ordem de aplicacao: o ultimo documento vence em campo repetido (contrato tem grafia completa; CNPJ cobre o que so a Receita tem). */
export const ORDEM_APLICACAO: Slot[] = ["cnpj_rfb", "certidao_jucesp", "contrato_social"];

export type Valor = string | number | boolean | string[] | Socio[] | Agente[];
export interface Socio { nome: string; quotas: number | null; valorCents: number | null; bp: number | null; nacionalidade: string | null; estadoCivil: string | null; profissao: string | null }
export interface Agente { papel: string; nome: string; data: string | null }
export interface Extraido { publicos: Record<string, Valor>; sensiveis: Record<string, string>; avisos: string[] }

export const ROTULOS: Record<string, { rotulo: string; grupo: string }> = {
  razaoSocial: { rotulo: "Razão social", grupo: "Identificação" }, nomeFantasia: { rotulo: "Nome fantasia", grupo: "Identificação" },
  cnpj: { rotulo: "CNPJ", grupo: "Identificação" }, tipoEstabelecimento: { rotulo: "Matriz ou filial", grupo: "Identificação" },
  nire: { rotulo: "NIRE (registro na Junta Comercial)", grupo: "Identificação" }, dataConstituicao: { rotulo: "Data de constituição", grupo: "Identificação" },
  dataArquivamento: { rotulo: "Data do arquivamento na Junta", grupo: "Identificação" }, dataInscricaoCnpj: { rotulo: "Data de inscrição no CNPJ", grupo: "Identificação" },
  naturezaJuridica: { rotulo: "Natureza jurídica", grupo: "Identificação" }, tipoJuridico: { rotulo: "Tipo jurídico (Junta)", grupo: "Identificação" },
  porte: { rotulo: "Porte", grupo: "Identificação" }, atosRegistrados: { rotulo: "Atos registrados", grupo: "Identificação" },
  situacaoCadastral: { rotulo: "Situação cadastral", grupo: "Situação na Receita" }, dataSituacao: { rotulo: "Data da situação cadastral", grupo: "Situação na Receita" },
  motivoSituacao: { rotulo: "Motivo da situação", grupo: "Situação na Receita" }, situacaoEspecial: { rotulo: "Situação especial", grupo: "Situação na Receita" },
  dataSituacaoEspecial: { rotulo: "Data da situação especial", grupo: "Situação na Receita" }, efr: { rotulo: "Ente federativo responsável", grupo: "Situação na Receita" },
  emitidoEm: { rotulo: "Comprovante emitido em", grupo: "Situação na Receita" },
  logradouro: { rotulo: "Logradouro", grupo: "Sede" }, numero: { rotulo: "Número", grupo: "Sede" }, complemento: { rotulo: "Complemento", grupo: "Sede" },
  bairro: { rotulo: "Bairro", grupo: "Sede" }, cep: { rotulo: "CEP", grupo: "Sede" }, municipio: { rotulo: "Município", grupo: "Sede" }, uf: { rotulo: "UF", grupo: "Sede" },
  email: { rotulo: "E-mail do cadastro", grupo: "Sede" }, telefone: { rotulo: "Telefone do cadastro", grupo: "Sede" },
  cnaePrincipal: { rotulo: "Atividade principal (CNAE)", grupo: "Atividades" }, cnaesSecundarios: { rotulo: "Atividades secundárias (CNAE)", grupo: "Atividades" },
  objetoSocial: { rotulo: "Objeto social (cláusula)", grupo: "Atividades" },
  capitalSocialCents: { rotulo: "Capital social", grupo: "Capital" }, quotasTotal: { rotulo: "Quotas (total)", grupo: "Capital" },
  valorQuotaCents: { rotulo: "Valor de cada quota", grupo: "Capital" }, capitalIntegralizado: { rotulo: "Capital totalmente integralizado", grupo: "Capital" },
  socios: { rotulo: "Sócios e participação", grupo: "Sócios e responsáveis" }, administradorNome: { rotulo: "Administrador(a)", grupo: "Sócios e responsáveis" },
  proLabore: { rotulo: "Pró-labore previsto no contrato", grupo: "Sócios e responsáveis" },
  rtNome: { rotulo: "Médico responsável técnico (clínico)", grupo: "Responsabilidade técnica clínica (não societário)" }, rtCrm: { rotulo: "Registro profissional do responsável técnico", grupo: "Responsabilidade técnica clínica (não societário)" },
  prazoDuracao: { rotulo: "Prazo de duração", grupo: "Contrato" }, exercicioSocial: { rotulo: "Exercício social", grupo: "Contrato" }, foro: { rotulo: "Foro", grupo: "Contrato" },
  dataAssinaturaContrato: { rotulo: "Data de assinatura do contrato", grupo: "Contrato" },
  dataExpedicao: { rotulo: "Certidão expedida em", grupo: "Certidão da Junta" }, horaExpedicao: { rotulo: "Hora da expedição", grupo: "Certidão da Junta" },
  codigoControle: { rotulo: "Código de controle da certidão", grupo: "Certidão da Junta" }, protocolo: { rotulo: "Protocolo na Junta", grupo: "Certidão da Junta" },
  dareCents: { rotulo: "DARE recolhido", grupo: "Certidão da Junta" }, darf: { rotulo: "DARF", grupo: "Certidão da Junta" },
  contadorNome: { rotulo: "Contador que autenticou", grupo: "Certidão da Junta" }, contadorCrc: { rotulo: "CRC do contador (como impresso)", grupo: "Certidão da Junta" },
  agentes: { rotulo: "Agentes da Junta que assinaram", grupo: "Certidão da Junta" },
  desimpedimentoData: { rotulo: "Declaração de desimpedimento em", grupo: "Declarações" }, enquadramentoEpp: { rotulo: "Declaração de enquadramento EPP", grupo: "Declarações" },
  licenciamentoDeclarado: { rotulo: "Declaração de licenciamento do estabelecimento", grupo: "Declarações" },
};
export const ROTULOS_SENSIVEIS: Record<string, string> = {
  socio1_cpf: "CPF do sócio", socio1_rg: "RG do sócio (número, órgão e expedição)", socio1_nascimento: "Data de nascimento do sócio", socio1_endereco: "Endereço residencial do sócio",
  socio2_cpf: "CPF do sócio 2", socio2_rg: "RG do sócio 2", socio2_nascimento: "Nascimento do sócio 2", socio2_endereco: "Endereço residencial do sócio 2",
  contador_cpf: "CPF do contador", agente_conferencia_cpf: "CPF do agente da conferência (Junta)", agente_decisao_cpf: "CPF do julgador (Junta)", agente_secretaria_cpf: "CPF da secretária-geral (Junta)",
};

// ---------- utilitarios ----------
export const soDigitos = (s: string) => s.replace(/\D/g, "");
export const chaveNome = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const flat = (t: string) => t.replace(/\s+/g, " ").trim();
const dataBr = (s: string): string | null => { const m = /^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(s.trim()); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const centavos = (s: string): number | null => { const n = Number(s.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? Math.round(n * 100) : null; };
const inteiro = (s: string): number | null => { const n = Number(s.replace(/\./g, "")); return Number.isInteger(n) ? n : null; };
const semAsteriscos = (s: string | undefined | null) => { const v = (s ?? "").trim(); return !v || /^\*+$/.test(v) ? null : v; };
const MESES: Record<string, string> = { janeiro: "01", fevereiro: "02", marco: "03", abril: "04", maio: "05", junho: "06", julho: "07", agosto: "08", setembro: "09", outubro: "10", novembro: "11", dezembro: "12" };

export function mascarar(chave: string, valor: string): string {
  if (/_cpf$/.test(chave)) { const d = soDigitos(valor); return d.length === 11 ? `***.***.***-${d.slice(9)}` : "***"; }
  if (/_rg$/.test(chave)) { const d = soDigitos(valor); return d.length >= 2 ? `*****${d.slice(-2)}` : "***"; }
  if (/_nascimento$/.test(chave)) { const m = /(\d{4})-?/.exec(valor); return `**/**/${/\d{4}$/.test(valor) ? valor.slice(-4) : (m?.[1] ?? "****")}`; }
  return "endereço oculto";
}

// ---------- tipo do documento (evita arquivo no campo errado) ----------
export function reconhecerSlot(texto: string): Slot | null {
  const t = flat(texto).toUpperCase();
  if (t.includes("COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL") || t.includes("COMPROVANTE DE INSCRIÇÃO E SITUAÇÃO CADASTRAL")) return "cnpj_rfb";
  if (t.includes("CERTIDÃO DE INTEIRO TEOR")) return "certidao_jucesp";
  if (/ATO CONSTITUTIVO|CONTRATO SOCIAL|ALTERAÇÃO CONTRATUAL|CONSTITUIÇÃO DE SOCIEDADE/.test(t)) return "contrato_social";
  return null;
}

// ---------- Comprovante de CNPJ (Receita Federal) ----------
const RE_CNAE = /^(\d{2}\.\d{2}-\d-\d{2}) - (.+)$/;
export function extrairCnpjRfb(texto: string): Extraido {
  const L = texto.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const avisos: string[] = [];
  const apos = (rot: string): string | undefined => { const i = L.findIndex((x) => x === rot); return i >= 0 ? L[i + 1] : undefined; };
  const p: Record<string, Valor> = {};
  const put = (k: string, v: Valor | null | undefined) => { if (v !== null && v !== undefined && v !== "") p[k] = v; };

  const iCnpj = L.findIndex((x) => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(x));
  if (iCnpj >= 0) { put("cnpj", L[iCnpj]); const tipo = L[iCnpj + 1]; if (/^(MATRIZ|FILIAL)$/i.test(tipo ?? "")) put("tipoEstabelecimento", tipo.toUpperCase()); }
  put("dataInscricaoCnpj", dataBr(apos("DATA DE INSCRIÇÃO NO CNPJ") ?? ""));
  put("razaoSocial", apos("NOME EMPRESARIAL"));
  put("dataConstituicao", dataBr(apos("DATA DE CONSTITUIÇÃO") ?? ""));
  put("nomeFantasia", semAsteriscos(apos("TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)")));
  put("porte", apos("PORTE"));

  const iPrinc = L.findIndex((x) => /ATIVIDADE ECONÔMICA PRINCIPAL$/.test(x));
  if (iPrinc >= 0 && RE_CNAE.test(L[iPrinc + 1] ?? "")) put("cnaePrincipal", L[iPrinc + 1]);
  const sec: string[] = [];
  let ult = -1;
  for (let i = 0; i < L.length; i++) {
    if (RE_CNAE.test(L[i])) { if (i === iPrinc + 1) { ult = -1; continue; } sec.push(L[i]); ult = sec.length - 1; continue; }
    if (ult >= 0 && /^[a-zà-ú]/.test(L[i])) { sec[ult] = `${sec[ult]} ${L[i]}`; continue; }
    ult = -1;
  }
  const vistos = new Set<string>(); const secUnicos = sec.filter((c) => { const k = c.slice(0, 10); if (vistos.has(k)) return false; vistos.add(k); return true; });
  if (secUnicos.length) put("cnaesSecundarios", secUnicos);
  if (!secUnicos.length) avisos.push("Nenhuma atividade secundária encontrada no texto.");

  const nat = apos("CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA"); if (nat) put("naturezaJuridica", nat);
  put("logradouro", apos("LOGRADOURO")); put("numero", apos("NÚMERO")); put("complemento", semAsteriscos(apos("COMPLEMENTO")));
  put("cep", apos("CEP")); put("bairro", apos("BAIRRO/DISTRITO")); put("municipio", apos("MUNICÍPIO")); put("uf", apos("UF"));
  const em = apos("ENDEREÇO ELETRÔNICO"); put("email", em ? em.toLowerCase() : undefined); put("telefone", apos("TELEFONE"));
  put("efr", semAsteriscos(apos("ENTE FEDERATIVO RESPONSÁVEL (EFR)")));
  put("situacaoCadastral", apos("SITUAÇÃO CADASTRAL")); put("dataSituacao", dataBr(apos("DATA DA SITUAÇÃO CADASTRAL") ?? ""));
  put("motivoSituacao", semAsteriscos(apos("MOTIVO DE SITUAÇÃO CADASTRAL"))); put("situacaoEspecial", semAsteriscos(apos("SITUAÇÃO ESPECIAL")));
  put("dataSituacaoEspecial", semAsteriscos(apos("DATA DA SITUAÇÃO ESPECIAL")));
  const em2 = /Emitido no dia (\d{2}\/\d{2}\/\d{4}) às (\d{2}:\d{2}:\d{2})/.exec(texto); if (em2) put("emitidoEm", `${dataBr(em2[1])} ${em2[2]}`);
  if (typeof p.cnpj === "string" && !cnpjValido(p.cnpj)) avisos.push("CNPJ lido não passa na conferência dos dígitos verificadores.");
  if (!/QSA/.test(texto) || /CONSULTAR QSA/.test(texto)) avisos.push("Este comprovante não traz o quadro de sócios (QSA); os sócios vêm do contrato social.");
  return { publicos: p, sensiveis: {}, avisos };
}

// ---------- Contrato social / ato constitutivo ----------
function clausula(f: string, de: RegExp, ate: RegExp): string | null {
  const a = de.exec(f); if (!a) return null;
  const resto = f.slice(a.index + a[0].length); const b = ate.exec(resto);
  return (b ? resto.slice(0, b.index) : resto).trim() || null;
}
export function extrairContrato(texto: string): Extraido {
  const f = flat(texto); const p: Record<string, Valor> = {}; const s: Record<string, string> = {}; const avisos: string[] = [];
  const put = (k: string, v: Valor | null | undefined) => { if (v !== null && v !== undefined && v !== "") p[k] = v; };

  const den = /denomina[çc][ãa]o de (.+?),? podendo/i.exec(f); put("razaoSocial", den?.[1]);
  const sede = clausula(f, /CL[ÁA]USULA SEGUNDA\s*:\s*/i, /CL[ÁA]USULA TERCEIRA/i);
  if (sede) {
    const m = /(?:estabelecida na|na|no)\s+(.+?)\s+n[°ºo]\s*(\d+[A-Za-z]?)\s*[-–]\s*(.+?)\s*,\s*CEP\s*([\d.\-]+)/i.exec(sede);
    if (m) {
      put("logradouro", m[1]); put("numero", m[2]); put("cep", m[4].replace(/\.$/, ""));
      const partes = m[3].split(",").map((x) => x.trim()).filter(Boolean);
      const cid = /^(.+?)\s*-\s*([A-Z]{2})$/.exec(partes[partes.length - 1] ?? "");
      if (cid && partes.length >= 3) { put("municipio", cid[1]); put("uf", cid[2]); partes.pop(); }
      if (partes.length >= 2) { put("bairro", partes[partes.length - 1]); put("complemento", partes.slice(0, -1).join(", ")); }
      else avisos.push("Complemento e bairro da sede nao puderam ser separados.");
    }
    else avisos.push("Cláusula da sede encontrada, mas o endereço não pôde ser separado em campos.");
  }
  const prazo = clausula(f, /CL[ÁA]USULA TERCEIRA\s*:\s*/i, /CL[ÁA]USULA QUARTA/i);
  if (prazo) put("prazoDuracao", /indeterminado/i.test(prazo) ? "Tempo indeterminado" : prazo);
  const obj = clausula(f, /CL[ÁA]USULA QUARTA\s*:\s*/i, /CL[ÁA]USULA QUINTA/i); put("objetoSocial", obj?.replace(/^O objetivo da empresa é explorar as atividades de\s*/i, ""));
  const cap = /Capital Social [ée] de R\$\s*([\d.]+,\d{2})/i.exec(f); put("capitalSocialCents", cap ? centavos(cap[1]) : null);
  const qt = /dividido em ([\d.]+)\s*(?:\([^)]*\)\s*)?quotas/i.exec(f); put("quotasTotal", qt ? inteiro(qt[1]) : null);
  const vq = /valor nominal de R\$\s*([\d.]+,\d{2})/i.exec(f); put("valorQuotaCents", vq ? centavos(vq[1]) : null);
  if (/totalmente integralizad/i.test(f)) put("capitalIntegralizado", true); else if (/parcialmente integralizad|a integralizar/i.test(f)) put("capitalIntegralizado", false);

  const tabela = clausula(f, /S[óo]ci[oa]s?\s+Quotas\s+R\$\s+%\s*/i, /(?:T.TAL|TOTAL)\s/i);
  const socios: Socio[] = [];
  if (tabela) for (const m of tabela.matchAll(/([A-Za-zÀ-ú][A-Za-zÀ-ú' ]+?)\s+(\d{1,3}(?:\.\d{3})*)\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3},\d{2})%/g)) {
    socios.push({ nome: m[1].trim(), quotas: inteiro(m[2]), valorCents: centavos(m[3]), bp: Math.round(Number(m[4].replace(",", ".")) * 100), nacionalidade: null, estadoCivil: null, profissao: null });
  }
  if (!socios.length) avisos.push("Tabela de quotas não encontrada: sócios e participações ficam sem origem.");
  socios.forEach((so, i) => {
    const q = new RegExp(`${so.nome.split(/\s+/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s+")}\\s*,\\s*(brasileir[ao]|estrangeir[ao])\\s*,\\s*([^,]+?)\\s*,\\s*([^,]+?)\\s*,\\s*nascid[ao] em (\\d{2}\\/\\d{2}\\/\\d{4})\\s*,\\s*portador[a]? da C[ée]dula de Identidade RG n[°ºo]?\\s*([\\w.\\-]+)\\s*([A-Z]{2,6}\\/[A-Z]{2})\\s*,\\s*inscrit[ao] no CPF n[°ºo]?\\s*([\\d.\\-]+)\\s*,\\s*residente e domiciliad[ao] (?:na|no|em)\\s+(.+?),\\s*por\\s?este instrumento`, "i").exec(f);
    if (q) {
      so.nacionalidade = q[1]; so.estadoCivil = q[2]; so.profissao = q[3];
      const k = `socio${i + 1}_`;
      s[`${k}cpf`] = soDigitos(q[7]); s[`${k}rg`] = `${q[5]} ${q[6]}`; s[`${k}nascimento`] = dataBr(q[4]) ?? q[4]; s[`${k}endereco`] = q[8];
    } else avisos.push(`Qualificação de ${so.nome} não reconhecida no preâmbulo; dados pessoais dele não foram lidos.`);
  });
  if (socios.length) put("socios", socios);
  if (socios.length === 1 || /s[óo]cia? [úu]nic[ao]/i.test(f)) put("tipoJuridico", "Sociedade limitada unipessoal");
  const adm = /(?:exercida|exercido)\s+pel[ao]s?\s+(?:titular|s[óo]cia|s[óo]cio|administrador[a]?)\s*,\s*([^,]+?)\s*,\s*j[áa] qualificad/i.exec(f); put("administradorNome", adm?.[1].trim());
  if (/pr[óo]-?labore/i.test(f)) put("proLabore", true);
  const rt = /administra[çc][ãa]o t[ée]cnica da empresa caber[áa] ao m[ée]dico\s+Dr\.?\s+(.+?)\s+habilitad[oa] e registrad[oa] no CRM\/([A-Z]{2})\s*([\d.]+)/i.exec(f);
  if (rt) { put("rtNome", rt[1].trim()); put("rtCrm", `CRM/${rt[2]} ${soDigitos(rt[3])}`); }
  if (/exerc[íi]cio social coincide com o ano civil/i.test(f)) put("exercicioSocial", "Ano civil (1º de janeiro a 31 de dezembro)");
  const foro = /eleito o foro de (.+?) para/i.exec(f); put("foro", foro?.[1].trim());
  const ass = /([A-Za-zÀ-ú ]+),\s*(\d{1,2}) de ([A-Za-zçÇ]+) de (\d{4})\./.exec(f);
  if (ass) { const mes = MESES[ass[3].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()]; if (mes) put("dataAssinaturaContrato", `${ass[4]}-${mes}-${ass[2].padStart(2, "0")}`); }
  if (!p.razaoSocial) avisos.push("Denominação social não encontrada no contrato.");
  return { publicos: p, sensiveis: s, avisos };
}

// ---------- Certidao de Inteiro Teor (JUCESP) ----------
export function extrairJucesp(texto: string): Extraido {
  const f = flat(texto);
  const base = extrairContrato(texto);
  const p: Record<string, Valor> = { ...base.publicos }; const s = { ...base.sensiveis }; const avisos = [...base.avisos];
  const put = (k: string, v: Valor | null | undefined) => { if (v !== null && v !== undefined && v !== "") p[k] = v; };
  const rz = /NOME EMPRESARIAL\s+(.+?)\s+TITULO/.exec(f); if (rz && !p.razaoSocial) put("razaoSocial", rz[1]);
  const tj = /TIPO JUR[ÍI]DICO\s+(.+?)\s+NIRE/.exec(f); if (tj) { put("tipoJuridico", tj[1].replace(/\s*\(E\.P\.P\.\)/, "").trim()); if (/E\.P\.P\./.test(tj[1])) put("porte", "EPP"); }
  const nire = /NIRE\s+(\d{11})/.exec(f) ?? /NIRE n[ºo°]\s*(\d{11})/.exec(f); put("nire", nire?.[1]);
  const arq = /DATA DO ARQUIVAMENTO\s+(\d{2}\/\d{2}\/\d{4})/.exec(f); put("dataArquivamento", arq ? dataBr(arq[1]) : null);
  const exp = /DATA DE EXPEDI[ÇC][ÃA]O\s+(\d{2}\/\d{2}\/\d{4})/.exec(f); put("dataExpedicao", exp ? dataBr(exp[1]) : null);
  put("horaExpedicao", /HORA DE EXPEDI[ÇC][ÃA]O\s+(\d{2}:\d{2}:\d{2})/.exec(f)?.[1]);
  put("codigoControle", /C[ÓO]DIGO DE CONTROLE\s+(\d+)/.exec(f)?.[1]);
  put("protocolo", /protocolad[oa] sob o n[ºo°]\s*([A-Z0-9]+)/.exec(f)?.[1]);
  put("atosRegistrados", /ATO\(S\)\s+(.+?)\s+NOME EMPRESARIAL/.exec(f)?.[1]);
  const dare = /DARE R\$\s*([\d.]+,\d{2})/.exec(f); put("dareCents", dare ? centavos(dare[1]) : null); put("darf", /DARF\s+(Isento|R\$\s*[\d.,]+)/i.exec(f)?.[1]);
  const ctd = /Eu\s+([A-ZÀ-Ú][A-ZÀ-Ú ]+?),\s*com inscri[çc][ãa]o ativa no CRC\/\(UF\) sob o n\S*\s*(\S+),\s*expedida em (\d{2}-\d{2}-\d{4}),\s*inscrito no CPF n\S*\s*([\d.\-]+)/.exec(f);
  if (ctd) { put("contadorNome", ctd[1]); put("contadorCrc", ctd[2]); s.contador_cpf = soDigitos(ctd[4]); avisos.push("CRC do contador veio de leitura imperfeita do original; confira o número no documento."); }
  const ag: Agente[] = [];
  const conf = /funcion[áa]rio\/empregado p[úu]blico\s+(.+?)\s+Junta Comercial do Estado de S[ãa]o Paulo,\s*(\d{2}\/\d{2}\/\d{4})\.\s*\1,\s*CPF:\s*(\d{11})/.exec(f);
  if (conf) { ag.push({ papel: "Conferência e digitalização", nome: conf[1], data: dataBr(conf[2]) }); s.agente_conferencia_cpf = conf[3]; }
  const dec = /o Julgador\s+(.+?)\.\s*Junta Comercial do Estado de S[ãa]o Paulo,\s*(\d{2}\/\d{2}\/\d{4})\.\s*\1,\s*CPF:\s*(\d{11})/.exec(f);
  if (dec) { ag.push({ papel: "Decisão (julgador)", nome: dec[1], data: dataBr(dec[2]) }); s.agente_decisao_cpf = dec[3]; }
  const sec = /Secret[áa]rio\(a\)-Geral [–-] (.+?)\.\s*A autenticidade.+?Junta Comercial do Estado de S[ãa]o Paulo,\s*(\d{2}\/\d{2}\/\d{4})\.\s*\1,\s*CPF:\s*(\d{11})/.exec(f);
  if (sec) { ag.push({ papel: "Secretária-Geral (registro)", nome: sec[1], data: dataBr(sec[2]) }); s.agente_secretaria_cpf = sec[3]; }
  if (ag.length) put("agentes", ag);
  const des = /DECLARA[ÇC][ÃA]O DE DESIMPEDIMENTO.+?DATA\s+(\d{2}\/\d{2}\/\d{4})/.exec(f); put("desimpedimentoData", des ? dataBr(des[1]) : null);
  if (/DECLARA[ÇC][ÃA]O DE ENQUADRAMENTO.+?se enquadra na condi[çc][ãa]o de Empresa de Pequeno Porte/.test(f)) put("enquadramentoEpp", true);
  if (/CERTIFICADO DE LICENCIAMENTO INTEGRADO V[ÁA]LIDO/.test(f)) put("licenciamentoDeclarado", true);
  const cap = /LOGRADOURO\s+(\S+)\s+N[ÚU]MERO\s+(\d+)\s+COMPLEMENTO\s+(.+?)\s+BAIRRO\/DISTRITO\s+(.+?)\s+CEP\s+(\d{8})\s+MUNIC[ÍI]PIO\s+(.+?)\s+UF\s+([A-Z]{2})/.exec(f);
  if (cap) { if (!p.numero) put("numero", cap[2]); if (!p.complemento) put("complemento", cap[3].trim()); if (!p.bairro) put("bairro", cap[4].trim()); if (!p.cep) put("cep", `${cap[5].slice(0, 5)}-${cap[5].slice(5)}`); put("municipio", cap[6].trim()); put("uf", cap[7]); }
  for (const k of ["nire", "dataArquivamento", "codigoControle", "protocolo"]) if (!p[k]) avisos.push(`Campo ${ROTULOS[k].rotulo} não encontrado na certidão.`);
  return { publicos: p, sensiveis: s, avisos };
}

export function extrair(slot: Slot, texto: string): Extraido {
  return slot === "cnpj_rfb" ? extrairCnpjRfb(texto) : slot === "certidao_jucesp" ? extrairJucesp(texto) : extrairContrato(texto);
}

// ---------- mascara para provedor de IA ----------
/** Remove dados pessoais do texto ANTES de qualquer envio a provedor de IA. */
export function mascararParaIA(texto: string): string {
  return texto
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\bRG n[°ºo]?\s*[\w.\-]+(\s*[A-Z]{2,6}\/[A-Z]{2})?/gi, "RG [RG]")
    .replace(/(IDENTIFICA[ÇC][ÃA]O\s+)\d{6,}/g, "$1[ID]").replace(/(Documento de Identifica[çc][ãa]o n\S*\s*)\d{6,}/gi, "$1[ID]")
    .replace(/nascid[ao] em \d{2}\/\d{2}\/\d{4}/gi, "nascida em [NASCIMENTO]")
    .replace(/(residente e domiciliad[ao] (?:na|no|em)\s+)[\s\S]*?(,\s*por\s?este instrumento)/gi, "$1[ENDEREÇO RESIDENCIAL]$2")
    .replace(/(DOMICILIADO \(A\)\s+)[\s\S]*?(\s+Declara,)/g, "$1[ENDEREÇO RESIDENCIAL]$2")
    .replace(/\b\d{9}\b/g, "[ID]");
}

// ---------- conferencia cruzada entre documentos ----------
export interface LinhaCruzada { chave: string; rotulo: string; resultado: "confere" | "diverge" | "so_um"; valores: Partial<Record<Slot, string>> }
const COMPARAVEIS: Array<{ chave: string; norm: (v: string) => string }> = [
  { chave: "razaoSocial", norm: chaveNome }, { chave: "cnpj", norm: soDigitos }, { chave: "cep", norm: soDigitos }, { chave: "numero", norm: chaveNome },
  { chave: "complemento", norm: chaveNome }, { chave: "bairro", norm: chaveNome }, { chave: "porte", norm: chaveNome }, { chave: "nire", norm: soDigitos },
  { chave: "dataConstituicao", norm: (v) => v }, { chave: "capitalSocialCents", norm: (v) => v },
];
const txt = (v: Valor | undefined) => (v === undefined ? undefined : typeof v === "string" ? v : JSON.stringify(v));
export function conferirCruzado(docs: Partial<Record<Slot, Record<string, Valor>>>): LinhaCruzada[] {
  const out: LinhaCruzada[] = [];
  for (const c of COMPARAVEIS) {
    const valores: Partial<Record<Slot, string>> = {};
    for (const sl of SLOTS) { const v = txt(docs[sl]?.[c.chave]); if (v !== undefined) valores[sl] = String(v); }
    const n = Object.keys(valores).length; if (!n) continue;
    const distintos = new Set(Object.values(valores).map((v) => c.norm(String(v))));
    out.push({ chave: c.chave, rotulo: ROTULOS[c.chave]?.rotulo ?? c.chave, resultado: n === 1 ? "so_um" : distintos.size === 1 ? "confere" : "diverge", valores });
  }
  // Nome do sócio na tabela do contrato x administrador x assinatura
  const rfbDt = docs.cnpj_rfb?.dataConstituicao, jDt = docs.certidao_jucesp?.dataArquivamento;
  if (typeof rfbDt === "string" && typeof jDt === "string") out.push({ chave: "dataArquivamentoXConstituicao", rotulo: "Constituição (Receita) x arquivamento (Junta)", resultado: rfbDt === jDt ? "confere" : "diverge", valores: { cnpj_rfb: rfbDt, certidao_jucesp: jDt } });
  return out;
}

/** Regras internas de coerencia do contrato (aritmetica e cadastro). */
export function coerenciaContrato(p: Record<string, Valor>): string[] {
  const a: string[] = []; const socios = (p.socios as Socio[] | undefined) ?? [];
  const cap = p.capitalSocialCents as number | undefined, q = p.quotasTotal as number | undefined, v = p.valorQuotaCents as number | undefined;
  if (cap !== undefined && q !== undefined && v !== undefined && q * v !== cap) a.push(`Capital (${cap / 100}) não é igual a quotas x valor da quota (${(q * v) / 100}).`);
  if (socios.length) {
    const bp = socios.reduce((x, s) => x + (s.bp ?? 0), 0); if (bp !== 10000) a.push(`Participações somam ${(bp / 100).toLocaleString("pt-BR")}%, não 100%.`);
    const qs = socios.reduce((x, s) => x + (s.quotas ?? 0), 0); if (q !== undefined && qs !== q) a.push(`Quotas dos sócios (${qs}) diferem do total do contrato (${q}).`);
    if (cap !== undefined) { const vs = socios.reduce((x, s) => x + (s.valorCents ?? 0), 0); if (vs !== cap) a.push("Valores por sócio não somam o capital social."); }
  }
  return a;
}

/** Limpa a transcricao da IA de visao: remove marcacao de formatacao (negrito, tabela) para que o leitor deterministico veja o mesmo texto de um PDF digital. */
export function normalizarTranscricao(t: string): string {
  return t.split(/\r?\n/).filter((l) => !/^\s*\|?[\s:\-|]+\|?\s*$/.test(l) || !l.includes("-") || !l.includes("|"))
    .map((l) => l.replace(/\*\*/g, "").replace(/^#+\s*/, "").replace(/^\s*\|(.*)\|\s*$/, (_m, c: string) => c.split("|").map((x) => x.trim()).join(" ")).replace(/\u2013|\u2014/g, "-").replace(/n\u00ba/g, "n\u00b0"))
    .join("\n");
}
