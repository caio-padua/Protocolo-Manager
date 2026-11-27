import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";

// Adesão às medicações (Tomei / Esqueci) na /area. Rotas token-bound; a data é a de Brasília no servidor.
// Lei do lugar fixo: Tomei e Esqueci nunca trocam de texto nem de lugar; o estado marcado aparece por
// aria-pressed + relevo côncavo. Mensagem de erro em slot reservado.
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type OrigemLista = "prescrita" | "propria";
type Status = "tomei" | "esqueci" | null;
export type HorarioDia = { origem: OrigemLista; nome: string; nomeChave: string; referenciaId?: number | null; dose: string | null; sigla: string; periodoNome: string; status: Status };
type Janela = {
  dias: number; tomei: number; esqueci: number; semRegistro: number; esperado: number; percentual: number | null;
  diasComHistorico?: number; diasSemHistorico?: number; suspenso?: number; retirado?: number; diasSuspensos?: number;
};
type Dia = { data: string; tomei: number; esqueci: number; esperado: number; comHistorico?: boolean; suspenso?: number; retirado?: number };
export type AdesaoLista = { esperadoPorDia: number; janelas: Janela[]; historico: Dia[] };
export type DadosAdesao = { hoje: HorarioDia[]; adesao: { prescrita: AdesaoLista; propria: AdesaoLista }; data: string };

const CHAVE_GAMIFICACAO = "paxcare.ocultarGamificacao";
export function useOcultarGamificacao() {
  const [oculta, setOculta] = useState<boolean>(() => { try { return localStorage.getItem(CHAVE_GAMIFICACAO) === "1"; } catch { return false; } });
  const alternar = () => setOculta((v) => { const n = !v; try { localStorage.setItem(CHAVE_GAMIFICACAO, n ? "1" : "0"); } catch { /* sem armazenamento: vale só nesta tela */ } return n; });
  return [oculta, alternar] as const;
}

export function useAdesao(token: string) {
  const [dados, setDados] = useState<DadosAdesao | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/medicacoes/adesao`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(r.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar sua adesão.");
      setDados(await r.json()); setErro("");
    } catch (e) { setErro((e as Error).message); }
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function marcar(h: HorarioDia, status: "tomei" | "esqueci") {
    if (ocupado) return;
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/medicacoes/tomadas`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ origem: h.origem, nome: h.nome, sigla: h.sigla, status, referenciaId: h.referenciaId ?? null }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "Não foi possível registrar. Tente de novo.");
      }
      await carregar();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }
  return { dados, erro, ocupado, marcar, recarregar: carregar };
}

