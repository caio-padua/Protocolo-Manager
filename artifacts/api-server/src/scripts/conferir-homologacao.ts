/**
 * Conferência SOMENTE DE LEITURA da configuração da homologação (Fase 1B). Nenhuma mensagem é enviada.
 * Consultas permitidas: SELECT no banco, GET connectionState/webhook na Evolution, getMe/getWebhookInfo no Telegram.
 * Tudo é mascarado: telefone = últimos 4 dígitos; segredos = apenas "existe/não existe".
 * Uso: pnpm --filter @workspace/api-server exec tsx src/scripts/conferir-homologacao.ts
 */
import { pool } from "@workspace/db";
import { getSecretStatus, getSetting } from "../lib/secure-settings";
import { lerConfig, consultarConexao, chamar, contatosAutorizados, homologacaoAtiva, chaveWebhook, chaveApi } from "../lib/evolution";
import { getWebhookInfo, getTelegramBotInfo } from "../lib/telegram";
import { decidirControle, lerControles } from "../lib/atendimento-controle";

const ult4 = (v: string | null | undefined) => (v ? `***${String(v).replace(/\D/g, "").slice(-4)}` : "ausente");
const linhas: Array<[string, string, string]> = [];
const campo = (area: string, item: string, valor: unknown) => linhas.push([area, item, String(valor)]);
const bloqueios: string[] = [];

