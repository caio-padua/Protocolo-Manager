import { useCallback, useEffect, useState } from "react";
import { QrCode, RefreshCw, Send, Settings2, MessageSquare } from "lucide-react";
import { ConsoleShell, BlockTitle, BASE } from "./_shared";
import { collabAuthHeaders } from "@/lib/collab-auth";

// ============================================================================
// WHATSAPP POR QR CODE (Evolution API) — alternativa PROVISÓRIA, não oficial.
// Nada aqui simula conexão ou entrega: cada estado vem do servidor Evolution.
// A chave de acesso nunca volta do servidor (só "definida / não definida").
// ============================================================================

type Config = { homologacao?: boolean; contatosAutorizados?: string[];  configurado: boolean; baseUrl: string | null; instanceName: string | null; chaveDefinida: boolean; webhookTokenDefinido: boolean; podeEditar: boolean };
type Conversa = { contato: string; exibicao: string; ultimaDirecao: string; ultimoTrecho: string; status: string; em: string };
type Msg = { id: number; direcao: string; corpo: string; status: string; erro: string | null; criado_em: string };

const ESTADOS: Record<string, string> = {
  nao_configurado: "Instância não configurada",
  sem_credencial: "Chave de acesso não cadastrada",
  servidor_inacessivel: "Servidor Evolution inacessível",
  credenciais_recusadas: "Servidor recusou a chave de acesso",
  instancia_inexistente: "Instância não existe no servidor",
  erro_do_provedor: "Resposta inesperada do servidor",
  sessao_expirada: "Sessão expirada: entre novamente no sistema",
  contato_nao_autorizado: "Número fora da lista autorizada (homologação)",
  desconectado: "Celular desconectado (leia o QR Code)",
  conectando: "Conectando…",
  conectado: "Conectado",
  qr_indisponivel: "O servidor não entregou um QR Code agora",
};
const STATUS_MSG: Record<string, string> = {
  aceito: "Aceito pelo servidor (ainda sem confirmação de entrega)",
  enviado: "Enviado ao WhatsApp",
  entregue: "Entregue",
  lido: "Lido",
  falha: "Falhou",
  recebida: "Recebida",
};

async function api<T>(caminho: string, init?: RequestInit): Promise<{ ok: boolean; status: number; dados: T }> {
  const r = await fetch(`${BASE}/api${caminho}`, { ...init, headers: collabAuthHeaders({ "Content-Type": "application/json", ...((init?.headers as Record<string, string>) ?? {}) }) });
  return { ok: r.ok, status: r.status, dados: (await r.json().catch(() => ({}))) as T };
}
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const campo = "concave-3d w-full px-3 py-2 text-[13px] bg-transparent";
const botao = "bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary disabled:opacity-50";

