import { useCallback, useEffect, useState } from "react";
import { Loader2, KeyRound, ShieldCheck, Clock, MailCheck, ChevronDown, ChevronUp } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";

// K8 — Confirmação do cliente por visita: chave de 6 dígitos, "Cliente confirma depois"
// e desafio presencial por dados do cadastro. O registro da aplicação NUNCA depende disto.

interface Resumo {
  estado: string; rotulo: string; chaveAtiva: boolean; chaveValidaAte: string | null;
  tentativasRestantesChave: number; podeEnviarChave: boolean; aguardeSegundos: number;
  completa: boolean; pendente: boolean; emailsEnviadosCliente: number; emailsTotal: number;
  desafioTravado: boolean; rubrica: { metodo: string; em: string } | null;
  confirmadaEm: string | null; confirmadaComAtraso: boolean; aplicacaoRegistrada: boolean;
}
interface Desafio {
  rodada: number; maxRodadas: number; tentativasRestantes: number;
  metades: [{ rotulo: string; tamanho: 3 }, { rotulo: string; tamanho: 3 }];
}
interface Canal { canal: "email" | "whatsapp" | "telegram"; estado: "aceito" | "falhou" | "sem_contato" | "simulado" }

const CANAL_NOME: Record<Canal["canal"], string> = { email: "E-mail", whatsapp: "WhatsApp", telegram: "Telegram" };
const CANAL_ESTADO: Record<Canal["estado"], string> = {
  aceito: "aceito pelo provedor (entrega não confirmada)", falhou: "falhou",
  sem_contato: "cliente sem este contato", simulado: "simulado (sem envio real)",
};
const MOTIVOS = ["Cliente sem celular", "A chave não chegou", "Cliente sem acesso ao e-mail", "Cliente prefere confirmar depois"];

function chipClass(r: Resumo | null): string {
  if (!r) return "bg-slate-100 text-slate-600";
  if (r.completa) return "bg-emerald-100 text-emerald-800";
  if (r.estado === "nao_confirmada") return "bg-red-100 text-red-800";
  if (r.pendente || r.estado === "rubrica_desafio") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-600";
}

