import { useCallback, useEffect, useMemo, useState } from "react";
import { useListClients } from "@workspace/api-client-react";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { brData, brDataHora, brl, dz, type EstadoCalendario, type Modalidade, type PedidoVisto } from "@/components/meus-jogos/tipos";

// Aba "Jogos do cliente" (gestor). Acompanha os pedidos INDIVIDUAIS de Meus Jogos do cliente escolhido (somente da clinica do gestor).
// Nada aqui aposta nem devolve dinheiro: devolucao e ato humano registrado; "registrado" so existe com comprovante oficial anexado.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const G = `${BASE}/api/boloes/gestao/meus-jogos`;
const BTN = "btn-3d-soft min-h-[44px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60 inline-flex items-center justify-center gap-2";
const LBL = "block text-[11px] font-black uppercase tracking-wider text-primary";
const INP = "field-engraved w-full min-h-[44px] px-2 text-sm";
type Config = { margemMinutos: number; metaMinutos: number; tetoPedidoCentavos: number };
type Fonte = { modalidade: Modalidade; nome: string; fonteUrl: string; situacao: { desatualizado: boolean; motivo: string | null; verificadoEm: string }; conferencia: { ok: boolean; verificadoEm: string; divergencias: string[] } | null };
type Painel = {
  config: Config; execucao: { disponivel: boolean; motivo: string; ambiente: string }; snapshotVerificadoEm: string;
  fontes: Fonte[]; calendario: EstadoCalendario; podeConfigurarAgendamento: boolean;
  avatarMedico: { fotoNoCadastro: boolean; acessoAoArquivo: "nao_verificado"; autorizacaoDeUso: "nao_cadastrada"; fotoUtilizada: false; motivo: string };
};
type PedidoGestor = PedidoVisto & { motivoInterno: string | null; devolucaoRef: string | null };
type DadosCliente = { cliente: { id: number; nome: string }; membroAtivo: boolean; favoritos: number; pedidos: PedidoGestor[] };

