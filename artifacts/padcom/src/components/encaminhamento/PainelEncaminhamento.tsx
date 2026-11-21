/**
 * PAINEL DE ENCAMINHAMENTO — modelo único para toda ferramenta que produz um documento.
 *
 * Três áreas, sempre na mesma ordem e com slots de tamanho fixo (Grade Imaginária, Lei 3 e Lei 4):
 *   1. PARA ONDE ENVIAR  — quatro canais lado a lado (WhatsApp, Telegram, E-mail, Instagram).
 *                          Vários canais podem ser marcados ao mesmo tempo. Sem contato = slot com "—".
 *   2. BAIXAR E GUARDAR  — abrir, baixar o PDF e guardar na subpasta certa da pasta do cliente.
 *   3. CONFIRMAR E ENVIAR — uma confirmação, um botão, um resultado por canal.
 *
 * O PDF enviado é sempre o já emitido. O destino vem do cadastro lido pelo servidor; nada digitado aqui
 * vira destinatário. Instagram é MANUAL: a Meta só permite mensagem automática para quem escreveu primeiro.
 */
import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2, ChevronDown, Download, Eye, FolderInput, Instagram, Mail, MessageCircle, Send,
} from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";

const API = import.meta.env.BASE_URL + "api";

export type TipoDocumento =
  | "prescricao" | "pedido_exames" | "atestado" | "encaminhamento"
  | "protocolo" | "ras_fap" | "carta_tratamento" | "documento_assinado";
type Canal = "WHATSAPP" | "TELEGRAM" | "EMAIL";
type Alvo = { channel: Canal; recipient: string };
type Historico = {
  id: number; createdAt: string; channel: Canal; state: string;
  recipientMasked: string; expiresAt: string | null; completedAt: string | null;
};

/** Espelho de exibição de PASTA_POR_TIPO (servidor). A decisão final é sempre do servidor. */
const PASTA: Record<TipoDocumento, string> = {
  prescricao: "RECEITAS", pedido_exames: "EXAMES", atestado: "ATESTADOS", encaminhamento: "ATESTADOS",
  protocolo: "PROTOCOLOS", ras_fap: "PROTOCOLOS", carta_tratamento: "PROTOCOLOS", documento_assinado: "CONTRATOS",
};

const CANAIS: Array<{ id: Canal; nome: string; Icone: typeof Mail }> = [
  { id: "WHATSAPP", nome: "WhatsApp", Icone: MessageCircle },
  { id: "TELEGRAM", nome: "Telegram", Icone: Send },
  { id: "EMAIL", nome: "E-mail", Icone: Mail },
];
const NOME_CANAL: Record<Canal, string> = { WHATSAPP: "WhatsApp", TELEGRAM: "Telegram", EMAIL: "E-mail" };

const ESTADOS: Record<string, string> = {
  requested: "Aguardando resultado",
  provider_accepted: "Aceito pelo provedor; entrega não confirmada",
  simulated: "Simulado; nenhuma mensagem enviada",
  failed: "Falha confirmada",
  unknown: "Resultado incerto; confira antes de repetir",
};

const RÓTULO = "text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none";

function Zona({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2" aria-label={titulo}>
      <div className="bevel-3d inline-flex px-2.5 py-1 text-[10px] font-black uppercase tracking-widest">{titulo}</div>
      {children}
    </section>
  );
}

