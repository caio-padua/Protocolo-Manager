/**
 * Radar Clínico — visão operacional do médico.
 *
 * GET  /radar-clinico          — lista paginada (PAGE_SIZE=50) com filtros
 * POST /radar-clinico/mensagem — envia mensagem pontual a um paciente
 *
 * Segurança:
 *  - moduleGuard("cockpit") bloqueia tenants sem o módulo ativo
 *  - resolveEmpresaId(req) garante isolamento multi-tenant em todo SELECT/INSERT
 *  - isPlatformOwner pode cruzar tenants via ?empresaId=N
 *
 * Regras de honestidade da mensageria rápida:
 *  - Telegram sem token (mock) → 422, nunca 200 ok:true
 *  - WhatsApp sem Twilio (link) → 422, nunca 200 ok:true
 *  - Falha de provedor → 502
 *  - Sucesso real → 200 ok:true + grava em mensageria_lembrete (fonte do "último contato")
 */
import { Router } from "express";
import { pool } from "@workspace/db";
import { moduleGuard } from "../middleware/moduleGuard";
import { resolveEmpresaId } from "../middleware/tenantContext";
import { sendWhatsapp, registrarLogMensagem } from "../lib/whatsapp";
import { sendTelegram } from "../lib/telegram";
import { sendGmailMessage } from "../lib/google-gmail";
import { enviarMensagemRadar, type RadarMensagemDeps } from "../lib/radar-mensagem";
import { sortByUrgencia } from "../lib/radar-sort";

const router = Router();

// Guard: todos os endpoints do Radar exigem o módulo "cockpit" ativo.
// isPlatformOwner nunca é bloqueado (regra do moduleGuard).
router.use(moduleGuard("cockpit"));

