/**
 * Catalogo das avaliacoes corporais do cliente (Cockpit da Consulta).
 * Fonte unica: a tela monta o formulario a partir daqui e o servidor valida por aqui.
 * Nenhum campo vem preenchido; derivados (IMC etc.) sao calculados na leitura e nunca gravados.
 */

export const TIPOS_AVALIACAO = [
  "bioimpedancia",
  "antropometria",
  "dinamometria",
  "calorimetria",
  "ultrassom",
  "outras",
] as const;
export type TipoAvaliacao = (typeof TIPOS_AVALIACAO)[number];

export type CampoNumero = {
  kind: "number";
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** casas decimais usadas na exibicao */
  casas: number;
  grupo: string;
};
export type CampoEscolha = {
  kind: "select";
  key: string;
  label: string;
  opcoes: { value: string; label: string }[];
  grupo: string;
};
export type Campo = CampoNumero | CampoEscolha;

export type Derivado = {
  key: string;
  label: string;
  unit: string;
  casas: number;
  grupo: string;
  calcula: (v: Record<string, number>) => number | null;
};

export type DefinicaoAvaliacao = {
  tipo: TipoAvaliacao;
  titulo: string;
  curto: string;
  descricao: string;
  /** o que esta medicao responde, em linguagem simples */
  paraQueServe: string;
  campos: Campo[];
  derivados: Derivado[];
};

const n = (grupo: string, key: string, label: string, unit: string, min: number, max: number, casas = 1): CampoNumero =>
  ({ kind: "number", grupo, key, label, unit, min, max, casas });

const ratio = (a?: number, b?: number): number | null =>
  a === undefined || b === undefined || b === 0 ? null : a / b;

const maiorDe = (...xs: (number | undefined)[]): number | null => {
  const ok = xs.filter((x): x is number => typeof x === "number");
  return ok.length ? Math.max(...ok) : null;
};

const bioimpedancia: DefinicaoAvaliacao = {
  tipo: "bioimpedancia",
  titulo: "Bioimpedância",
  curto: "Composição corporal",
  descricao: "Composição corporal medida por corrente elétrica de baixa intensidade.",
  paraQueServe: "Mostra quanto do peso é músculo, gordura e água, e como isso muda a cada medição.",
  campos: [
    n("Peso e massas", "peso", "Peso", "kg", 2, 400),
    n("Peso e massas", "massaMuscularEsqueletica", "Massa muscular esquelética", "kg", 1, 150),
    n("Peso e massas", "massaGordura", "Massa de gordura", "kg", 0.5, 300),
    n("Peso e massas", "massaMagra", "Massa magra", "kg", 1, 250),
    n("Peso e massas", "massaMineralOssea", "Massa mineral óssea", "kg", 0.2, 10),
    n("Gordura", "percentualGordura", "Percentual de gordura", "%", 1, 70),
    n("Gordura", "gorduraVisceral", "Gordura visceral (nível)", "nível", 1, 30, 0),
    n("Água corporal", "aguaTotal", "Água corporal total", "L", 5, 120),
    n("Água corporal", "aguaIntracelular", "Água intracelular", "L", 3, 80),
    n("Água corporal", "aguaExtracelular", "Água extracelular", "L", 2, 60),
    n("Metabolismo e células", "taxaMetabolicaBasal", "Taxa metabólica basal", "kcal", 500, 4500, 0),
    n("Metabolismo e células", "anguloFase", "Ângulo de fase (50 kHz)", "°", 1, 15),
    n("Metabolismo e células", "resistencia", "Resistência (50 kHz)", "Ω", 100, 1500, 0),
    n("Metabolismo e células", "reatancia", "Reatância (50 kHz)", "Ω", 10, 200, 0),
  ],
  derivados: [
    { key: "razaoAguaExtra", label: "Água extracelular / total", unit: "", casas: 3, grupo: "Água corporal",
      calcula: (v) => ratio(v.aguaExtracelular, v.aguaTotal) },
    { key: "percentualMusculo", label: "Músculo esquelético / peso", unit: "%", casas: 1, grupo: "Peso e massas",
      calcula: (v) => { const r = ratio(v.massaMuscularEsqueletica, v.peso); return r === null ? null : r * 100; } },
  ],
};