function Slot({ ligado, desabilitado, onClick, children, rotulo }: {
  ligado: boolean; desabilitado: boolean; onClick: () => void; children: ReactNode; rotulo: string;
}) {
  return (
    <button
      type="button" role="checkbox" aria-checked={ligado} aria-label={rotulo} disabled={desabilitado} onClick={onClick}
      className={`relative h-[92px] w-full min-w-0 px-2.5 py-2 text-left flex flex-col justify-between rounded-[6px] transition
        ${ligado ? "bevel-3d ring-2 ring-[#9a7b32]" : "concave-3d"} ${desabilitado ? "opacity-55 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {children}
    </button>
  );
}

async function buscarPdf(caminho: string, baixar: boolean, nome: string) {
  const token = getCollabToken();
  if (!token) throw new Error("Faça login de colaborador para continuar.");
  const aba = baixar ? null : window.open("about:blank", "_blank");
  if (aba) aba.opener = null;
  try {
    const r = await fetch(caminho, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error("Não foi possível abrir o PDF autorizado.");
    const url = URL.createObjectURL(await r.blob());
    if (baixar) {
      const a = document.createElement("a");
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    } else if (aba) {
      aba.location.href = url;
    } else {
      URL.revokeObjectURL(url);
      throw new Error("Permita abrir uma nova aba para visualizar o documento.");
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    aba?.close();
    throw e;
  }
}

export default function PainelEncaminhamento({ clientId, documentType, documentId, iniciarAberto = false }: {
  clientId: number; documentType: TipoDocumento; documentId: number; iniciarAberto?: boolean;
}) {
  const [aberto, setAberto] = useState(iniciarAberto);
  const [alvos, setAlvos] = useState<Alvo[]>([]);
  const [instagram, setInstagram] = useState<string | null>(null);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(false);
  const [marcados, setMarcados] = useState<Canal[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultados, setResultados] = useState<Array<{ channel: Canal; state: string; error?: string }>>([]);
  const [aviso, setAviso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState<{ ok: boolean; texto: string; link?: string } | null>(null);
  const pasta = PASTA[documentType];

  useEffect(() => {
    if (!aberto) { setAlvos([]); setMarcados([]); setConfirmado(false); return; }
    const token = getCollabToken();
    if (!token) { setErro("Faça login de colaborador para conferir os canais."); return; }
    const ac = new AbortController();
    setCarregando(true); setErro("");
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/clinical-documents/delivery-targets/${clientId}`, { headers, signal: ac.signal }),
      fetch(`${API}/clinical-documents/delivery-history/${documentType}/${documentId}`, { headers, signal: ac.signal }),
    ]).then(async ([a, h]) => {
      const [da, dh] = await Promise.all([a.json().catch(() => null), h.json().catch(() => null)]);
      if (!a.ok) throw new Error(da?.error || "Não foi possível conferir os destinatários.");
      if (!h.ok) throw new Error(dh?.error || "Não foi possível consultar os envios anteriores.");
      if (ac.signal.aborted) return;
      setAlvos(Array.isArray(da?.targets) ? da.targets : []);
      setInstagram(typeof da?.manual?.instagram === "string" ? da.manual.instagram : null);
      setHistorico(Array.isArray(dh?.deliveries) ? dh.deliveries : []);
    }).catch((e: unknown) => { if (!ac.signal.aborted) setErro(e instanceof Error ? e.message : "Falha ao consultar os dados do documento."); })
      .finally(() => { if (!ac.signal.aborted) setCarregando(false); });
    return () => ac.abort();
  }, [aberto, clientId, documentType, documentId, versao]);

  const contato = (c: Canal) => alvos.find((a) => a.channel === c)?.recipient ?? "";
  const disponiveis = CANAIS.filter((c) => contato(c.id));
  const alternar = (c: Canal) => {
    setMarcados((atual) => atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]);
    setConfirmado(false); setResultados([]);
  };
  const handle = instagram ? instagram.replace(/^@/, "").replace(/\s+/g, "") : "";

  async function enviar() {
    if (!confirmado || !marcados.length || enviando) return;
    const token = getCollabToken();
    if (!token) { setErro("Faça login de colaborador para continuar."); return; }
    setEnviando(true); setErro(""); setResultados([]); setAviso("");
    try {
      const r = await fetch(`${API}/clinical-documents/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId, documentType, documentId, channels: marcados, confirmed: true, operationKey: crypto.randomUUID() }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "O servidor não confirmou o envio.");
      setResultados(d.results || []);
      if (d.shareExpiresAt) setAviso(`Link seguro válido até ${new Date(d.shareExpiresAt).toLocaleDateString("pt-BR")}.`);
      setConfirmado(false);
      setVersao((v) => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha no envio; confira o histórico antes de repetir.");
    } finally { setEnviando(false); }
  }

  async function guardar() {
    const token = getCollabToken();
    if (!token || guardando) return;
    setGuardando(true); setGuardado(null);
    try {
      const r = await fetch(`${API}/clinical-documents/archive-folder`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId, documentType, documentId, confirmed: true }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "O servidor não confirmou o arquivamento.");
      setGuardado({
        ok: true, link: d.webViewLink,
        texto: d.estado === "ja_estava" ? `Já estava na pasta ${d.pasta} do cliente. Nada foi duplicado.` : `Guardado na pasta ${d.pasta} do cliente.`,
      });
    } catch (e) {
      setGuardado({ ok: false, texto: e instanceof Error ? e.message : "Falha ao guardar na pasta." });
    } finally { setGuardando(false); }
  }

  const caminhoPdf = `${API}/clinical-documents/${documentType}/${documentId}/pdf`;
  const acaoPdf = (baixar: boolean) => {
    setErro("");
    void buscarPdf(baixar ? `${caminhoPdf}?download=1` : caminhoPdf, baixar, `${documentType}-${documentId}.pdf`)
      .catch((e) => setErro(e instanceof Error ? e.message : "Falha ao abrir o PDF."));
  };

  return (
    <div className="panel-3d-sub p-2">
      <button
        type="button" aria-expanded={aberto} onClick={() => { setAberto((v) => !v); setErro(""); setResultados([]); }}
        className="btn-3d-soft w-full h-10 px-3 inline-flex items-center justify-between gap-2 text-[11px] font-black uppercase tracking-wider"
      >
        <span className="inline-flex items-center gap-2"><Send className="h-4 w-4" />Encaminhar · baixar · guardar</span>
        <ChevronDown className={`h-4 w-4 transition ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="mt-3 space-y-4 px-1 pb-1">
          <Zona titulo="1 · Para onde enviar">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CANAIS.map(({ id, nome, Icone }) => {
                const valor = contato(id);
                const ligado = marcados.includes(id);
                return (
                  <Slot key={id} ligado={ligado} desabilitado={!valor || enviando || carregando} onClick={() => alternar(id)} rotulo={`${nome}${valor ? `: ${valor}` : ": sem contato"}`}>
                    <span className="flex items-center justify-between">
                      <span className={`${RÓTULO} inline-flex items-center gap-1`}><Icone className="h-3.5 w-3.5" />{nome}</span>
                      {ligado && <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                    </span>
                    <span className="text-[11px] font-bold leading-tight break-all line-clamp-2">{valor || "—"}</span>
                    <span className={`${RÓTULO} ${valor ? "" : "opacity-60"}`}>{!valor ? "Sem contato cadastrado" : ligado ? "Marcado" : "Toque para marcar"}</span>
                  </Slot>
                );
              })}
              {handle ? (
                <a
                  href={`https://ig.me/m/${encodeURIComponent(handle)}`} target="_blank" rel="noreferrer"
                  className="concave-3d h-[92px] min-w-0 px-2.5 py-2 flex flex-col justify-between rounded-[6px] hover:ring-2 hover:ring-[#9a7b32]"
                  aria-label={`Instagram manual: abrir conversa com ${instagram}`}
                >
                  <span className={`${RÓTULO} inline-flex items-center gap-1`}><Instagram className="h-3.5 w-3.5" />Instagram</span>
                  <span className="text-[11px] font-bold leading-tight break-all line-clamp-2">{instagram}</span>
                  <span className={RÓTULO}>Manual · abrir conversa</span>
                </a>
              ) : (
                <div className="concave-3d h-[92px] min-w-0 px-2.5 py-2 flex flex-col justify-between rounded-[6px] opacity-55" aria-label="Instagram: sem perfil cadastrado">
                  <span className={`${RÓTULO} inline-flex items-center gap-1`}><Instagram className="h-3.5 w-3.5" />Instagram</span>
                  <span className="text-[11px] font-bold">—</span>
                  <span className={RÓTULO}>Sem perfil cadastrado</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-3d-soft h-9 px-3 text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
                disabled={!disponiveis.length || enviando}
                onClick={() => { setMarcados(disponiveis.map((c) => c.id)); setConfirmado(false); setResultados([]); }}>
                Marcar todos os canais com contato
              </button>
              <button type="button" className="btn-3d-soft h-9 px-3 text-[10px] font-black uppercase tracking-wider disabled:opacity-50"
                disabled={!marcados.length || enviando} onClick={() => { setMarcados([]); setConfirmado(false); }}>
                Limpar
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Instagram é manual: a Meta só deixa o sistema responder a quem escreveu primeiro. Baixe o PDF abaixo, abra a conversa e anexe o arquivo.
            </p>
          </Zona>

          <Zona titulo="2 · Baixar e guardar">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <button type="button" className="btn-3d-soft h-11 px-3 inline-flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider" onClick={() => acaoPdf(false)}>
                <Eye className="h-4 w-4" />Abrir PDF
              </button>
              <button type="button" className="btn-3d-soft h-11 px-3 inline-flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider" onClick={() => acaoPdf(true)}>
                <Download className="h-4 w-4" />Baixar PDF
              </button>
              <button type="button" disabled={guardando} onClick={() => void guardar()}
                className="btn-3d-soft h-11 px-3 inline-flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-wider disabled:opacity-60">
                <FolderInput className="h-4 w-4" />{guardando ? "Guardando…" : `Guardar na pasta ${pasta}`}
              </button>
            </div>
            <div className="concave-3d min-h-[40px] px-3 py-2 text-[11px] font-bold" role="status">
              {guardado ? (
                <span className={guardado.ok ? "text-emerald-700" : "text-destructive"}>
                  {guardado.texto}
                  {guardado.link && <> <a className="underline" href={guardado.link} target="_blank" rel="noreferrer">Abrir no Drive</a></>}
                </span>
              ) : <span className="text-muted-foreground/60">Pasta do cliente no Drive: {pasta}. Nada foi guardado ainda.</span>}
            </div>
          </Zona>

          <Zona titulo="3 · Confirmar e enviar">
            <p className="text-[11px] text-muted-foreground">
              Será enviado exatamente o PDF já emitido. O sistema não gera, assina nem substitui outro documento.
            </p>
            <label className="concave-3d flex items-start gap-2 px-3 py-2 text-[12px]">
              <input type="checkbox" className="mt-1" checked={confirmado} disabled={enviando || !marcados.length} onChange={(e) => setConfirmado(e.target.checked)} />
              <span>
                {marcados.length
                  ? <>Conferi o documento e o destinatário e autorizo o envio por: <strong>{marcados.map((c) => NOME_CANAL[c]).join(", ")}</strong>.</>
                  : "Marque ao menos um canal acima para liberar o envio."}
              </span>
            </label>
            <button type="button" className="btn-3d h-11 w-full sm:w-auto px-5 text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
              disabled={!confirmado || !marcados.length || enviando || carregando} onClick={() => void enviar()}>
              {enviando ? "Registrando envio…" : `Enviar por ${marcados.length || 0} canal${marcados.length === 1 ? "" : "is"}`}
            </button>
            {resultados.length > 0 && (
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-1.5" aria-label="Resultado por canal">
                {resultados.map((r) => (
                  <li key={r.channel} className="concave-3d px-2.5 py-2 text-[11px]">
                    <div className={RÓTULO}>{NOME_CANAL[r.channel]}</div>
                    <div className="font-bold mt-1">{r.state === "provider_accepted" ? "Aceito pelo provedor; entrega não confirmada" : (r.error || ESTADOS[r.state] || r.state)}</div>
                  </li>
                ))}
              </ul>
            )}
            {aviso && <p role="status" className="text-[11px]">{aviso}</p>}
          </Zona>

          {carregando && <p role="status" className="text-[11px]">Conferindo os canais cadastrados…</p>}
          {erro && <p role="alert" className="text-[12px] text-destructive font-bold">{erro}</p>}

          <section className="concave-3d space-y-2 p-3" aria-label="Histórico de envios deste documento">
            <h4 className={RÓTULO}>Envios anteriores deste documento</h4>
            {!carregando && !historico.length && <p className="text-[11px]">Nenhum envio registrado.</p>}
            {!!historico.length && (
              <ul className="space-y-2">
                {historico.map((h) => (
                  <li key={h.id} className="border-t border-current/10 pt-2 text-[11px]">
                    <p className="font-semibold">
                      {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(h.createdAt))}
                      {" · "}{NOME_CANAL[h.channel] || h.channel}
                    </p>
                    <p>{ESTADOS[h.state] || h.state} · Destino {h.recipientMasked || "não informado"}</p>
                    {h.expiresAt && <p>Link válido até {new Date(h.expiresAt).toLocaleDateString("pt-BR")}.</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
