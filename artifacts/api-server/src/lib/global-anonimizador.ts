/**
 * Filtro de anonimização do Cérebro Global (aprendizado entre clínicas).
 * Pipeline, nesta ordem:
 *  1. dados pessoais (CPF, telefone, e-mail, endereço digital) são removidos;
 *  2. nome de paciente/cliente (lista da própria clínica e padrões "paciente X", "meu nome é X") é removido;
 *  3. nome de médico vira {Medico}; nome de clínica vira {Clinica}; dinheiro vira {Valor};
 *  4. TRAVA CLÍNICA: se sobrar qualquer termo clínico (doença, medicamento, sintoma, exame), a pergunta INTEIRA é barrada.
 *     Nada clínico é "consertado": o que é clínico não sobe para a base global.
 *  5. sobra de número ou de palavra capitalizada fora do início = barrada.
 * Não promete anonimização perfeita: revisão humana continua possível (campo revisada).
 */
export interface ContextoAnonimizacao {
  /** Nomes completos de clientes/profissionais da clínica de origem. */
  nomesPessoas?: string[];
  /** Nomes de clínicas conhecidas (origem e demais). */
  nomesClinicas?: string[];
  /** Nomes de substâncias/medicamentos do catálogo. */
  substancias?: string[];
}
export type ResultadoAnonimizacao =
  | { ok: true; texto: string; trocas: string[] }
  | { ok: false; motivo: string; parcial: string; trocas: string[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const TERMOS_CLINICOS = new Set([
  "dor", "dores", "sintoma", "sintomas", "reacao", "efeito", "efeitos", "medicacao", "medicamento", "remedio", "dose", "dosagem",
  "diagnostico", "exame", "exames", "resultado", "pressao", "febre", "nausea", "tontura", "vomito", "alergia", "prescricao", "receita",
  "hormonio", "hormonios", "tratamento", "tratar", "doenca", "cirurgia", "gravida", "gravidez", "diabetes", "obesidade", "colesterol",
  "tireoide", "insulina", "tirzepatida", "semaglutida", "liraglutida", "testosterona", "metformina", "levotiroxina", "ozempic",
  "mounjaro", "wegovy", "saxenda", "emagrecer", "sangramento", "inchaco", "enxaqueca", "ansiedade", "depressao", "cancer",
]);
const PADRAO_CLINICO = /\b(?:hipo|hiper)\w{4,}|\w{5,}(?:ismo|emia|patia|ite|ose)\b/;

/** Palavras de início de frase ou de uso comum que não são nomes próprios. */
const TITULO_MEDICO = /\b(?:[Dd]r|[Dd]ra|[Dd]outor|[Dd]outora)\.?\s+\p{Lu}\p{L}+(?:\s+(?:(?:de|da|do|dos|das)\s+)?\p{Lu}\p{L}+)*/gu;

function escapar(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

export function anonimizarParaGlobal(original: string, ctx: ContextoAnonimizacao = {}): ResultadoAnonimizacao {
  const trocas: string[] = [];
  let t = (original ?? "").replace(/\s+/g, " ").trim();
  if (!t) return { ok: false, motivo: "texto_vazio", parcial: "", trocas };
  const troca = (re: RegExp, por: string, rotulo: string) => {
    const antes = t; t = t.replace(re, por); if (t !== antes) trocas.push(rotulo);
  };
  // 1. Dados pessoais.
  troca(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "", "cpf_removido");
  troca(/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "", "telefone_removido");
  troca(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "", "email_removido");
  troca(/https?:\/\/\S+|www\.\S+/gi, "", "endereco_digital_removido");
  troca(/\b(?:cpf|rg|telefone|celular|whatsapp)\b\s*[:\-]?/gi, "", "rotulo_de_dado_removido");
  // 2. Nome de paciente.
  for (const nome of [...(ctx.nomesPessoas ?? [])].sort((a, b) => b.length - a.length)) {
    if (nome.trim().length >= 4) troca(new RegExp(`\\b${escapar(nome.trim())}\\b`, "giu"), "", "nome_de_pessoa_removido");
  }
  troca(/\b(?:[Pp]aciente|[Cc]liente|[Ss]ra\.?|[Ss]r\.?|[Ss]enhora|[Ss]enhor|[Dd]ona)\s+\p{Lu}\p{L}+(?:\s+(?:(?:de|da|do|dos|das)\s+)?\p{Lu}\p{L}+)*/gu, ((m: string) => m.split(/\s+/)[0]) as unknown as string, "nome_de_paciente_removido");
  troca(/\b(?:[Mm]eu nome (?:e|é)|[Mm]e chamo|[Aa]qui (?:e|é))\s+\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)*/gu, "", "autoapresentacao_removida");
  // 3. Variáveis.
  troca(TITULO_MEDICO, "{Medico}", "medico_para_variavel");
  for (const c of [...(ctx.nomesClinicas ?? []), "Instituto Pádua", "Instituto Padua"].sort((a, b) => b.length - a.length)) {
    if (c.trim().length >= 4) troca(new RegExp(escapar(c.trim()), "giu"), "{Clinica}", "clinica_para_variavel");
  }
  troca(/R\$\s?\d[\d.,]*|\b\d[\d.,]*\s*(?:reais|real)\b/gi, "{Valor}", "valor_para_variavel");
  t = t.replace(/\s{2,}/g, " ").replace(/\s+([?!.,])/g, "$1").trim();
  // 4. Trava clínica: barra a pergunta inteira.
  const norm = semAcento(t.replace(/\{\w+\}/g, " "));
  const palavras = norm.split(/[^a-z0-9]+/).filter(Boolean);
  const subs = new Set((ctx.substancias ?? []).map((x) => semAcento(x).trim()).filter((x) => x.length >= 4));
  const achado = palavras.find((p) => TERMOS_CLINICOS.has(p) || subs.has(p) || PADRAO_CLINICO.test(p));
  if (achado) return { ok: false, motivo: "termo_clinico", parcial: t, trocas };
  // 5. Sobras.
  if (/\d/.test(t.replace(/\{\w+\}/g, ""))) return { ok: false, motivo: "numero_residual", parcial: t, trocas };
  const resto = t.replace(/\{\w+\}/g, "").split(/\s+/).filter(Boolean);
  if (resto.slice(1).some((p) => /^\p{Lu}\p{Ll}{2,}/u.test(p.replace(/^[("'¿]+/, "")))) return { ok: false, motivo: "possivel_nome_proprio", parcial: t, trocas };
  if (palavras.length < 3) return { ok: false, motivo: "curto_demais", parcial: t, trocas };
  return { ok: true, texto: t, trocas };
}
