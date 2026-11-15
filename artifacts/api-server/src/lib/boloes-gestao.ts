import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  BOLOES_COMPROVANTE_MAX_BYTES, auditarBolao, detectarTipoComprovante, sha256Hex, type TipoComprovante,
} from "./boloes";
import {
  MOTIVO_TEXTO, casarRecibo, podeAprovarAutomaticamente, type Candidato, type MotivoCodigo, type ReciboLido,
} from "./boloes-casamento";
import { getJsonSetting, setJsonSetting } from "./secure-settings";

/**
 * Operacoes de gestao de Boloes (compartilhadas pelas rotas do gestor, pelo titular e pelo robo).
 * Regras: toda consulta filtra pela empresa; pagamento, registro e entrega sao estados separados;
 * o arquivo so vira comprovante do participante depois de aprovado (humano, ou regra automatica ligada pela clinica).
 */

export interface ArmazenamentoPrivado {
  savePrivateObject(key: string, buffer: Buffer, contentType: string): Promise<unknown>;
  readPrivateObject(key: string): Promise<Buffer>;
  deletePrivateObject(key: string): Promise<void>;
}
export interface Ator { texto: string; profissionalId: number | null }
export type LeitorRecibo = (buffer: Buffer, mime: string, empresaId: number) => Promise<ReciboLido>;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const rows = (r: unknown): any[] => (r as { rows: any[] }).rows;

// ---------------------------------------------------------------- configuracao por clinica
export interface ConfigBoloes { driveFolderId: string | null; autoAprovar: boolean }
const chaveConfig = (empresaId: number) => `boloes.config.${empresaId}`;

export async function lerConfig(empresaId: number): Promise<ConfigBoloes> {
  const c = await getJsonSetting<Partial<ConfigBoloes>>(chaveConfig(empresaId));
  return { driveFolderId: c?.driveFolderId ?? null, autoAprovar: c?.autoAprovar === true };
}
export async function gravarConfig(empresaId: number, cfg: ConfigBoloes, ator: Ator): Promise<void> {
  const antes = await lerConfig(empresaId);
  await setJsonSetting(chaveConfig(empresaId), cfg);
  await auditarBolao({
    empresaId, ator: ator.texto, acao: "configuracao_alterada", resultado: "ok",
    detalhe: `pasta ${antes.driveFolderId ? "definida" : "vazia"} -> ${cfg.driveFolderId ? "definida" : "vazia"}; aprovacao automatica ${antes.autoAprovar ? "ligada" : "desligada"} -> ${cfg.autoAprovar ? "ligada" : "desligada"}`,
  });
}

// ---------------------------------------------------------------- campanha e participacao
export async function criarCampanha(p: { empresaId: number; nome: string; concurso?: string; dataSorteio?: string; ator: Ator }): Promise<number> {
  return db.transaction(async (tx) => {
    const r = rows(await tx.execute(sql`
      INSERT INTO boloes_campanhas (empresa_id, nome, concurso, data_sorteio, criado_por)
      VALUES (${p.empresaId}, ${p.nome}, ${p.concurso ?? null}, ${p.dataSorteio ?? null}, ${p.ator.profissionalId}) RETURNING id`))[0];
    await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "campanha_criada", resultado: "ok", detalhe: `campanha ${r.id}` }, tx);
    return r.id as number;
  });
}

export type ResultadoParticipacao = { s: 201; id: number } | { s: 404 } | { s: 409; dup: boolean };

/** `empresaId` restringe a clinica (gestor); null = titular da plataforma (a clinica vem da campanha). */
export async function criarParticipacao(p: { empresaId: number | null; campanhaId: number; clientId: number; cotas: number; ator: Ator }): Promise<ResultadoParticipacao> {
  return db.transaction(async (tx) => {
    const ca = rows(await tx.execute(sql`SELECT id, empresa_id FROM boloes_campanhas WHERE id = ${p.campanhaId}`))[0];
    const cl = rows(await tx.execute(sql`SELECT id, empresa_id FROM clients WHERE id = ${p.clientId} AND deleted_at IS NULL`))[0];
    if (!ca || !cl) return { s: 404 } as const;
    if (p.empresaId !== null && (ca.empresa_id !== p.empresaId || cl.empresa_id !== p.empresaId)) return { s: 404 } as const;
    if (ca.empresa_id !== cl.empresa_id) return { s: 409, dup: false } as const;
    const ins = rows(await tx.execute(sql`
      INSERT INTO boloes_participacoes (empresa_id, campanha_id, client_id, cotas, criado_por)
      VALUES (${ca.empresa_id}, ${ca.id}, ${cl.id}, ${p.cotas}, ${p.ator.profissionalId})
      ON CONFLICT (campanha_id, client_id) DO NOTHING RETURNING id`))[0];
    if (!ins) return { s: 409, dup: true } as const;
    await auditarBolao({ empresaId: ca.empresa_id, clientId: cl.id, ator: p.ator.texto, acao: "participacao_criada", participacaoId: ins.id, resultado: "ok" }, tx);
    return { s: 201, id: ins.id as number } as const;
  });
}