const fmtPct = (p: number | null) => (p == null ? "—" : `${String(p).replace(".", ",")}%`);
const fmtData = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function BlocoAdesao({ origem, adesao, somenteLeitura }: {
  origem: OrigemLista; adesao: ReturnType<typeof useAdesao>; somenteLeitura: boolean;
}) {
  const { dados, erro, ocupado, marcar } = adesao;
  const [janela, setJanela] = useState<7 | 15 | 30>(7);
  const [ocultarGamificacao, alternarGamificacao] = useOcultarGamificacao();
  if (!dados) return <div className="min-h-[44px] text-xs text-muted-foreground" role="status">{erro || "Carregando adesão…"}</div>;
  const lista = dados.adesao[origem];
  const horarios = dados.hoje.filter((h) => h.origem === origem);
  const j = lista.janelas.find((x) => x.dias === janela)!;
  const hist = lista.historico.slice(-janela);

  return (
    <div className="space-y-3" data-testid={`adesao-${origem}`}>
      <div className="space-y-2">
        <p className="text-primary font-black text-[10px] uppercase tracking-widest">Hoje · {fmtData(dados.data)}</p>
        {horarios.length === 0 && <p className="text-xs text-muted-foreground">Nenhum horário marcado para hoje.</p>}
        {horarios.map((h) => (
          <div key={`${h.nomeChave}|${h.referenciaId ?? 0}|${h.sigla}`} className="concave-3d rounded-lg p-3 flex items-center justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-primary font-black text-sm break-words">{h.nome}</p>
              <p className="text-[10px] uppercase tracking-widest text-accent">{h.periodoNome}{h.dose ? ` · ${h.dose}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={ocupado || somenteLeitura} aria-pressed={h.status === "tomei"} onClick={() => void marcar(h, "tomei")}
                className={`px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest rounded-md flex items-center gap-1 disabled:opacity-40 ${h.status === "tomei" ? "concave-3d text-accent" : "btn-3d-soft"}`}>
                <Check className="w-3 h-3" />Tomei
              </button>
              <button type="button" disabled={ocupado || somenteLeitura} aria-pressed={h.status === "esqueci"} onClick={() => void marcar(h, "esqueci")}
                className={`px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest rounded-md flex items-center gap-1 disabled:opacity-40 ${h.status === "esqueci" ? "concave-3d text-red-600" : "btn-3d-soft"}`}>
                <X className="w-3 h-3" />Esqueci
              </button>
            </div>
          </div>
        ))}
        <div role="status" aria-live="polite" className="min-h-[20px] text-xs text-red-600">{erro}</div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-primary font-black text-[10px] uppercase tracking-widest">Adesão</p>
          <div className="flex gap-1" role="group" aria-label="Período da adesão">
            {([7, 15, 30] as const).map((n) => (
              <button key={n} type="button" aria-pressed={janela === n} onClick={() => setJanela(n)}
                className={`px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest rounded-md ${janela === n ? "concave-3d text-accent" : "btn-3d-soft"}`}>{n} dias</button>
            ))}
          </div>
        </div>
        <div className="concave-3d rounded-lg p-3" data-testid="indice-constancia">
          <p className="text-primary font-black text-[10px] uppercase tracking-widest">Índice de Constância</p>
          <p className="text-sm text-primary mt-1" data-testid="constancia-frase">
            Você respondeu a {j.tomei + j.esqueci} de {j.esperado} lembretes nos últimos {j.dias} dias.
          </p>
          {!ocultarGamificacao && (
            <p className="text-primary font-black text-3xl mt-1" style={{ fontFamily: "'EB Garamond', serif" }}>{fmtPct(j.percentual)}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {j.tomei} tomado(s) de {j.esperado} esperados · {j.esqueci} não tomado(s) · {j.semRegistro} sem resposta
          </p>
          <p className="text-xs text-muted-foreground" data-testid="constancia-lacunas">
            {j.diasSemHistorico ?? 0} dia(s) sem histórico fora da conta (nada é estimado)
            {(j.suspenso ?? 0) > 0 ? ` · ${j.suspenso} horário(s) suspenso(s) por pausa, fora da conta` : ""}
            {(j.retirado ?? 0) > 0 ? ` · ${j.retirado} horário(s) trocado(s), fora da conta` : ""}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Este índice mede só o seu registro de lembretes. Não é nota de risco, de saúde nem de longevidade.</p>
          <button type="button" aria-pressed={ocultarGamificacao} onClick={alternarGamificacao}
            className="mt-2 px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest rounded-md btn-3d-soft" data-testid="constancia-ocultar">
            {ocultarGamificacao ? "Mostrar porcentagem" : "Ocultar porcentagem"}
          </button>
        </div>
        <ul className="space-y-1" aria-label="Histórico por dia">
          {[...hist].reverse().map((d) => (
            <li key={d.data} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{fmtData(d.data)}</span>
              <span className="text-primary">
                {d.comHistorico === false ? "sem histórico"
                  : d.esperado === 0 && (d.suspenso ?? 0) > 0 ? "suspenso"
                  : `${d.tomei} tomado · ${d.esqueci} não tomado · ${Math.max(0, d.esperado - d.tomei - d.esqueci)} sem resposta`}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-muted-foreground">Cada dia usa os horários que valiam naquele dia. Sem resposta não conta como tomado. Dias anteriores ao primeiro registro ficam sem histórico.</p>
      </div>
    </div>
  );
}
