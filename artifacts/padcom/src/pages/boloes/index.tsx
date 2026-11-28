import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Crown, Clock3, Eye, FileUp, History, Inbox, Loader2, RefreshCw, Settings, Ticket, Users } from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import GrupoVipGestao, { type CampanhaVip, type ParticipacaoVip } from "./GrupoVipGestao";

// Central de Bolões (gestor da clínica).
// Recebe recibos REAIS por canal autorizado (envio manual ou pasta do Drive da própria clínica), mostra o que o
// sistema leu, sugere a participação e deixa o gestor decidir. Nada aqui compra, aposta, cobra ou gera comprovante.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const G = `${BASE}/api/boloes/gestao`;

type Motivo = { codigo: string; texto: string };
type Recebimento = {
  id: number; origem: "manual" | "drive"; nomeOriginal: string | null; mime: string | null; bytes: number | null;
  status: string; motivos: Motivo[]; codigoRecibo: string | null;
  extraido: { concurso: string | null; dataSorteio: string | null; cotas: number | null; nomeImpresso: string | null; emissor: string | null; confianca: number } | null;
  sugerida: { participacaoId: number; cliente: string; campanha: string; cotas: number } | null;
  criadoEm: string; decididoPor: string | null; motivoRejeicao: string | null; duplicadoDe: number | null; temArquivo: boolean;
};
type Participacao = {
  id: number; cliente: { id: number; nome: string }; campanha: { id: number; nome: string; concurso: string | null; dataSorteio: string | null };
  cotas: number; pagamento: "nao_informado" | "pendente" | "confirmado"; registro: string; entrega: string;
  comprovante: { id: number; tipo: string } | null;
};
type Campanha = { id: number; nome: string; concurso: string | null; dataSorteio: string | null };
type Config = { driveFolderId: string | null; autoAprovar: boolean };
type Evento = { id: number; ator: string; acao: string; resultado: string; detalhe: string | null; criadoEm: string };

const brDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const brDate = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

const PAGAMENTO: Record<string, string> = { nao_informado: "Não informado", pendente: "Pendente", confirmado: "Confirmado" };
const REGISTRO: Record<string, string> = { pendente_registro: "Aguardando recibo", registrada: "Registrada", cancelada: "Cancelada" };
const ENTREGA: Record<string, string> = { indisponivel: "Indisponível", disponivel: "Disponível", baixado: "Baixado pelo cliente" };
const STATUS_REC: Record<string, string> = {
  recebido: "Recebido", lendo: "Lendo", em_revisao: "Em revisão", aprovado: "Aprovado", rejeitado: "Rejeitado", duplicado: "Duplicado",
};

async function chamar<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const headers = collabAuthHeaders(init?.json !== undefined ? { "Content-Type": "application/json" } : {});
  const res = await fetch(`${G}${path}`, { ...init, headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 403 ? "Acesso restrito ao gestor da clínica." : res.status === 401 ? "Sessão expirada. Entre novamente." : body.error ?? "Não foi possível concluir.");
  return body as T;
}