// ---------------------------------------------------------------- anexar comprovante (unico caminho)
export type MotivoRecusaAnexo =
  | "participacao_inexistente" | "cancelada" | "ja_tem_comprovante" | "arquivo_duplicado" | "recebimento_indisponivel";
export type ResultadoAnexo = { ok: true; comprovanteId: number } | { ok: false; motivo: MotivoRecusaAnexo };

class RecebimentoIndisponivel extends Error {}

type OrigemArquivo =
  | { buffer: Buffer; tipo: TipoComprovante }
  | { existente: { storageKey: string; mime: string; bytes: number; sha256: string } };

/**
 * Cria o comprovante ATIVO de uma participacao e marca a participacao como registrada, na mesma transacao.
 * `empresaId` null = titular da plataforma (sem restricao de clinica).
 */
export async function anexarComprovante(
  storage: ArmazenamentoPrivado,
  p: { empresaId: number | null; participacaoId: number; origem: OrigemArquivo; ator: Ator; recebimentoId?: number | null },
): Promise<ResultadoAnexo> {
  const part = rows(await db.execute(sql`
    SELECT id, empresa_id, client_id, status FROM boloes_participacoes
     WHERE id = ${p.participacaoId} ${p.empresaId !== null ? sql`AND empresa_id = ${p.empresaId}` : sql``}`))[0];
  if (!part) return { ok: false, motivo: "participacao_inexistente" };
  if (part.status === "cancelada") return { ok: false, motivo: "cancelada" };

  let dados: { storageKey: string; mime: string; bytes: number; sha256: string };
  let salvoAgora = false;
  if ("buffer" in p.origem) {
    dados = {
      storageKey: `boloes-comprovantes/${part.empresa_id}/${randomUUID()}`,
      mime: p.origem.tipo.mime, bytes: p.origem.buffer.length, sha256: sha256Hex(p.origem.buffer),
    };
    await storage.savePrivateObject(dados.storageKey, p.origem.buffer, dados.mime);
    salvoAgora = true;
  } else {
    dados = p.origem.existente;
  }

  try {
    const res = await db.transaction(async (tx) => {
      const atual = rows(await tx.execute(sql`SELECT status FROM boloes_participacoes WHERE id = ${p.participacaoId} FOR UPDATE`))[0];
      if (!atual || atual.status === "cancelada") return { ok: false, motivo: "cancelada" } as const;
      const ins = rows(await tx.execute(sql`
        INSERT INTO boloes_comprovantes (empresa_id, participacao_id, storage_key, mime, bytes, sha256, validado_por, validado_ator, recebimento_id)
        VALUES (${part.empresa_id}, ${p.participacaoId}, ${dados.storageKey}, ${dados.mime}, ${dados.bytes}, ${dados.sha256},
                ${p.ator.profissionalId}, ${p.ator.texto}, ${p.recebimentoId ?? null})
        ON CONFLICT DO NOTHING RETURNING id`))[0];
      if (!ins) {
        const ativo = rows(await tx.execute(sql`SELECT 1 FROM boloes_comprovantes WHERE participacao_id = ${p.participacaoId} AND revogado_em IS NULL`))[0];
        return { ok: false, motivo: ativo ? "ja_tem_comprovante" : "arquivo_duplicado" } as const;
      }
      if (p.recebimentoId) {
        const upd = rows(await tx.execute(sql`
          UPDATE boloes_recebimentos
             SET status = 'aprovado', comprovante_id = ${ins.id}, decidido_por = ${p.ator.texto}, decidido_em = NOW(), atualizado_em = NOW()
           WHERE id = ${p.recebimentoId} AND empresa_id = ${part.empresa_id} AND status = 'em_revisao' RETURNING id`))[0];
        if (!upd) throw new RecebimentoIndisponivel();
      }
      await tx.execute(sql`UPDATE boloes_participacoes SET status = 'registrada', registrada_em = NOW() WHERE id = ${p.participacaoId}`);
      await auditarBolao({
        empresaId: part.empresa_id, clientId: part.client_id, ator: p.ator.texto, acao: "comprovante_anexado",
        participacaoId: p.participacaoId, comprovanteId: ins.id, resultado: "ok",
        detalhe: p.recebimentoId ? `recebimento ${p.recebimentoId}` : undefined,
      }, tx);
      return { ok: true, comprovanteId: ins.id as number } as const;
    });
    if (!res.ok && salvoAgora) await storage.deletePrivateObject(dados.storageKey).catch(() => undefined);
    return res;
  } catch (err) {
    if (salvoAgora) await storage.deletePrivateObject(dados.storageKey).catch(() => undefined);
    if (err instanceof RecebimentoIndisponivel) return { ok: false, motivo: "recebimento_indisponivel" };
    throw err;
  }
}