async function call(path: string, method: "GET" | "POST", body?: unknown) {
  const res = await fetch(`/api/sessions/${path}`, {
    method,
    headers: collabAuthHeaders(body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function ConfirmacaoCliente({ sessionId, enabled }: { sessionId: number; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro" | "aviso"; texto: string } | null>(null);
  const [canais, setCanais] = useState<Canal[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [desafio, setDesafio] = useState<Desafio | null>(null);
  const [desafioInfo, setDesafioInfo] = useState<string | null>(null);
  const [h1, setH1] = useState("");
  const [h2, setH2] = useState("");
  const [aguarde, setAguarde] = useState(0);
  const base = `${sessionId}/confirmacao`;

  const aplicar = useCallback((d: any) => { if (d?.resumo) setResumo(d.resumo); }, []);

  const carregar = useCallback(async () => {
    const r = await call(base, "GET");
    if (r.ok) aplicar(r.data); else setMsg({ tipo: "erro", texto: r.data?.error ?? "Não foi possível consultar a confirmação." });
  }, [base, aplicar]);

  useEffect(() => { if (open && !resumo) void carregar(); }, [open, resumo, carregar]);
  useEffect(() => { setAguarde(resumo?.aguardeSegundos ?? 0); }, [resumo]);
  useEffect(() => {
    if (aguarde <= 0) return;
    const t = setTimeout(() => setAguarde((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [aguarde]);

  async function run(nome: string, fn: () => Promise<void>) {
    setBusy(nome); setMsg(null);
    try { await fn(); } catch { setMsg({ tipo: "erro", texto: "Falha de conexão. Tente de novo." }); } finally { setBusy(null); }
  }

  const enviarChave = () => run("chave", async () => {
    const r = await call(`${base}/chave/enviar`, "POST");
    aplicar(r.data); setCanais(r.data?.canais ?? null);
    setMsg(r.ok ? { tipo: "ok", texto: "Chave enviada. Peça ao cliente os 6 números e digite abaixo." }
      : { tipo: "erro", texto: r.data?.error ?? "Não foi possível enviar a chave." });
  });

  const validarChave = () => run("validar", async () => {
    const r = await call(`${base}/chave/validar`, "POST", { codigo });
    aplicar(r.data);
    if (r.ok) { setCodigo(""); setMsg({ tipo: "ok", texto: "Chave correta. Confirmação do cliente completa." }); return; }
    const resto = r.data?.tentativasRestantes;
    setMsg({ tipo: "erro", texto: `${r.data?.error ?? "Chave não aceita."}${typeof resto === "number" ? ` Restam ${resto} tentativas.` : ""}` });
  });

  const depois = () => run("depois", async () => {
    const r = await call(`${base}/pendente`, "POST", { motivo });
    aplicar(r.data);
    if (!r.ok) { setMsg({ tipo: "erro", texto: r.data?.error ?? "Não foi possível registrar." }); return; }
    const avisos: string[] = r.data?.avisos ?? [];
    setMsg({
      tipo: avisos.length ? "aviso" : "ok",
      texto: `Registrado: o cliente confirma depois por e-mail e a gestão foi avisada. ${avisos.join(" ")}`.trim(),
    });
  });

  const abrirDesafio = () => run("desafio", async () => {
    const r = await call(`${base}/desafio`, "GET");
    if (!r.ok) { setMsg({ tipo: "erro", texto: r.data?.error ?? "Não foi possível abrir o desafio." }); return; }
    if (r.data.estado === "disponivel") { setDesafio(r.data.desafio); setDesafioInfo(null); setH1(""); setH2(""); return; }
    setDesafio(null);
    setDesafioInfo(r.data.estado === "indisponivel"
      ? "O cadastro deste cliente não tem dados suficientes para o desafio. Use a chave ou \"Cliente confirma depois\"."
      : r.data.estado === "travado" ? "O desafio está travado nesta visita." : "A confirmação já está completa.");
  });

  const responderDesafio = () => run("responder", async () => {
    const r = await call(`${base}/desafio`, "POST", { metade1: h1, metade2: h2 });
    aplicar(r.data); setH1(""); setH2("");
    if (r.ok) {
      setDesafio(null);
      setMsg({ tipo: "aviso", texto: "Desafio correto (prova por dados do cadastro). O cliente ainda precisa confirmar pelo e-mail para a parte dele ficar completa." });
      return;
    }
    if (r.data?.motivo === "nova_rodada") { setDesafio(r.data.desafio); setMsg({ tipo: "erro", texto: "Respostas incorretas. Novo desafio sorteado." }); return; }
    if (r.data?.motivo === "travou") { setDesafio(null); setMsg({ tipo: "aviso", texto: r.data.error }); return; }
    if (r.data?.motivo === "incorreta" && desafio) setDesafio({ ...desafio, tentativasRestantes: r.data.tentativasRestantes });
    setMsg({ tipo: "erro", texto: r.data?.error ?? "Resposta não aceita." });
  });

  const travado = resumo?.desafioTravado ?? false;
  const semAplicacao = resumo?.aplicacaoRegistrada === false;
  const livre = enabled && !resumo?.completa && !semAplicacao;

  return (
    <div className="bevel-3d mt-2 px-2.5 py-2" data-testid={`confirmacao-cliente-${sessionId}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Confirmação do cliente
        </span>
        <span className="flex items-center gap-2">
          {resumo && <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${chipClass(resumo)}`} data-testid={`confirmacao-estado-${sessionId}`}>{resumo.rotulo}</span>}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {!resumo && !msg && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Consultando…</div>}

          {resumo?.rubrica && (
            <div className="text-[11px] text-muted-foreground">
              Rubrica: {resumo.rubrica.metodo === "chave" ? "chave de 6 dígitos (prova plena)" : "dados do cadastro (prova fraca)"}
              {resumo.confirmadaEm ? ` · confirmada pelo e-mail${resumo.confirmadaComAtraso ? " (com atraso)" : ""}` : ""}
            </div>
          )}
          {resumo?.pendente && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-800">
              <MailCheck className="h-3.5 w-3.5" /> E-mails ao cliente: {resumo.emailsEnviadosCliente} de {resumo.emailsTotal}
            </div>
          )}

          {enabled && resumo && semAplicacao && !resumo.completa && (
            <div className="text-[11px] font-bold text-amber-800" data-testid={`confirmacao-sem-aplicacao-${sessionId}`}>
              Registre ao menos uma aplicação desta visita para liberar a confirmação do cliente.
            </div>
          )}

          {livre && resumo && (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="btn-3d px-3 py-1.5 text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
                    disabled={busy !== null || aguarde > 0} onClick={enviarChave} data-testid={`confirmacao-enviar-chave-${sessionId}`}>
                    {busy === "chave" ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1 inline h-3.5 w-3.5" />}
                    {aguarde > 0 ? `Enviar chave de novo em ${aguarde} s` : resumo.chaveAtiva ? "Reenviar chave ao cliente" : "Enviar chave ao cliente"}
                  </button>
                  {resumo.chaveAtiva && resumo.chaveValidaAte && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Clock className="h-3 w-3" /> vale até {new Date(resumo.chaveValidaAte).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {canais && (
                  <ul className="text-[11px] text-muted-foreground">
                    {canais.map((c) => <li key={c.canal}>{CANAL_NOME[c.canal]}: {CANAL_ESTADO[c.estado]}</li>)}
                  </ul>
                )}
                {resumo.chaveAtiva && (
                  <div className="flex items-center gap-2">
                    <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codigo}
                      onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="000000" aria-label="Chave de 6 dígitos do cliente"
                      className="concave-3d w-32 px-2 py-1.5 text-center font-mono text-lg tracking-[0.4em]" data-testid={`confirmacao-codigo-${sessionId}`} />
                    <button type="button" className="btn-3d-soft px-3 py-1.5 text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
                      disabled={busy !== null || codigo.length !== 6} onClick={validarChave}>
                      {busy === "validar" ? "Validando…" : "Validar chave"}
                    </button>
                    <span className="text-[11px] text-muted-foreground">Restam {resumo.tentativasRestantesChave} tentativas</span>
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t border-foreground/10 pt-2">
                {!travado && (
                  <button type="button" className="btn-3d-soft px-3 py-1.5 text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
                    disabled={busy !== null} onClick={abrirDesafio} data-testid={`confirmacao-abrir-desafio-${sessionId}`}>
                    Validar no local por dados do cadastro
                  </button>
                )}
                {desafioInfo && <div className="text-[11px] text-amber-800">{desafioInfo}</div>}
                {desafio && (
                  <div className="space-y-2" data-testid={`confirmacao-desafio-${sessionId}`}>
                    <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      Desafio {desafio.rodada} de {desafio.maxRodadas} · restam {desafio.tentativasRestantes} tentativas
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[{ v: h1, set: setH1, d: desafio.metades[0], n: 1 }, { v: h2, set: setH2, d: desafio.metades[1], n: 2 }].map((c) => (
                        <label key={c.n} className="block">
                          <input value={c.v} maxLength={3} onChange={(e) => c.set(e.target.value.slice(0, 3))} autoComplete="off"
                            aria-label={c.d.rotulo} className="concave-3d w-full px-2 py-1.5 text-center font-mono text-lg uppercase tracking-[0.3em]" />
                          <span className="legenda-respira mt-1 block text-center text-[10px] font-bold leading-tight text-foreground">{c.d.rotulo}</span>
                        </label>
                      ))}
                    </div>
                    <button type="button" className="btn-3d px-3 py-1.5 text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
                      disabled={busy !== null || h1.trim().length !== 3 || h2.trim().length !== 3} onClick={responderDesafio}>
                      {busy === "responder" ? "Conferindo…" : "Conferir desafio"}
                    </button>
                    <div className="text-[10px] text-muted-foreground">Prova fraca: os dados estão no cadastro. O e-mail de confirmação do cliente continua sendo enviado.</div>
                  </div>
                )}
              </div>

              {!resumo.pendente && (
                <div className="space-y-2 border-t border-foreground/10 pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo" className="concave-3d px-2 py-1.5 text-[11px]">
                      {MOTIVOS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <button type="button" className="btn-3d-soft px-3 py-1.5 text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
                      disabled={busy !== null} onClick={depois} data-testid={`confirmacao-depois-${sessionId}`}>
                      {busy === "depois" ? "Registrando…" : "Cliente confirma depois"}
                    </button>
                  </div>
                  <div className="text-[10px] text-muted-foreground">Seu registro da aplicação não depende disto. O cliente recebe até 3 e-mails (1 por dia) e a gestão é avisada.</div>
                </div>
              )}
            </>
          )}

          {!enabled && <div className="text-[11px] text-muted-foreground">Entre com seu acesso profissional para registrar a confirmação do cliente.</div>}
          {msg && (
            <div role="status" data-testid={`confirmacao-msg-${sessionId}`}
              className={`text-[11px] font-bold ${msg.tipo === "erro" ? "text-red-700" : msg.tipo === "aviso" ? "text-amber-800" : "text-emerald-700"}`}>
              {msg.texto}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
