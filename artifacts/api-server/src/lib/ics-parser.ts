// Leitor minimo de arquivos iCalendar (.ics) exportados pelo Google Agenda.
// Regras: so le dentro de VEVENT (o bloco de fuso tambem tem DTSTART); nao expande recorrencias
// (guarda a regra); TZID desconhecido vira "ignorado" com motivo, nunca hora chutada.

export interface EventoIcs {
  uid: string;
  recurrenceId: string | null;
  titulo: string | null;
  descricao: string | null;
  localTexto: string | null;
  inicio: Date;
  fim: Date | null;
  diaInteiro: boolean;
  recorrencia: string | null;
  status: "ativo" | "cancelado";
}

export interface IgnoradoIcs {
  uid: string | null;
  motivo: string;
}

export interface ResultadoIcs {
  calendarioNome: string | null;
  calendarioDescricao: string | null;
  eventos: EventoIcs[];
  ignorados: IgnoradoIcs[];
}

const TZ_COM_OFFSET: Record<string, string> = { "America/Sao_Paulo": "-03:00", UTC: "Z", GMT: "Z" };

function desdobrar(texto: string): string[] {
  const linhas = texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const l of linhas) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out;
}

function desescapar(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function parseLinha(l: string): { nome: string; params: Record<string, string>; valor: string } | null {
  const i = l.indexOf(":");
  if (i < 0) return null;
  const [nome, ...ps] = l.slice(0, i).split(";");
  const params: Record<string, string> = {};
  for (const p of ps) {
    const [k, v] = p.split("=");
    if (k && v !== undefined) params[k.toUpperCase()] = v;
  }
  return { nome: nome.toUpperCase(), params, valor: l.slice(i + 1) };
}

// Devolve { data, diaInteiro } ou um motivo de erro.
function parseData(valor: string, params: Record<string, string>): { data: Date; diaInteiro: boolean } | { erro: string } {
  const v = valor.trim();
  const dia = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dia) {
    // Dia inteiro: ancora no inicio do dia em Brasilia.
    return { data: new Date(`${dia[1]}-${dia[2]}-${dia[3]}T00:00:00-03:00`), diaInteiro: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return { erro: `data em formato desconhecido (${v})` };
  const base = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (m[7] === "Z") return { data: new Date(`${base}Z`), diaInteiro: false };
  const tzid = params.TZID;
  const off = tzid ? TZ_COM_OFFSET[tzid] : undefined;
  if (!off) return { erro: tzid ? `fuso nao suportado (${tzid})` : "data sem fuso (flutuante)" };
  return { data: new Date(`${base}${off}`), diaInteiro: false };
}

export function lerIcs(texto: string): ResultadoIcs {
  const linhas = desdobrar(texto);
  const res: ResultadoIcs = { calendarioNome: null, calendarioDescricao: null, eventos: [], ignorados: [] };
  let atual: Array<NonNullable<ReturnType<typeof parseLinha>>> | null = null;
  let profundidade = 0; // VALARM etc. dentro de VEVENT

  for (const bruta of linhas) {
    const l = bruta.trimEnd();
    if (l === "BEGIN:VEVENT") { atual = []; profundidade = 0; continue; }
    if (l === "END:VEVENT" && atual) {
      const p = (n: string) => atual!.find((x) => x.nome === n);
      const uid = p("UID")?.valor.trim() ?? null;
      const ini = p("DTSTART");
      if (!uid || !ini) { res.ignorados.push({ uid, motivo: "evento sem UID ou sem inicio" }); atual = null; continue; }
      const di = parseData(ini.valor, ini.params);
      if ("erro" in di) { res.ignorados.push({ uid, motivo: di.erro }); atual = null; continue; }
      const fimL = p("DTEND");
      let fim: Date | null = null;
      if (fimL) {
        const df = parseData(fimL.valor, fimL.params);
        if ("erro" in df) { res.ignorados.push({ uid, motivo: df.erro }); atual = null; continue; }
        fim = df.data;
      }
      res.eventos.push({
        uid,
        recurrenceId: p("RECURRENCE-ID")?.valor.trim() ?? null,
        titulo: p("SUMMARY") ? desescapar(p("SUMMARY")!.valor) : null,
        descricao: p("DESCRIPTION") ? desescapar(p("DESCRIPTION")!.valor) : null,
        localTexto: p("LOCATION") ? desescapar(p("LOCATION")!.valor) : null,
        inicio: di.data,
        fim,
        diaInteiro: di.diaInteiro,
        recorrencia: p("RRULE")?.valor.trim() ?? null,
        status: p("STATUS")?.valor.trim().toUpperCase() === "CANCELLED" ? "cancelado" : "ativo",
      });
      atual = null;
      continue;
    }
    if (atual) {
      if (l.startsWith("BEGIN:")) { profundidade += 1; continue; }
      if (l.startsWith("END:")) { profundidade -= 1; continue; }
      if (profundidade > 0) continue;
      const pl = parseLinha(l);
      if (pl) atual.push(pl);
      continue;
    }
    const pl = parseLinha(l);
    if (!pl) continue;
    if (pl.nome === "X-WR-CALNAME") res.calendarioNome = desescapar(pl.valor).trim();
    if (pl.nome === "X-WR-CALDESC") res.calendarioDescricao = desescapar(pl.valor).trim();
  }
  return res;
}

export function chaveEvento(e: Pick<EventoIcs, "uid" | "recurrenceId">): string {
  return `${e.uid}|${e.recurrenceId ?? ""}`;
}
