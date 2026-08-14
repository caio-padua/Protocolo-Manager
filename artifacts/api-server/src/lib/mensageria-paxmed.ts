// MONTADOR DA MENSAGERIA PAXMED (server) — casa o catálogo editável com o motor
// automático de lembrete. Espelha o `mensagemFinal` da tela (IHE), injetando o
// BLOCO DE PRESCRIÇÃO REAL do cliente no lugar do placeholder.
//
// Falha-segura: se o catálogo estiver vazio (ainda não semeado) ou faltar bloco
// essencial, `montarMensagemPaxmed` retorna null e o motor cai no template simples.
import { db, mensagensCatalogoTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { LembretePeriodoJson } from "@workspace/db";
import { blocoPrescricaoPeriodos } from "./lembrete-templates";
import { semAcento } from "@workspace/posologia";

const TIMEZONE = "America/Sao_Paulo";
const CACHE_TTL_MS = 60_000;

interface BlocoCatalogo {
  id: number;
  categoria: string;
  chave: string;
  ordem: number;
  conteudo: Record<string, unknown>;
}

type Catalogo = Map<string, BlocoCatalogo[]>; // categoria -> blocos ativos (ordenados)

let cache: { at: number; data: Catalogo } | null = null;

// Invalida o cache do catálogo — chamado pelas escritas da rota (PUT/POST/DELETE)
// para a próxima montagem já refletir a edição do CEO.
export function invalidarCacheCatalogo(): void {
  cache = null;
}

async function carregarCatalogo(): Promise<Catalogo> {
  const agora = Date.now();
  if (cache && agora - cache.at < CACHE_TTL_MS) return cache.data;

  const rows = await db
    .select({
      id: mensagensCatalogoTable.id,
      categoria: mensagensCatalogoTable.categoria,
      chave: mensagensCatalogoTable.chave,
      ordem: mensagensCatalogoTable.ordem,
      conteudo: mensagensCatalogoTable.conteudo,
    })
    .from(mensagensCatalogoTable)
    .where(eq(mensagensCatalogoTable.ativo, true));

  const mapa: Catalogo = new Map();
  for (const r of rows) {
    const conteudo = (r.conteudo ?? {}) as Record<string, unknown>;
    const bloco: BlocoCatalogo = {
      id: r.id,
      categoria: r.categoria,
      chave: r.chave,
      ordem: r.ordem,
      conteudo,
    };
    const lista = mapa.get(r.categoria) ?? [];
    lista.push(bloco);
    mapa.set(r.categoria, lista);
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.ordem - b.ordem);

  cache = { at: agora, data: mapa };
  return mapa;
}

// ─────────────────────── helpers de data (BRT) ───────────────────────

interface PartesLocais {
  ano: number;
  mes: number;
  dia: number;
  diaSemana: number; // 0 = domingo .. 6 = sábado
}

function partesLocais(now: Date): PartesLocais {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const ano = parseInt(get("year"), 10);
  const mes = parseInt(get("month"), 10);
  const dia = parseInt(get("day"), 10);
  const mapaWd: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const diaSemana = mapaWd[get("weekday")] ?? 0;
  return { ano, mes, dia, diaSemana };
}

const DIA_CHAVE = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

// Mapa sigla do período canônico → chave do catálogo PERIODO.
const SIGLA_PERIODO: Record<string, string> = {
  JE: "jejum",
  IM: "inicioManha",
  MM: "meioManha",
  AL: "almoco",
  IT: "inicioTarde",
  MT: "meioTarde",
  NO: "inicioNoite",
  FN: "finalNoite",
  CE: "ceia",
};

function pegar(cat: BlocoCatalogo[] | undefined, chave: string): BlocoCatalogo | undefined {
  return cat?.find((b) => b.chave === chave);
}

// Escolha determinística por índice (variedade estável dentro do dia).
function escolherRotacionado(cat: BlocoCatalogo[] | undefined, semente: number): BlocoCatalogo | undefined {
  if (!cat || cat.length === 0) return undefined;
  const idx = ((semente % cat.length) + cat.length) % cat.length;
  return cat[idx];
}

function diaDoAno(p: PartesLocais): number {
  const inicio = Date.UTC(p.ano, 0, 0);
  const hoje = Date.UTC(p.ano, p.mes - 1, p.dia);
  return Math.floor((hoje - inicio) / 86_400_000);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export interface MontarPaxmedDados {
  nome: string; // primeiro nome já resolvido, ou nome completo
  agora: Date;
  periodos: LembretePeriodoJson[];
}

// Monta a mensagem RICA a partir do catálogo + prescrição real. Retorna null se
// o catálogo não tiver os blocos mínimos (motor então usa o template simples).
export async function montarMensagemPaxmed(dados: MontarPaxmedDados): Promise<string | null> {
  const catalogo = await carregarCatalogo();
  const periodosCat = catalogo.get("PERIODO");
  const diasCat = catalogo.get("DIA_SEMANA");
  const semanasCat = catalogo.get("SEMANA_MES");
  if (!periodosCat?.length || !diasCat?.length || !semanasCat?.length) return null;

  const p = partesLocais(dados.agora);
  const primeiroPeriodo = dados.periodos[0];

  // Resolve o bloco de PERIODO: por sigla → por label == nome → primeiro.
  let periodo: BlocoCatalogo | undefined;
  if (primeiroPeriodo) {
    const chavePorSigla = SIGLA_PERIODO[primeiroPeriodo.sigla];
    if (chavePorSigla) periodo = pegar(periodosCat, chavePorSigla);
    if (!periodo) periodo = periodosCat.find((b) => str(b.conteudo.label) === primeiroPeriodo.nome);
  }
  if (!periodo) periodo = periodosCat[0];

  const diaChave = DIA_CHAVE[p.diaSemana] ?? "segunda";
  const dia = pegar(diasCat, diaChave) ?? diasCat[0];

  const semanaNum = Math.min(4, Math.max(1, Math.ceil(p.dia / 7)));
  const semana = pegar(semanasCat, String(semanaNum)) ?? semanasCat[0];

  const isSabado = diaChave === "sabado";

  // Rotação determinística: status pelo dia da semana, fala pelo dia do ano.
  const status = escolherRotacionado(catalogo.get("DR_CAIO_STATUS"), p.diaSemana);
  const fala = escolherRotacionado(catalogo.get("DR_CAIO_FALA"), diaDoAno(p));
  const elogio = pegar(catalogo.get("ELOGIO_SEMANA"), String(semanaNum));
  const versiculo = escolherRotacionado(catalogo.get("VERSICULO_SABADO"), semanaNum - 1);
  const obs = catalogo.get("OBS_DOSE")?.[0];
  const ass = catalogo.get("ASSINATURA")?.[0];

  const saudacao = str(periodo.conteudo.saudacao) || "Olá";
  const diaLabel = str(dia.conteudo.label).toLowerCase();
  const semanaFrase = str(semana.conteudo.frase);

  let abertura = `${saudacao}!\n\n${dados.nome}, tudo bem?\n\n`;
  const statusTxt = str(status?.conteudo.texto);
  if (statusTxt) abertura += `${statusTxt}\n\n`;

  if (isSabado && versiculo && str(versiculo.conteudo.texto)) {
    abertura += `*Feliz Sábado!* Hoje estamos na *${semanaFrase}*.\n\n`;
    abertura += `${str(versiculo.conteudo.texto)}\n\n`;
    abertura += `${str(periodo.conteudo.abertura)}\n\n${str(dia.conteudo.frase)}\n\n${str(periodo.conteudo.desejo)}`;
  } else {
    abertura += `Hoje é *${diaLabel}* — estamos na *${semanaFrase}*.\n\n`;
    abertura += `${str(periodo.conteudo.abertura)}\n\n${str(dia.conteudo.frase)}\n\n${str(periodo.conteudo.desejo)}`;
  }

  const prescricao = blocoPrescricaoPeriodos(dados.periodos);
  const drCaio = str(fala?.conteudo.texto);
  const elogioTxt = elogio && str(elogio.conteudo.texto)
    ? `*${str(elogio.conteudo.texto)}*\n\nParabéns, ${dados.nome}. Continue firme.`
    : "";
  const obsTxt = str(obs?.conteudo.texto);
  const assBlock = ass
    ? `${str(ass.conteudo.saudacao_fechamento)}\n\n*${str(ass.conteudo.nome)}*\n_${str(ass.conteudo.papel)}_\n\n───────────\n${str(ass.conteudo.rodape_linha1)}\n_${str(ass.conteudo.rodape_subtitulo1)}_\n\n${str(ass.conteudo.rodape_linha2)}\n_${str(ass.conteudo.rodape_subtitulo2)}_\n───────────`
    : "";

  // Funil ÚNICO de normalização (regra do CEO, 09/07/2026): a mensagem inteira
  // sai SEM acento para não dar erro em nenhum canal. Emojis e *_ preservados.
  return semAcento(
    [abertura, prescricao, drCaio, elogioTxt, obsTxt, assBlock].filter(Boolean).join("\n\n"),
  );
}
