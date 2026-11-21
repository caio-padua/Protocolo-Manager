import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardCheck, GitCompareArrows, ListChecks, Loader2, Lock, Plus, ShieldAlert, SkipForward, StickyNote } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import NovaConsulta from "./anamnese/NovaConsulta";
import Evolucao from "./anamnese/Evolucao";
import ResumoRetorno from "./anamnese/ResumoRetorno";
import {
  agruparPorBloco, api, blocoDe, compararSessoes, podeComparar, IDENTIDADE_IDS, concluida, dataBR, formatarValor, haQuanto, horaBR, MUDO, NAVY, OURO, quando,
  VOL_AJUDA, VOL_COR, VOL_ROTULO, type SessaoDetalhe, type SessaoResumo, type Volatilidade,
} from "./anamnese/util";

// ===========================================================================
// ANAMNESE DO CLIENTE (Cockpit da Consulta): historico datado, respostas por bloco,
// evolucao entre duas anamneses e abertura de uma NOVA na consulta (na tela do medico
// ou no celular do cliente). Respostas = leitura; a nova anamnese herda so o que nao muda.
// Spec: specs/cockpit-cliente-onda2-anamnese-exames.md
// ===========================================================================

export { formatarValor };
type Aba = "respostas" | "evolucao" | "achados";

const ROTULO_MODO: Record<string, string> = { paciente: "Respondida pelo cliente", consulta: "Feita na consulta" };

