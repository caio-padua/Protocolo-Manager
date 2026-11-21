import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, pulsoDiarioTable, clientsTable } from "@workspace/db";
import { getSecret } from "../lib/secure-settings";
import { validarInitData } from "../lib/telegram-webapp-auth";
import { parseBrtParts } from "../lib/brt";
import { logger } from "../lib/logger";

// ============================================================================
// PULSO DIÁRIO pelo Telegram — mini aplicativo (web_app). PÚBLICO (antes do portão):
// a credencial é a assinatura do Telegram (initData). Quem abre só consegue ler e gravar
// o pulso do PRÓPRIO chat vinculado; nunca recebe id de cliente na URL nem no corpo.
//   POST /pulso-telegram/sessao     { initData }          → nome, dia, período, valores já registrados
//   POST /pulso-telegram/registrar  { initData, valores } → grava (upsert cliente+dia+período)
// ============================================================================

const router: IRouter = Router();

async function tokenDoBot(): Promise<string | null> {
  const env = process.env["TELEGRAM_BOT_TOKEN"];
  if (env) return env;
  try { return await getSecret("telegram.botToken"); } catch { return null; }
}

function periodoAgora(): { data: string; periodo: "manha" | "tarde" | "noite" } {
  const p = parseBrtParts();
  const h = Number(p.hour);
  return { data: `${p.year}-${p.month}-${p.day}`, periodo: h < 12 ? "manha" : h < 18 ? "tarde" : "noite" };
}

type Quem = { id: number; nome: string } | { erro: number; mensagem: string };

async function identificar(initData: unknown): Promise<Quem> {
  const token = await tokenDoBot();
  if (!token) return { erro: 503, mensagem: "Canal do Telegram indisponível." };
  const v = validarInitData(initData, token);
  if (!v) return { erro: 401, mensagem: "Abra este formulário pelo botão enviado no Telegram." };
  const achados = await db.select({ id: clientsTable.id, nome: clientsTable.name })
    .from(clientsTable).where(eq(clientsTable.telegramChatId, v.userId)).limit(2);
  // Vínculo único: chat sem cliente ou ligado a mais de um cadastro nunca grava.
  if (achados.length !== 1) return { erro: 403, mensagem: "Este Telegram não está vinculado a um único cadastro." };
  return { id: achados[0].id, nome: achados[0].nome };
}

const inteiro = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();
const valoresSchema = z.object({
  energia: inteiro(0, 10),
  disposicao: inteiro(0, 10),
  sono: inteiro(0, 10),
  pressaoSistolica: inteiro(50, 260),
  pressaoDiastolica: inteiro(30, 160),
  frequenciaCardiaca: inteiro(30, 220),
  glicemia: inteiro(20, 600),
});

router.post("/pulso-telegram/sessao", async (req, res): Promise<void> => {
  const quem = await identificar(req.body?.initData);
  if ("erro" in quem) { res.status(quem.erro).json({ error: quem.mensagem }); return; }
  const { data, periodo } = periodoAgora();
  const [atual] = await db.select().from(pulsoDiarioTable).where(and(
    eq(pulsoDiarioTable.clienteId, quem.id), eq(pulsoDiarioTable.data, data), eq(pulsoDiarioTable.periodo, periodo),
  ));
  const primeiro = quem.nome.trim().split(/\s+/)[0] ?? "";
  res.json({
    nome: primeiro ? primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase() : "",
    data, periodo,
    atual: atual ? {
      energia: atual.energia, disposicao: atual.disposicao, sono: atual.sono,
      pressaoSistolica: atual.pressaoSistolica, pressaoDiastolica: atual.pressaoDiastolica,
      frequenciaCardiaca: atual.frequenciaCardiaca, glicemia: atual.glicemia,
    } : null,
  });
});

router.post("/pulso-telegram/registrar", async (req, res): Promise<void> => {
  const quem = await identificar(req.body?.initData);
  if ("erro" in quem) { res.status(quem.erro).json({ error: quem.mensagem }); return; }
  const parsed = valoresSchema.safeParse(req.body?.valores);
  if (!parsed.success) { res.status(400).json({ error: "Algum valor está fora do limite aceito." }); return; }
  const v = parsed.data;
  const sis = v.pressaoSistolica ?? null;
  const dia = v.pressaoDiastolica ?? null;
  if ((sis === null) !== (dia === null)) { res.status(400).json({ error: "Informe sístole e diástole juntas." }); return; }
  if (sis !== null && dia !== null && sis <= dia) { res.status(400).json({ error: "A sístole deve ser maior que a diástole." }); return; }

  const { data, periodo } = periodoAgora();
  const valores = {
    energia: v.energia ?? null, disposicao: v.disposicao ?? null, sono: v.sono ?? null,
    pressaoSistolica: sis, pressaoDiastolica: dia,
    frequenciaCardiaca: v.frequenciaCardiaca ?? null, glicemia: v.glicemia ?? null,
  };
  if (Object.values(valores).every((x) => x === null)) { res.status(400).json({ error: "Preencha ao menos um campo." }); return; }

  await db.insert(pulsoDiarioTable)
    .values({ clienteId: quem.id, data, periodo, ...valores, origem: "telegram" })
    .onConflictDoUpdate({
      target: [pulsoDiarioTable.clienteId, pulsoDiarioTable.data, pulsoDiarioTable.periodo],
      set: { ...valores, origem: "telegram", updatedAt: new Date() },
    });
  logger.info({ clienteId: quem.id, periodo }, "[pulso-telegram] registro gravado");
  res.status(201).json({ ok: true, data, periodo });
});

export default router;