const antropometria: DefinicaoAvaliacao = {
  tipo: "antropometria",
  titulo: "Antropometria",
  curto: "Medidas do corpo",
  descricao: "Medidas feitas com fita e adipômetro: peso, altura, circunferências e dobras cutâneas.",
  paraQueServe: "Acompanha o formato do corpo: onde a medida diminuiu ou aumentou, mesmo quando o peso não muda.",
  campos: [
    n("Básicas", "peso", "Peso", "kg", 2, 400),
    n("Básicas", "altura", "Altura", "cm", 40, 250),
    n("Circunferências (fita)", "cPescoco", "Pescoço", "cm", 15, 80),
    n("Circunferências (fita)", "cTorax", "Tórax", "cm", 40, 200),
    n("Circunferências (fita)", "cCintura", "Cintura", "cm", 30, 220),
    n("Circunferências (fita)", "cAbdomen", "Abdômen", "cm", 30, 220),
    n("Circunferências (fita)", "cQuadril", "Quadril", "cm", 40, 220),
    n("Circunferências (fita)", "cBracoD", "Braço direito (relaxado)", "cm", 10, 80),
    n("Circunferências (fita)", "cBracoE", "Braço esquerdo (relaxado)", "cm", 10, 80),
    n("Circunferências (fita)", "cCoxaD", "Coxa direita (proximal)", "cm", 20, 120),
    n("Circunferências (fita)", "cCoxaE", "Coxa esquerda (proximal)", "cm", 20, 120),
    n("Circunferências (fita)", "cPanturrilhaD", "Panturrilha direita", "cm", 15, 80),
    n("Circunferências (fita)", "cPanturrilhaE", "Panturrilha esquerda", "cm", 15, 80),
    n("Dobras cutâneas (adipômetro)", "dTriceps", "Tricipital", "mm", 1, 80),
    n("Dobras cutâneas (adipômetro)", "dSubescapular", "Subescapular", "mm", 1, 80),
    n("Dobras cutâneas (adipômetro)", "dPeitoral", "Peitoral", "mm", 1, 80),
    n("Dobras cutâneas (adipômetro)", "dAxilarMedia", "Axilar média", "mm", 1, 80),
    n("Dobras cutâneas (adipômetro)", "dSuprailiaca", "Supra-ilíaca", "mm", 1, 80),
    n("Dobras cutâneas (adipômetro)", "dAbdominal", "Abdominal", "mm", 1, 80),
    n("Dobras cutâneas (adipômetro)", "dCoxa", "Coxa", "mm", 1, 80),
  ],
  derivados: [
    { key: "imc", label: "Índice de massa corporal (IMC)", unit: "kg/m²", casas: 1, grupo: "Básicas",
      calcula: (v) => (v.peso && v.altura ? v.peso / Math.pow(v.altura / 100, 2) : null) },
    { key: "rcq", label: "Relação cintura/quadril", unit: "", casas: 2, grupo: "Circunferências (fita)",
      calcula: (v) => ratio(v.cCintura, v.cQuadril) },
    { key: "rce", label: "Relação cintura/estatura", unit: "", casas: 2, grupo: "Circunferências (fita)",
      calcula: (v) => ratio(v.cCintura, v.altura) },
    { key: "somaDobras", label: "Soma das dobras informadas", unit: "mm", casas: 1, grupo: "Dobras cutâneas (adipômetro)",
      calcula: (v) => {
        const ks = ["dTriceps", "dSubescapular", "dPeitoral", "dAxilarMedia", "dSuprailiaca", "dAbdominal", "dCoxa"];
        const xs = ks.map((k) => v[k]).filter((x) => typeof x === "number");
        return xs.length >= 2 ? xs.reduce((a, b) => a + b, 0) : null;
      } },
  ],
};