async function main() {
  const emp = (await pool.query(`SELECT id,nome FROM empresas WHERE id=5`)).rows[0];
  campo("Clínica", "empresa 5", emp ? `encontrada (${emp.nome})` : "NÃO ENCONTRADA");
  if (!emp) bloqueios.push("empresa 5");

  // Evolution
  const cfg = await lerConfig(5);
  campo("Evolution", "instância", cfg ? cfg.instanceName : "NÃO CONFIGURADA");
  if (!cfg || cfg.instanceName !== "paxmed-teste") bloqueios.push("evolution.instance_name (esperado paxmed-teste)");
  campo("Evolution", "chave da API", (await getSecretStatus(chaveApi(5))).isSet ? "existe" : "AUSENTE");
  campo("Evolution", "segredo do webhook (autenticação por token no caminho)", (await getSecretStatus(chaveWebhook(5))).isSet ? "existe" : "AUSENTE");
  if (!(await getSecretStatus(chaveWebhook(5))).isSet) bloqueios.push("evolution.webhookToken.5");
  const con = await consultarConexao(5);
  campo("Evolution", "estado da conexão", `${con.estado}${con.detalhe ? ` (${con.detalhe})` : ""}`);
  if (con.estado !== ("conectado" as string)) bloqueios.push(`evolution.conexao=${con.estado}`);
  if (cfg) {
    const w = await chamar(cfg, "GET", `/webhook/find/${encodeURIComponent(cfg.instanceName)}`);
    const url = String((w.json as any)?.url ?? (w.json as any)?.webhook?.url ?? "");
    campo("Evolution", "webhook registrado", url ? url.replace(/\/webhook\/(\d+)\/[^/?#]+/, "/webhook/$1/***") : `não lido (HTTP ${w.status})`);
    campo("Evolution", "webhook aponta para empresa 5", /\/evolution\/webhook\/5\//.test(url) ? "sim" : "NÃO CONFIRMADO");
    if (!/\/evolution\/webhook\/5\//.test(url)) bloqueios.push("evolution.webhook (não confirmado para a empresa 5)");
  }
  // Homologação
  const lista = contatosAutorizados();
  campo("Homologação", "trava de homologação ativa", homologacaoAtiva() ? "sim" : "NÃO (qualquer contato passaria)");
  if (!homologacaoAtiva()) bloqueios.push("homologacao desligada");
  campo("Homologação", "contatos autorizados", lista.map(ult4).join(", ") || "nenhum");
  for (const [nome, id] of [["Dayana", 12], ["Carlúcia", 11]] as const) {
    const c = (await pool.query(`SELECT id,name,phone,empresa_id,status,telegram_chat_id FROM clients WHERE id=$1`, [id])).rows[0];
    if (!c) { campo(nome, "cadastro", "NÃO ENCONTRADO"); bloqueios.push(`cliente ${id}`); continue; }
    const tel = String(c.phone ?? "").replace(/\D/g, "");
    const naLista = lista.some((x) => x.endsWith(tel.slice(-8)));
    const modo = (await pool.query(`SELECT modo FROM telegram_atendimento WHERE cliente_id=$1`, [id])).rows[0]?.modo ?? "ia (padrão)";
    const ctl = await decidirControle({ empresaId: 5, canal: "whatsapp", clienteId: id });
    campo(nome, "cadastro", `cliente ${id}, clínica ${c.empresa_id}, situação ${c.status}`);
    campo(nome, "telefone", ult4(c.phone));
    campo(nome, "na lista de homologação (WhatsApp)", naLista ? "sim" : "não");
    campo(nome, "modo do contato", modo);
    campo(nome, "decisão do controle agora", `${ctl.acao}${ctl.motivo ? ` (${ctl.motivo})` : ""}`);
    campo(nome, "Telegram vinculado", c.telegram_chat_id ? ult4(c.telegram_chat_id) : "não");
    if (Number(c.empresa_id) !== 5) bloqueios.push(`cliente ${id} em outra clínica`);
    if (nome === "Dayana" && !naLista) bloqueios.push("Dayana fora da lista de homologação");
    if (nome === "Carlúcia" && (modo !== "humano" || naLista && ctl.acao === "automatico")) bloqueios.push("Carlúcia precisa continuar em modo humano");
  }
  const ctrls = await lerControles(5);
  campo("Interruptores", "estado gravado", JSON.stringify(ctrls.estado));
  // Telegram
  const bot = await getTelegramBotInfo();
  campo("Telegram", "bot", bot.mock ? "NÃO CONSULTADO (sem token válido)" : `@${bot.username}`);
  campo("Telegram", "token do bot", (await getSecretStatus("telegram.botToken")).isSet ? "existe" : "AUSENTE");
  campo("Telegram", "segredo do webhook", (await getSecretStatus("telegram.webhookSecret")).isSet ? "existe" : "AUSENTE");
  campo("Telegram", "canal ativo", (await getSetting("telegram.active")) === "true" ? "sim" : "não");
  const wh = await getWebhookInfo();
  campo("Telegram", "webhook registrado", wh.url ? wh.url.replace(/\/\/[^/]+/, "//<domínio>") : "NENHUM");
  campo("Telegram", "pendências no Telegram", wh.pendingUpdateCount);
  const modoIA = (await getSetting("atendimento.ia.modo")) ?? "desligado";
  campo("Telegram", "atendimento automático", modoIA);
  const vinc = (await pool.query(`SELECT COUNT(*)::int n FROM clients WHERE empresa_id=5 AND telegram_chat_id IS NOT NULL`)).rows[0].n;
  campo("Telegram", "clientes da clínica 5 com Telegram vinculado", vinc);
  if (bot.mock) bloqueios.push("telegram.bot nao consultado");
  if (!wh.url) bloqueios.push("telegram.webhook nao registrado");

  const larg = [14, 52];
  console.log("\nCONFERÊNCIA DA HOMOLOGAÇÃO (somente leitura; nenhuma mensagem enviada)\n");
  for (const [a, i, v] of linhas) console.log(`${a.padEnd(larg[0])}| ${i.padEnd(larg[1])}| ${v}`);
  console.log(bloqueios.length ? `\nBLOQUEIOS (${bloqueios.length}):\n- ${bloqueios.join("\n- ")}` : "\nSem bloqueios encontrados.");
  await pool.end();
}
main().catch((e) => { console.error("falha:", (e as Error).message); process.exit(1); });