async function chamar<T>(caminho: string, init?: { method?: string; json?: unknown; form?: FormData }): Promise<T> {
  const headers = collabAuthHeaders(init?.json !== undefined ? { "Content-Type": "application/json" } : {});
  const res = await fetch(`${G}${caminho}`, { method: init?.method ?? "GET", headers, body: init?.form ?? (init?.json !== undefined ? JSON.stringify(init.json) : undefined) });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(res.status === 403 ? "Acesso restrito ao gestor da clínica." : res.status === 401 ? "Sessão expirada. Entre novamente." : corpo.error ?? "Não foi possível concluir.");
  return corpo as T;
}
async function abrirComprovante(id: number) {
  const res = await fetch(`${G}/pedidos/${id}/comprovante`, { headers: collabAuthHeaders() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Comprovante indisponível.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function Bloco({ titulo, children, id }: { titulo: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label={titulo} data-testid={id}>
      <div className="login-card-topbar px-4 py-3"><h2 className="text-primary text-xs font-black uppercase tracking-widest">{titulo}</h2></div>
      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

function PedidoLinha({ p, rodar, ocupado }: { p: PedidoGestor; rodar: (fn: () => Promise<unknown>, ok: string) => void; ocupado: boolean }) {
  const [nota, setNota] = useState(""); const [ref, setRef] = useState("");
  const aguardaComprovante = p.status === "processando" || p.status === "falha_em_conferencia";
  return (
    <article className="panel-3d-sub rounded-xl p-3 space-y-2" data-testid="mj-gestor-pedido" data-status={p.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-primary text-sm font-black">{p.nome} · concurso {p.concurso} · {brl(p.totalCentavos)}</p>
          <p className="text-muted-foreground text-[11px]">Pedido {p.id} · sorteio {brData(p.dataSorteio)} · criado {brDataHora(p.criadoEm)}{p.pagoEm ? ` · pago ${brDataHora(p.pagoEm)}` : ""}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-primary">{p.rotulo}</span>
      </div>
      <ul className="space-y-1">{p.jogos.map((j) => <li key={j.ordem} className="concave-3d rounded-lg px-3 py-1.5 text-xs text-primary font-black tabular-nums">Jogo {j.ordem}: {j.dezenas.map(dz).join(" ")}</li>)}</ul>
      {p.falha && <p className="concave-3d rounded-lg px-3 py-2 text-xs flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" aria-hidden="true" />{p.falha.texto}</p>}
      {p.atrasadoNaMeta && <p className="text-xs text-amber-800 dark:text-amber-300">Além da meta operacional de registro ({p.prazos.metaEfetivacaoEm ? brDataHora(p.prazos.metaEfetivacaoEm) : "—"}).</p>}
      {p.devolucaoRef && <p className="text-xs text-muted-foreground">Devolução registrada: {p.devolucaoRef}</p>}
      {p.comprovante && <button type="button" className={BTN} onClick={() => rodar(() => abrirComprovante(p.id), "")}><Download className="w-4 h-4" aria-hidden="true" /> Abrir comprovante ({p.comprovante.codigo})</button>}
      {aguardaComprovante && (
        <div className="space-y-2">
          <label className={LBL} htmlFor={`mjc-${p.id}`}>Anexar comprovante oficial (PDF, PNG ou JPEG)</label>
          <input id={`mjc-${p.id}`} type="file" accept="application/pdf,image/png,image/jpeg" className={INP} data-testid="mj-gestor-comprovante" disabled={ocupado}
            onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const form = new FormData(); form.append("file", f); rodar(() => chamar(`/pedidos/${p.id}/comprovante`, { method: "POST", form }), "Comprovante anexado. O pedido passa a registrado."); e.target.value = ""; }} />
          <p className="text-[11px] text-muted-foreground leading-snug"><FileUp className="w-3 h-3 inline mr-1" aria-hidden="true" />Só o comprovante oficial muda o pedido para registrado.</p>
        </div>
      )}
      {p.status === "falha_em_conferencia" && (
        <div className="space-y-2">
          <label className={LBL} htmlFor={`mja-${p.id}`}>Atestar que NÃO houve aposta (conferido na lotérica ou conta CAIXA)</label>
          <textarea id={`mja-${p.id}`} rows={2} maxLength={280} className="field-engraved w-full px-2 py-2 text-sm" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Descreva como foi conferido" />
          <button type="button" className={BTN} disabled={ocupado || nota.trim().length < 10} data-testid="mj-gestor-atestar"
            onClick={() => rodar(() => chamar(`/pedidos/${p.id}/atestar-sem-aposta`, { method: "POST", json: { nota } }), "Atestado registrado. Devolução pendente.")}>Atestar sem aposta</button>
        </div>
      )}
      {p.status === "devolucao_pendente" && (
        <div className="space-y-2">
          <label className={LBL} htmlFor={`mjd-${p.id}`}>Referência da devolução já feita (ex.: código do PIX)</label>
          <input id={`mjd-${p.id}`} className={INP} maxLength={120} value={ref} onChange={(e) => setRef(e.target.value)} />
          <button type="button" className={BTN} disabled={ocupado || ref.trim().length < 3} data-testid="mj-gestor-devolver"
            onClick={() => rodar(() => chamar(`/pedidos/${p.id}/devolucao`, { method: "POST", json: { referencia: ref } }), "Devolução registrada.")}>Registrar devolução feita</button>
          <p className="text-[11px] text-muted-foreground leading-snug">O sistema não move dinheiro. Faça a devolução no Asaas e registre aqui.</p>
        </div>
      )}
    </article>
  );
}

export default function MeusJogosGestao() {
  const { data: todos } = useListClients();
  const opcoes = useMemo(() => (todos ?? []).map((cl) => ({ id: cl.id, name: cl.name, cpf: cl.cpf ?? null, phone: cl.phone ?? null, photoUrl: (cl as { photoUrl?: string | null }).photoUrl ?? null })), [todos]);
  const [cli, setCli] = useState<number | null>(null);
  const [dados, setDados] = useState<DadosCliente | null>(null);
  const [painel, setPainel] = useState<Painel | null>(null);
  const [cfg, setCfg] = useState<{ margem: string; meta: string; teto: string }>({ margem: "240", meta: "30", teto: "500,00" });
  const [agendamento, setAgendamento] = useState<{ habilitado: boolean; diaSemana: number; hora: string }>({ habilitado: true, diaSemana: 1, hora: "06:00" });
  const [ocupado, setOcupado] = useState(false);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [msg, setMsg] = useState(""); const [erro, setErro] = useState("");

  const carregarPainel = useCallback(async () => {
    try {
      const p = await chamar<Painel>("/painel"); setPainel(p);
      setCfg({ margem: String(p.config.margemMinutos), meta: String(p.config.metaMinutos), teto: (p.config.tetoPedidoCentavos / 100).toFixed(2).replace(".", ",") });
      setAgendamento({ habilitado: p.calendario.agendamento.habilitado, diaSemana: p.calendario.agendamento.diaSemana, hora: p.calendario.agendamento.hora });
      setErro("");
    } catch (e) { setErro((e as Error).message); }
  }, []);
  const carregarCliente = useCallback(async (id: number | null) => {
    if (!id) { setDados(null); return; }
    try { setDados(await chamar<DadosCliente>(`/cliente/${id}`)); setErro(""); } catch (e) { setDados(null); setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregarPainel(); }, [carregarPainel]);
  useEffect(() => { void carregarCliente(cli); }, [cli, carregarCliente]);

  function rodar(fn: () => Promise<unknown>, ok: string) {
    setOcupado(true); setMsg(""); setErro("");
    fn().then(() => { if (ok) setMsg(ok); return Promise.all([carregarCliente(cli), carregarPainel()]); })
      .catch((e: Error) => setErro(e.message)).finally(() => setOcupado(false));
  }
  function salvarConfig() {
    const teto = Math.round(Number(cfg.teto.replace(/\./g, "").replace(",", ".")) * 100);
    rodar(() => chamar("/config", { method: "PUT", json: { margemMinutos: Number(cfg.margem), metaMinutos: Number(cfg.meta), tetoPedidoCentavos: teto } }), "Margem, meta e teto salvos.");
  }
  function salvarAgendamento() {
    rodar(() => chamar("/calendario/agendamento", { method: "PUT", json: agendamento }), "Rotina semanal do calendário salva.");
  }

  return (
    <div className="space-y-4" data-testid="meus-jogos-gestao">
      <Bloco titulo="Jogos do cliente (Meus Jogos)" id="mj-gestor-cliente">
        <p className="text-muted-foreground text-xs leading-relaxed">Escolha o cliente para acompanhar os pedidos individuais dele. Pedidos de bolão ficam em Conexão Milionária, separados.</p>
        <label className={LBL}>Cliente</label>
        <PaxterClientSelector clientes={opcoes} value={cli} onChange={setCli} placeholder="Selecionar cliente…" />
        {msg && <p role="status" className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />{msg}</p>}
        {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300" data-testid="mj-gestor-erro">{erro}</p>}
        {dados && (
          <p className="concave-3d rounded-lg px-3 py-2 text-xs text-primary" data-testid="mj-gestor-resumo-cliente">
            <strong>{dados.cliente.nome}</strong> · {dados.membroAtivo ? "participa do Grupo VIP" : "NÃO participa do Grupo VIP (sem acesso a Meus Jogos)"} · {dados.favoritos} favorito(s) · {dados.pedidos.length} pedido(s)
          </p>
        )}
        {dados && dados.pedidos.length === 0 && <p className="concave-3d rounded-lg p-3 text-center text-muted-foreground text-xs" data-testid="mj-gestor-vazio">Este cliente ainda não fez pedidos em Meus Jogos.</p>}
        {dados?.pedidos.map((p) => <PedidoLinha key={`${p.id}-${p.status}`} p={p} rodar={rodar} ocupado={ocupado} />)}
      </Bloco>

      <Bloco titulo="Execução, prazos e fonte oficial" id="mj-gestor-painel">
        {!painel && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {painel && (
          <>
            <p className={`rounded-lg px-3 py-2 text-xs flex gap-2 concave-3d ${painel.execucao.disponivel ? "text-primary" : "text-amber-800 dark:text-amber-300"}`} data-testid="mj-gestor-execucao" data-disponivel={painel.execucao.disponivel ? "sim" : "nao"}>
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span><strong>{painel.execucao.disponivel ? "Execução conectada" : "Execução indisponível"}</strong> ({painel.execucao.ambiente}). {painel.execucao.motivo} Enquanto indisponível, nenhum pedido é aceito.</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div><label className={LBL} htmlFor="mjg-margem">Margem interna (min antes do fechamento)</label><input id="mjg-margem" inputMode="numeric" className={INP} value={cfg.margem} onChange={(e) => setCfg({ ...cfg, margem: e.target.value.replace(/\D/g, "") })} /></div>
              <div><label className={LBL} htmlFor="mjg-meta">Meta após pagamento (min)</label><input id="mjg-meta" inputMode="numeric" className={INP} value={cfg.meta} onChange={(e) => setCfg({ ...cfg, meta: e.target.value.replace(/\D/g, "") })} /></div>
              <div><label className={LBL} htmlFor="mjg-teto">Teto por pedido (R$)</label><input id="mjg-teto" inputMode="decimal" className={INP} value={cfg.teto} onChange={(e) => setCfg({ ...cfg, teto: e.target.value.replace(/[^\d,.]/g, "") })} /></div>
            </div>
            <p className="concave-3d rounded-lg px-3 py-2 text-[11px] text-primary leading-snug">Os horários de fechamento agora vêm do calendário oficial por concurso. Os antigos campos digitados pela clínica não alteram o prazo. A margem interna continua configurável.</p>
            <div className="concave-3d rounded-lg px-3 py-2 space-y-1" data-testid="mjg-calendario" data-estado={painel.calendario.estado}>
              <p className="text-primary text-xs font-black">Calendário oficial: {painel.calendario.estado === "verificado" ? "verificado" : painel.calendario.estado === "desatualizado" ? "vencido" : "indisponível"}</p>
              <p className="text-muted-foreground text-[11px]">
                {painel.calendario.extraidoEm ? `Última leitura ${brDataHora(painel.calendario.extraidoEm)}.` : "Ainda não houve leitura válida."}
                {painel.calendario.validoAte ? ` Validade até ${brDataHora(painel.calendario.validoAte)}.` : ""}
                {painel.calendario.meses.length ? ` Meses cobertos: ${painel.calendario.meses.join(", ")}.` : ""}
              </p>
              {painel.calendario.impressoDigital && <p className="break-all text-[10px] text-muted-foreground">Identificador da leitura: {painel.calendario.impressoDigital}</p>}
            </div>
            <ul className="space-y-1" aria-label="Fontes oficiais lidas">
              {painel.calendario.fontes.map((f, i) => (
                <li key={`${f.tipo}-${i}`} className="concave-3d rounded-lg px-3 py-2 text-[11px]" data-testid="mjg-fonte-calendario" data-ok={f.ok ? "sim" : "nao"}>
                  <strong className={f.ok ? "text-primary" : "text-amber-800 dark:text-amber-300"}>{f.ok ? "Verificado" : "Não confirmado"} · {f.tipo}</strong>
                  <span className="ml-1 text-muted-foreground">{f.detalhe}</span>
                </li>
              ))}
            </ul>
            {painel.podeConfigurarAgendamento && (
              <div className="panel-3d-sub rounded-xl p-3 space-y-2">
                <p className="text-primary text-xs font-black uppercase tracking-wider">Rotina global da CAIXA</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><label className={LBL} htmlFor="mjg-dia-atualizacao">Dia da atualização semanal</label>
                    <select id="mjg-dia-atualizacao" className={INP} value={agendamento.diaSemana} onChange={(e) => setAgendamento({ ...agendamento, diaSemana: Number(e.target.value) })}>
                      {["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"].map((dia, i) => <option key={dia} value={i}>{dia}</option>)}
                    </select>
                  </div>
                  <div><label className={LBL} htmlFor="mjg-hora-atualizacao">Horário de Brasília</label><input id="mjg-hora-atualizacao" type="time" className={INP} value={agendamento.hora} onChange={(e) => setAgendamento({ ...agendamento, hora: e.target.value })} /></div>
                </div>
                <label className="flex min-h-[44px] items-center gap-2 text-xs text-primary"><input type="checkbox" checked={agendamento.habilitado} onChange={(e) => setAgendamento({ ...agendamento, habilitado: e.target.checked })} /> Ativar atualização automática semanal</label>
                <button type="button" className={BTN} disabled={ocupado} onClick={salvarAgendamento}>Salvar rotina semanal</button>
              </div>
            )}
            <div className="space-y-1" aria-label="Últimas cinco extrações oficiais">
              <p className="text-primary text-xs font-black uppercase tracking-wider">Últimas cinco leituras</p>
              {painel.calendario.ultimasExtracoes.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma leitura foi registrada ainda.</p>}
              {painel.calendario.ultimasExtracoes.map((x) => <p key={x.id} className="concave-3d rounded-lg px-3 py-2 text-[11px] text-muted-foreground" data-testid="mjg-extracao">
                <strong className={x.ok ? "text-primary" : "text-amber-800 dark:text-amber-300"}>{x.ok ? "Válida" : "Não validada"}</strong> · {x.tipo} · {brDataHora(x.extraidoEm)} · {x.origem}
              </p>)}
            </div>
            <div className="concave-3d rounded-lg px-3 py-2 space-y-1" data-testid="mjg-avatar-identidade">
              <p className="text-primary text-xs font-black">Avatar ilustrativo</p>
              <p className="text-[11px] text-muted-foreground">
                Foto no cadastro do médico: {painel.avatarMedico.fotoNoCadastro ? "sim" : "não"} · acesso ao arquivo: não verificado · autorização de uso: não cadastrada.
                {" "}{painel.avatarMedico.motivo}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BTN} disabled={ocupado} onClick={salvarConfig} data-testid="mj-gestor-salvar-config">Salvar configuração</button>
              <button type="button" className={BTN} disabled={ocupado} onClick={() => rodar(() => chamar("/fonte/conferir", { method: "POST" }), "Calendário, regras e preços foram conferidos.")} data-testid="mj-gestor-conferir"><RefreshCw className="w-4 h-4" aria-hidden="true" /> Conferir calendário, regras e preços</button>
              <button type="button" className={BTN} disabled={ocupado || !painel.execucao.disponivel} onClick={() => setConfirmarEnvio(true)}>Verificar fila de pedidos pagos</button>
            </div>
            {confirmarEnvio && (
              <div className="panel-3d-sub rounded-xl p-3 space-y-2" role="alertdialog" aria-label="Confirmar envio manual de jogos">
                <p className="text-xs leading-relaxed text-primary"><strong>Ação manual.</strong> Ao confirmar, pedidos pagos podem ser enviados ao canal de registro conectado e apostas reais podem ser feitas. Esta ação não inicia pagamentos. Não há integração autorizada conectada agora.</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={BTN} disabled={ocupado} onClick={() => setConfirmarEnvio(false)}>Cancelar</button>
                  <button type="button" className={BTN} disabled={ocupado || !painel.execucao.disponivel}
                    onClick={() => { setConfirmarEnvio(false); rodar(() => chamar("/fila/processar", { method: "POST", json: { confirmarEnvio: true } }), "Fila conferida; veja os estados dos pedidos."); }}>
                    Confirmar envio manual
                  </button>
                </div>
              </div>
            )}
            <ul className="space-y-1.5" aria-label="Situação das regras por modalidade">
              {painel.fontes.map((f) => (
                <li key={f.modalidade} className="concave-3d rounded-lg px-3 py-2 text-xs" data-testid="mj-gestor-fonte" data-desatualizado={f.situacao.desatualizado ? "sim" : "nao"}>
                  <p className="text-primary font-black">{f.nome}: {f.situacao.desatualizado ? "DESATUALIZADO (pedidos bloqueados)" : "em dia"}</p>
                  <p className="text-muted-foreground">{f.situacao.motivo ?? `Verificado em ${brDataHora(f.situacao.verificadoEm)}.`}{f.conferencia?.divergencias?.length ? ` Divergências: ${f.conferencia.divergencias.join("; ")}` : ""}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Bloco>
    </div>
  );
}
