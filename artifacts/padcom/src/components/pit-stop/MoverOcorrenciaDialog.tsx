import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtData, fmtDataHora, fmtDiferenca, fmtDias } from "@/lib/pit-stop-formato";
import { PitStopErro, previaMoverOcorrencia, type PreviaMover } from "@/lib/pit-stop-api";

/**
 * "Alterar data/hora" de UMA visita do plano. Serve o botão acessível e o fim do arrastar/soltar (mouse e toque):
 * os dois caminhos chegam aqui e só o servidor decide. A tela mostra a prévia (bloqueios, avisos, impacto nas próximas,
 * vagas do dia e alternativas) e nada muda no plano até o botão "Mover no plano". Nenhuma reserva nem evento do Google nasce aqui.
 */
export type AlvoMover = { planoId: number; ocId: number; itemNome: string; numero: number; total: number; data: string | null; hora: string | null };

export function MoverOcorrenciaDialog({ alvo, destino, salvando, onFechar, onMover }: {
  alvo: AlvoMover | null; destino: { data: string; hora: string } | null; salvando: boolean; onFechar: () => void;
  onMover: (v: { ocId: number; data: string; hora: string; aceitarForaDaJanela: boolean }) => void;
}) {
  const [data, setData] = useState("");
  const [hora, setHora] = useState("");
  const [aceite, setAceite] = useState(false);
  const [previa, setPrevia] = useState<PreviaMover | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!alvo) return;
    setData(destino?.data ?? alvo.data ?? ""); setHora(destino?.hora ?? alvo.hora ?? "09:00"); setAceite(false); setPrevia(null); setFalha(null);
  }, [alvo?.ocId, destino?.data, destino?.hora]); // eslint-disable-line react-hooks/exhaustive-deps

  // Prévia debounced; respostas fora de ordem são descartadas (guarda de corrida por sequência) e a anterior é abortada.
  useEffect(() => {
    if (!alvo || !/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) { setPrevia(null); return; }
    const minha = ++seq.current;
    const ctl = new AbortController();
    setCarregando(true); setFalha(null);
    const t = window.setTimeout(() => {
      previaMoverOcorrencia(alvo.planoId, alvo.ocId, data, hora, ctl.signal)
        .then((p) => { if (minha === seq.current) { setPrevia(p); setAceite(false); } })
        .catch((e: unknown) => {
          if (ctl.signal.aborted || minha !== seq.current) return;
          setPrevia(null);
          setFalha(e instanceof PitStopErro ? e.message : "Não foi possível validar agora. Nada foi alterado.");
        })
        .finally(() => { if (minha === seq.current) setCarregando(false); });
    }, 300);
    return () => { window.clearTimeout(t); ctl.abort(); };
  }, [alvo?.planoId, alvo?.ocId, data, hora]); // eslint-disable-line react-hooks/exhaustive-deps

  const pode = !!previa && previa.podeMover && !carregando && (!previa.exigeAceite || aceite) && !salvando;
  const escolher = (d: string, h: string) => { setData(d); setHora(h); };

  return (
    <Dialog open={alvo !== null} onOpenChange={(o) => { if (!o) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="mover-dialog">
        <DialogHeader>
          <DialogTitle>Alterar data e hora{alvo ? `: ${alvo.itemNome}, sessão ${alvo.numero}/${alvo.total}` : ""}</DialogTitle>
          <DialogDescription>
            Hoje: {alvo ? fmtDataHora(alvo.data, alvo.hora) : ""}. O servidor confere agenda, profissional, intervalos e conflitos antes de aceitar.
            Nada é reservado nem enviado ao Google agora.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] font-bold">Nova data
            <input type="date" className="field-engraved mt-1 block min-h-10 px-2" value={data} onChange={(e) => setData(e.target.value)} data-testid="mover-data" />
          </label>
          <label className="text-[11px] font-bold">Nova hora
            <input type="time" step={900} className="field-engraved mt-1 block min-h-10 px-2" value={hora} onChange={(e) => setHora(e.target.value)} data-testid="mover-hora" />
          </label>
          {carregando && <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Conferindo no servidor…</span>}
        </div>

        {falha && <p role="alert" className="text-xs font-bold text-red-800">{falha}</p>}

        {previa && (
          <div className="space-y-3" data-testid="mover-previa" data-pode={previa.podeMover ? "sim" : "nao"}>
            {previa.bloqueios.length > 0 && (
              <ul role="alert" className="concave-3d space-y-1 p-3">
                {previa.bloqueios.map((b) => (
                  <li key={b.code} className="flex items-start gap-2 text-xs font-bold text-red-800"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />{b.message}</li>
                ))}
              </ul>
            )}
            {previa.avisos.length > 0 && (
              <ul className="concave-3d space-y-1 p-3">
                {previa.avisos.map((a) => (
                  <li key={a.code} className="flex items-start gap-2 text-xs text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{a.message}</li>
                ))}
              </ul>
            )}

            <dl className="concave-3d grid gap-x-4 gap-y-1 p-3 text-xs sm:grid-cols-2" aria-label="Avaliação da nova data">
              <div><dt className="inline font-bold">Data nominal do protocolo: </dt><dd className="inline">{fmtData(previa.avaliacao.dataNominal)}</dd></div>
              <div><dt className="inline font-bold">Diferença: </dt><dd className="inline">{fmtDiferenca(previa.avaliacao.diferencaDias)}</dd></div>
              <div><dt className="inline font-bold">Intervalo desde a sessão anterior: </dt><dd className="inline">{fmtDias(previa.avaliacao.intervaloAnterior)}</dd></div>
              <div><dt className="inline font-bold">Mínimo deste procedimento: </dt><dd className="inline">{fmtDias(previa.avaliacao.intervaloMinimo)}</dd></div>
            </dl>

            {previa.impacto.length > 0 && (
              <div className="space-y-1" data-testid="mover-impacto">
                <h4 className="text-[11px] font-black uppercase tracking-widest">Impacto nas próximas sessões</h4>
                <ul className="space-y-1">
                  {previa.impacto.map((i) => (
                    <li key={i.ocorrenciaId} className="concave-3d flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span><b>Sessão {i.numero}</b>: {fmtDataHora(i.data, i.hora)}</span>
                      <span className="text-muted-foreground">
                        {i.reservada ? "já reservada, não muda" : i.seraRecalculada ? "será recalculada pelo sistema" : "escolha sua, não muda"}
                        {i.intervaloDepoisDoMovimento !== null ? ` · ${fmtDias(i.intervaloDepoisDoMovimento)} depois` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {previa.vagasDoDia.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-widest">Horários livres neste dia (equipe completa)</h4>
                <div className="flex flex-wrap gap-2" data-testid="mover-vagas-dia">
                  {previa.vagasDoDia.map((v) => (
                    <button key={v.time} type="button" aria-pressed={v.time === hora} onClick={() => setHora(v.time)}
                      className={`${v.time === hora ? "panel-3d-active" : "bevel-3d"} min-h-9 px-3 text-xs font-bold`}>{v.time}</button>
                  ))}
                </div>
              </div>
            )}

            {previa.alternativas.length > 0 && (
              <div className="space-y-1">
                <h4 className="text-[11px] font-black uppercase tracking-widest">Alternativas dentro da janela</h4>
                <div className="flex flex-wrap gap-2" data-testid="mover-alternativas">
                  {previa.alternativas.map((a) => (
                    <button key={`${a.date}-${a.time}`} type="button" onClick={() => escolher(a.date, a.time)} className="bevel-3d min-h-9 px-3 text-xs font-bold">
                      {fmtDataHora(a.date, a.time)}{a.agendas.length ? ` · ${a.agendas.join(" + ")}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {previa.exigeAceite && (
              <label className="concave-3d flex items-start gap-2 p-3 text-xs font-bold">
                <input type="checkbox" className="mt-0.5 h-4 w-4" checked={aceite} onChange={(e) => setAceite(e.target.checked)} data-testid="mover-aceite" />
                Aceito mover para fora da janela de {previa.avaliacao.dataNominal ? "4 dias em torno da data nominal" : "4 dias"}.
              </label>
            )}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button type="button" disabled={!pode} data-testid="mover-confirmar"
            onClick={() => alvo && onMover({ ocId: alvo.ocId, data, hora, aceitarForaDaJanela: aceite })}>
            {salvando ? "Movendo…" : "Mover no plano"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