const tent = (grupo: string, lado: string, i: number, k: string) =>
  n(grupo, `${k}${i}`, `${lado} — tentativa ${i}`, "kgf", 1, 120);

const dinamometria: DefinicaoAvaliacao = {
  tipo: "dinamometria",
  titulo: "Dinamometria",
  curto: "Força muscular",
  descricao: "Força medida em aparelho (dinamômetro): preensão da mão, lombar e membros inferiores.",
  paraQueServe: "Mostra a força real do músculo e se há diferença entre o lado direito e o esquerdo.",
  campos: [
    tent("Preensão manual — mão direita", "Direita", 1, "preD"),
    tent("Preensão manual — mão direita", "Direita", 2, "preD"),
    tent("Preensão manual — mão direita", "Direita", 3, "preD"),
    tent("Preensão manual — mão esquerda", "Esquerda", 1, "preE"),
    tent("Preensão manual — mão esquerda", "Esquerda", 2, "preE"),
    tent("Preensão manual — mão esquerda", "Esquerda", 3, "preE"),
    n("Outros dinamômetros", "forcaLombar", "Força lombar", "kgf", 5, 400),
    n("Outros dinamômetros", "forcaPernas", "Força de membros inferiores", "kgf", 5, 600),
    n("Outros dinamômetros", "pinca", "Pinça (polpa-lateral)", "kgf", 0.5, 40),
  ],
  derivados: [
    { key: "melhorPreD", label: "Melhor preensão direita", unit: "kgf", casas: 1, grupo: "Resultado",
      calcula: (v) => maiorDe(v.preD1, v.preD2, v.preD3) },
    { key: "melhorPreE", label: "Melhor preensão esquerda", unit: "kgf", casas: 1, grupo: "Resultado",
      calcula: (v) => maiorDe(v.preE1, v.preE2, v.preE3) },
    { key: "assimetria", label: "Diferença entre os lados", unit: "%", casas: 1, grupo: "Resultado",
      calcula: (v) => {
        const d = maiorDe(v.preD1, v.preD2, v.preD3), e = maiorDe(v.preE1, v.preE2, v.preE3);
        if (d === null || e === null) return null;
        const maior = Math.max(d, e);
        return maior === 0 ? null : (Math.abs(d - e) / maior) * 100;
      } },
  ],
};

const calorimetria: DefinicaoAvaliacao = {
  tipo: "calorimetria",
  titulo: "Calorimetria",
  curto: "Gasto de energia",
  descricao: "Calorimetria indireta: gás que o corpo consome e produz, para medir o gasto de energia.",
  paraQueServe: "Mede o gasto energético real em repouso e se o corpo está queimando mais gordura ou mais açúcar.",
  campos: [
    { kind: "select", grupo: "Condições do teste", key: "condicao", label: "Condição do teste",
      opcoes: [{ value: "repouso", label: "Repouso" }, { value: "esforco", label: "Esforço" }] },
    n("Condições do teste", "jejumHoras", "Jejum", "h", 0, 48, 0),
    n("Condições do teste", "duracaoMin", "Duração do teste", "min", 3, 90, 0),
    n("Gases", "vo2", "Consumo de oxigênio (VO₂)", "mL/min", 50, 6000, 0),
    n("Gases", "vco2", "Produção de gás carbônico (VCO₂)", "mL/min", 40, 6000, 0),
    n("Energia", "gerMedido", "Gasto energético de repouso medido", "kcal/dia", 400, 5000, 0),
    n("Energia", "gerPrevisto", "Gasto previsto (equação usada)", "kcal/dia", 400, 5000, 0),
    n("Esforço", "vo2Max", "VO₂ máximo", "mL/kg/min", 5, 95),
    n("Esforço", "fcMedia", "Frequência cardíaca média", "bpm", 30, 230, 0),
  ],
  derivados: [
    { key: "qr", label: "Quociente respiratório (VCO₂/VO₂)", unit: "", casas: 2, grupo: "Gases",
      calcula: (v) => ratio(v.vco2, v.vo2) },
    { key: "pctPrevisto", label: "Medido em relação ao previsto", unit: "%", casas: 0, grupo: "Energia",
      calcula: (v) => { const r = ratio(v.gerMedido, v.gerPrevisto); return r === null ? null : r * 100; } },
  ],
};