// ──────────────────────────────────────────────────────────────────────────────
// GET /radar-clinico
// ──────────────────────────────────────────────────────────────────────────────
router.get("/radar-clinico", async (req, res): Promise<void> => {
  try {
    const empresaId = resolveEmpresaId(req as any);
    const PAGE_SIZE = 50;
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;

    const protocoloStatus = String(req.query.protocolo_status || "all");
    const tempoAtivo = req.query.tempo_ativo ? Number(req.query.tempo_ativo) : null;
    const faltaDias = req.query.falta_dias ? Number(req.query.falta_dias) : null;
    const substancia = req.query.substancia ? String(req.query.substancia) : null;
    const silencioDias = req.query.silencio_dias ? Number(req.query.silencio_dias) : null;

    // Busca por nome: filtro ILIKE aplicado diretamente no SQL (evita carregar toda a base).
    const search = req.query.search ? String(req.query.search).trim() : null;

    // "urgencia" (padrão) = faltou DESC → silêncio DESC → nome ASC
    // "az" = nome ASC
    const ordenacao = String(req.query.ordenacao || "urgencia");

    // Isolamento multi-tenant: empresa_id = $1 é o PRIMEIRO parâmetro e aparece
    // em toda CTE. A busca por nome entra como parâmetro numerado adicional —
    // nunca por interpolação de texto — e é somada ao WHERE, jamais o substitui.
    // Por isso a busca não consegue atravessar a clínica (Task #74).

    const result = await enviarMensagemRadar(
      { clientId: Number(clientId), canal, mensagem, empresaId },
      deps,
    );

    let rows = result.rows.map((r) => {
      const diasDesdeInicio = r.protocolo_inicio
        ? Math.floor((Date.now() - new Date(r.protocolo_inicio).getTime()) / 86_400_000)
        : null;
      const diasDesdeUltSessao = r.ultima_sessao_data
        ? Math.floor((Date.now() - new Date(r.ultima_sessao_data).getTime()) / 86_400_000)
        : null;
      const diasSemContato = r.ultimo_contato
        ? Math.floor((Date.now() - new Date(r.ultimo_contato).getTime()) / 86_400_000)
        : null;
      const faltou = r.ultima_sessao_status === "missed" || r.ultima_sessao_status === "cancelled";
      const totalSubstancias = Number(r.total_substancias);

      return {
        id: r.id,
        nome: r.nome,
        dataNascimento: r.data_nascimento,
        telefone: r.telefone,
        email: r.email,
        photoUrl: r.photo_url,
        telegramChatId: r.telegram_chat_id,
        protocolo: r.protocolo_id
          ? { id: r.protocolo_id, titulo: r.protocolo_titulo, status: r.protocolo_status, inicio: r.protocolo_inicio, diasDesdeInicio }
          : null,
        sessoes: {
          ultimaData: r.ultima_sessao_data,
          ultimaStatus: r.ultima_sessao_status,
          diasDesdeUltima: diasDesdeUltSessao,
          faltou,
          proximaData: r.proxima_sessao_data,
          proximaHora: r.proxima_sessao_hora,
        },
        substancias: { total: totalSubstancias, temCoenzima: r.tem_coenzima, temGH: r.tem_gh, temTestosterona: r.tem_testosterona },
        alertas: { faltaHaDias: faltou ? diasDesdeUltSessao : null, silencioHaDias: diasSemContato },
        ultimoContato: r.ultimo_contato,
      };
    });

    if (protocoloStatus === "active") {
      rows = rows.filter((r) => r.protocolo?.status === "active" || r.protocolo?.status === "validated");
    } else if (protocoloStatus === "inactive") {
      rows = rows.filter((r) => !r.protocolo || (r.protocolo.status !== "active" && r.protocolo.status !== "validated"));
    }
    if (tempoAtivo !== null) {
      rows = rows.filter((r) => r.protocolo?.diasDesdeInicio != null && r.protocolo.diasDesdeInicio >= tempoAtivo);
    }
    if (faltaDias !== null) {
      rows = rows.filter((r) => r.alertas.faltaHaDias != null && r.alertas.faltaHaDias >= faltaDias);
    }
    if (substancia === "coenzima") rows = rows.filter((r) => r.substancias.temCoenzima);
    else if (substancia === "gh") rows = rows.filter((r) => r.substancias.temGH);
    else if (substancia === "testosterona") rows = rows.filter((r) => r.substancias.temTestosterona);
    else if (substancia === "5plus") rows = rows.filter((r) => r.substancias.total >= 5);
    if (silencioDias !== null) {
      rows = rows.filter((r) => r.alertas.silencioHaDias == null || r.alertas.silencioHaDias >= silencioDias);
    }

    // ── Ordenação ────────────────────────────────────────────────────────────
    if (ordenacao === "urgencia") {
      sortByUrgencia(rows);
    } else {
      // "az" — ordem alfabética simples
      rows.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
    }

    const total = rows.length;
    const pacientes = rows.slice(offset, offset + PAGE_SIZE);
    res.json({ total, pagina: page, pageSize: PAGE_SIZE, totalPaginas: Math.ceil(total / PAGE_SIZE), pacientes });
  } catch (err) {
    console.error("[radar-clinico] erro:", err);
    res.status(500).json({ error: "Erro interno ao carregar o Radar Clínico" });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// POST /radar-clinico/mensagem
// Regras: Telegram mock → 422 | WhatsApp sem Twilio → 422 | falha → 502
//         sucesso real → 200 + grava em mensageria_lembrete
//
// A lógica de negócio fica em lib/radar-mensagem.ts (testável sem HTTP).
// A rota só injeta as dependências reais e mapeia o resultado para HTTP.
// ──────────────────────────────────────────────────────────────────────────────
router.post("/radar-clinico/mensagem", async (req, res): Promise<void> => {
  try {
    const empresaId = resolveEmpresaId(req as any);
    const { clientId, canal, mensagem } = req.body ?? {};

    // Dependências reais injetadas aqui
    const deps: RadarMensagemDeps = {
      async getCliente(cId, eId) {
        const r = await pool.query<{
          id: number; name: string; phone: string | null;
          email: string | null; telegram_chat_id: string | null;
        }>(
          `SELECT id, name, phone, email, telegram_chat_id FROM clients WHERE id = $1 AND empresa_id = $2`,
          [Number(cId), eId],
        );
        return r.rows[0] ?? null;
      },
      sendWhatsapp: (phone, msg) => sendWhatsapp(phone, msg),
      sendTelegram: (chatId, msg) => sendTelegram(chatId, msg),
      async sendGmail(to, subject, html) {
        const r = await sendGmailMessage({ to, subject, html });
        return r;
      },
      async saveHistory({ clientId: cId, mensagem: msg, via, phone, empresaId: eId }) {
        const agora = new Date();
        await pool.query(
          `INSERT INTO mensageria_lembrete
            (cliente_id, tipo, titulo, mensagem, periodo, dia_semana,
             proximo_envio, status, via, telefone, enviado_em, empresa_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            Number(cId), "radar", "Mensagem rápida via Radar Clínico", msg,
            "avulso", null, agora, "enviado", via, phone, agora, eId,
          ],
        );
        // Também registra no log unificado de mensagens para o cockpit poder
        // exibir "último contato Telegram" quando o canal Telegram foi usado.
        // Para WhatsApp via Radar o log já é gravado dentro de sendWhatsapp.
        if (via === "telegram") {
          void registrarLogMensagem({
            // Telefone é o identificador de contato; para Telegram usamos
            // o phone do paciente quando disponível, senão marcamos 'telegram'.
            telefone: phone ?? "telegram",
            corpo: msg,
            status: "sent",
            contexto: "radar",
            clienteId: Number(cId),
            via: "telegram",
          });
        }
        return true;
      },
    };

    const result = await enviarMensagemRadar(
      { clientId: Number(clientId), canal, mensagem, empresaId },
      deps,
    );

    // Mapeamento resultado → HTTP
    switch (result.kind) {
      case "ok":
        res.json({
          ok: true, canal, entregue: true,
          historyStored: result.historyStored,
          ...(result.historyError ? { historyError: result.historyError } : {}),
        });
        break;
      case "400": res.status(400).json({ error: result.error }); break;
      case "404": res.status(404).json({ error: "Paciente não encontrado" }); break;
      case "422":
        res.status(422).json({ ok: false, error: result.error, ...(result.link ? { link: result.link } : {}) });
        break;
      case "502":
        res.status(502).json({ ok: false, error: result.error, ...(result.link ? { link: result.link } : {}) });
        break;
      default:
        res.status(500).json({ error: (result as any).error ?? "Erro interno" });
    }
  } catch (err) {
    console.error("[radar-clinico/mensagem] erro:", err);
    res.status(500).json({ error: "Erro interno ao enviar mensagem" });
  }
});

export default router;

