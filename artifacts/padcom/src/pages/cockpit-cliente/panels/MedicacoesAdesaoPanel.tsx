import { useCallback, useEffect, useState } from "react";
import { Check, Pill, ShieldAlert, X, Pencil } from "lucide-react";
import CodigoExclusaoAppCard from "./CodigoExclusaoAppCard";
import { useToast } from "@/hooks/use-toast";

// Cockpit > "Adesão & Medicações em Uso". Rotas /cockpit/:clientId/medicacoes (colaborador, isolado por empresa).
// Lei do lugar fixo: botões não mudam de texto/posição; confirmação de recusa fica em slot reservado (invisible).
import { collabAuthHeaders } from "@/lib/collab-auth";
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

type Periodo = "jejum" | "manha" | "meio_manha" | "almoco" | "tarde" | "meio_tarde" | "noite" | "final_noite" | "ceia";
const NOME_PERIODO: Record<Periodo, string> = {
  jejum: "Jejum", manha: "Início da manhã", meio_manha: "Meio da manhã", almoco: "Almoço", tarde: "Início da tarde",
  meio_tarde: "Meio da tarde", noite: "Noite", final_noite: "Final da noite", ceia: "Ceia",
};
type Estado = "nao_validada" | "validada" | "recusada" | "encerrada";
const ESTADO_TEXTO: Record<Estado, string> = { nao_validada: "Aguardando conferência", validada: "Validada", recusada: "Recusada", encerrada: "Encerrada" };
type Prescrita = { nome: string; dose: string | null; observacao: string | null; periodos: { sigla: string; nome: string }[] };
type Propria = {
  id: number; nome: string; estado: Estado; pausada: boolean; doseValor: number | null; doseUnidade: string | null;
  refeicao: string | null; observacao: string | null; periodos: Periodo[]; motivoRecusa: string | null;
};
type Janela = { dias: number; tomei: number; esqueci: number; semRegistro: number; esperado: number; percentual: number | null; diasSemHistorico?: number; suspenso?: number; retirado?: number };
type AdesaoLista = { esperadoPorDia: number; janelas: Janela[]; historico: { data: string; tomei: number; esqueci: number; esperado: number }[] };
type Dados = {
  podeDecidir: boolean; prescritas: Prescrita[];
  cadastradasPeloCliente: { consentimentoAtivo: boolean; itens: Propria[] };
  adesao: { prescrita: AdesaoLista; propria: AdesaoLista | null };
  opcoes: { periodos: Periodo[]; unidades: string[] };
};

const fmtPct = (p: number | null) => (p == null ? "—" : `${String(p).replace(".", ",")}%`);
const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmtDose = (v: number | null, u: string | null) => (v != null && u ? `${String(v).replace(".", ",")} ${u}` : "dose não informada");