export function interpretaQuociente(qr: number | null): string | null {
  if (qr === null || !Number.isFinite(qr)) return null;
  if (qr < 0.7) return "Abaixo de 0,70: fora da faixa fisiológica; confira jejum, calibração e vazamento da máscara.";
  if (qr <= 0.8) return "Predomínio de gordura como combustível.";
  if (qr <= 0.9) return "Combustível misto (gordura e carboidrato).";
  if (qr <= 1.0) return "Predomínio de carboidrato como combustível.";
  return "Acima de 1,00: típico de esforço intenso ou respiração acelerada; confira as condições do teste.";
}

const ultrassom: DefinicaoAvaliacao = {
  tipo: "ultrassom",
  titulo: "Ultrassom",
  curto: "Músculo e gordura por imagem",
  descricao: "Ultrassom de composição corporal: espessura de músculo e de gordura medida por imagem.",
  paraQueServe: "Vê o músculo e a gordura por imagem, inclusive a gordura que fica dentro do abdômen.",
  campos: [
    n("Gordura", "gorduraSubAbdominal", "Gordura subcutânea abdominal", "mm", 1, 120),
    n("Gordura", "gorduraVisceral", "Gordura visceral (intra-abdominal)", "mm", 1, 150),
    n("Gordura", "gorduraPreperitoneal", "Gordura pré-peritoneal", "mm", 1, 60),
    n("Músculo", "espRetoFemoral", "Reto femoral — espessura", "mm", 3, 60),
    n("Músculo", "espVastoIntermedio", "Vasto intermédio — espessura", "mm", 3, 60),
    n("Músculo", "espQuadriceps", "Quadríceps total — espessura", "mm", 5, 100),
    n("Músculo", "areaRetoFemoral", "Reto femoral — área de secção", "cm²", 1, 40),
    n("Músculo", "espBiceps", "Bíceps braquial — espessura", "mm", 5, 80),
    n("Músculo", "espRetoAbdominal", "Reto abdominal — espessura", "mm", 2, 40),
    { kind: "select", grupo: "Qualidade do músculo e fígado", key: "ecogenicidade", label: "Ecogenicidade do músculo (Heckmatt)",
      opcoes: [{ value: "1", label: "1 — normal" }, { value: "2", label: "2 — leve aumento" }, { value: "3", label: "3 — aumento moderado" }, { value: "4", label: "4 — aumento intenso" }] },
    { kind: "select", grupo: "Qualidade do músculo e fígado", key: "esteatose", label: "Gordura no fígado (esteatose)",
      opcoes: [{ value: "ausente", label: "Ausente" }, { value: "leve", label: "Leve" }, { value: "moderada", label: "Moderada" }, { value: "grave", label: "Grave" }] },
  ],
  derivados: [
    { key: "razaoVisceralSub", label: "Visceral / subcutânea", unit: "", casas: 2, grupo: "Gordura",
      calcula: (v) => ratio(v.gorduraVisceral, v.gorduraSubAbdominal) },
  ],
};

