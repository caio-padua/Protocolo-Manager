import { useCallback, useEffect, useRef, useState } from "react";
import { QrCode, RefreshCw, Send, Settings2, MessageSquare } from "lucide-react";
import { ConsoleShell, BlockTitle, BASE } from "./_shared";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type {
  EvolutionHomologacaoClient,
  EvolutionHomologacaoConfig,
  EvolutionHomologacaoConfigUpdate,
  EvolutionHomologacaoLinkResult,
  EvolutionHomologacaoPlanResult,
  EvolutionHomologacaoSendResult,
  EvolutionIsolatedTestInput,
  EvolutionIsolatedTestResult,
} from "@workspace/api-client-react";

// ============================================================================
// WHATSAPP POR QR CODE (Evolution API) — alternativa PROVISÓRIA, não oficial.
// Nada aqui simula conexão ou entrega: cada estado vem do servidor Evolution.
// A chave de acesso nunca volta do servidor (só "definida / não definida").
// ============================================================================

type Config = { homologacao?: boolean; contatosAutorizados?: string[];  configurado: boolean; baseUrl: string | null; instanceName: string | null; chaveDefinida: boolean; webhookTokenDefinido: boolean; podeEditar: boolean };
type Conversa = { contato: string; exibicao: string; ultimaDirecao: string; ultimoTrecho: string; status: string; em: string };
type Msg = { id: number; direcao: string; corpo: string; status: string; erro: string | null; criado_em: string };
type ClienteTeste = EvolutionHomologacaoClient;
type ConfigMotor = EvolutionHomologacaoConfigUpdate;
type PlanoTeste = EvolutionHomologacaoPlanResult;

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
  incerto: "Resultado incerto — conferir antes de repetir",
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
  const [teste, setTeste] = useState<EvolutionIsolatedTestInput>({ numero: "", texto: "", confirmo: false });
  const [clientesTeste, setClientesTeste] = useState<ClienteTeste[]>([]);
  const [clienteTesteId, setClienteTesteId] = useState("");
  const [configMotor, setConfigMotor] = useState<ConfigMotor>({ modelos: { selecao: "", interprete: "", conferente: "", aprendizagem: "" }, textoTeste: "", nomeAssistente: "", motorAtivo: false });
  const [perguntaTeste, setPerguntaTeste] = useState("");
  const [contextoTeste, setContextoTeste] = useState("");
  const [planoTeste, setPlanoTeste] = useState<PlanoTeste | null>(null);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);
  const [vinculoTeste, setVinculoTeste] = useState({ telefone: "", confirmo: false });
  const clienteEscolhidoRef = useRef(false);

  const carregar = useCallback(async () => {
    const c = await api<Config>("/evolution/config");
    if (c.ok) { setCfg(c.dados); setForm((f) => ({ ...f, baseUrl: c.dados.baseUrl ?? f.baseUrl, instanceName: c.dados.instanceName ?? f.instanceName })); }
    const k = await api<{ estado: string }>("/evolution/conexao");
    setEstado(k.ok ? k.dados.estado : k.status === 401 ? "sessao_expirada" : "erro_do_provedor");
    const v = await api<{ conversas: Conversa[] }>("/evolution/conversas");
    if (v.ok) setConversas(v.dados.conversas);
    const [hc, cc] = await Promise.all([
      api<EvolutionHomologacaoConfig>("/evolution/homologacao/config"),
      api<{ clientes: ClienteTeste[] }>("/evolution/homologacao/clientes"),
    ]);
    if (hc.ok) {
      const { modelos, textoTeste, nomeAssistente, motorAtivo } = hc.dados;
      setConfigMotor({ modelos, textoTeste, nomeAssistente, motorAtivo });
    }
    if (cc.ok) {
      setClientesTeste(cc.dados.clientes);
      if (!clienteEscolhidoRef.current && cc.dados.clientes.length) {
        setClienteTesteId(String(cc.dados.clientes[0]!.id));
        clienteEscolhidoRef.current = true;
      }
    }
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
    const r = await api<EvolutionIsolatedTestResult & { error?: string; estado?: string; status?: string }>("/evolution/teste", { method: "POST", body: JSON.stringify(teste) });
    setAviso(r.ok ? "Teste aceito pelo servidor (não é confirmação de entrega)." : (r.dados.error ?? "Falha") + (r.dados.estado ? ` (${ESTADOS[r.dados.estado] ?? r.dados.estado})` : ""));
    await carregar();
  }
  async function salvarConfigMotor() {
    const r = await api<{ error?: string }>("/evolution/homologacao/config", { method: "PUT", body: JSON.stringify(configMotor) });
    setAviso(r.ok ? "Parâmetros do motor salvos." : r.dados.error ?? "Não foi possível salvar os parâmetros.");
    if (r.ok) await carregar();
  }
  async function salvarVinculoTeste() {
    const digitos = vinculoTeste.telefone.replace(/\D/g, "");
    const r = await api<EvolutionHomologacaoLinkResult & { error?: string }>("/evolution/homologacao/vinculo", {
      method: "PUT",
      body: JSON.stringify({
        clienteId: Number(clienteTesteId),
        ...(digitos.length === 4 ? { telefoneFinal: digitos } : { telefone: vinculoTeste.telefone }),
        confirmo: vinculoTeste.confirmo,
      }),
    });
    setAviso(r.ok ? "Vínculo de homologação registrado." : r.dados.error ?? "Não foi possível registrar o vínculo.");
    if (r.ok) { setVinculoTeste({ telefone: "", confirmo: false }); await carregar(); }
  }
  async function planejarTeste() {
    setResultadoTeste(null);
    const r = await api<PlanoTeste & { error?: string }>("/evolution/homologacao/planejar", {
      method: "POST",
      body: JSON.stringify({ clienteId: Number(clienteTesteId), pergunta: perguntaTeste }),
    });
    if (!r.ok) { setResultadoTeste(r.dados.error ?? "O motor não gerou um plano."); setPlanoTeste(null); return; }
    setPlanoTeste(r.dados);
  }
  async function enviarRespostaTeste() {
    if (!planoTeste?.resposta) return;
    const r = await api<EvolutionHomologacaoSendResult & { error?: string; status?: string }>("/evolution/homologacao/enviar-resposta", {
      method: "POST",
      body: JSON.stringify({ clienteId: Number(clienteTesteId), pergunta: perguntaTeste, contexto: contextoTeste, confirmo: true }),
    });
    setResultadoTeste(r.ok
      ? `Envio ${r.dados.status ?? "registrado"}; origem: motor PAXMED; pergunta mantida como simulada.`
      : r.dados.error ?? "Falha no envio.");
    if (r.ok) await carregar();
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
          <textarea className={campo} rows={3} maxLength={4000} placeholder="Texto editável do teste" value={teste.texto} onChange={(e) => setTeste({ ...teste, texto: e.target.value })} />
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={teste.confirmo} onChange={(e) => setTeste({ ...teste, confirmo: e.target.checked })} />
            Confirmo que esta pessoa autorizou receber o teste.
          </label>
          <button type="button" className={botao} disabled={!teste.confirmo || !teste.numero || !teste.texto.trim()} onClick={() => void enviarTeste()}>Enviar teste</button>
        </section>
      )}

      {cfg?.podeEditar && (
        <>
          <section className="panel-3d p-5 space-y-3">
            <BlockTitle icon={Settings2}>Parâmetros editáveis do motor</BlockTitle>
            <p className="text-[12px] text-muted-foreground">Campos vazios deixam a etapa de inteligência artificial indisponível. Não há modelo ou texto de teste substituto escondido.</p>
            <label className="block text-[12px]">Modelo de seleção de orientação<input className={campo} value={configMotor.modelos.selecao} onChange={(e) => setConfigMotor({ ...configMotor, modelos: { ...configMotor.modelos, selecao: e.target.value } })} /></label>
            <label className="block text-[12px]">Modelo de interpretação<input className={campo} value={configMotor.modelos.interprete} onChange={(e) => setConfigMotor({ ...configMotor, modelos: { ...configMotor.modelos, interprete: e.target.value } })} /></label>
            <label className="block text-[12px]">Modelo de conferência<input className={campo} value={configMotor.modelos.conferente} onChange={(e) => setConfigMotor({ ...configMotor, modelos: { ...configMotor.modelos, conferente: e.target.value } })} /></label>
            <label className="block text-[12px]">Modelo de aprendizagem<input className={campo} value={configMotor.modelos.aprendizagem} onChange={(e) => setConfigMotor({ ...configMotor, modelos: { ...configMotor.modelos, aprendizagem: e.target.value } })} /></label>
            <label className="block text-[12px]">Nome editável da assistente<input className={campo} maxLength={80} value={configMotor.nomeAssistente} onChange={(e) => setConfigMotor({ ...configMotor, nomeAssistente: e.target.value })} /></label>
            <label className="block text-[12px]">Modelo de mensagem de teste
              <textarea className={campo} rows={5} maxLength={4000} value={configMotor.textoTeste} onChange={(e) => setConfigMotor({ ...configMotor, textoTeste: e.target.value })} placeholder="Use {cliente}, {pergunta} e {resposta}; deixe explícito que a pergunta é simulada." />
            </label>
            <label className="flex items-start gap-2 text-[12px]">
              <input type="checkbox" checked={configMotor.motorAtivo} onChange={(e) => setConfigMotor({ ...configMotor, motorAtivo: e.target.checked })} />
              <span>Permitir que mensagens reais recebidas por este WhatsApp sejam avaliadas pelo motor. O padrão permanece desligado até a ativação explícita.</span>
            </label>
            <button type="button" className={botao} onClick={() => void salvarConfigMotor()}>Salvar parâmetros do motor</button>
          </section>

          <section className="panel-3d p-5 space-y-3">
            <BlockTitle icon={MessageSquare}>Teste supervisionado pelo motor</BlockTitle>
            <label className="block text-[12px]">Cliente autorizado
              <select className={campo} value={clienteTesteId} onChange={(e) => { clienteEscolhidoRef.current = true; setClienteTesteId(e.target.value); setPlanoTeste(null); }}>
                {clientesTeste.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.telefoneMascarado ?? "sem telefone autorizado"}{c.vinculoExplicito ? " · vínculo confirmado" : ""}</option>)}
              </select>
            </label>
            <div className="concave-3d p-3 space-y-2">
               <p className="text-[12px]">Se o contato autorizado não for o telefone principal do cadastro, informe o número completo ou os quatro últimos dígitos visíveis na lista de contatos autorizados. O servidor só aceita um resultado único e não altera o telefone principal do cliente.</p>
               <input className={campo} placeholder="Telefone autorizado ou quatro últimos dígitos" value={vinculoTeste.telefone} onChange={(e) => setVinculoTeste({ ...vinculoTeste, telefone: e.target.value })} />
              <label className="flex items-center gap-2 text-[12px]"><input type="checkbox" checked={vinculoTeste.confirmo} onChange={(e) => setVinculoTeste({ ...vinculoTeste, confirmo: e.target.checked })} />Confirmo que este número pertence ao cadastro escolhido.</label>
              <button type="button" className={botao} disabled={!vinculoTeste.confirmo || !vinculoTeste.telefone || !clienteTesteId} onClick={() => void salvarVinculoTeste()}>Salvar vínculo de homologação</button>
            </div>
            <label className="block text-[12px]">Pergunta imaginada para o teste
              <textarea className={campo} rows={3} maxLength={1000} value={perguntaTeste} onChange={(e) => { setPerguntaTeste(e.target.value); setPlanoTeste(null); }} />
            </label>
            <label className="block text-[12px]">Identificador do cenário, sem dado pessoal<input className={campo} maxLength={60} value={contextoTeste} onChange={(e) => setContextoTeste(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} /></label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={botao} disabled={!clienteTesteId || !perguntaTeste.trim()} onClick={() => void planejarTeste()}>Executar motor sem enviar</button>
              <button type="button" className={botao} disabled={!planoTeste?.resposta || !configMotor.textoTeste.trim()} onClick={() => void enviarRespostaTeste()}>Enviar resposta simulada</button>
            </div>
            {resultadoTeste && <p className="concave-3d p-3 text-[13px]" role="status">{resultadoTeste}</p>}
            {planoTeste && (
              <div className="concave-3d space-y-2 p-3" data-testid="plano-motor">
                <p className="text-[12px]"><b>Origem:</b> motor real do atendimento PAXMED</p>
                <p className="text-[12px]"><b>Desfecho:</b> {planoTeste.desfecho} · <b>caminho:</b> {planoTeste.caminhoResolucao}</p>
                <p className="text-[12px]"><b>Orientação utilizada:</b> {planoTeste.orientacaoId ?? "nenhuma"}</p>
                <p className="whitespace-pre-wrap text-[13px]"><b>Resposta produzida:</b><br />{planoTeste.resposta ?? "O motor não produziu resposta."}</p>
                <p className="text-[11px] text-muted-foreground">A pergunta não foi gravada como mensagem recebida. O envio externo só ocorre ao clicar em “Enviar resposta simulada”.</p>
              </div>
            )}
          </section>
        </>
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
