/**
 * Adiciona item(ns) na PLANILHA PRODUCAO e avisa o #padaxor-projeto no Slack.
 *
 * Obedece docs/PROTOCOLO-PLANILHA.md:
 *   A=Nº  B=Data  C=Hora  D=Descricao  E=Responsavel  F=Estado
 *   G=Prioridade  H=Depende de  I=Para que serve  J=Modulo
 * As colunas I e J sao OBRIGATORIAS — o script recusa o item sem elas.
 *
 * O numero (coluna A) nunca e inventado: e lido da planilha (maior + 1),
 * porque a numeracao da planilha e a unica valida.
 *
 * Uso:
 *   node scripts/planilha-adicionar-item.mjs itens.json
 *
 * Formato do arquivo JSON — lista de objetos:
 *   [{ "descricao": "...", "responsavel": "Dr. Replit", "estado": "A FAZER",
 *      "prioridade": "P2", "dependeDe": "", "paraQueServe": "...", "modulo": "Comunicação" }]
 *
 * Sem --slack o script so escreve na planilha.
 */
import { readFileSync } from "node:fs";

const arquivo = process.argv[2];
const avisarSlack = !process.argv.includes("--sem-slack");
if (!arquivo) {
  console.error("Uso: node scripts/planilha-adicionar-item.mjs <itens.json> [--sem-slack]");
  process.exit(1);
}

const PLANILHA_ID = process.env.PADAXOR_PLANILHA_ID ?? "1SW6K2JNUEP4i1I16v_ZYhtwxTpUkT_dx3ERHkj9HQcw";
const ABA = "PLANILHA PRODUCAO";
const CANAL_SLACK = process.env.PADAXOR_SLACK_CHANNEL_ID ?? "C0BLW5S7GQL";

// --- credencial dos conectores Replit (mesmo caminho que lib/google-drive.ts usa) ---
async function tokenDoConector(nome) {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;
  if (!xReplitToken) throw new Error("X-Replit-Token ausente — rode dentro do Repl.");

  const resp = await fetch(`https://${hostname}/api/v2/connection?include_secrets=true`, {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const dados = await resp.json();
  const conexao = dados.items?.find((i) => i.connector_name === nome);
  const token =
    conexao?.settings?.access_token || conexao?.settings?.oauth?.credentials?.access_token;
  if (!token) throw new Error(`Conector "${nome}" nao conectado.`);
  return token;
}

function agoraBRT() {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { data: `${p.day}/${p.month}/${p.year}`, hora: `${p.hour}:${p.minute}` };
}

const itens = JSON.parse(readFileSync(arquivo, "utf8"));
for (const [i, it] of itens.entries()) {
  if (!it.descricao || !it.paraQueServe || !it.modulo) {
    console.error(
      `Item ${i + 1} recusado: descricao, paraQueServe (col I) e modulo (col J) sao obrigatorios.`,
    );
    process.exit(1);
  }
}

const tokenSheets = await tokenDoConector("google-drive");
const cabecalhoSheets = { Authorization: `Bearer ${tokenSheets}`, "Content-Type": "application/json" };
const faixa = encodeURIComponent(`${ABA}!A1:K300`);

// 1. Le a planilha para descobrir o proximo numero (nunca inventar sequencia).
const respLeitura = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA_ID}/values/${faixa}`,
  { headers: cabecalhoSheets },
);
if (!respLeitura.ok) {
  console.error("Falha ao ler a planilha:", respLeitura.status, await respLeitura.text());
  process.exit(1);
}
const linhas = (await respLeitura.json()).values ?? [];
const numeros = linhas
  .slice(1)
  .map((l) => parseInt(l[0], 10))
  .filter((n) => Number.isFinite(n));
let proximo = (numeros.length ? Math.max(...numeros) : 0) + 1;

// Primeira linha realmente livre = depois da ultima linha com QUALQUER celula preenchida.
// Nao usar o :append do Google: uma celula solta fora da coluna A (ja existe uma em F88)
// engana o detector de tabela dele e as colunas saem deslocadas.
let ultimaOcupada = 0;
linhas.forEach((l, i) => {
  if (l.some((c) => String(c ?? "").trim())) ultimaOcupada = i + 1;
});
const primeiraLivre = ultimaOcupada + 1;

const { data, hora } = agoraBRT();
const novas = itens.map((it) => [
  String(proximo++),
  data,
  hora,
  it.descricao,
  it.responsavel ?? "Dr. Replit",
  it.estado ?? "A FAZER",
  it.prioridade ?? "P2",
  it.dependeDe || "—",
  it.paraQueServe,
  it.modulo,
]);

// 2. Escreve em faixa explicita, depois da ultima linha ocupada (nunca sobrescreve).
const destino = `${ABA}!A${primeiraLivre}:J${primeiraLivre + novas.length - 1}`;
const respEscrita = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA_ID}/values/${encodeURIComponent(
    destino,
  )}?valueInputOption=USER_ENTERED`,
  { method: "PUT", headers: cabecalhoSheets, body: JSON.stringify({ values: novas }) },
);
if (!respEscrita.ok) {
  console.error("Falha ao escrever na planilha:", respEscrita.status, await respEscrita.text());
  process.exit(1);
}
const escrita = await respEscrita.json();
console.log("Planilha atualizada:", escrita.updates?.updatedRange, "|", novas.length, "linha(s)");
for (const l of novas) console.log(`  #${l[0]} · ${l[5]} · ${l[6]} · ${l[9]} — ${l[3].slice(0, 70)}…`);

// 3. Confere lendo de volta (a planilha e a prova, nao a resposta da chamada).
const respConfere = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${PLANILHA_ID}/values/${faixa}`,
  { headers: cabecalhoSheets },
);
const linhasDepois = (await respConfere.json()).values ?? [];
const gravados = novas.map((n) => n[0]);
const achados = linhasDepois.filter((l) => gravados.includes(String(l[0]))).map((l) => l[0]);
console.log(`Conferencia na planilha: ${achados.length}/${gravados.length} item(ns) encontrados (${achados.join(", ")})`);

// 4. Avisa o Slack.
if (avisarSlack) {
  const tokenSlack = await tokenDoConector("slack");
  const texto = [
    `*Novos itens na PLANILHA PRODUCAO* — ${data} ${hora}`,
    "",
    ...novas.map((l) => `• *#${l[0]}* [${l[6]} · ${l[9]}] ${l[3]}\n   _Para que serve:_ ${l[8]}`),
  ].join("\n");
  const respSlack = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenSlack}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel: CANAL_SLACK, text: texto }),
  });
  const js = await respSlack.json();
  console.log(js.ok ? `Slack avisado no canal ${CANAL_SLACK} (ts ${js.ts})` : `Slack FALHOU: ${js.error}`);
}