// ---------------------------------------------------------------- quarentena: receber
export type ResultadoIngestao =
  | { ok: true; id: number | null; status: "recebido" | "duplicado" | "rejeitado"; duplicadoDe?: number | null }
  | { ok: false; motivo: "vazio" | "grande" | "tipo_invalido" };

export async function ingerirArquivo(
  storage: ArmazenamentoPrivado,
  p: { empresaId: number; origem: "manual" | "drive"; buffer: Buffer; nomeOriginal?: string; driveFileId?: string; criadoPor?: number | null; ator: Ator },
): Promise<ResultadoIngestao> {
  const nome = p.nomeOriginal ? p.nomeOriginal.slice(0, 200) : null;
  if (p.buffer.length === 0) return { ok: false, motivo: "vazio" };
  if (p.buffer.length > BOLOES_COMPROVANTE_MAX_BYTES) return { ok: false, motivo: "grande" };
  const tipo = detectarTipoComprovante(p.buffer);
  if (!tipo) {
    if (p.origem === "manual") return { ok: false, motivo: "tipo_invalido" };
    // Drive: registra a recusa para o arquivo nao ser reavaliado a cada varredura.
    const r = rows(await db.execute(sql`
      INSERT INTO boloes_recebimentos (empresa_id, origem, drive_file_id, nome_original, status, motivo_rejeicao, decidido_por, decidido_em)
      VALUES (${p.empresaId}, 'drive', ${p.driveFileId ?? null}, ${nome}, 'rejeitado', 'Tipo de arquivo não aceito (apenas PDF, PNG ou JPEG).', 'robo', NOW())
      ON CONFLICT DO NOTHING RETURNING id`))[0];
    return { ok: true, id: r?.id ?? null, status: "rejeitado" };
  }
  const sha = sha256Hex(p.buffer);

  const jaComprovante = rows(await db.execute(sql`SELECT id FROM boloes_comprovantes WHERE empresa_id = ${p.empresaId} AND sha256 = ${sha} AND revogado_em IS NULL`))[0];
  const jaVivo = jaComprovante ? null : rows(await db.execute(sql`
    SELECT id FROM boloes_recebimentos WHERE empresa_id = ${p.empresaId} AND sha256 = ${sha} AND status IN ('recebido','lendo','em_revisao','aprovado')`))[0];
  if (jaComprovante || jaVivo) {
    const r = rows(await db.execute(sql`
      INSERT INTO boloes_recebimentos (empresa_id, origem, drive_file_id, nome_original, mime, bytes, sha256, status, duplicado_de, motivo_rejeicao, criado_por)
      VALUES (${p.empresaId}, ${p.origem}, ${p.driveFileId ?? null}, ${nome}, ${tipo.mime}, ${p.buffer.length}, ${sha}, 'duplicado',
              ${jaVivo?.id ?? null}, 'Arquivo idêntico a outro já recebido.', ${p.criadoPor ?? null})
      ON CONFLICT DO NOTHING RETURNING id`))[0];
    if (r) await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "recebimento_duplicado", resultado: "ok", detalhe: `recebimento ${r.id}` });
    return { ok: true, id: r?.id ?? null, status: "duplicado", duplicadoDe: jaVivo?.id ?? null };
  }

  const key = `boloes-quarentena/${p.empresaId}/${randomUUID()}`;
  await storage.savePrivateObject(key, p.buffer, tipo.mime);
  try {
    const r = rows(await db.execute(sql`
      INSERT INTO boloes_recebimentos (empresa_id, origem, drive_file_id, nome_original, storage_key, mime, bytes, sha256, criado_por)
      VALUES (${p.empresaId}, ${p.origem}, ${p.driveFileId ?? null}, ${nome}, ${key}, ${tipo.mime}, ${p.buffer.length}, ${sha}, ${p.criadoPor ?? null})
      ON CONFLICT DO NOTHING RETURNING id`))[0];
    if (!r) {
      await storage.deletePrivateObject(key).catch(() => undefined);
      return { ok: true, id: null, status: "duplicado" };
    }
    await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "recebimento_recebido", resultado: "ok", detalhe: `recebimento ${r.id} (${p.origem})` });
    return { ok: true, id: r.id as number, status: "recebido" };
  } catch (err) {
    await storage.deletePrivateObject(key).catch(() => undefined);
    throw err;
  }
}