function TabelaAdesao({ titulo, a }: { titulo: string; a: AdesaoLista | null }) {
  if (!a) return <p className="text-xs text-muted-foreground">Adesão indisponível: o cliente não autoriza esta clínica.</p>;
  return (
    <div className="space-y-2" data-testid={`cockpit-adesao-${titulo}`}>
      <p className="text-primary font-black text-[10px] uppercase tracking-widest">Adesão — {titulo}</p>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-muted-foreground"><th className="py-1">Período</th><th>Adesão</th><th>Tomado / esperado</th><th>Não tomado</th><th>Sem resposta</th><th>Suspenso</th><th>Dias sem histórico</th></tr></thead>
        <tbody>
          {a.janelas.map((j) => (
            <tr key={j.dias} className="border-t border-border/40">
              <td className="py-1 font-black text-primary">{j.dias} dias</td><td>{fmtPct(j.percentual)}</td><td>{j.tomei} / {j.esperado}</td><td>{j.esqueci}</td><td>{j.semRegistro}</td><td>{j.suspenso ?? 0}</td><td>{j.diasSemHistorico ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary className="text-[10px] uppercase tracking-widest cursor-pointer text-accent min-h-[44px] flex items-center">Histórico dos últimos 30 dias</summary>
        <ul className="space-y-1 mt-1">
          {[...a.historico].reverse().map((d) => (
            <li key={d.data} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{fmtData(d.data)}</span>
              <span>{d.tomei} tomei · {d.esqueci} esqueci · {Math.max(0, d.esperado - d.tomei - d.esqueci)} sem registro</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default function MedicacoesAdesaoPanel({ clientId }: { clientId: number }) {
  const { toast } = useToast();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recusando, setRecusando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ajustando, setAjustando] = useState<number | null>(null);
  const [aj, setAj] = useState<{ dose: string; unidade: string; periodos: Periodo[] }>({ dose: "", unidade: "mg", periodos: [] });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/cockpit/${clientId}/medicacoes`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(r.status === 404 ? "Cliente não encontrado nesta clínica." : "Não foi possível carregar as medicações.");
      setDados(await r.json()); setErro("");
    } catch (e) { setErro((e as Error).message); }
  }, [clientId]);
  useEffect(() => { setDados(null); setRecusando(null); setAjustando(null); void carregar(); }, [carregar]);

  async function decidir(id: number, corpo: Record<string, unknown>) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await fetch(`${API}/cockpit/${clientId}/medicacoes/${id}/decisao`, {
        method: "POST", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(corpo),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; lembreteRecalculado?: boolean };
      if (!r.ok) throw new Error(d.error ?? "Não foi possível concluir.");
      toast({ title: "Decisão registrada", description: d.lembreteRecalculado === false ? "Atenção: o lembrete não foi recalculado. Avise o suporte." : undefined });
      setRecusando(null); setAjustando(null); setMotivo("");
      await carregar();
    } catch (e) { toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }); } finally { setOcupado(false); }
  }

  if (!dados) return <div className="concave-3d rounded-lg px-4 py-3 text-sm" role="status">{erro || "Carregando…"}</div>;
  const doseAj = Number(aj.dose.replace(",", "."));
  const ajOk = Number.isFinite(doseAj) && doseAj > 0 && aj.periodos.length > 0;

  return (
    <div className="space-y-4" data-testid="painel-medicacoes-adesao">
      <div role="status" aria-live="polite" className="min-h-[20px] text-xs text-red-600">{erro}</div>
      <div className="grid gap-4 md:grid-cols-2">
        <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Prescritos pela clínica">
          <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><Pill className="w-4 h-4" />Prescritos pela clínica</h3>
          {dados.prescritas.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma prescrição com horários definidos.</p>}
          {dados.prescritas.map((p) => (
            <div key={p.nome} className="concave-3d rounded-lg p-3 space-y-1">
              <p className="text-primary font-black text-sm break-words">{p.nome}</p>
              <p className="text-xs text-muted-foreground">{p.dose ?? "dose conforme a receita"}{p.observacao ? ` · ${p.observacao}` : ""}</p>
              <p className="text-[10px] uppercase tracking-widest text-accent">{p.periodos.map((x) => x.nome).join(" · ")}</p>
            </div>
          ))}
          <TabelaAdesao titulo="prescritos" a={dados.adesao.prescrita} />
        </section>

        <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Cadastrados pelo paciente">
          <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><Pill className="w-4 h-4" />Cadastrados pelo paciente</h3>
          {!dados.cadastradasPeloCliente.consentimentoAtivo && (
            <p className="text-xs flex items-start gap-2"><ShieldAlert className="w-4 h-4 shrink-0" />O cliente não autorizou esta clínica a ver o que ele cadastrou. Nada é exibido.</p>
          )}
          {dados.cadastradasPeloCliente.itens.map((m) => (
            <div key={m.id} className="concave-3d rounded-lg p-3 space-y-2">
              <div>
                <p className="text-primary font-black text-sm break-words">{m.nome}</p>
                <p className="text-xs text-muted-foreground">{fmtDose(m.doseValor, m.doseUnidade)} · {m.periodos.map((p) => NOME_PERIODO[p]).join(", ")}</p>
                <p className="text-[10px] uppercase tracking-widest text-accent">{ESTADO_TEXTO[m.estado]}{m.pausada ? " · Pausado" : ""}</p>
                {m.motivoRecusa && <p className="text-xs text-red-600 break-words">Motivo: {m.motivoRecusa}</p>}
                {m.observacao && <p className="text-xs break-words">{m.observacao}</p>}
              </div>
              {m.estado === "nao_validada" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" disabled={ocupado || !dados.podeDecidir} onClick={() => void decidir(m.id, { decisao: "validar" })}
                      className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-40"><Check className="w-3 h-3" />Validar</button>
                    <button type="button" disabled={ocupado || !dados.podeDecidir} onClick={() => {
                      setRecusando(null); setAjustando(m.id);
                      setAj({ dose: m.doseValor != null ? String(m.doseValor).replace(".", ",") : "", unidade: m.doseUnidade ?? "mg", periodos: m.periodos });
                    }} className="btn-3d-soft px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-40"><Pencil className="w-3 h-3" />Ajustar</button>
                    <button type="button" disabled={ocupado || !dados.podeDecidir} onClick={() => { setAjustando(null); setRecusando(m.id); setMotivo(""); }}
                      className="btn-3d-soft px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-40"><X className="w-3 h-3" />Recusar</button>
                  </div>
                  {!dados.podeDecidir && <p className="text-[10px] text-muted-foreground">Somente médico valida ou recusa.</p>}
                  {/* Slots reservados: ocupam o mesmo espaço aberto ou não (Lei do lugar fixo). */}
                  <div className={`space-y-2 ${recusando === m.id ? "" : "invisible h-0 overflow-hidden"}`} aria-hidden={recusando !== m.id}>
                    <input aria-label="Motivo da recusa" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} tabIndex={recusando === m.id ? 0 : -1}
                      placeholder="Motivo da recusa" className="concave-3d w-full h-11 px-3 text-sm rounded-lg" />
                    <button type="button" tabIndex={recusando === m.id ? 0 : -1} disabled={ocupado || recusando !== m.id || !motivo.trim()}
                      onClick={() => void decidir(m.id, { decisao: "recusar", motivo: motivo.trim() })}
                      className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest">Confirmar recusa</button>
                  </div>
                  <div className={`space-y-2 ${ajustando === m.id ? "" : "invisible h-0 overflow-hidden"}`} aria-hidden={ajustando !== m.id}>
                    <div className="flex gap-2">
                      <input aria-label="Dose" inputMode="decimal" value={aj.dose} onChange={(e) => setAj({ ...aj, dose: e.target.value })} tabIndex={ajustando === m.id ? 0 : -1}
                        className="concave-3d w-28 h-11 px-3 text-sm rounded-lg" />
                      <select aria-label="Unidade" value={aj.unidade} onChange={(e) => setAj({ ...aj, unidade: e.target.value })} tabIndex={ajustando === m.id ? 0 : -1}
                        className="concave-3d h-11 px-2 text-sm rounded-lg">{dados.opcoes.unidades.map((u) => <option key={u} value={u}>{u}</option>)}</select>
                    </div>
                    <div className="flex flex-wrap gap-1" role="group" aria-label="Horários">
                      {dados.opcoes.periodos.map((p) => (
                        <button key={p} type="button" tabIndex={ajustando === m.id ? 0 : -1} aria-pressed={aj.periodos.includes(p)}
                          onClick={() => setAj({ ...aj, periodos: aj.periodos.includes(p) ? aj.periodos.filter((x) => x !== p) : [...aj.periodos, p] })}
                          className={`px-2 min-h-[44px] text-[10px] font-black uppercase tracking-widest rounded-md ${aj.periodos.includes(p) ? "concave-3d text-accent" : "btn-3d-soft"}`}>{NOME_PERIODO[p]}</button>
                      ))}
                    </div>
                    <button type="button" tabIndex={ajustando === m.id ? 0 : -1} disabled={ocupado || ajustando !== m.id || !ajOk}
                      onClick={() => void decidir(m.id, { decisao: "ajustar", ajuste: { doseValor: doseAj, doseUnidade: aj.unidade, periodos: aj.periodos } })}
                      className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest">Salvar ajuste e validar</button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {dados.cadastradasPeloCliente.consentimentoAtivo && dados.cadastradasPeloCliente.itens.length === 0 && (
            <p className="text-xs text-muted-foreground">O cliente ainda não cadastrou medicamentos.</p>
          )}
          <TabelaAdesao titulo="cadastrados pelo paciente" a={dados.adesao.propria} />
        </section>
      </div>
      <CodigoExclusaoAppCard clientId={clientId} />
    </div>
  );
}
