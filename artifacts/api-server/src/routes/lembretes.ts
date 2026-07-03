// ROTA da CENTRAL DE LEMBRETES — gestão do lembrete de prescrição por cliente.
//
// Conteúdo rico (periodos) é JSONB; por isso NÃO usa OpenAPI/Orval (espelha a
// mensagens-catalogo). Admin single-tenant atrás do proxy: as escritas seguem
// abertas, igual à tela irmã (Carta → PATCH /mensagens-catalogo). Não é PII nem
// credencial; o perímetro é o proxy (ver memória "admin-api-sem-auth").
//
// Opção A (riqueza): a prévia usa montarMensagemOpus com os periodos reais.
// Opção B (override manual): PATCH grava ativoManual; ativo efetivo nunca dispara
// lembrete vazio (ativo = temFormulas && ativoManual !== false).
import { Router, type IRouter } from "express";
import {
  db,
  lembretesPrescricaoTable,
  lembreteEnviosTable,
  clientsTable,
  type LembretePeriodoJson,
  type LembreteFormulaJson,
} from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { montarMensagemOpus } from "../lib/mensageria-opus";
import { templateLembretePrescricao, montarSaudacao } from "../lib/lembrete-templates";
import { partsParaTimezone } from "../lib/lembrete-periodo";

const router: IRouter = Router();

const TIMEZONE = "America/Sao_Paulo";
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function contarFormulas(periodos: LembretePeriodoJson[]): number {
  return periodos.reduce((acc, p) => acc + (Array.isArray(p.formulas) ? p.formulas.length : 0), 0);
}

// Próximo horário de HOJE (BRT) que ainda não passou; null se todos já passaram.
function proximaJanelaHoje(horarios: string[], agora: Date): string | null {
  const { horaMin } = partsParaTimezone(agora, TIMEZONE);
  const futuros = horarios
    .filter((h) => HHMM.test(h.trim()))
    .map((h) => h.trim())
    .filter((h) => {
      const [hh, mm] = h.split(":").map((n) => parseInt(n, 10));
      return hh * 60 + mm >= horaMin;
    })
    .sort();
  return futuros[0] ?? null;
}

// GET /api/lembretes — lista todos os lembretes reais (leitura livre).
router.get("/lembretes", async (_req, res) => {
  const rows = await db
    .select({
      clienteId: lembretesPrescricaoTable.clienteId,
      lembreteId: lembretesPrescricaoTable.id,
      ativo: lembretesPrescricaoTable.ativo,
      ativoManual: lembretesPrescricaoTable.ativoManual,
      periodos: lembretesPrescricaoTable.periodos,
      horariosEnvio: lembretesPrescricaoTable.horariosEnvio,
      nome: clientsTable.name,
      telefone: clientsTable.phone,
    })
    .from(lembretesPrescricaoTable)
    .innerJoin(clientsTable, eq(clientsTable.id, lembretesPrescricaoTable.clienteId))
    .orderBy(clientsTable.name);

  const agora = new Date();
  const lista = await Promise.all(
    rows.map(async (r) => {
      const periodos = Array.isArray(r.periodos) ? r.periodos : [];
      const horarios = Array.isArray(r.horariosEnvio) ? r.horariosEnvio : [];
      const [ultimo] = await db
        .select({
          janela: lembreteEnviosTable.janela,
          status: lembreteEnviosTable.status,
          enviadoEm: lembreteEnviosTable.enviadoEm,
        })
        .from(lembreteEnviosTable)
        .where(eq(lembreteEnviosTable.lembreteId, r.lembreteId))
        .orderBy(desc(lembreteEnviosTable.createdAt))
        .limit(1);
      return {
        clienteId: r.clienteId,
        lembreteId: r.lembreteId,
        nome: r.nome,
        telefone: r.telefone,
        ativo: r.ativo,
        ativoManual: r.ativoManual,
        qtdePeriodos: periodos.length,
        qtdeFormulas: contarFormulas(periodos),
        horariosEnvio: horarios,
        ultimoEnvio: ultimo
          ? { janela: ultimo.janela, status: ultimo.status, enviadoEm: ultimo.enviadoEm }
          : null,
        proximaJanelaHoje: proximaJanelaHoje(horarios, agora),
      };
    }),
  );
  res.json({ lembretes: lista });
});

// Carrega o lembrete + dados do cliente por clienteId (helper interno).
async function carregarDetalhe(clienteId: number) {
  const [row] = await db
    .select({
      lembreteId: lembretesPrescricaoTable.id,
      clienteId: lembretesPrescricaoTable.clienteId,
      ativo: lembretesPrescricaoTable.ativo,
      ativoManual: lembretesPrescricaoTable.ativoManual,
      periodos: lembretesPrescricaoTable.periodos,
      horariosEnvio: lembretesPrescricaoTable.horariosEnvio,
      observacao: lembretesPrescricaoTable.observacao,
      nome: clientsTable.name,
      telefone: clientsTable.phone,
    })
    .from(lembretesPrescricaoTable)
    .innerJoin(clientsTable, eq(clientsTable.id, lembretesPrescricaoTable.clienteId))
    .where(eq(lembretesPrescricaoTable.clienteId, clienteId))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    periodos: Array.isArray(row.periodos) ? row.periodos : [],
    horariosEnvio: Array.isArray(row.horariosEnvio) ? row.horariosEnvio : [],
  };
}