// ---------------------------------------------------------------- quarentena: ler e casar
async function candidatosDaEmpresa(empresaId: number): Promise<Candidato[]> {
  const r = rows(await db.execute(sql`
    SELECT p.id, p.cotas, c.name AS cliente, ca.nome AS campanha, ca.concurso, to_char(ca.data_sorteio, 'YYYY-MM-DD') AS data_sorteio
      FROM boloes_participacoes p
      JOIN clients c ON c.id = p.client_id AND c.empresa_id = p.empresa_id AND c.deleted_at IS NULL
      JOIN boloes_campanhas ca ON ca.id = p.campanha_id AND ca.empresa_id = p.empresa_id
 LEFT JOIN boloes_comprovantes co ON co.participacao_id = p.id AND co.revogado_em IS NULL
     WHERE p.empresa_id = ${empresaId} AND p.status <> 'cancelada' AND co.id IS NULL`));
  return r.map((x) => ({
    participacaoId: x.id, clienteNome: x.cliente ?? "", cotas: x.cotas,
    concurso: x.concurso ?? null, dataSorteio: x.data_sorteio ?? null, campanhaNome: x.campanha,
  }));
}

export type ResultadoProcessamento =
  | { estado: "ignorado" }
  | { estado: "em_revisao"; motivos: MotivoCodigo[]; sugerida: number | null }
  | { estado: "aprovado_automatico"; comprovanteId: number };

export async function processarRecebimento(
  storage: ArmazenamentoPrivado, recebimentoId: number, leitor: LeitorRecibo,
): Promise<ResultadoProcessamento> {
  const rec = rows(await db.execute(sql`
    UPDATE boloes_recebimentos SET status = 'lendo', atualizado_em = NOW()
     WHERE id = ${recebimentoId} AND status = 'recebido' AND storage_key IS NOT NULL RETURNING *`))[0];
  if (!rec) return { estado: "ignorado" };
  const empresaId = rec.empresa_id as number;
  const revisar = async (motivos: MotivoCodigo[], extra: { lido?: ReciboLido; sugerida?: number | null; falha?: boolean }) => {
    await db.execute(sql`
      UPDATE boloes_recebimentos
         SET status = 'em_revisao', motivos = ${JSON.stringify(motivos)}::jsonb,
             extraido = ${extra.lido ? JSON.stringify(extra.lido) : null}::jsonb,
             codigo_recibo = ${extra.lido?.codigoRecibo ?? null},
             participacao_sugerida_id = ${extra.sugerida ?? null},
             tentativas = tentativas + ${extra.falha ? 1 : 0}, atualizado_em = NOW()
       WHERE id = ${recebimentoId}`);
  };

  let lido: ReciboLido;
  try {
    const bytes = await storage.readPrivateObject(rec.storage_key);
    if (bytes.length !== rec.bytes || sha256Hex(bytes) !== rec.sha256) throw new Error("integridade do arquivo da quarentena divergente");
    lido = await leitor(bytes, rec.mime, empresaId);
  } catch (err) {
    await revisar(["leitura_falhou"], { falha: true });
    await auditarBolao({ empresaId, ator: "robo", acao: "leitura_recebimento", resultado: "erro", detalhe: `recebimento ${recebimentoId}: ${(err as Error).message}` });
    return { estado: "em_revisao", motivos: ["leitura_falhou"], sugerida: null };
  }

  const casamento = casarRecibo(lido, await candidatosDaEmpresa(empresaId));
  const repetido = lido.codigoRecibo
    ? Boolean(rows(await db.execute(sql`
        SELECT 1 FROM boloes_recebimentos
         WHERE empresa_id = ${empresaId} AND id <> ${recebimentoId} AND codigo_recibo = ${lido.codigoRecibo}
           AND status IN ('recebido','lendo','em_revisao','aprovado') LIMIT 1`))[0])
    : false;
  const motivos = new Set<MotivoCodigo>(casamento.motivos);
  if (!lido.pareceReciboCaixa) motivos.add("nao_parece_recibo_caixa");
  if (lido.confianca < 0.7) motivos.add("confianca_baixa");
  if (repetido) motivos.add("codigo_repetido");
  await revisar([...motivos], { lido, sugerida: casamento.sugerida });
  await auditarBolao({ empresaId, ator: "robo", acao: "leitura_recebimento", resultado: "ok", detalhe: `recebimento ${recebimentoId}: ${motivos.size ? [...motivos].join(",") : "sem pendencias"}` });

  const cfg = await lerConfig(empresaId);
  if (cfg.autoAprovar && casamento.sugerida !== null) {
    const auto = podeAprovarAutomaticamente(lido, casamento, repetido);
    if (auto.ok) {
      const r = await aprovarRecebimento(storage, { empresaId, recebimentoId, participacaoId: casamento.sugerida, ator: { texto: "robo:aprovacao-automatica", profissionalId: null } });
      if (r.ok) return { estado: "aprovado_automatico", comprovanteId: r.comprovanteId };
    }
  }
  return { estado: "em_revisao", motivos: [...motivos], sugerida: casamento.sugerida };
}

