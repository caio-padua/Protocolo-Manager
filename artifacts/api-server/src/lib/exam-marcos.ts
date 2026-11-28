/**
 * Marcos do envio de exame mostrados ao paciente (SPEC 3, adendo de 16/11/2026).
 * Regra: etapa só aparece CONCLUÍDA com evidência gravada; nunca por inferência de um status global.
 * Funções puras (testáveis) + gravação best-effort (falha em registrar o marco nunca derruba o processamento).
 */
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type MarcoGravado = "leitura_preliminar" | "dados_extraidos" | "processamento";
export type EstadoMarco = "executando" | "concluido" | "falhou";
export type EstadoEtapa = "pendente" | "executando" | "concluido" | "falhou";

export async function registrarMarcoExame(documentId: number, marco: MarcoGravado, estado: EstadoMarco, detalhe?: Record<string, unknown>): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO exam_document_marcos (document_id, marco, estado, detalhe)
      VALUES (${documentId}, ${marco}, ${estado}, ${detalhe ? JSON.stringify(detalhe) : null}::jsonb)
    `);
  } catch (err) {
    console.error(`[ExamMarcos] doc ${documentId}: não foi possível registrar ${marco}/${estado}: ${(err as Error).message}`);
  }
}

export interface EntradaMarcos {
  status: string;
  createdAt: Date | string;
  conf1At: Date | string | null;
  conf2At: Date | string | null;
  analitos: number;
  /** Último registro de cada marco gravado. */
  marcos: Partial<Record<MarcoGravado, { estado: EstadoMarco; em: Date | string }>>;
  /** Registros imutáveis da verificação de identidade (no máximo um por evento). */
  identidade: {
    verificacao?: { verdict: string | null; em: Date | string; ruleSetVersion: number | null };
    liberacaoHumana?: { em: Date | string };
    rejeicaoHumana?: { em: Date | string };
  };
}

export interface EtapaEnvio {
  chave: "arquivo_recebido" | "leitura_preliminar" | "dados_extraidos" | "identidade_validada" | "revisao_c1" | "revisao_c2";
  rotulo: string;
  estado: EstadoEtapa;
  em: string | null;
  /** Texto curto e seguro para o paciente (sem nome de profissional, CPF ou conteúdo clínico). */
  metodo: string | null;
}

export interface MarcosEnvio {
  etapas: EtapaEnvio[];
  percentual: number;
  concluidas: number;
  total: number;
  /** Rótulo neutro: não há mecanismo de backend comprovado para esta etapa; nunca conta no percentual. */
  etapaAvancada: { rotulo: string; estado: "pendente" };
}

const iso = (v: Date | string | null | undefined): string | null => (v ? new Date(v).toISOString() : null);

export function montarMarcosEnvio(e: EntradaMarcos): MarcosEnvio {
  const erro = e.status === "erro";
  const registrada = (m: MarcoGravado, rotulo: string, chave: EtapaEnvio["chave"]): EtapaEnvio => {
    const r = e.marcos[m];
    if (r?.estado === "concluido") return { chave, rotulo, estado: "concluido", em: iso(r.em), metodo: "Registrado no processamento" };
    if (r?.estado === "executando") return { chave, rotulo, estado: erro ? "falhou" : "executando", em: iso(r.em), metodo: null };
    if (r?.estado === "falhou") return { chave, rotulo, estado: "falhou", em: iso(r.em), metodo: null };
    // Sem marco gravado: só há prova se existirem resultados gravados (envio anterior ao rastreio).
    if (e.analitos > 0) return { chave, rotulo, estado: "concluido", em: null, metodo: "Envio anterior ao rastreio: resultados gravados" };
    if (erro) return { chave, rotulo, estado: "falhou", em: null, metodo: null };
    return { chave, rotulo, estado: "pendente", em: null, metodo: null };
  };

  const recebido: EtapaEnvio = { chave: "arquivo_recebido", rotulo: "Arquivo recebido", estado: "concluido", em: iso(e.createdAt), metodo: "Arquivo guardado" };
  const leitura = registrada("leitura_preliminar", "Leitura preliminar", "leitura_preliminar");
  const dados = registrada("dados_extraidos", "Dados extraídos", "dados_extraidos");

  let identidade: EtapaEnvio;
  const id = e.identidade;
  const rotuloId = "Identificação validada";
  if (id.rejeicaoHumana || e.status === "identidade_rejeitada") {
    identidade = { chave: "identidade_validada", rotulo: rotuloId, estado: "falhou", em: iso(id.rejeicaoHumana?.em ?? null), metodo: "Não confirmada pela equipe" };
  } else if (id.liberacaoHumana) {
    identidade = { chave: "identidade_validada", rotulo: rotuloId, estado: "concluido", em: iso(id.liberacaoHumana.em), metodo: "Confirmada pela equipe" };
  } else if (id.verificacao?.verdict === "confirmada") {
    identidade = { chave: "identidade_validada", rotulo: rotuloId, estado: "concluido", em: iso(id.verificacao.em), metodo: "Conferência automática de nome, CPF e nascimento" };
  } else if (id.verificacao) {
    identidade = { chave: "identidade_validada", rotulo: rotuloId, estado: "pendente", em: iso(id.verificacao.em), metodo: "Aguardando conferência da equipe" };
  } else {
    identidade = { chave: "identidade_validada", rotulo: rotuloId, estado: "pendente", em: null, metodo: e.status === "processando" ? null : "Sem registro de verificação" };
  }

  const c1Feita = e.conf1At != null;
  const revisaoC1: EtapaEnvio = c1Feita
    ? { chave: "revisao_c1", rotulo: "Revisão C1", estado: "concluido", em: iso(e.conf1At), metodo: "Conferência operacional pela equipe" }
    : { chave: "revisao_c1", rotulo: "Revisão C1", estado: "pendente", em: null, metodo: e.status === "conferido" ? "Sem registro de C1 (envio anterior)" : null };

  // C2 só existe em status "conferido": a rota de conferência exige médico ativo e C1 prévio (nextExamReviewStatus).
  const c2Feita = e.status === "conferido";
  const revisaoC2: EtapaEnvio = c2Feita
    ? { chave: "revisao_c2", rotulo: "Revisão C2", estado: "concluido", em: iso(e.conf2At), metodo: e.conf2At ? "Conferência clínica pelo médico" : "Conferência clínica (registro anterior)" }
    : { chave: "revisao_c2", rotulo: "Revisão C2", estado: "pendente", em: null, metodo: null };

  const etapas = [recebido, leitura, dados, identidade, revisaoC1, revisaoC2];
  const concluidas = etapas.filter((x) => x.estado === "concluido").length;
  // 100% exige as seis etapas com evidência E status final real.
  const percentual = concluidas === etapas.length && c2Feita ? 100 : Math.min(99, Math.round((concluidas / etapas.length) * 100));
  return { etapas, percentual, concluidas, total: etapas.length, etapaAvancada: { rotulo: "Cérebro e sinapses (medicina de alta precisão) — configuração pendente", estado: "pendente" } };
}