export default function AnamnesePreviaPanel({ clientId }: { clientId: number }) {
  const temToken = Boolean(getCollabToken());
  const [sessoes, setSessoes] = useState<SessaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [sessaoId, setSessaoId] = useState<number | null>(null);
  const [baseId, setBaseId] = useState<number | null>(null);
  const [detalhes, setDetalhes] = useState<Map<number, SessaoDetalhe>>(new Map());
  const [aba, setAba] = useState<Aba>("respostas");
  const [abrirNova, setAbrirNova] = useState(false);
  const [mostrarLegenda, setMostrarLegenda] = useState(false);

  const carregar = useCallback(async () => {
    if (!temToken) { setCarregando(false); return; }
    try {
      const data = await api<SessaoResumo[]>(`/api/collaborator/anamnese/sessions?clientId=${clientId}`);
      // Rascunho vazio e ruido: so entra o que tem resposta ou foi aberto na consulta.
      const uteis = data.filter((s) => concluida(s) || s.respondidas > 0 || s.mode === "consulta");
      setSessoes(uteis);
      setSessaoId((atual) => (atual && uteis.some((s) => s.id === atual) ? atual : (uteis.find(concluida) ?? uteis[0])?.id ?? null));
      setErro("");
    } catch { setErro("Não foi possível carregar as anamneses deste cliente."); }
    finally { setCarregando(false); }
  }, [clientId, temToken]);
  useEffect(() => { setCarregando(true); setDetalhes(new Map()); void carregar(); }, [carregar]);

  const carregarDetalhe = useCallback(async (id: number) => {
    setDetalhes((m) => (m.has(id) ? m : m));
    try {
      const d = await api<SessaoDetalhe>(`/api/collaborator/anamnese/sessions/${id}`);
      setDetalhes((m) => new Map(m).set(id, d));
    } catch { /* a aba mostra "carregando"; erro fica no console do servidor */ }
  }, []);

  // A anterior padrao e a concluida imediatamente mais antiga que a selecionada.
  const ordenadas = useMemo(() => [...sessoes].sort((a, b) => new Date(quando(b)).getTime() - new Date(quando(a)).getTime()), [sessoes]);
  useEffect(() => {
    if (sessaoId == null) return;
    const i = ordenadas.findIndex((s) => s.id === sessaoId);
    const anterior = ordenadas.slice(i + 1).find(concluida) ?? ordenadas.find((s) => s.id !== sessaoId && concluida(s));
    setBaseId((b) => (b != null && b !== sessaoId && ordenadas.some((s) => s.id === b) ? b : (anterior?.id ?? null)));
  }, [sessaoId, ordenadas]);
  useEffect(() => { if (sessaoId != null && !detalhes.has(sessaoId)) void carregarDetalhe(sessaoId); }, [sessaoId, detalhes, carregarDetalhe]);
  useEffect(() => { if (baseId != null && !detalhes.has(baseId)) void carregarDetalhe(baseId); }, [baseId, detalhes, carregarDetalhe]);

  const detail = sessaoId != null ? detalhes.get(sessaoId) : undefined;
  const base = baseId != null ? detalhes.get(baseId) : undefined;
  const ultima = ordenadas.find(concluida);

  const mudancas = useMemo(() => {
    if (!detail || !base || !podeComparar(detail, base)) return new Map<number, string>();
    return new Map(compararSessoes(base.respostas ?? [], detail.respostas ?? []).filter((l) => l.situacao === "mudou" || l.situacao === "novo").map((l) => [l.rowId, l.antes]));
  }, [detail, base]);
  const porBloco = useMemo(() => agruparPorBloco((detail?.respostas ?? []).map((r) => ({ ...r, bloco: blocoDe(r) }))), [detail]);

  if (!temToken) {
    return (
      <div className="rounded-md border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-amber-800"><Lock className="h-4 w-4" /> Acesso de colaborador necessário</div>
        <p className="mt-1.5 text-sm text-amber-800">A anamnese é informação clínica protegida. Entre como colaborador (menu Profissionais → Entrar) para ver as respostas do cliente.</p>
      </div>
    );
  }
  if (carregando) return <div className="flex items-center gap-2 py-6 text-sm" style={{ color: MUDO }}><Loader2 className="h-4 w-4 animate-spin" /> Carregando anamneses…</div>;
  if (erro) return <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700">{erro}</div>;

  const TABS: Array<[Aba, string, typeof ListChecks]> = [["respostas", "Respostas", ListChecks], ["evolucao", "Evolução", GitCompareArrows], ["achados", "Achados e observações", ShieldAlert]];

  return (
    <div className="space-y-5" data-testid="anamnese-painel">
      {/* ZONA 1 — situacao e acao principal */}
      <div className="panel-3d-sub p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
            <ClipboardCheck className="h-4 w-4" style={{ color: OURO }} /> Anamnese do cliente
          </div>
          <button type="button" onClick={() => setAbrirNova(true)} className="btn-3d-gold ml-auto inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide" data-testid="anamnese-nova">
            <Plus className="h-4 w-4" /> Nova anamnese na consulta
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Última concluída", ultima ? `${dataBR(quando(ultima))} · ${horaBR(quando(ultima))}` : "Nenhuma", ultima ? haQuanto(quando(ultima)) : "O cliente ainda não concluiu"],
            ["Anamneses concluídas", String(sessoes.filter(concluida).length), sessoes.some((s) => !concluida(s)) ? "e uma em andamento" : "nenhuma em andamento"],
            ["Respostas na última", ultima ? String(ultima.respondidas) : "—", "perguntas respondidas"],
            ["Achados do motor", ultima ? `${ultima.diagnosticado} diag · ${ultima.suspeito} susp` : "—", ultima?.temAlarme ? "com sinal de alarme" : "sem sinal de alarme"],
          ].map(([t, v, s]) => (
            <div key={t} className="concave-3d px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUDO }}>{t}</div>
              <div className="mt-0.5 text-[15px] font-bold" style={{ color: NAVY }}>{v}</div>
              <div className="text-[11px]" style={{ color: MUDO }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      <NovaConsulta clientId={clientId} aberto={abrirNova} onFechar={() => setAbrirNova(false)} onMudou={() => void carregar()} />

      {sessoes.length === 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-amber-800"><AlertTriangle className="h-4 w-4" /> Sem anamnese registrada</div>
          <p className="mt-1.5 text-sm text-amber-800">Este cliente ainda não respondeu nenhuma anamnese. Use “Nova anamnese na consulta” para abrir a primeira.</p>
        </div>
      ) : (
        <>
          {/* ZONA 2 — linha do tempo: cada anamnese com data e hora nitidas */}
          <div className="panel-3d-sub p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>Linha do tempo ({sessoes.length})</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="listbox" aria-label="Anamneses">
              {ordenadas.map((s) => {
                const ativa = s.id === sessaoId;
                const aberta = !concluida(s);
                const cor = s.temAlarme ? "#dc2626" : aberta ? "#d97706" : "#16a34a";
                return (
                  <button key={s.id} type="button" role="option" aria-selected={ativa} onClick={() => setSessaoId(s.id)}
                    className={`${ativa ? "panel-3d-active" : "concave-3d"} relative overflow-hidden px-3 py-2.5 pl-4 text-left`} data-testid="anamnese-sessao">
                    <span className="absolute inset-y-0 left-0 w-1" style={{ background: cor }} />
                    <div className="text-[16px] font-bold leading-tight" style={{ color: NAVY }}>{dataBR(quando(s))}</div>
                    <div className="text-[11px]" style={{ color: MUDO }}>{horaBR(quando(s))} · {haQuanto(quando(s))}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: cor }}>{aberta ? "Em andamento" : "Concluída"}</span>
                      <span className="text-[11px]" style={{ color: MUDO }}>{s.respondidas} respostas</span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: "#8a7a55" }}>{ROTULO_MODO[s.mode] ?? s.mode} · {s.diagnosticado} diag · {s.suspeito} susp</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ZONA 3 — abas */}
          <div className="flex flex-wrap gap-2" role="tablist">
            {TABS.map(([id, rotulo, Icon]) => (
              <button key={id} type="button" role="tab" aria-selected={aba === id} onClick={() => setAba(id)}
                className={`${aba === id ? "btn-3d" : "btn-3d-soft"} inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[12px] font-semibold uppercase tracking-wide`}>
                <Icon className="h-4 w-4" style={aba === id ? undefined : { color: OURO }} /> {rotulo}
              </button>
            ))}
          </div>

          {aba === "respostas" && detail && <ResumoRetorno clientId={clientId} detail={detail} base={base && podeComparar(detail, base) ? base : undefined} />}

          {aba === "evolucao" && (
            <Evolucao sessoes={ordenadas.filter(concluida).length >= 2 ? ordenadas.filter(concluida) : ordenadas} baseId={baseId} atualId={sessaoId} onBase={setBaseId} onAtual={setSessaoId} detalhes={detalhes} />
          )}

          {aba !== "evolucao" && !detail && <div className="flex items-center gap-2 py-4 text-sm" style={{ color: MUDO }}><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}

          {aba === "respostas" && detail && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: MUDO }}>
                <span>Anamnese de <b style={{ color: NAVY }}>{dataBR(quando(detail))} às {horaBR(quando(detail))}</b>.</span>
                {base && <span>Marcadas com “Mudou” as respostas diferentes da de {dataBR(quando(base))}.</span>}
                <button type="button" className="underline" onClick={() => setMostrarLegenda((v) => !v)}>{mostrarLegenda ? "Esconder legenda" : "O que é Fixa, Acumula e Muda?"}</button>
              </div>
              {mostrarLegenda && (
                <div className="concave-3d grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(Object.keys(VOL_ROTULO) as Volatilidade[]).map((v) => (
                    <div key={v} className="text-[12px]" style={{ color: NAVY }}>
                      <span className="mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: VOL_COR[v] }}>{VOL_ROTULO[v]}</span>{VOL_AJUDA[v]}
                    </div>
                  ))}
                </div>
              )}
              {porBloco.length === 0 ? <p className="text-[12px]" style={{ color: MUDO }}>Nenhuma resposta registrada nesta anamnese.</p> : porBloco.map(([bloco, itens]) => (
                <details key={bloco} open className="panel-3d-sub group p-4">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: OURO }}>
                    <span>{bloco}</span><span className="ml-auto rounded px-1.5 py-0.5 text-[10px]" style={{ background: "#f3ecd9", color: NAVY }}>{itens.length} respostas</span>
                  </summary>
                  <div className="mt-2 divide-y" style={{ borderColor: "#f3eee1" }}>
                    {itens.map((r) => {
                      const antes = mudancas.get(r.questionRowId);
                      const doCadastro = r.origemCadastro === true || IDENTIDADE_IDS.includes(r.questionRowId);
                      return (
                        <div key={r.id} className="grid items-start gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_64px]">
                          <div className="text-[12px]" style={{ color: "#4a5d75" }}>{r.pergunta ?? r.perguntaId ?? "Pergunta removida do questionário"}</div>
                          <div>
                            <div className="concave-3d px-2.5 py-1.5 text-[13px] font-semibold" style={{ color: NAVY }}>{formatarValor(r.valor)}</div>
                            {doCadastro && <div className="mt-1 text-[11px]" style={{ color: MUDO }} data-testid="resposta-identidade">Dado de identificação digitado no formulário. A identidade oficial é a do cadastro e não entra na comparação.</div>}
                            {!doCadastro && antes !== undefined && (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: MUDO }}>
                                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: OURO }}>Mudou</span>
                                antes: <span className="line-through">{antes}</span>
                              </div>
                            )}
                            <div className="mt-0.5 text-[10px]" style={{ color: "#9aa8b9" }}>respondida em {dataBR(r.respondidoEm)} às {horaBR(r.respondidoEm)}</div>
                          </div>
                          <span className="justify-self-start rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white sm:justify-self-end" style={{ background: VOL_COR[r.volatilidade] ?? NAVY }} title={VOL_AJUDA[r.volatilidade]}>{VOL_ROTULO[r.volatilidade] ?? "Muda"}</span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              ))}
            </div>
          )}

          {aba === "achados" && detail && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="panel-3d-sub p-4">
                <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>Achados do motor</div>
                {detail.findings.length === 0 ? <p className="text-[12px]" style={{ color: MUDO }}>Nenhum achado.</p> : (
                  <ul className="space-y-1.5">{detail.findings.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-[12px]">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white" style={{ background: f.tipo === "diagnosticado" ? "#16a34a" : "#d97706" }}>{f.tipo === "diagnosticado" ? "Diag" : "Susp"}</span>
                      <span style={{ color: NAVY }}>{f.rotulo}</span>
                      {(f.severidade ?? "").toLowerCase() === "alta" && <ShieldAlert className="h-3.5 w-3.5 text-red-600" />}
                    </li>))}</ul>
                )}
              </div>
              <div className="panel-3d-sub p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><SkipForward className="h-3.5 w-3.5" style={{ color: OURO }} /> Recusas</div>
                {detail.refusals.length === 0 ? <p className="text-[12px]" style={{ color: MUDO }}>Nenhum bloco recusado.</p> : (
                  <ul className="space-y-1.5">{detail.refusals.map((r) => <li key={r.id} className="text-[12px]" style={{ color: NAVY }}><span className="font-semibold">{r.alvo}</span>{r.motivo ? ` — ${r.motivo}` : ""}</li>)}</ul>
                )}
              </div>
              <div className="panel-3d-sub p-4">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><StickyNote className="h-3.5 w-3.5" style={{ color: OURO }} /> Observações</div>
                {detail.notes.length === 0 ? <p className="text-[12px]" style={{ color: MUDO }}>Nenhuma observação da equipe.</p> : (
                  <ul className="space-y-1.5">{detail.notes.map((n) => <li key={n.id} className="text-[12px]" style={{ color: NAVY }}><span className="font-semibold">{n.grupo}:</span> {n.observacao}</li>)}</ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