// ---------------------------------------------------------------- quarentena: decidir
export async function aprovarRecebimento(
  storage: ArmazenamentoPrivado,
  p: { empresaId: number; recebimentoId: number; participacaoId: number; ator: Ator },
): Promise<ResultadoAnexo | { ok: false; motivo: "recebimento_inexistente" | "recebimento_indisponivel" }> {
  const rec = rows(await db.execute(sql`
    SELECT id, status, storage_key, mime, bytes, sha256 FROM boloes_recebimentos
     WHERE id = ${p.recebimentoId} AND empresa_id = ${p.empresaId}`))[0];
  if (!rec) return { ok: false, motivo: "recebimento_inexistente" };
  if (rec.status !== "em_revisao" || !rec.storage_key) return { ok: false, motivo: "recebimento_indisponivel" };
  return anexarComprovante(storage, {
    empresaId: p.empresaId, participacaoId: p.participacaoId, ator: p.ator, recebimentoId: p.recebimentoId,
    origem: { existente: { storageKey: rec.storage_key, mime: rec.mime, bytes: rec.bytes, sha256: rec.sha256 } },
  });
}

export async function rejeitarRecebimento(p: { empresaId: number; recebimentoId: number; motivo: string; ator: Ator }): Promise<boolean> {
  const r = rows(await db.execute(sql`
    UPDATE boloes_recebimentos
       SET status = 'rejeitado', motivo_rejeicao = ${p.motivo.slice(0, 300)}, decidido_por = ${p.ator.texto}, decidido_em = NOW(), atualizado_em = NOW()
     WHERE id = ${p.recebimentoId} AND empresa_id = ${p.empresaId} AND status = 'em_revisao' RETURNING id`))[0];
  if (!r) return false;
  await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "recebimento_rejeitado", resultado: "ok", detalhe: `recebimento ${p.recebimentoId}: ${p.motivo}` });
  return true;
}

/** Devolve ao robo um recebimento que ficou em revisao por falha de leitura. */
export async function reprocessarRecebimento(p: { empresaId: number; recebimentoId: number; ator: Ator }): Promise<boolean> {
  const r = rows(await db.execute(sql`
    UPDATE boloes_recebimentos SET status = 'recebido', atualizado_em = NOW()
     WHERE id = ${p.recebimentoId} AND empresa_id = ${p.empresaId} AND status = 'em_revisao' AND storage_key IS NOT NULL RETURNING id`))[0];
  if (r) await auditarBolao({ empresaId: p.empresaId, ator: p.ator.texto, acao: "recebimento_reprocessar", resultado: "ok", detalhe: `recebimento ${p.recebimentoId}` });
  return Boolean(r);
}

// ---------------------------------------------------------------- corrigir associacoes
export type ResultadoCorrecao =
  | { ok: true }
  | { ok: false; motivo: "inexistente" | "destino_invalido" | "destino_ocupado" | "mesmo_destino" };

