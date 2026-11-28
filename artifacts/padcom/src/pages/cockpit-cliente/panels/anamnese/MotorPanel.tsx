import { useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import { api, MUDO, NAVY, OURO } from "./util";

type Motor = {
  natureza: string; sessaoConcluida: boolean; escoreTotal: number; gradeGlobal: string; redFlag: boolean;
  alarmes: { perguntaId: string; pergunta: string }[]; examesSugeridos: string[];
  regrasDisparadas: { regra: string; perguntaId: string; questionRowId: number | null; gatilho: string | null; valorRecebido: string | number; alvo: string }[];
  regrasSemResposta: { regra: string; perguntaId: string; alvo: string }[];
  naoAvaliadas: { questionRowId: number; perguntaId: string | null; motivo: string }[];
  conflitos: { perguntaId: string; questionRowIds: number[]; usada: number }[];
};

/** Resultado do motor deterministico sobre a anamnese V2: regras cadastradas, com rastro ate a resposta. Nao e diagnostico. */
export default function MotorPanel({ sessaoId }: { sessaoId: number }) {
  const [m, setM] = useState<Motor | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let vivo = true; setM(null); setErro("");
    api<Motor>(`/api/collaborator/anamnese/sessions/${sessaoId}/motor`).then((r) => { if (vivo) setM(r); }).catch((e) => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [sessaoId]);
  return (
    <div className="panel-3d-sub p-4" data-testid="motor-panel">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><Cpu className="h-3.5 w-3.5" style={{ color: OURO }} /> Motor de regras (determinístico)</div>
      {erro ? <p className="text-[12px] text-red-700" data-testid="motor-erro">Motor indisponível: {erro}. Nenhuma sugestão foi calculada.</p> : !m ? <div className="flex items-center gap-2 text-[12px]" style={{ color: MUDO }}><Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculando…</div> : (
        <div className="space-y-2 text-[12px]" style={{ color: NAVY }}>
          <p style={{ color: MUDO }}>{m.natureza}{m.sessaoConcluida ? "" : " Anamnese ainda em andamento: resultado parcial."}</p>
          <div><b>{m.gradeGlobal}</b> · escore {m.escoreTotal}{m.redFlag && <b className="ml-2 text-red-700">SINAL DE ALARME</b>}</div>
          {m.regrasDisparadas.length > 0 ? (
            <ul className="space-y-1" data-testid="motor-disparadas">{m.regrasDisparadas.map((r, i) => (
              <li key={i}>{r.alvo} <span style={{ color: MUDO }}>— regra {r.regra}, pergunta {r.perguntaId}, resposta #{r.questionRowId ?? "?"} = {String(r.valorRecebido)}{r.gatilho ? ` (gatilho ${r.gatilho})` : ""}</span></li>))}</ul>
          ) : <p style={{ color: MUDO }}>Nenhuma regra disparada pelas respostas dadas.</p>}
          {m.regrasSemResposta.length > 0 && <p style={{ color: MUDO }} data-testid="motor-omitidas">Regras sem resposta, não avaliadas (não significa “não”): {m.regrasSemResposta.map((r) => r.perguntaId).join(", ")}.</p>}
          {m.naoAvaliadas.length > 0 && <p style={{ color: MUDO }}>Respostas que o motor não avalia (multi-seleção, texto): {m.naoAvaliadas.length}. Revisar manualmente.</p>}
          {m.conflitos.length > 0 && <p className="text-amber-800">Identificador repetido com respostas diferentes: {m.conflitos.map((c) => c.perguntaId).join(", ")}. Usada a mais recente.</p>}
        </div>
      )}
    </div>
  );
}