// GET /api/lembretes/:clienteId — detalhe completo (leitura livre).
router.get("/lembretes/:clienteId", async (req, res) => {
  const clienteId = Number(req.params.clienteId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: "clienteId inválido" });
  }
  const detalhe = await carregarDetalhe(clienteId);
  if (!detalhe) return res.status(404).json({ error: "lembrete não encontrado" });
  res.json({ lembrete: detalhe });
});

// GET /api/lembretes/:clienteId/preview — mensagem REAL (leitura livre).
router.get("/lembretes/:clienteId/preview", async (req, res) => {
  const clienteId = Number(req.params.clienteId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: "clienteId inválido" });
  }
  const detalhe = await carregarDetalhe(clienteId);
  if (!detalhe) return res.status(404).json({ error: "lembrete não encontrado" });

  const agora = new Date();
  const primeiroNome = (detalhe.nome || "").trim().split(/\s+/)[0] || detalhe.nome;
  let mensagem: string | null = null;
  try {
    mensagem = await montarMensagemOpus({ nome: primeiroNome, agora, periodos: detalhe.periodos });
  } catch {
    mensagem = null;
  }
  if (!mensagem) {
    mensagem = templateLembretePrescricao({
      clienteNome: detalhe.nome,
      clienteGenero: "nao_informado",
      agora,
      saudacao: montarSaudacao(detalhe.nome, "nao_informado", agora),
      periodos: detalhe.periodos,
    });
  }
  res.json({ mensagem });
});

// Sanitiza um array de LembreteFormulaJson vindo do cliente (só campos conhecidos).
function sanitizarFormula(raw: unknown): LembreteFormulaJson | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const nome = typeof o.nome === "string" ? o.nome.trim() : "";
  if (!nome) return null;
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  return {
    nome,
    ativoPrincipal: s(o.ativoPrincipal),
    dose: s(o.dose),
    horario: s(o.horario),
    observacaoRefeicao: s(o.observacaoRefeicao),
    posologia: s(o.posologia),
  };
}

function sanitizarPeriodos(raw: unknown): LembretePeriodoJson[] | null {
  if (!Array.isArray(raw)) return null;
  const out: LembretePeriodoJson[] = [];
  for (const p of raw) {
    if (typeof p !== "object" || p === null) return null;
    const o = p as Record<string, unknown>;
    const nome = typeof o.nome === "string" ? o.nome.trim() : "";
    if (!nome) return null;
    const tipo = o.tipo === "nao_tomar" ? "nao_tomar" : "tomar";
    const sigla = typeof o.sigla === "string" ? o.sigla.trim() : undefined;
    const formulas: LembreteFormulaJson[] = [];
    if (Array.isArray(o.formulas)) {
      for (const f of o.formulas) {
        const san = sanitizarFormula(f);
        if (!san) return null;
        formulas.push(san);
      }
    }
    out.push({ sigla, nome, tipo, formulas });
  }
  return out;
}

// PATCH /api/lembretes/:clienteId — override manual + horários + periodos ricos.
router.patch("/lembretes/:clienteId", async (req, res) => {
  const clienteId = Number(req.params.clienteId);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    return res.status(400).json({ error: "clienteId inválido" });
  }
  const atual = await carregarDetalhe(clienteId);
  if (!atual) return res.status(404).json({ error: "lembrete não encontrado" });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const set: Partial<typeof lembretesPrescricaoTable.$inferInsert> = { updatedAt: new Date() };

  // ativoManual: true | false | null (segue automático).
  let ativoManual = atual.ativoManual;
  if ("ativoManual" in body) {
    const v = body.ativoManual;
    if (v !== true && v !== false && v !== null) {
      return res.status(400).json({ error: "ativoManual deve ser true, false ou null" });
    }
    ativoManual = v;
    set.ativoManual = v;
  }

  // horariosEnvio: array de HH:MM válidos (dedup + ordena).
  let periodos = atual.periodos;
  if ("horariosEnvio" in body) {
    const arr = body.horariosEnvio;
    if (!Array.isArray(arr) || !arr.every((h) => typeof h === "string" && HHMM.test(h.trim()))) {
      return res.status(400).json({ error: "horariosEnvio deve ser um array de HH:MM válidos" });
    }
    const limpos = [...new Set((arr as string[]).map((h) => h.trim()))].sort();
    set.horariosEnvio = limpos;
  }

  // periodos ricos: valida forma e campos conhecidos.
  if ("periodos" in body) {
    const san = sanitizarPeriodos(body.periodos);
    if (!san) return res.status(400).json({ error: "periodos malformado" });
    periodos = san;
    set.periodos = san;
  }

  // ativo efetivo: nunca dispara lembrete vazio; desligar à mão sempre vence.
  const temFormulas = contarFormulas(periodos) > 0;
  set.ativo = temFormulas && ativoManual !== false;

  await db
    .update(lembretesPrescricaoTable)
    .set(set)
    .where(eq(lembretesPrescricaoTable.clienteId, clienteId));

  const detalhe = await carregarDetalhe(clienteId);
  res.json({ lembrete: detalhe });
});

export default router;