export async function reassociarComprovante(p: { empresaId: number; comprovanteId: number; destinoId: number; motivo: string; ator: Ator }): Promise<ResultadoCorrecao> {
  return db.transaction(async (tx) => {
    const co = rows(await tx.execute(sql`
      SELECT id, participacao_id FROM boloes_comprovantes
       WHERE id = ${p.comprovanteId} AND empresa_id = ${p.empresaId} AND revogado_em IS NULL`))[0];
    if (!co) return { ok: false, motivo: "inexistente" } as const;
    if (co.participacao_id === p.destinoId) return { ok: false, motivo: "mesmo_destino" } as const;
    // Trava as duas participacoes sempre em ordem crescente de id (sem deadlock entre gestores).
    const ids = [co.participacao_id as number, p.destinoId].sort((a, b) => a - b);
    const travadas = rows(await tx.execute(sql`
      SELECT id, empresa_id, client_id, status FROM boloes_participacoes WHERE id IN (${ids[0]}, ${ids[1]}) ORDER BY id FOR UPDATE`));
    const origem = travadas.find((x) => x.id === co.participacao_id);
    const destino = travadas.find((x) => x.id === p.destinoId);
    if (!origem || !destino || destino.empresa_id !== p.empresaId || destino.status === "cancelada") return { ok: false, motivo: "destino_invalido" } as const;
    const ocupado = rows(await tx.execute(sql`SELECT 1 FROM boloes_comprovantes WHERE participacao_id = ${p.destinoId} AND revogado_em IS NULL`))[0];
    if (ocupado) return { ok: false, motivo: "destino_ocupado" } as const;
    await tx.execute(sql`UPDATE boloes_comprovantes SET participacao_id = ${p.destinoId} WHERE id = ${p.comprovanteId}`);
    if (origem.status !== "cancelada") {
      await tx.execute(sql`UPDATE boloes_participacoes SET status = 'pendente_registro', registrada_em = NULL WHERE id = ${origem.id}`);
    }
    await tx.execute(sql`UPDATE boloes_participacoes SET status = 'registrada', registrada_em = NOW() WHERE id = ${destino.id}`);
    const detalhe = `de participacao ${origem.id} para ${destino.id}: ${p.motivo}`;
    await auditarBolao({ empresaId: p.empresaId, clientId: origem.client_id, ator: p.ator.texto, acao: "comprovante_reassociado", participacaoId: origem.id, comprovanteId: p.comprovanteId, resultado: "ok", detalhe }, tx);
    await auditarBolao({ empresaId: p.empresaId, clientId: destino.client_id, ator: p.ator.texto, acao: "comprovante_reassociado", participacaoId: destino.id, comprovanteId: p.comprovanteId, resultado: "ok", detalhe }, tx);
    return { ok: true } as const;
  });
}

export async function revogarComprovante(p: { empresaId: number; comprovanteId: number; motivo: string; ator: Ator }): Promise<ResultadoCorrecao> {
  return db.transaction(async (tx) => {
    const co = rows(await tx.execute(sql`
      SELECT co.id, co.participacao_id, co.recebimento_id, pa.client_id, pa.status
        FROM boloes_comprovantes co JOIN boloes_participacoes pa ON pa.id = co.participacao_id
       WHERE co.id = ${p.comprovanteId} AND co.empresa_id = ${p.empresaId} AND co.revogado_em IS NULL FOR UPDATE OF co`))[0];
    if (!co) return { ok: false, motivo: "inexistente" } as const;
    await tx.execute(sql`UPDATE boloes_comprovantes SET revogado_em = NOW() WHERE id = ${p.comprovanteId}`);
    if (co.status !== "cancelada") {
      await tx.execute(sql`UPDATE boloes_participacoes SET status = 'pendente_registro', registrada_em = NULL WHERE id = ${co.participacao_id}`);
    }
    if (co.recebimento_id) {
      // O arquivo volta para a fila: o gestor pode aprova-lo para a participacao correta.
      await tx.execute(sql`
        UPDATE boloes_recebimentos
           SET status = 'em_revisao', comprovante_id = NULL, participacao_sugerida_id = NULL,
               motivos = '["revogado"]'::jsonb, decidido_por = NULL, decidido_em = NULL, atualizado_em = NOW()
         WHERE id = ${co.recebimento_id} AND empresa_id = ${p.empresaId} AND comprovante_id = ${p.comprovanteId}`);
    }
    await auditarBolao({ empresaId: p.empresaId, clientId: co.client_id, ator: p.ator.texto, acao: "comprovante_revogado", participacaoId: co.participacao_id, comprovanteId: p.comprovanteId, resultado: "ok", detalhe: p.motivo }, tx);
    return { ok: true } as const;
  });
}

export type StatusPagamento = "nao_informado" | "pendente" | "confirmado";
export async function definirPagamento(p: { empresaId: number; participacaoId: number; status: StatusPagamento; ator: Ator }): Promise<boolean> {
  return db.transaction(async (tx) => {
    const antes = rows(await tx.execute(sql`
      SELECT client_id, pagamento_status FROM boloes_participacoes WHERE id = ${p.participacaoId} AND empresa_id = ${p.empresaId} FOR UPDATE`))[0];
    if (!antes) return false;
    await tx.execute(sql`
      UPDATE boloes_participacoes SET pagamento_status = ${p.status}, pagamento_atualizado_em = NOW(), pagamento_atualizado_por = ${p.ator.profissionalId}
       WHERE id = ${p.participacaoId}`);
    await auditarBolao({ empresaId: p.empresaId, clientId: antes.client_id, ator: p.ator.texto, acao: "pagamento_informado", participacaoId: p.participacaoId, resultado: "ok", detalhe: `${antes.pagamento_status} -> ${p.status}` }, tx);
    return true;
  });
}