async function abrirArquivo(path: string) {
  const res = await fetch(`${G}${path}`, { headers: collabAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Não foi possível abrir o arquivo.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Painel({ titulo, icone, children }: { titulo: string; icone?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label={titulo}>
      <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
        {icone}
        <h2 className="text-primary text-xs font-black uppercase tracking-widest">{titulo}</h2>
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="concave-3d rounded-lg px-3 py-2 min-w-0">
      <p className="text-accent text-[9px] font-black uppercase tracking-widest">{label}</p>
      <p className="text-primary text-sm font-bold break-words">{value || "—"}</p>
    </div>
  );
}

const BTN = "btn-3d-soft min-h-[44px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60 inline-flex items-center justify-center gap-2";

type Aba = "fila" | "participacoes" | "grupovip" | "cadastro" | "historico";

export default function CentralBoloesPage() {
  const [aba, setAba] = useState<Aba>("fila");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [resumo, setResumo] = useState<{ emRevisao?: number; config: Config } | null>(null);
  const [fila, setFila] = useState<Recebimento[]>([]);
  const [partes, setPartes] = useState<Participacao[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const falhou = (e: unknown) => setMsg({ tipo: "erro", texto: (e as Error).message });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [r, f, p, a] = await Promise.all([
        chamar<{ emRevisao?: number; config: Config }>("/resumo"),
        chamar<{ recebimentos: Recebimento[] }>("/recebimentos"),
        chamar<{ participacoes: Participacao[]; campanhas: Campanha[] }>("/participacoes"),
        chamar<{ eventos: Evento[] }>("/auditoria"),
      ]);
      setResumo(r); setFila(f.recebimentos); setPartes(p.participacoes); setCampanhas(p.campanhas); setEventos(a.eventos);
    } catch (e) { falhou(e); } finally { setCarregando(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function executar(chave: string, fn: () => Promise<unknown>, ok: string) {
    setOcupado(chave); setMsg(null);
    try { await fn(); setMsg({ tipo: "ok", texto: ok }); await carregar(); } catch (e) { falhou(e); } finally { setOcupado(null); }
  }

  const emRevisao = fila.filter((r) => r.status === "em_revisao");
  const abertas = useMemo(() => partes.filter((p) => p.registro === "pendente_registro" && !p.comprovante), [partes]);

  return (
    <div className="space-y-3 max-w-5xl mx-auto" data-testid="central-boloes">
      <Painel titulo="Central de Bolões" icone={<Ticket className="w-4 h-4 text-accent" aria-hidden="true" />}>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Aqui você recebe e confere recibos oficiais da CAIXA. O sistema lê e sugere; quem libera o recibo ao cliente é você.
          Este sistema não compra, não aposta, não cobra e não cria comprovante. Pagamento, registro da aposta e entrega do comprovante são etapas separadas.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className={BTN} onClick={() => void carregar()} disabled={carregando}>
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />} Atualizar
          </button>
        </div>
      </Painel>

      {msg && (
        <div className={`panel-3d-sub rounded-xl p-3 text-sm ${msg.tipo === "erro" ? "text-destructive" : "text-primary"}`} role={msg.tipo === "erro" ? "alert" : "status"}>
          {msg.texto}
        </div>
      )}

      <nav className="grid grid-cols-2 sm:grid-cols-5 gap-2" aria-label="Seções da Central de Bolões">
        {([
          ["fila", `Fila de revisão (${emRevisao.length})`, Inbox],
          ["participacoes", `Participações (${partes.length})`, Users],
          ["grupovip", "Grupo VIP", Crown],
          ["cadastro", "Cadastro e configuração", Settings],
          ["historico", "Histórico", History],
        ] as const).map(([k, rot, Icone]) => (
          <button key={k} type="button" aria-pressed={aba === k} onClick={() => setAba(k)}
            className={`${aba === k ? "bevel-3d" : "btn-3d-soft"} min-h-[48px] px-2 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5`}>
            <Icone className="w-4 h-4 shrink-0" aria-hidden="true" /> <span>{rot}</span>
          </button>
        ))}
      </nav>

      {aba === "fila" && (
        <Painel titulo="Fila de revisão" icone={<Inbox className="w-4 h-4 text-accent" aria-hidden="true" />}>
          <EnviarRecibo ocupado={ocupado} onEnviar={(f) => executar("envio", async () => {
            const fd = new FormData(); fd.append("file", f);
            const res = await fetch(`${G}/recebimentos`, { method: "POST", headers: collabAuthHeaders(), body: fd });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Não foi possível receber o arquivo.");
          }, "Arquivo recebido e lido. Confira a sugestão na fila.")} />
          {fila.length === 0 && !carregando && <p className="concave-3d rounded-lg p-4 text-center text-muted-foreground text-sm" data-testid="fila-vazia">Nenhum recibo recebido ainda.</p>}
          {fila.map((r) => (
            <ItemFila key={r.id} r={r} abertas={abertas} ocupado={ocupado}
              onVer={() => abrirArquivo(`/recebimentos/${r.id}/arquivo`).catch(falhou)}
              onAprovar={(participacaoId) => executar(`ap${r.id}`, () => chamar(`/recebimentos/${r.id}/aprovar`, { method: "POST", json: { participacaoId, confirmoReciboCaixaReal: true } }), "Recibo aprovado e liberado ao cliente.")}
              onRejeitar={(motivo) => executar(`rj${r.id}`, () => chamar(`/recebimentos/${r.id}/rejeitar`, { method: "POST", json: { motivo } }), "Arquivo recusado.")}
              onReler={() => executar(`rl${r.id}`, () => chamar(`/recebimentos/${r.id}/reprocessar`, { method: "POST" }), "Arquivo lido novamente.")} />
          ))}
        </Painel>
      )}

      {aba === "grupovip" && (
        <GrupoVipGestao chamar={chamar} partes={partes as unknown as ParticipacaoVip[]} campanhas={campanhas as unknown as CampanhaVip[]} ocupado={ocupado} executar={executar} />
      )}

      {aba === "participacoes" && (
        <Painel titulo="Participações" icone={<Users className="w-4 h-4 text-accent" aria-hidden="true" />}>
          {partes.length === 0 && <p className="concave-3d rounded-lg p-4 text-center text-muted-foreground text-sm">Nenhuma participação cadastrada.</p>}
          {partes.map((p) => (
            <LinhaParticipacao key={p.id} p={p} partes={partes} ocupado={ocupado}
              onPagamento={(status) => executar(`pg${p.id}`, () => chamar(`/participacoes/${p.id}/pagamento`, { method: "POST", json: { status } }), "Pagamento atualizado (informação interna, sem cobrança).")}
              onVer={() => p.comprovante && abrirArquivo(`/comprovantes/${p.comprovante.id}/arquivo`).catch(falhou)}
              onReassociar={(destinoId, motivo) => executar(`ra${p.id}`, () => chamar(`/comprovantes/${p.comprovante!.id}/reassociar`, { method: "POST", json: { destinoId, motivo } }), "Associação corrigida.")}
              onRevogar={(motivo) => executar(`rv${p.id}`, () => chamar(`/comprovantes/${p.comprovante!.id}/revogar`, { method: "POST", json: { motivo } }), "Comprovante revogado; o arquivo voltou para a fila.")} />
          ))}
        </Painel>
      )}

      {aba === "cadastro" && (
        <Cadastro campanhas={campanhas} partes={partes} config={resumo?.config ?? null} ocupado={ocupado}
          onCampanha={(b) => executar("camp", () => chamar("/campanhas", { method: "POST", json: b }), "Campanha criada.")}
          onParticipacao={(b) => executar("part", () => chamar("/participacoes", { method: "POST", json: b }), "Participação registrada.")}
          onConfig={(b) => executar("cfg", () => chamar("/config", { method: "PUT", json: b }), "Configuração salva.")} />
      )}

      {aba === "historico" && (
        <Painel titulo="Histórico de ações" icone={<History className="w-4 h-4 text-accent" aria-hidden="true" />}>
          {eventos.length === 0 && <p className="text-muted-foreground text-sm">Nenhum evento registrado.</p>}
          <ul className="space-y-2">
            {eventos.map((e) => (
              <li key={e.id} className="concave-3d rounded-lg px-3 py-2 text-xs">
                <p className="text-primary font-black uppercase tracking-wider break-words">{e.acao.replaceAll("_", " ")} <span className="text-muted-foreground normal-case font-bold">· {e.resultado}</span></p>
                <p className="text-muted-foreground">{brDateTime(e.criadoEm)} · {e.ator}</p>
                {e.detalhe && <p className="text-foreground break-words">{e.detalhe}</p>}
              </li>
            ))}
          </ul>
        </Painel>
      )}
    </div>
  );
}

function EnviarRecibo({ ocupado, onEnviar }: { ocupado: string | null; onEnviar: (f: File) => void }) {
  return (
    <div className="concave-3d rounded-lg p-3 space-y-2">
      <p className="text-primary text-[11px] font-black uppercase tracking-wider">Inserir recibo real recebido</p>
      <p className="text-muted-foreground text-xs">PDF, PNG ou JPEG até 10 MB, recebido por canal autorizado. O mesmo arquivo nunca entra duas vezes.</p>
      <label className={`${BTN} cursor-pointer w-full sm:w-auto`}>
        {ocupado === "envio" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileUp className="w-4 h-4" aria-hidden="true" />}
        Escolher arquivo
        <input type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" disabled={ocupado !== null}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onEnviar(f); }} />
      </label>
    </div>
  );
}

function ItemFila({ r, abertas, ocupado, onVer, onAprovar, onRejeitar, onReler }: {
  r: Recebimento; abertas: Participacao[]; ocupado: string | null; onVer: () => void;
  onAprovar: (id: number) => void; onRejeitar: (motivo: string) => void; onReler: () => void;
}) {
  const [escolha, setEscolha] = useState<string>(r.sugerida ? String(r.sugerida.participacaoId) : "");
  const [confirmo, setConfirmo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [recusando, setRecusando] = useState(false);
  const decidivel = r.status === "em_revisao";
  const ex = r.extraido;
  return (
    <article className="panel-3d-sub rounded-xl p-3 space-y-3" data-testid="item-fila" data-status={r.status} aria-label={`Recibo ${r.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-primary text-sm font-black uppercase tracking-wide break-words">{r.nomeOriginal ?? `Recibo ${r.id}`}</p>
          <p className="text-muted-foreground text-[11px]">{r.origem === "drive" ? "Pasta do Drive" : "Envio manual"} · {brDateTime(r.criadoEm)}</p>
        </div>
        <span className="bevel-3d px-2 py-1 text-[10px] font-black uppercase tracking-wider shrink-0">{STATUS_REC[r.status] ?? r.status}</span>
      </div>

      {ex && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Campo label="CONCURSO LIDO" value={ex.concurso ?? ""} />
          <Campo label="SORTEIO LIDO" value={brDate(ex.dataSorteio)} />
          <Campo label="COTAS LIDAS" value={ex.cotas !== null ? String(ex.cotas) : ""} />
          <Campo label="CONFIANÇA DA LEITURA" value={`${Math.round(ex.confianca * 100)}%`} />
        </div>
      )}
      {r.motivos.length > 0 && (
        <ul className="space-y-1" aria-label="Pontos de atenção">
          {r.motivos.map((m) => (
            <li key={m.codigo} className="flex items-start gap-2 text-xs text-foreground"><AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />{m.texto}</li>
          ))}
        </ul>
      )}
      {r.sugerida && decidivel && (
        <p className="concave-3d rounded-lg px-3 py-2 text-xs text-primary"><strong>Sugestão do sistema:</strong> {r.sugerida.cliente} — {r.sugerida.campanha} ({r.sugerida.cotas} cotas). É só uma sugestão; confira o arquivo.</p>
      )}
      {r.status === "rejeitado" && r.motivoRejeicao && <p className="text-xs text-muted-foreground">Motivo: {r.motivoRejeicao}</p>}
      {r.status === "duplicado" && <p className="text-xs text-muted-foreground">Arquivo idêntico a outro já recebido{r.duplicadoDe ? ` (recibo ${r.duplicadoDe})` : ""}. Nada foi duplicado.</p>}

      <div className="flex gap-2 flex-wrap">
        {r.temArquivo && <button type="button" className={BTN} onClick={onVer}><Eye className="w-4 h-4" aria-hidden="true" /> Ver arquivo</button>}
        {decidivel && <button type="button" className={BTN} disabled={ocupado !== null} onClick={onReler}><RefreshCw className="w-4 h-4" aria-hidden="true" /> Ler de novo</button>}
      </div>

      {decidivel && (
        <div className="space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor={`sel-${r.id}`}>Liberar para qual participação?</label>
          <select id={`sel-${r.id}`} className="field-engraved w-full min-h-[44px] px-2 text-sm" value={escolha} onChange={(e) => setEscolha(e.target.value)}>
            <option value="">Escolha a participação…</option>
            {abertas.map((p) => <option key={p.id} value={p.id}>{p.cliente.nome} — {p.campanha.nome} ({p.cotas} cotas)</option>)}
          </select>
          <label className="flex items-start gap-2 text-xs text-foreground min-h-[44px]">
            <input type="checkbox" className="mt-1 w-5 h-5" checked={confirmo} onChange={(e) => setConfirmo(e.target.checked)} />
            <span>Confirmo que conferi o arquivo: é o recibo real da CAIXA, recebido por canal autorizado, e pertence a esta participação.</span>
          </label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={`${BTN} bevel-3d`} disabled={!escolha || !confirmo || ocupado !== null} onClick={() => onAprovar(Number(escolha))}>
              {ocupado === `ap${r.id}` ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="w-4 h-4" aria-hidden="true" />} Aprovar e liberar
            </button>
            <button type="button" className={BTN} onClick={() => setRecusando((v) => !v)} aria-expanded={recusando}>Recusar arquivo</button>
          </div>
          {recusando && (
            <div className="space-y-2">
              <label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor={`mot-${r.id}`}>Motivo da recusa</label>
              <input id={`mot-${r.id}`} className="field-engraved w-full min-h-[44px] px-2 text-sm" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
              <button type="button" className={BTN} disabled={motivo.trim().length < 3 || ocupado !== null} onClick={() => onRejeitar(motivo.trim())}>Confirmar recusa</button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function LinhaParticipacao({ p, partes, ocupado, onPagamento, onVer, onReassociar, onRevogar }: {
  p: Participacao; partes: Participacao[]; ocupado: string | null; onPagamento: (s: string) => void; onVer: () => void;
  onReassociar: (destino: number, motivo: string) => void; onRevogar: (motivo: string) => void;
}) {
  const [corrigindo, setCorrigindo] = useState(false);
  const [destino, setDestino] = useState("");
  const [motivo, setMotivo] = useState("");
  const livres = partes.filter((x) => x.id !== p.id && !x.comprovante && x.registro !== "cancelada");
  return (
    <article className="panel-3d-sub rounded-xl p-3 space-y-3" data-testid="linha-participacao" aria-label={`Participação de ${p.cliente.nome}`}>
      <div className="min-w-0">
        <p className="text-primary text-sm font-black uppercase tracking-wide break-words">{p.cliente.nome}</p>
        <p className="text-muted-foreground text-[11px]">{p.campanha.nome} · concurso {p.campanha.concurso ?? "—"} · sorteio {brDate(p.campanha.dataSorteio)} · {p.cotas} cotas</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Campo label="PAGAMENTO (INFORMADO)" value={PAGAMENTO[p.pagamento]} />
        <Campo label="REGISTRO DA APOSTA" value={REGISTRO[p.registro] ?? p.registro} />
        <Campo label="ENTREGA DO COMPROVANTE" value={ENTREGA[p.entrega] ?? p.entrega} />
      </div>
      <div className="flex gap-2 flex-wrap items-center">
        <label className="sr-only" htmlFor={`pg-${p.id}`}>Pagamento informado</label>
        <select id={`pg-${p.id}`} className="field-engraved min-h-[44px] px-2 text-sm" value={p.pagamento} disabled={ocupado !== null} onChange={(e) => onPagamento(e.target.value)}>
          <option value="nao_informado">Pagamento: não informado</option>
          <option value="pendente">Pagamento: pendente</option>
          <option value="confirmado">Pagamento: confirmado</option>
        </select>
        {p.comprovante && <button type="button" className={BTN} onClick={onVer}><Eye className="w-4 h-4" aria-hidden="true" /> Ver recibo</button>}
        {p.comprovante && <button type="button" className={BTN} aria-expanded={corrigindo} onClick={() => setCorrigindo((v) => !v)}>Corrigir associação</button>}
      </div>
      {corrigindo && p.comprovante && (
        <div className="concave-3d rounded-lg p-3 space-y-2">
          <label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor={`dest-${p.id}`}>Mover o recibo para</label>
          <select id={`dest-${p.id}`} className="field-engraved w-full min-h-[44px] px-2 text-sm" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Escolha a participação correta…</option>
            {livres.map((x) => <option key={x.id} value={x.id}>{x.cliente.nome} — {x.campanha.nome}</option>)}
          </select>
          <label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor={`cm-${p.id}`}>Motivo da correção</label>
          <input id={`cm-${p.id}`} className="field-engraved w-full min-h-[44px] px-2 text-sm" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <div className="flex gap-2 flex-wrap">
            <button type="button" className={BTN} disabled={!destino || motivo.trim().length < 3 || ocupado !== null} onClick={() => onReassociar(Number(destino), motivo.trim())}>Mover recibo</button>
            <button type="button" className={BTN} disabled={motivo.trim().length < 3 || ocupado !== null} onClick={() => onRevogar(motivo.trim())}>Revogar recibo</button>
          </div>
          <p className="text-muted-foreground text-[11px]">Revogar tira o acesso do cliente e devolve o arquivo à fila de revisão. Nada é apagado.</p>
        </div>
      )}
    </article>
  );
}

function Cadastro({ campanhas, partes, config, ocupado, onCampanha, onParticipacao, onConfig }: {
  campanhas: Campanha[]; partes: Participacao[]; config: Config | null; ocupado: string | null;
  onCampanha: (b: { nome: string; concurso?: string; dataSorteio?: string }) => void;
  onParticipacao: (b: { campanhaId: number; clientId: number; cotas: number }) => void;
  onConfig: (b: { driveFolderId: string | null; autoAprovar: boolean; confirmoAprovacaoAutomatica?: boolean }) => void;
}) {
  const [nome, setNome] = useState(""); const [concurso, setConcurso] = useState(""); const [data, setData] = useState("");
  const [campId, setCampId] = useState(""); const [clientId, setClientId] = useState(""); const [cotas, setCotas] = useState("1");
  const [pasta, setPasta] = useState(config?.driveFolderId ?? ""); const [auto, setAuto] = useState(config?.autoAprovar ?? false); const [confAuto, setConfAuto] = useState(false);
  useEffect(() => { setPasta(config?.driveFolderId ?? ""); setAuto(config?.autoAprovar ?? false); setConfAuto(false); }, [config]);
  const { data: todosCli } = useListClients();
  const opcoesCli = useMemo(() => (todosCli ?? []).map((cl) => ({ id: cl.id, name: cl.name, cpf: cl.cpf ?? null, phone: cl.phone ?? null, photoUrl: (cl as { photoUrl?: string | null }).photoUrl ?? null })), [todosCli]);
  const ligandoAuto = auto && !(config?.autoAprovar ?? false);
  return (
    <>
      <Painel titulo="Nova campanha" icone={<Ticket className="w-4 h-4 text-accent" aria-hidden="true" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div><label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor="c-nome">Nome</label>
            <input id="c-nome" className="field-engraved w-full min-h-[44px] px-2 text-sm" maxLength={120} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
          <div><label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor="c-conc">Concurso</label>
            <input id="c-conc" className="field-engraved w-full min-h-[44px] px-2 text-sm" maxLength={60} value={concurso} onChange={(e) => setConcurso(e.target.value)} /></div>
          <div><label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor="c-data">Data do sorteio</label>
            <input id="c-data" type="date" className="field-engraved w-full min-h-[44px] px-2 text-sm" value={data} onChange={(e) => setData(e.target.value)} /></div>
        </div>
        <p className="text-muted-foreground text-[11px]">Sem concurso e data, o sistema não consegue sugerir a participação a partir do recibo.</p>
        <button type="button" className={BTN} disabled={!nome.trim() || ocupado !== null}
          onClick={() => { onCampanha({ nome: nome.trim(), ...(concurso.trim() ? { concurso: concurso.trim() } : {}), ...(data ? { dataSorteio: data } : {}) }); setNome(""); setConcurso(""); setData(""); }}>Criar campanha</button>
      </Painel>

      <Painel titulo="Registrar participação de cliente" icone={<Users className="w-4 h-4 text-accent" aria-hidden="true" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div><label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor="p-camp">Campanha</label>
            <select id="p-camp" className="field-engraved w-full min-h-[44px] px-2 text-sm" value={campId} onChange={(e) => setCampId(e.target.value)}>
              <option value="">Escolha…</option>{campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select></div>
          <div><label className="block text-[11px] font-black uppercase tracking-wider text-primary">Cliente</label>
            <PaxterClientSelector clientes={opcoesCli} value={clientId ? Number(clientId) : null} onChange={(id) => setClientId(id ? String(id) : "")} placeholder="Selecionar cliente…" /></div>
          <div><label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor="p-cotas">Cotas</label>
            <input id="p-cotas" inputMode="numeric" className="field-engraved w-full min-h-[44px] px-2 text-sm" value={cotas} onChange={(e) => setCotas(e.target.value.replace(/\D/g, ""))} /></div>
        </div>
        <button type="button" className={BTN} disabled={!campId || !clientId || !Number(cotas) || ocupado !== null}
          onClick={() => onParticipacao({ campanhaId: Number(campId), clientId: Number(clientId), cotas: Number(cotas) })}>Registrar participação</button>
        <p className="text-muted-foreground text-[11px]">{partes.length} participação(ões) cadastrada(s) nesta clínica. Registrar a participação não cobra o cliente e não afirma que a aposta foi feita.</p>
      </Painel>

      <Painel titulo="Recebimento automático" icone={<Settings className="w-4 h-4 text-accent" aria-hidden="true" />}>
        <div>
          <label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor="cfg-pasta">Código da pasta do Drive da clínica (opcional)</label>
          <input id="cfg-pasta" className="field-engraved w-full min-h-[44px] px-2 text-sm" value={pasta} onChange={(e) => setPasta(e.target.value.trim())} placeholder="Cole só o código da pasta" />
          <p className="text-muted-foreground text-[11px] mt-1">Arquivos colocados nesta pasta entram na fila de revisão a cada 5 minutos. Sem pasta, nada é recebido automaticamente.</p>
        </div>
        <label className="flex items-start gap-2 text-xs text-foreground min-h-[44px]">
          <input type="checkbox" className="mt-1 w-5 h-5" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
          <span>Liberar automaticamente recibos lidos com alta certeza (desligado por padrão). Recomendado manter desligado até conferir recibos reais.</span>
        </label>
        {ligandoAuto && (
          <label className="flex items-start gap-2 text-xs text-foreground min-h-[44px]">
            <input type="checkbox" className="mt-1 w-5 h-5" checked={confAuto} onChange={(e) => setConfAuto(e.target.checked)} />
            <span>Entendo que recibos lidos com alta certeza serão liberados ao cliente sem conferência humana.</span>
          </label>
        )}
        <button type="button" className={BTN} disabled={ocupado !== null || (ligandoAuto && !confAuto)}
          onClick={() => onConfig({ driveFolderId: pasta || null, autoAprovar: auto, ...(ligandoAuto ? { confirmoAprovacaoAutomatica: true } : {}) })}>Salvar configuração</button>
        <p className="text-muted-foreground text-[11px] flex items-start gap-1.5"><Clock3 className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />Não há consulta à CAIXA: o canal oficial de recibos ainda precisa ser definido pela clínica.</p>
      </Painel>
    </>
  );
}
