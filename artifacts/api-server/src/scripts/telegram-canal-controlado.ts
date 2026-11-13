/**
 * Prova controlada do outbox/worker de desenvolvimento.
 * Não configura webhook, não muda vínculos, não inicia jobs nem apaga evidências.
 * Sem --enfileirar/--responder executa somente leitura. Telefones são parâmetros de autorização
 * fornecidos pelo operador; nunca aparecem na saída.
 */
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getWebhookInfo, isTelegramConfigured } from "../lib/telegram";
import { resolverChatAlerta } from "../lib/telegram-config";
import { vinculoTelegramAtualUnico } from "../lib/telegram-vinculo-atual";
import { gravarMensagemEntrada } from "../lib/telegram-inbox-store";
import { registrarRepasse } from "../lib/telegram-repasse-outbox";

const arg = (key: string) => process.argv.find(v => v.startsWith(`--${key}=`))?.split("=").slice(1).join("=") ?? "";
function assert(ok: unknown, motivo: string): asserts ok {
  if (!ok) throw new Error(motivo);
}
const codigos = new Set([
  "somente_desenvolvimento", "parametros_invalidos", "contatos_nao_confirmados",
  "vinculo_nao_confirmado", "destino_nao_confirmado", "webhook_nao_confirmado",
  "token_ausente", "fila_ocupada", "credencial_operador_ausente",
  "autenticacao_recusada", "leitura_autenticada_recusada", "tempo_de_observacao_esgotado",
  "resposta_preexistente", "resposta_nao_comprovada",
]);