// ---------------------------------------------------------------- consultas do gestor
export interface RecebimentoDto {
  id: number; origem: "manual" | "drive"; nomeOriginal: string | null; mime: string | null; bytes: number | null;
  status: string; motivos: Array<{ codigo: string; texto: string }>; codigoRecibo: string | null;
  extraido: { concurso: string | null; dataSorteio: string | null; cotas: number | null; valor: number | null; nomeImpresso: string | null; emissor: string | null; confianca: number } | null;
  sugerida: { participacaoId: number; cliente: string; campanha: string; cotas: number } | null;
  criadoEm: string; decididoPor: string | null; motivoRejeicao: string | null; duplicadoDe: number | null; temArquivo: boolean;
}

export async function listarRecebimentos(empresaId: number, status: string[] | null, limite = 100): Promise<RecebimentoDto[]> {
  const filtro = status && status.length ? sql`AND r.status IN (${sql.join(status.map((s) => sql`${s}`), sql`, `)})` : sql``;
  const r = rows(await db.execute(sql`
    SELECT r.id, r.origem, r.nome_original, r.mime, r.bytes, r.status, r.motivos, r.codigo_recibo, r.extraido, r.criado_em,
           r.decidido_por, r.motivo_rejeicao, r.duplicado_de, (r.storage_key IS NOT NULL) AS tem_arquivo,
           p.id AS part_id, p.cotas AS part_cotas, c.name AS cliente, ca.nome AS campanha
      FROM boloes_recebimentos r
 LEFT JOIN boloes_participacoes p ON p.id = r.participacao_sugerida_id AND p.empresa_id = r.empresa_id
 LEFT JOIN clients c ON c.id = p.client_id
 LEFT JOIN boloes_campanhas ca ON ca.id = p.campanha_id
     WHERE r.empresa_id = ${empresaId} ${filtro}
     ORDER BY CASE r.status WHEN 'em_revisao' THEN 0 WHEN 'recebido' THEN 1 WHEN 'lendo' THEN 1 ELSE 2 END, r.criado_em DESC, r.id DESC
     LIMIT ${limite}`));
  return r.map((x) => {
    const ex = x.extraido as Record<string, any> | null;
    return {
      id: x.id, origem: x.origem, nomeOriginal: x.nome_original, mime: x.mime, bytes: x.bytes, status: x.status,
      motivos: ((x.motivos ?? []) as string[]).map((codigo) => ({ codigo, texto: (MOTIVO_TEXTO as Record<string, string>)[codigo] ?? codigo })),
      codigoRecibo: x.codigo_recibo,
      extraido: ex ? { concurso: ex.concurso ?? null, dataSorteio: ex.dataSorteio ?? null, cotas: ex.cotas ?? null, valor: ex.valor ?? null, nomeImpresso: ex.nomeImpresso ?? null, emissor: ex.emissor ?? null, confianca: ex.confianca ?? 0 } : null,
      sugerida: x.part_id ? { participacaoId: x.part_id, cliente: x.cliente ?? "", campanha: x.campanha ?? "", cotas: x.part_cotas } : null,
      criadoEm: new Date(x.criado_em).toISOString(), decididoPor: x.decidido_por, motivoRejeicao: x.motivo_rejeicao,
      duplicadoDe: x.duplicado_de, temArquivo: x.tem_arquivo,
    };
  });
}

export async function recebimentoParaVer(empresaId: number, id: number) {
  const r = rows(await db.execute(sql`SELECT id, storage_key, mime, bytes, sha256 FROM boloes_recebimentos WHERE id = ${id} AND empresa_id = ${empresaId} AND storage_key IS NOT NULL`))[0];
  return r ? { id: r.id as number, storageKey: r.storage_key as string, mime: r.mime as string, bytes: r.bytes as number, sha256: r.sha256 as string } : null;
}

export type EntregaEstado = "indisponivel" | "disponivel" | "baixado";