export default function ComunicacaoWhatsappQr() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [estado, setEstado] = useState<string | null>(null);
  const [qr, setQr] = useState<{ img?: string; codigo?: string; aviso?: string } | null>(null);
  const [form, setForm] = useState({ baseUrl: "", instanceName: "", apiKey: "" });
  const [aviso, setAviso] = useState<string | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [teste, setTeste] = useState({ numero: "", confirmo: false });

  const carregar = useCallback(async () => {
    const c = await api<Config>("/evolution/config");
    if (c.ok) { setCfg(c.dados); setForm((f) => ({ ...f, baseUrl: c.dados.baseUrl ?? f.baseUrl, instanceName: c.dados.instanceName ?? f.instanceName })); }
    const k = await api<{ estado: string }>("/evolution/conexao");
    setEstado(k.ok ? k.dados.estado : k.status === 401 ? "sessao_expirada" : "erro_do_provedor");
    const v = await api<{ conversas: Conversa[] }>("/evolution/conversas");
    if (v.ok) setConversas(v.dados.conversas);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    if (!sel) return;
    void api<{ mensagens: Msg[] }>(`/evolution/mensagens?contato=${encodeURIComponent(sel)}`).then((r) => r.ok && setMsgs(r.dados.mensagens));
  }, [sel]);

  async function salvar() {
    const r = await api<{ error?: string }>("/evolution/config", { method: "PUT", body: JSON.stringify(form) });
    setAviso(r.ok ? "Configuração salva." : r.dados.error ?? "Não foi possível salvar.");
    if (r.ok) { setForm((f) => ({ ...f, apiKey: "" })); await carregar(); }
  }
  async function pedirQr() {
    const r = await api<{ estado: string; qrBase64?: string; codigoPareamento?: string }>("/evolution/qr", { method: "POST", body: "{}" });
    if (r.dados.qrBase64) setQr({ img: r.dados.qrBase64, codigo: r.dados.codigoPareamento });
    else setQr({ aviso: ESTADOS[r.dados.estado] ?? r.dados.estado });
  }
  async function registrarWebhook() {
    const r = await api<{ error?: string }>("/evolution/webhook/registrar", { method: "POST", body: "{}" });
    setAviso(r.ok ? "Webhook registrado no servidor Evolution." : r.dados.error ?? "O servidor Evolution recusou o registro do webhook.");
  }
  async function responder() {
    if (!sel || !texto.trim()) return;
    const r = await api<{ error?: string; estado?: string }>("/evolution/responder", { method: "POST", body: JSON.stringify({ contato: sel, texto }) });
    setAviso(r.ok ? "Mensagem aceita pelo servidor. A entrega será confirmada quando o WhatsApp avisar." : (r.dados.error ?? "Falha") + (r.dados.estado ? ` (${ESTADOS[r.dados.estado] ?? r.dados.estado})` : ""));
    if (r.ok) setTexto("");
    const m = await api<{ mensagens: Msg[] }>(`/evolution/mensagens?contato=${encodeURIComponent(sel)}`);
    if (m.ok) setMsgs(m.dados.mensagens);
  }
  async function enviarTeste() {
    const r = await api<{ error?: string; estado?: string; status?: string }>("/evolution/teste", { method: "POST", body: JSON.stringify(teste) });
    setAviso(r.ok ? "Teste aceito pelo servidor (não é confirmação de entrega)." : (r.dados.error ?? "Falha") + (r.dados.estado ? ` (${ESTADOS[r.dados.estado] ?? r.dados.estado})` : ""));
    await carregar();
  }

  return (
    <ConsoleShell icon={QrCode} title="WhatsApp por QR Code (provisório)" subtitle="Canal não oficial via Evolution API. O WhatsApp oficial (Twilio) e o Telegram continuam funcionando.">
      {cfg?.homologacao && (
        <div className="concave-3d px-3 py-2 text-[13px]" data-testid="aviso-homologacao">
          Homologação: só estes contatos autorizados recebem e têm mensagens registradas: {cfg.contatosAutorizados?.length ? cfg.contatosAutorizados.join(", ") : "nenhum cadastrado (todo envio fica bloqueado)"}.
        </div>
      )}
      {aviso && <div className="concave-3d px-3 py-2 text-[13px]" role="status">{aviso}</div>}

      <section className="panel-3d p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <BlockTitle icon={RefreshCw}>Conexão</BlockTitle>
          <button type="button" className={botao} onClick={() => void carregar()}><RefreshCw className="h-4 w-4" />Atualizar</button>
        </div>
        <p className="text-sm font-semibold" data-testid="estado-conexao">{estado ? ESTADOS[estado] ?? estado : "Consultando…"}</p>
        {cfg?.podeEditar && cfg.configurado && estado !== "conectado" && (
          <button type="button" className={botao} onClick={() => void pedirQr()}><QrCode className="h-4 w-4" />Mostrar QR Code</button>
        )}
        {qr?.img && (
          <div className="space-y-2">
            <img src={qr.img} alt="QR Code do WhatsApp" className="h-56 w-56 bg-white p-2" />
            <p className="text-[12px] text-muted-foreground">No celular: WhatsApp &gt; Aparelhos conectados &gt; Conectar um aparelho. O QR expira em poucos segundos; peça outro se precisar.</p>
            {qr.codigo && <p className="text-[12px]">Código de pareamento: <b>{qr.codigo}</b></p>}
          </div>
        )}
        {qr?.aviso && <p className="text-[13px] text-amber-700 dark:text-amber-400">{qr.aviso}</p>}
      </section>

      {cfg?.podeEditar && (
        <section className="panel-3d p-5 space-y-3">
          <BlockTitle icon={Settings2}>Instância desta clínica</BlockTitle>
          <input className={campo} placeholder="Endereço do servidor (https://...)" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} />
          <input className={campo} placeholder="Nome da instância" value={form.instanceName} onChange={(e) => setForm({ ...form, instanceName: e.target.value })} />
          <input className={campo} type="password" autoComplete="off" placeholder={cfg.chaveDefinida ? "Chave definida (deixe vazio para manter)" : "Chave de acesso da instância"} value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={botao} onClick={() => void salvar()}>Salvar</button>
            <button type="button" className={botao} disabled={!cfg.configurado} onClick={() => void registrarWebhook()}>Registrar webhook no servidor</button>
          </div>
        </section>
      )}

      {cfg?.podeEditar && (
        <section className="panel-3d p-5 space-y-3">
          <BlockTitle icon={Send}>Teste isolado (um destinatário)</BlockTitle>
          <input className={campo} placeholder="Número escolhido (DDD + número)" value={teste.numero} onChange={(e) => setTeste({ ...teste, numero: e.target.value })} />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={teste.confirmo} onChange={(e) => setTeste({ ...teste, confirmo: e.target.checked })} />
            Confirmo que esta pessoa autorizou receber o teste.
          </label>
          <button type="button" className={botao} disabled={!teste.confirmo || !teste.numero} onClick={() => void enviarTeste()}>Enviar teste</button>
        </section>
      )}

      <section className="panel-3d p-5 space-y-3">
        <BlockTitle icon={MessageSquare}>Central de conversas</BlockTitle>
        {conversas.length === 0 ? <p className="concave-3d px-3 py-2 text-[13px] text-muted-foreground">Nenhuma mensagem recebida ainda.</p> : (
          <div className="grid gap-3 md:grid-cols-[260px_1fr]">
            <ul className="space-y-1">
              {conversas.map((c) => (
                <li key={c.contato}>
                  <button type="button" onClick={() => setSel(c.contato)} className={`w-full text-left px-3 py-2 text-[12px] ${sel === c.contato ? "bevel-3d" : "concave-3d"}`}>
                    <b>{c.exibicao}</b><br /><span className="text-muted-foreground">{c.ultimoTrecho}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="space-y-2">
              {!sel ? <p className="text-[13px] text-muted-foreground">Escolha uma conversa.</p> : (
                <>
                  <ul className="max-h-80 space-y-1 overflow-y-auto">
                    {msgs.map((m) => (
                      <li key={m.id} className={`px-3 py-2 text-[13px] ${m.direcao === "saida" ? "bevel-3d ml-8" : "concave-3d mr-8"}`}>
                        {m.corpo}
                        <div className="mt-1 text-[11px] text-muted-foreground">{fmt(m.criado_em)} · {STATUS_MSG[m.status] ?? m.status}{m.erro ? ` · ${m.erro}` : ""}</div>
                      </li>
                    ))}
                  </ul>
                  <textarea className={campo} rows={3} maxLength={4000} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Responder (envio manual, uma pessoa por vez)" />
                  <button type="button" className={botao} disabled={!texto.trim()} onClick={() => void responder()}><Send className="h-4 w-4" />Responder</button>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </ConsoleShell>
  );
}
