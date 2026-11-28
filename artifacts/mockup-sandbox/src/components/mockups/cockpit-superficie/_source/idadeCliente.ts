type DataCivil = { ano: number; mes: number; dia: number };

function dataUtc({ ano, mes, dia }: DataCivil): Date {
  const data = new Date(0);
  data.setUTCHours(0, 0, 0, 0);
  data.setUTCFullYear(ano, mes - 1, dia);
  return data;
}

function dataValida(texto: string | null | undefined): DataCivil | null {
  const partes = texto?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!partes) return null;
  const data = { ano: Number(partes[1]), mes: Number(partes[2]), dia: Number(partes[3]) };
  const teste = dataUtc(data);
  return data.ano > 0 && teste.getUTCFullYear() === data.ano &&
    teste.getUTCMonth() + 1 === data.mes && teste.getUTCDate() === data.dia
    ? data : null;
}

function somarMeses(data: DataCivil, quantidade: number): DataCivil {
  const total = data.ano * 12 + data.mes - 1 + quantidade;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimoDia = dataUtc({ ano, mes: mes + 1, dia: 0 }).getUTCDate();
  return { ano, mes, dia: Math.min(data.dia, ultimoDia) };
}

function dataDaClinica(agora: Date): DataCivil | null {
  if (Number.isNaN(agora.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(agora);
  const obter = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((parte) => parte.type === tipo)?.value);
  const data = { ano: obter("year"), mes: obter("month"), dia: obter("day") };
  return Number.isFinite(data.ano) && Number.isFinite(data.mes) && Number.isFinite(data.dia)
    ? data : null;
}

export function formatarNascimento(texto: string | null | undefined): string | null {
  const data = dataValida(texto);
  return data ? `${String(data.dia).padStart(2, "0")}/${String(data.mes).padStart(2, "0")}/${data.ano}` : null;
}

/** Idade civil em São Paulo; nunca usada para decisão clínica ou alteração cadastral. */
export function idadeCompleta(texto: string | null | undefined, agora = new Date()): string | null {
  const nascimento = dataValida(texto);
  const hoje = dataDaClinica(agora);
  if (!nascimento || !hoje || dataUtc(nascimento) > dataUtc(hoje)) return null;

  let anos = hoje.ano - nascimento.ano;
  let aniversario = somarMeses(nascimento, anos * 12);
  if (dataUtc(aniversario) > dataUtc(hoje)) {
    anos -= 1;
    aniversario = somarMeses(nascimento, anos * 12);
  }
  let meses = (hoje.ano - aniversario.ano) * 12 + hoje.mes - aniversario.mes;
  if (dataUtc(somarMeses(aniversario, meses)) > dataUtc(hoje)) meses -= 1;
  const ultimaData = somarMeses(aniversario, meses);
  const dias = Math.round((dataUtc(hoje).getTime() - dataUtc(ultimaData).getTime()) / 86_400_000);
  const unidade = (valor: number, singular: string, plural: string) =>
    `${valor} ${valor === 1 ? singular : plural}`;
  return `${unidade(anos, "ano", "anos")} ${unidade(meses, "mês", "meses")} ${unidade(dias, "dia", "dias")}`;
}