const outras: DefinicaoAvaliacao = {
  tipo: "outras",
  titulo: "Outras avaliações",
  curto: "Testes funcionais",
  descricao: "Testes de função física e sinais vitais que não pertencem aos grupos anteriores.",
  paraQueServe: "Registra testes de desempenho (caminhada, levantar, equilíbrio) e sinais vitais do dia.",
  campos: [
    n("Sinais vitais", "paSistolica", "Pressão sistólica", "mmHg", 60, 260, 0),
    n("Sinais vitais", "paDiastolica", "Pressão diastólica", "mmHg", 30, 160, 0),
    n("Sinais vitais", "fcRepouso", "Frequência cardíaca em repouso", "bpm", 25, 220, 0),
    n("Sinais vitais", "saturacao", "Saturação de oxigênio", "%", 50, 100, 0),
    n("Testes funcionais", "sentarLevantar30", "Sentar e levantar em 30 s", "repetições", 0, 60, 0),
    n("Testes funcionais", "caminhada6min", "Caminhada de 6 minutos", "m", 20, 1000, 0),
    n("Testes funcionais", "tug", "Levantar e andar 3 m (TUG)", "s", 2, 90),
    n("Testes funcionais", "velocidadeMarcha", "Velocidade de marcha", "m/s", 0.1, 3, 2),
    n("Testes funcionais", "sentarAlcancar", "Sentar e alcançar (flexibilidade)", "cm", -40, 60),
    n("Testes funcionais", "equilibrioUnipodal", "Equilíbrio em um pé", "s", 0, 120, 0),
  ],
  derivados: [],
};

export const AVALIACOES: Record<TipoAvaliacao, DefinicaoAvaliacao> = {
  bioimpedancia, antropometria, dinamometria, calorimetria, ultrassom, outras,
};

export function ehTipoAvaliacao(x: unknown): x is TipoAvaliacao {
  return typeof x === "string" && (TIPOS_AVALIACAO as readonly string[]).includes(x);
}

export type ValoresAvaliacao = Record<string, number | string>;

/** Valores numericos da medicao + derivados calculados (nunca gravados). */
export function calculaDerivados(tipo: TipoAvaliacao, valores: ValoresAvaliacao): Record<string, number> {
  const nums: Record<string, number> = {};
  for (const [k, v] of Object.entries(valores)) if (typeof v === "number" && Number.isFinite(v)) nums[k] = v;
  const out: Record<string, number> = {};
  for (const d of AVALIACOES[tipo].derivados) {
    const r = d.calcula(nums);
    if (r !== null && Number.isFinite(r)) out[d.key] = r;
  }
  return out;
}

export type ResultadoValidacao =
  | { ok: true; valores: ValoresAvaliacao }
  | { ok: false; erro: string };

/** Valida o que veio do navegador: so chaves do catalogo, numeros dentro dos limites plausiveis. */
export function validaValores(tipo: TipoAvaliacao, bruto: unknown): ResultadoValidacao {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, erro: "Valores inválidos." };
  const def = AVALIACOES[tipo];
  const porChave = new Map(def.campos.map((c) => [c.key, c]));
  const valores: ValoresAvaliacao = {};
  for (const [k, v] of Object.entries(bruto as Record<string, unknown>)) {
    const campo = porChave.get(k);
    if (!campo) return { ok: false, erro: `Campo desconhecido: ${k}.` };
    if (v === null || v === "" || v === undefined) continue;
    if (campo.kind === "number") {
      if (typeof v !== "number" || !Number.isFinite(v)) return { ok: false, erro: `${campo.label}: informe um número.` };
      if (v < campo.min || v > campo.max) {
        return { ok: false, erro: `${campo.label}: o valor deve ficar entre ${campo.min} e ${campo.max} ${campo.unit}.` };
      }
      valores[k] = v;
    } else {
      if (typeof v !== "string" || !campo.opcoes.some((o) => o.value === v)) {
        return { ok: false, erro: `${campo.label}: opção inválida.` };
      }
      valores[k] = v;
    }
  }
  if (!Object.keys(valores).length) return { ok: false, erro: "Preencha ao menos um campo." };
  return { ok: true, valores };
}
