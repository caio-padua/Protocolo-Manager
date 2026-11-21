import { useState } from "react";
import { Lock, Plus, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AnamneseQuestion } from "@workspace/api-client-react";
import type { Valor } from "./types";

/** Nome (1), CPF (2) e idade (41): vem do cadastro, nunca sao perguntas de evolucao. */
export const IDENTIDADE_IDS = [1, 2, 41];
/** Sexo biologico (A04): nao se muda. Se o cadastro ja tem, a pergunta some e vale o cadastro. */
export const SEXO_ID = 42;
/** Pergunta de texto livre onde o cliente ACRESCENTA nova cirurgia (id real do questionario). */
const ID_OUTRA_CIRURGIA = 315;

export interface Retorno {
  identidade: { nome: string | null; cpfMascarado: string | null; dataNascimento: string | null; idade: number | null; sexoBiologico?: "M" | "F" | null } | null;
  bloqueados: Record<string, Record<string, unknown>>;
  correcoes: Array<{ id: number; questionRowId: number; texto: string; status: string }>;
}

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const GOLD = "#c9a24e";

function formatar(v: Record<string, unknown>): string {
  switch (v.tipo) {
    case "multi": return Array.isArray(v.selecionados) ? v.selecionados.join(", ") : "—";
    case "texto": return String(v.texto ?? "—");
    case "boolean": return v.bool ? "Sim" : "Não";
    case "single": return String(v.opcao ?? "—");
    default: return "—";
  }
}
const temFato = (v: Record<string, unknown>) => {
  const t = formatar(v).normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  return !["", "—", "nao", "nenhuma", "nenhum", "nada"].includes(t) && !t.startsWith("nunca");
};

export default function RetornoPanel({ retorno, token, questions, answers, onAnswer }: {
  retorno: Retorno; token: string | null; questions: AnamneseQuestion[];
  answers: Record<number, Valor>; onAnswer: (q: AnamneseQuestion, v: Valor, opts?: { commit?: boolean }) => void;
}) {
  const [nova, setNova] = useState("");
  const [erroDe, setErroDe] = useState<number | null>(null);
  const [descricao, setDescricao] = useState("");
  const [aviso, setAviso] = useState("");
  const id = retorno.identidade;
  const itens = Object.entries(retorno.bloqueados)
    .filter(([, v]) => temFato(v))
    .map(([k, v]) => ({ rowId: Number(k), pergunta: questions.find((q) => q.id === Number(k))?.pergunta ?? "Registro anterior", texto: formatar(v) }));
  const qOutra = questions.find((q) => q.id === ID_OUTRA_CIRURGIA);
  const atualOutra = answers[ID_OUTRA_CIRURGIA];
  const textoAtual = atualOutra && atualOutra.tipo === "texto" ? atualOutra.texto : "";

  function acrescentar() {
    const t = nova.trim();
    if (!qOutra || t.length < 3) return;
    onAnswer(qOutra, { tipo: "texto", texto: textoAtual.trim() ? `${textoAtual.trim()}; ${t}` : t }, { commit: true });
    setNova(""); setAviso("Nova cirurgia acrescentada. Os registros anteriores foram mantidos.");
  }
  async function comunicar(rowId: number) {
    if (!token || descricao.trim().length < 3) return;
    const r = await fetch(`${API_BASE}/api/anamnese-v2/sessions/${token}/correcao`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ questionRowId: rowId, texto: descricao.trim() }),
    });
    setAviso(r.ok ? "Erro comunicado. Um profissional vai analisar; nada foi apagado." : "Não foi possível comunicar agora. Tente de novo.");
    if (r.ok) { setErroDe(null); setDescricao(""); }
  }

  return (
    <div className="mb-4 space-y-3" data-testid="retorno-panel">
      {id && (
        <div className="leva-card rounded-xl p-4" data-testid="retorno-identidade">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>
            <ShieldCheck className="h-4 w-4" /> Seus dados cadastrais
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Nome</dt><dd className="font-semibold">{id.nome ?? "—"}</dd>
            <dt className="text-muted-foreground">CPF</dt><dd className="font-semibold">{id.cpfMascarado ?? "—"}</dd>
            <dt className="text-muted-foreground">Sexo biológico</dt><dd className="font-semibold">{id.sexoBiologico === "M" ? "Masculino" : id.sexoBiologico === "F" ? "Feminino" : "informado uma única vez nesta anamnese"}</dd>
            <dt className="text-muted-foreground">Idade</dt><dd className="font-semibold">{id.idade != null ? `${id.idade} anos` : "calculada quando houver data de nascimento"}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Vêm do seu cadastro. Para atualizar, fale com a clínica; esta anamnese não altera cadastro.</p>
        </div>
      )}

      {itens.length > 0 && (
        <div className="leva-card rounded-xl p-4" data-testid="retorno-cirurgias">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>
            <Lock className="h-4 w-4" /> Já registrado (somente leitura)
          </div>
          <ul className="mt-2 space-y-2">
            {itens.map((i) => (
              <li key={i.rowId} className="text-sm">
                <div className="text-xs text-muted-foreground">{i.pergunta.toLowerCase()}</div>
                <div className="font-semibold">{i.texto}</div>
                {erroDe === i.rowId ? (
                  <div className="mt-1 space-y-1">
                    <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} placeholder="Descreva o que está errado" className="w-full rounded-md border border-border bg-background p-2 text-sm" data-testid="retorno-erro-texto" />
                    <div className="flex gap-2">
                      <button type="button" className="btn-3d rounded-md px-3 py-1.5 text-xs font-bold uppercase" onClick={() => void comunicar(i.rowId)} data-testid="retorno-erro-enviar">Enviar ao profissional</button>
                      <button type="button" className="btn-3d-soft rounded-md px-3 py-1.5 text-xs font-bold uppercase" onClick={() => setErroDe(null)}>Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs underline" onClick={() => { setErroDe(i.rowId); setDescricao(""); }} data-testid="retorno-erro-abrir">
                    <TriangleAlert className="h-3 w-3" /> Comunicar erro
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(itens.length > 0 || Object.keys(retorno.bloqueados).length > 0) && qOutra && (
        <div className="leva-card rounded-xl p-4">
          <div className="text-[11px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>Fez outra cirurgia desde a última vez?</div>
          <div className="mt-2 flex gap-2">
            <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Qual cirurgia e em que ano?" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-2 text-sm" data-testid="retorno-nova-cirurgia" />
            <button type="button" onClick={acrescentar} className="btn-3d inline-flex items-center gap-1 rounded-md px-3 py-2 text-xs font-bold uppercase" data-testid="retorno-acrescentar"><Plus className="h-3.5 w-3.5" /> Acrescentar</button>
          </div>
        </div>
      )}
      {aviso && <p className="text-xs" role="status" data-testid="retorno-aviso">{aviso}</p>}
    </div>
  );
}