async function main() {
  assert(process.env.REPLIT_DEPLOYMENT !== "1"
    && process.env.REPLIT_DEV_DOMAIN?.endsWith(".replit.dev"), "somente_desenvolvimento");
  const origemId = Number(arg("origem-id"));
  const destinoId = Number(arg("destino-id"));
  const telefones = [arg("origem-telefone"), arg("destino-telefone")].map(v => v.replace(/\D/g, ""));
  assert([origemId, destinoId].every(v => Number.isSafeInteger(v) && v > 0)
    && origemId !== destinoId && telefones.every(v => v.length === 11), "parametros_invalidos");
  const rows = await pool.query<{
    id: number; empresa_id: number; telegram_chat_id: string | null; phone: string | null;
  }>("SELECT id, empresa_id, telegram_chat_id, phone FROM clients WHERE id=ANY($1::int[])", [[origemId, destinoId]]);
  const origem = rows.rows.find(r => r.id === origemId);
  const destino = rows.rows.find(r => r.id === destinoId);
  assert(origem && destino && origem.empresa_id === destino.empresa_id
    && String(origem.phone ?? "").replace(/\D/g, "").slice(-11) === telefones[0]
    && String(destino.phone ?? "").replace(/\D/g, "").slice(-11) === telefones[1], "contatos_nao_confirmados");
  assert(origem.telegram_chat_id && destino.telegram_chat_id, "vinculo_nao_confirmado");
  for (const c of [origem, destino]) {
    assert(await vinculoTelegramAtualUnico(db, {
      clienteId: c.id, empresaId: c.empresa_id, chatId: c.telegram_chat_id!,
    }), "vinculo_nao_confirmado");
  }
  const cfg = await resolverChatAlerta();
  assert(cfg.chatId === destino.telegram_chat_id, "destino_nao_confirmado");
  assert(await isTelegramConfigured(), "token_ausente");
  const webhook = await getWebhookInfo();
  assert(!webhook.mock && !webhook.fetchError && webhook.url
    && new URL(webhook.url).hostname === process.env.REPLIT_DEV_DOMAIN, "webhook_nao_confirmado");
  const ocupados = await pool.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM telegram_repasse_ceo WHERE estado IN ('pendente','falhou','enviando')",
  );
  assert(ocupados.rows[0].n === 0, "fila_ocupada");
  console.log(JSON.stringify({ auditoria: "aprovada", contatosConfirmados: 2, filaAtivaVazia: true, webhook: "desenvolvimento_sem_alteracao" }));
  if (!process.argv.includes("--enfileirar") && !process.argv.includes("--responder")) return;

  const identifier = process.argv.includes("--identificador-alternativo")
    ? process.env.PAXTER_OPERATOR_LOGIN_RETRY : process.env.PAXTER_OPERATOR_LOGIN;
  assert(identifier && process.env.PAXTER_OPERATOR_PASSWORD, "credencial_operador_ausente");
  const base = `https://${process.env.REPLIT_DEV_DOMAIN}/api`;
  // Login real, uma única tentativa; nunca fabrica token nem altera permissões.
  const login = await fetch(`${base}/collaborator/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: process.env.PAXTER_OPERATOR_PASSWORD }),
    signal: AbortSignal.timeout(15_000),
  });
  console.log(JSON.stringify({ autenticacaoHttp: login.status }));
  assert(login.ok, "autenticacao_recusada");
  const sessao = await login.json() as { token?: string };
  assert(typeof sessao.token === "string", "autenticacao_recusada");
  const leitura = await fetch(`${base}/cockpit/${origemId}/telegram-inbox?direcao=saida`, {
    headers: { Authorization: `Bearer ${sessao.token}`, "X-Empresa-Id": String(origem.empresa_id) },
    signal: AbortSignal.timeout(15_000),
  });
  await leitura.body?.cancel();
  assert(leitura.ok, "leitura_autenticada_recusada");
  console.log(JSON.stringify({ autenticacaoReal: true, leituraDaPropriaClinica: true }));

  if (process.argv.includes("--responder")) {
    const texto = "Teste técnico autorizado de resposta da equipe pelo Cockpit. Mensagem não clínica. Não exige resposta.";
    const antes = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM telegram_inbox_messages WHERE empresa_id=$1 AND cliente_id=$2 AND direcao='saida' AND texto=$3",
      [origem.empresa_id, origem.id, texto],
    );
    assert(antes.rows[0].n === 0, "resposta_preexistente");
    const resposta = await fetch(`${base}/cockpit/${origemId}/telegram-inbox/enviar`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sessao.token}`, "X-Empresa-Id": String(origem.empresa_id), "Content-Type": "application/json" },
      body: JSON.stringify({ texto }), signal: AbortSignal.timeout(20_000),
    });
    console.log(JSON.stringify({ respostaHttp: resposta.status }));
    assert(resposta.ok, "resposta_nao_comprovada");
    const r = await resposta.json() as { sent?: boolean; mock?: boolean };
    const depois = await pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM telegram_inbox_messages WHERE empresa_id=$1 AND cliente_id=$2 AND direcao='saida' AND texto=$3 AND chat_id=$4",
      [origem.empresa_id, origem.id, texto, origem.telegram_chat_id],
    );
    console.log(JSON.stringify({
      respostaDaEquipe: true, aceitePelaApi: r.sent === true && r.mock === false,
      respostaPersistidaUmaVez: depois.rows[0].n === 1, recebimentoVisual: "nao_observado",
    }));
    return;
  }

  // Escrita expressamente autorizada, apenas mensagem técnica; não simula update
  // de webhook nem altera autorização de envio recorrente.
  const repasseId = await db.transaction(async tx => {
    assert(await vinculoTelegramAtualUnico(tx, {
      clienteId: origem.id, empresaId: origem.empresa_id, chatId: origem.telegram_chat_id!,
    }), "vinculo_nao_confirmado");
    const m = await gravarMensagemEntrada(tx, {
      empresaId: origem.empresa_id, clienteId: origem.id, chatId: origem.telegram_chat_id!,
      texto: "Teste técnico autorizado do encaminhamento Telegram. Mensagem não clínica. Não exige resposta.",
    });
    const id = await registrarRepasse(tx, m.id, destino.telegram_chat_id!);
    await tx.execute(sql`UPDATE telegram_repasse_ceo SET proxima_tentativa_em=NOW()+interval '5 seconds' WHERE id=${id}`);
    return id;
  });
  let anterior = "";
  const inicio = Date.now();
  while (Date.now() - inicio < 90_000) {
    const r = await pool.query<{ estado: string; tentativas: number; ultimo_erro: string | null }>(
      "SELECT estado,tentativas,ultimo_erro FROM telegram_repasse_ceo WHERE id=$1", [repasseId],
    );
    const linha = r.rows[0];
    if (linha.estado !== anterior) {
      console.log(JSON.stringify({ estado: linha.estado, tentativas: linha.tentativas, erroTecnico: linha.ultimo_erro }));
      anterior = linha.estado;
    }
    if (["aceito_telegram", "falhou", "incerto", "esgotado"].includes(linha.estado)) {
      console.log(JSON.stringify({ aceitePelaApi: linha.estado === "aceito_telegram", recebimentoVisual: "nao_observado" }));
      return;
    }
    await new Promise(resolve => setTimeout(resolve, linha.estado === "enviando" ? 50 : 200));
  }
  throw new Error("tempo_de_observacao_esgotado");
}

main().catch(err => {
  const code = err instanceof Error && codigos.has(err.message) ? err.message : "falha_tecnica_sem_detalhes";
  console.log(JSON.stringify({ bloqueado: code, repeticaoAutomaticaDoRoteiro: false }));
  process.exitCode = 1;
}).finally(() => pool.end());
