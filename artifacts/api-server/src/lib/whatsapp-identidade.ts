/**
 * Identidade de quem escreve no WhatsApp (camada com banco).
 *
 * Regras:
 *  1. Só número COMPLETO e exato identifica alguém. O pedaço final do telefone serve apenas
 *     para reduzir a consulta; a decisão é sempre pela comparação do número inteiro.
 *  2. Mais de um cadastro com o mesmo número = ambíguo = ninguém é identificado.
 *  3. "Clínica correta": a clínica do cliente precisa ser a dona do canal que recebeu a
 *     mensagem (número de destino cadastrado na empresa). Canal sem dono = clínica não
 *     confirmada.
 *  4. Informação clínica só é lida quando cliente identificado E clínica confirmada.
 */
import { pool } from "@workspace/db";
import { telefoneCanonico } from "./whatsapp-seguranca";

export type RemetenteIdentificado =
  | { tipo: "cliente"; clienteId: number; empresaId: number | null; nome: string; clinicaConfirmada: boolean }
  | { tipo: "profissional"; nome: string; cargo: string }
  | { tipo: "ambiguo" }
  | { tipo: "desconhecido" };

/** Empresa dona do canal que recebeu a mensagem; null se nenhuma (ou mais de uma) for dona. */
export async function empresaDoCanal(destino: string): Promise<number | null> {
  const alvo = telefoneCanonico(destino);
  if (!alvo) return null;
  const r = await pool.query(
    `SELECT id, twilio_numero, wa_numero FROM empresas WHERE twilio_numero IS NOT NULL OR wa_numero IS NOT NULL`,
  );
  const donas = (r.rows as Array<{ id: number; twilio_numero: string | null; wa_numero: string | null }>)
    .filter((e) => telefoneCanonico(e.twilio_numero) === alvo || telefoneCanonico(e.wa_numero) === alvo)
    .map((e) => e.id);
  return donas.length === 1 ? donas[0]! : null;
}

export async function identificarRemetente(from: string, to: string): Promise<RemetenteIdentificado> {
  const numero = telefoneCanonico(from);
  if (!numero) return { tipo: "desconhecido" };
  const sufixo = numero.slice(-8);

  const c = await pool.query(
    `SELECT id, name, phone, empresa_id FROM clients
      WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') LIKE $1
        AND deleted_at IS NULL AND COALESCE(status,'') <> 'deleted'
      LIMIT 50`,
    [`%${sufixo}`],
  );
  const exatos = (c.rows as Array<{ id: number; name: string | null; phone: string | null; empresa_id: number | null }>)
    .filter((x) => telefoneCanonico(x.phone) === numero);
  if (exatos.length > 1) return { tipo: "ambiguo" };
  if (exatos.length === 1) {
    const x = exatos[0]!;
    const canal = await empresaDoCanal(to).catch(() => null);
    return {
      tipo: "cliente",
      clienteId: x.id,
      empresaId: x.empresa_id ?? null,
      nome: x.name ?? "",
      clinicaConfirmada: canal !== null && x.empresa_id !== null && canal === x.empresa_id,
    };
  }

  const p = await pool.query(
    `SELECT name, role, phone FROM professionals
      WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') LIKE $1 LIMIT 50`,
    [`%${sufixo}`],
  );
  const pros = (p.rows as Array<{ name: string | null; role: string | null; phone: string | null }>)
    .filter((x) => telefoneCanonico(x.phone) === numero);
  if (pros.length > 1) return { tipo: "ambiguo" };
  if (pros.length === 1) return { tipo: "profissional", nome: pros[0]!.name ?? "", cargo: pros[0]!.role ?? "" };
  return { tipo: "desconhecido" };
}

/** Contexto clínico mínimo — só deve ser chamado com identidade E clínica confirmadas. */
export async function contextoClinico(clienteId: number, empresaId: number) {
  const r = await pool.query(
    `SELECT p.title AS ptitle,
            (SELECT COUNT(*) FROM sessions s WHERE s.protocol_id = p.id AND s.status = 'completed')::int AS feitas,
            (SELECT COUNT(*) FROM sessions s WHERE s.protocol_id = p.id)::int AS total
       FROM clients c
       LEFT JOIN protocols p ON p.client_id = c.id AND p.status = 'active'
      WHERE c.id = $1 AND c.empresa_id = $2 AND c.deleted_at IS NULL
      ORDER BY p.created_at DESC NULLS LAST LIMIT 1`,
    [clienteId, empresaId],
  );
  const row = r.rows[0] as { ptitle: string | null; feitas: number; total: number } | undefined;
  return row?.ptitle ? { protocolo: row.ptitle, feitas: Number(row.feitas), total: Number(row.total) } : null;
}

/** Última mensagem RECEBIDA do contato (abre a janela de 24 h). Número completo, nunca pedaço. */
export async function ultimaEntradaDoContato(telefone: string): Promise<Date | null> {
  const alvo = telefoneCanonico(telefone);
  if (!alvo) return null;
  const r = await pool.query(
    `SELECT telefone, criado_em FROM whatsapp_mensagens_log
      WHERE direcao = 'entrada' AND via = 'whatsapp' AND telefone LIKE $1
      ORDER BY criado_em DESC LIMIT 20`,
    [`%${alvo.slice(-8)}`],
  );
  for (const row of r.rows as Array<{ telefone: string; criado_em: Date }>) {
    if (telefoneCanonico(row.telefone) === alvo) return new Date(row.criado_em);
  }
  return null;
}
