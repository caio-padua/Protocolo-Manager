/**
 * Porteiro de identidade: roda DEPOIS da extração e ANTES de qualquer gravação em exam_results.
 * Veredito diferente de "confirmada" => documento em quarentena, sem resultados no prontuário.
 * Liberação ou rejeição humana ficam em registro append-only (exam_identity_checks).
 */
import { db, clientsTable, examDocumentsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { assessIdentity, maskCpf, type IdentityAssessment } from "./identity-check.js";
import { detectEvidenceConflicts } from "./identity-evidence.js";
import { getActiveRules, loadKnownAliases, recordAlias } from "./identity-rules-store.js";
import type { ExtractedExam } from "./schema.js";

export interface IdentityGateInput {
  /** Quando as leituras de IA divergem sobre o paciente: retém o documento, qualquer que seja o resto. */
  forceQuarantineReason?: string;
  documentId: number;
  clientId: number;
  extracted: ExtractedExam;
  modelUsed: string;
  pipeline: unknown[];
  /** Texto do laudo (quando o importador o tem): alimenta o detector de dois pacientes. */
  evidenceText?: string | null;
}

export interface IdentityGateResult {
  quarantined: boolean;
  assessment: IdentityAssessment;
  empresaId: number | null;
  ruleSetVersion: number;
}

/** Guarda o que é preciso para incorporar depois da liberação, sem nova chamada de modelo. */
export interface QuarantinePayload {
  extracted: ExtractedExam;
  modelUsed: string;
  pipeline: unknown[];
}

export async function runIdentityGate(input: IdentityGateInput): Promise<IdentityGateResult> {
  const [client] = await db
    .select({
      id: clientsTable.id,
      name: clientsTable.name,
      cpf: clientsTable.cpf,
      birthDate: clientsTable.birthDate,
      empresaId: clientsTable.empresaId,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, input.clientId))
    .limit(1);
  const [doc] = await db
    .select({ empresaId: examDocumentsTable.empresaId })
    .from(examDocumentsTable)
    .where(eq(examDocumentsTable.id, input.documentId))
    .limit(1);

  const empresaId = client?.empresaId ?? doc?.empresaId ?? null;
  const active = await getActiveRules(empresaId);
  let assessment: IdentityAssessment;
  if (!client) {
    assessment = {
      verdict: "contradicao",
      decision: "quarentena",
      fields: { cpf: "ausente", name: "ausente", birthDate: "ausente" },
      reasons: ["Cliente do documento não encontrado no cadastro."],
      trail: ["Cliente do documento não encontrado no cadastro."],
      nameVariants: [],
      aliasToRecord: null,
    };
  } else {
    const knownAliases = empresaId == null ? [] : await loadKnownAliases(empresaId, client.id);
    const evidence = detectEvidenceConflicts({
      text: input.evidenceText,
      collectionDate: input.extracted.collectionDate,
      registeredBirthDate: client.birthDate,
    });
    assessment = assessIdentity(input.extracted.patient ?? {}, client, { rules: active.rules, knownAliases, evidence });
    if (active.degraded) {
      assessment.trail.unshift(`Regras da clínica (versão ${active.version}) ilegíveis: aplicado o modo mais rígido.`);
    }
    if (doc?.empresaId != null && client.empresaId != null && doc.empresaId !== client.empresaId) {
      assessment = {
        ...assessment,
        verdict: "contradicao",
        decision: "quarentena",
        aliasToRecord: null,
        reasons: ["A clínica do documento difere da clínica do cliente.", ...assessment.reasons],
      };
    }
  }

  if (input.forceQuarantineReason) {
    assessment = {
      ...assessment,
      verdict: "contradicao",
      decision: "quarentena",
      aliasToRecord: null,
      reasons: [input.forceQuarantineReason, ...assessment.reasons],
      trail: [input.forceQuarantineReason, ...assessment.trail],
    };
  }
  const quarantined = assessment.verdict !== "confirmada" || empresaId == null;
  // Registrado como "preliminar" só quando há clínica; nos demais casos retidos, "quarentena".
  const decision = !quarantined ? assessment.decision : assessment.decision === "preliminar" && empresaId != null ? "preliminar" : "quarentena";
  const payload: QuarantinePayload = {
    extracted: input.extracted,
    modelUsed: input.modelUsed,
    pipeline: input.pipeline,
  };

  // Somente o que não foi confirmado guarda o conteúdo extraído (acesso restrito a esta tabela).
  await db.execute(sql`
    INSERT INTO exam_identity_checks
      (document_id, empresa_id, client_id, event, verdict, field_results, reasons, extracted_json, extracted_cpf_masked,
       decision, rule_set_version, trail)
    VALUES
      (${input.documentId}, ${empresaId ?? 0}, ${input.clientId}, 'verificacao', ${quarantined && assessment.verdict === "confirmada" ? "revisao" : assessment.verdict},
       ${JSON.stringify(assessment.fields)}::jsonb,
       ${JSON.stringify(empresaId == null ? [...assessment.reasons, "Cliente sem clínica definida."] : assessment.reasons)}::jsonb,
       ${quarantined ? JSON.stringify(payload) : null}::jsonb,
       ${maskCpf(input.extracted.patient?.cpf)},
       ${decision}, ${active.version}, ${JSON.stringify(assessment.trail)}::jsonb)
    ON CONFLICT (document_id) WHERE event = 'verificacao' DO NOTHING
  `);

  if (quarantined) {
    // Atualização condicional: só documento ainda sem leitura incorporada entra em quarentena
    // ("processando" no fluxo do portal; "recebido" sem resultados nos importadores do Drive).
    // Documento ainda sem leitura incorporada entra em quarentena como antes. Documento que JÁ tem
    // resultados também sai de "recebido" quando a verificação gravada é contraditória: os resultados
    // ficam preservados (nada é apagado nem movido) e só a liberação humana os torna visíveis de novo.
    await db.execute(sql`
      UPDATE exam_documents SET status = 'quarentena'
      WHERE id = ${input.documentId}
        AND (
          (status IN ('processando', 'recebido')
            AND NOT EXISTS (SELECT 1 FROM exam_results r WHERE r.exam_document_id = ${input.documentId}))
          OR (status IN ('recebido', 'conferido_1')
            AND EXISTS (
              SELECT 1 FROM exam_identity_checks c
              WHERE c.document_id = ${input.documentId} AND c.event = 'verificacao' AND c.verdict IN ('contradicao', 'revisao')
            ))
        )
    `);
  }
  if (!quarantined && assessment.decision === "incorporar_com_alias" && assessment.aliasToRecord && empresaId != null) {
    await recordAlias({
      empresaId,
      clientId: input.clientId,
      alias: assessment.aliasToRecord,
      kinds: assessment.nameVariants,
      documentId: input.documentId,
    });
  }
  return { quarantined, assessment, empresaId, ruleSetVersion: active.version };
}

export interface QuarantinedDocument {
  documentId: number;
  clientId: number;
  empresaId: number;
  verdict: "revisao" | "contradicao";
  reasons: string[];
  payload: QuarantinePayload | null;
  decision: "quarentena" | "preliminar";
  ruleSetVersion: number | null;
  trail: string[];
}

export async function loadQuarantine(documentId: number): Promise<QuarantinedDocument | null> {
  const result = await db.execute(sql`
    SELECT document_id, client_id, empresa_id, verdict, reasons, extracted_json, decision, rule_set_version, trail
    FROM exam_identity_checks
    WHERE document_id = ${documentId} AND event = 'verificacao'
    LIMIT 1
  `);
  const row = (result as unknown as { rows: Array<Record<string, any>> }).rows[0];
  if (!row || row.verdict === "confirmada") return null;
  return {
    documentId: Number(row.document_id),
    clientId: Number(row.client_id),
    empresaId: Number(row.empresa_id),
    verdict: row.verdict,
    reasons: Array.isArray(row.reasons) ? row.reasons : [],
    payload: row.extracted_json ?? null,
    decision: row.decision === "preliminar" ? "preliminar" : "quarentena",
    ruleSetVersion: row.rule_set_version == null ? null : Number(row.rule_set_version),
    trail: Array.isArray(row.trail) ? row.trail : [],
  };
}

export type ClaimResult = "claimed" | "not_in_quarantine";

/** Reivindica o documento em quarentena: apenas uma chamada concorrente vence. */
export async function claimQuarantine(documentId: number, next: "processando" | "identidade_rejeitada" | "recebido"): Promise<ClaimResult> {
  const result = await db.execute(sql`
    UPDATE exam_documents SET status = ${next}
    WHERE id = ${documentId} AND status = 'quarentena'
    RETURNING id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length > 0 ? "claimed" : "not_in_quarantine";
}

export async function revertClaim(documentId: number): Promise<void> {
  await db.execute(sql`UPDATE exam_documents SET status = 'quarentena' WHERE id = ${documentId} AND status = 'processando'`);
}

export async function recordHumanDecision(input: {
  documentId: number;
  empresaId: number;
  clientId: number;
  event: "liberacao_humana" | "rejeicao_humana";
  professionalId: number;
  note: string;
}): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO exam_identity_checks (document_id, empresa_id, client_id, event, professional_id, note)
    VALUES (${input.documentId}, ${input.empresaId}, ${input.clientId}, ${input.event}, ${input.professionalId}, ${input.note})
    ON CONFLICT (document_id) WHERE event IN ('liberacao_humana', 'rejeicao_humana') DO NOTHING
    RETURNING id
  `);
  return (result as unknown as { rows: unknown[] }).rows.length > 0;
}