export async function listarParticipacoesGestor(empresaId: number, limite = 300) {
  const r = rows(await db.execute(sql`
    SELECT p.id, p.cotas, p.status, p.pagamento_status, p.registrada_em, p.client_id, c.name AS cliente,
           ca.id AS campanha_id, ca.nome AS campanha, ca.concurso, to_char(ca.data_sorteio, 'YYYY-MM-DD') AS data_sorteio,
           co.id AS comp_id, co.mime AS comp_mime,
           (SELECT MAX(a.criado_em) FROM boloes_auditoria a WHERE a.comprovante_id = co.id AND a.acao = 'download' AND a.resultado = 'ok') AS baixado_em
      FROM boloes_participacoes p
      JOIN clients c ON c.id = p.client_id
      JOIN boloes_campanhas ca ON ca.id = p.campanha_id
 LEFT JOIN boloes_comprovantes co ON co.participacao_id = p.id AND co.revogado_em IS NULL
     WHERE p.empresa_id = ${empresaId}
     ORDER BY p.criado_em DESC, p.id DESC LIMIT ${limite}`));
  return r.map((x) => {
    const registro = x.status === "cancelada" ? "cancelada" : x.status === "registrada" && x.comp_id ? "registrada" : "pendente_registro";
    const entrega: EntregaEstado = !x.comp_id || x.status === "cancelada" ? "indisponivel" : x.baixado_em ? "baixado" : "disponivel";
    return {
      id: x.id as number, cliente: { id: x.client_id as number, nome: (x.cliente ?? "") as string },
      campanha: { id: x.campanha_id as number, nome: x.campanha as string, concurso: (x.concurso ?? null) as string | null, dataSorteio: (x.data_sorteio ?? null) as string | null },
      cotas: x.cotas as number, pagamento: x.pagamento_status as StatusPagamento, registro: registro as string, entrega,
      comprovante: x.comp_id ? { id: x.comp_id as number, tipo: x.comp_mime === "application/pdf" ? "pdf" : "imagem" } : null,
    };
  });
}

export async function listarCampanhas(empresaId: number) {
  return rows(await db.execute(sql`
    SELECT id, nome, concurso, to_char(data_sorteio, 'YYYY-MM-DD') AS data_sorteio, status, valor_cota_centavos, cotas_total,
           escolha_jogos, modalidade, dezenas_por_jogo, universo_max, jogos_por_cota, regras_texto
      FROM boloes_campanhas
     WHERE empresa_id = ${empresaId} ORDER BY criado_em DESC, id DESC LIMIT 100`))
    .map((x) => ({
      id: x.id as number, nome: x.nome as string, concurso: (x.concurso ?? null) as string | null, dataSorteio: (x.data_sorteio ?? null) as string | null,
      status: x.status as "rascunho" | "aberto" | "encerrado", valorCotaCentavos: (x.valor_cota_centavos ?? null) as number | null,
      cotasTotal: (x.cotas_total ?? null) as number | null, escolhaJogos: x.escolha_jogos as "clinica" | "participante",
      modalidade: (x.modalidade ?? null) as string | null, dezenasPorJogo: (x.dezenas_por_jogo ?? null) as number | null,
      universoMax: x.universo_max as number, jogosPorCota: x.jogos_por_cota as number, regrasTexto: (x.regras_texto ?? null) as string | null,
    }));
}

export async function listarAuditoria(empresaId: number, limite = 100) {
  return rows(await db.execute(sql`
    SELECT id, ator, acao, resultado, detalhe, participacao_id, comprovante_id, criado_em FROM boloes_auditoria
     WHERE empresa_id = ${empresaId} ORDER BY id DESC LIMIT ${limite}`))
    .map((x) => ({
      id: x.id as number, ator: x.ator as string, acao: x.acao as string, resultado: x.resultado as string, detalhe: (x.detalhe ?? null) as string | null,
      participacaoId: (x.participacao_id ?? null) as number | null, comprovanteId: (x.comprovante_id ?? null) as number | null,
      criadoEm: new Date(x.criado_em).toISOString(),
    }));
}

export async function resumoGestor(empresaId: number) {
  const rec = rows(await db.execute(sql`SELECT status, COUNT(*)::int AS n FROM boloes_recebimentos WHERE empresa_id = ${empresaId} GROUP BY status`));
  const part = rows(await db.execute(sql`
    SELECT COUNT(*) FILTER (WHERE p.status <> 'cancelada')::int AS total,
           COUNT(*) FILTER (WHERE p.status <> 'cancelada' AND co.id IS NULL)::int AS sem_comprovante,
           COUNT(*) FILTER (WHERE p.status <> 'cancelada' AND p.pagamento_status <> 'confirmado')::int AS pagamento_em_aberto
      FROM boloes_participacoes p
 LEFT JOIN boloes_comprovantes co ON co.participacao_id = p.id AND co.revogado_em IS NULL
     WHERE p.empresa_id = ${empresaId}`))[0];
  const porStatus: Record<string, number> = {};
  for (const x of rec) porStatus[x.status] = x.n;
  return {
    recebimentos: porStatus,
    participacoes: { total: part?.total ?? 0, semComprovante: part?.sem_comprovante ?? 0, pagamentoEmAberto: part?.pagamento_em_aberto ?? 0 },
  };
}
