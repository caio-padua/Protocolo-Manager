import { useEffect, useMemo, useState } from "react";
import { useListClients } from "@workspace/api-client-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { Crown, Loader2, ShieldAlert, Ticket } from "lucide-react";
import MeusJogosGestao from "./MeusJogosGestao";

// Aba "Grupo VIP" da Central de Bolões (gestor). Convite e adesão são voluntários e só o cliente aceita (no portal).
// Nada aqui cria cobrança, chama Asaas ou CAIXA, envia mensagem, compra ou aposta. Cobrança só se VINCULA quando já existe
// no livro financeiro da clínica. Jogo só aparece como registrado se houver comprovante oficial.

export type CampanhaVip = {
  id: number; nome: string; concurso: string | null; dataSorteio: string | null; status?: "rascunho" | "aberto" | "encerrado";
  valorCotaCentavos?: number | null; cotasTotal?: number | null; escolhaJogos?: "clinica" | "participante";
  dezenasPorJogo?: number | null; universoMax?: number; jogosPorCota?: number;
};
export type ParticipacaoVip = {
  id: number; cliente: { id: number; nome: string }; campanha: { id: number; nome: string }; cotas: number;
  comprovante: { id: number; tipo: string } | null;
  jogos?: { ordem: number; dezenas: number[]; origem: string }[];
  situacaoJogos?: "sem_jogos" | "escolhido_sem_comprovante" | "efetivado_com_comprovante";
  natureza?: "nominativo" | "cota_oficial_individual" | null;
  cobranca?: { estado: string; statusAsaas: string | null; extratoConferido: boolean };
  escolhaJogos?: "clinica" | "participante";
  regras?: { dezenasPorJogo: number | null; universoMax: number; jogosPorCota: number; esperado: number; bolaoAberto: boolean };
};
type Membro = { id: number; cliente: { id: number; nome: string }; status: string; convidadoEm: string; respondidoEm: string | null };
type ConviteBolao = { id: number; campanha: { id: number; nome: string }; cliente: { id: number; nome: string }; status: string; convidadoEm: string };
type Automacao = { estado: string; motivo: string; ambiente: string };

const BTN = "btn-3d-soft min-h-[44px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60 inline-flex items-center justify-center gap-2";
const LBL = "block text-[11px] font-black uppercase tracking-wider text-primary";
const INP = "field-engraved w-full min-h-[44px] px-2 text-sm";
const STATUS_MEMBRO: Record<string, string> = { convidado: "Convidado, aguardando resposta", ativo: "Participa", recusou: "Recusou", saiu: "Saiu" };
const STATUS_CAMP: Record<string, string> = { rascunho: "Rascunho (não visível ao cliente)", aberto: "Aberto", encerrado: "Encerrado" };
const STATUS_CONVITE: Record<string, string> = { convidado: "Aguardando resposta", aceito: "Aceito", recusado: "Recusado" };
const COBRANCA: Record<string, string> = {
  sem_cobranca: "Sem cobrança vinculada", aguardando: "Aguardando pagamento", confirmado: "Pagamento confirmado no Asaas",
  vencido: "Cobrança vencida", outro: "Situação especial", indisponivel: "Situação indisponível",
};
const JOGOS: Record<string, string> = {
  sem_jogos: "Jogos não definidos", escolhido_sem_comprovante: "Escolhidos, SEM comprovante oficial (não efetivados)", efetivado_com_comprovante: "Efetivados, com comprovante oficial",
};
const dz = (n: number) => String(n).padStart(2, "0");
const brDateTime = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

function Bloco({ titulo, children, id }: { titulo: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label={titulo} data-testid={id}>
      <div className="login-card-topbar px-4 py-3"><h2 className="text-primary text-xs font-black uppercase tracking-widest">{titulo}</h2></div>
      <div className="p-3 space-y-3">{children}</div>
    </section>
  );
}

function EditorJogos({ p, ocupado, onSalvar }: { p: ParticipacaoVip; ocupado: boolean; onSalvar: (jogos: number[][]) => void }) {
  const [txt, setTxt] = useState((p.jogos ?? []).map((j) => j.dezenas.map(dz).join(" ")).join("\n"));
  const [erro, setErro] = useState("");
  const r = p.regras!;
  return (
    <div className="space-y-2">
      <label className={LBL} htmlFor={`gj-${p.id}`}>Jogos: {r.esperado} jogo(s), {r.dezenasPorJogo} dezenas (1 a {r.universoMax}), um por linha</label>
      <textarea id={`gj-${p.id}`} rows={Math.min(8, Math.max(3, r.esperado))} className="field-engraved w-full px-2 py-2 text-sm font-mono" value={txt} onChange={(e) => setTxt(e.target.value)} />
      <button type="button" className={BTN} disabled={ocupado} data-testid="gestor-jogos-salvar" onClick={() => {
        const jogos = txt.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\s,;-]+/).filter(Boolean).map(Number));
        if (jogos.some((j) => j.some((n) => !Number.isInteger(n)))) { setErro("Use apenas números nas dezenas."); return; }
        setErro(""); onSalvar(jogos);
      }}>Salvar jogos definidos pela clínica</button>
      {erro && <p className="text-destructive text-xs" role="alert">{erro}</p>}
    </div>
  );
}

function LinhaVip({ p, ocupado, onJogos, onCobranca, onNatureza }: {
  p: ParticipacaoVip; ocupado: boolean; onJogos: (jogos: number[][]) => void; onCobranca: (chargeId: string) => void; onNatureza: (comprovanteId: number, n: string) => void;
}) {
  const [charge, setCharge] = useState("");
  if (!p.regras || !p.cobranca) return null;
  const clinicaDefine = p.escolhaJogos === "clinica" && p.regras.bolaoAberto && p.situacaoJogos !== "efetivado_com_comprovante" && p.regras.dezenasPorJogo !== null;
  return (
    <article className="panel-3d-sub rounded-xl p-3 space-y-2" data-testid="vip-participacao" aria-label={`Participação de ${p.cliente.nome} em ${p.campanha.nome}`}>
      <p className="text-primary text-sm font-black uppercase tracking-wide break-words">{p.cliente.nome}</p>
      <p className="text-muted-foreground text-[11px]">{p.campanha.nome} · {p.cotas} cota(s) · jogos escolhidos por {p.escolhaJogos === "participante" ? "participante" : "clínica"}</p>
      <p className="concave-3d rounded-lg px-3 py-2 text-xs text-muted-foreground" data-testid="vip-jogos-situacao">{JOGOS[p.situacaoJogos ?? "sem_jogos"]}</p>
      {(p.jogos ?? []).map((j) => <p key={j.ordem} className="concave-3d rounded-lg px-3 py-1.5 text-xs font-mono text-primary">Jogo {j.ordem}: {j.dezenas.map(dz).join(" ")}</p>)}
      <p className="concave-3d rounded-lg px-3 py-2 text-xs text-muted-foreground" data-testid="vip-cobranca-estado" data-estado={p.cobranca.estado}>
        Cobrança Asaas: {COBRANCA[p.cobranca.estado] ?? p.cobranca.estado}{p.cobranca.statusAsaas ? ` (${p.cobranca.statusAsaas})` : ""}{p.cobranca.estado === "confirmado" ? (p.cobranca.extratoConferido ? " · crédito conferido no extrato" : " · sem conferência no extrato") : ""}
      </p>
      {p.cobranca.estado === "sem_cobranca" && (
        <div className="space-y-2">
          <label className={LBL} htmlFor={`ch-${p.id}`}>Vincular cobrança já existente (código do Asaas)</label>
          <input id={`ch-${p.id}`} className={INP} maxLength={60} value={charge} onChange={(e) => setCharge(e.target.value.trim())} placeholder="pay_..." />
          <button type="button" className={BTN} disabled={ocupado || charge.length < 3} onClick={() => onCobranca(charge)} data-testid="vip-vincular">Vincular cobrança</button>
          <p className="text-muted-foreground text-[11px]">Só vincula cobrança que já esteja no livro financeiro desta clínica. Esta tela não cria cobrança.</p>
        </div>
      )}
      {p.comprovante && (
        <div className="space-y-1">
          <label className={LBL} htmlFor={`nt-${p.id}`}>Tipo do comprovante</label>
          <select id={`nt-${p.id}`} className={INP} value={p.natureza ?? ""} disabled={ocupado} data-testid="vip-natureza" onChange={(e) => e.target.value && onNatureza(p.comprovante!.id, e.target.value)}>
            <option value="">Ainda não classificado</option>
            <option value="nominativo">Nominativo (não é a cota oficial individual)</option>
            <option value="cota_oficial_individual">Cota oficial individual</option>
          </select>
        </div>
      )}
      {clinicaDefine && <EditorJogos p={p} ocupado={ocupado} onSalvar={onJogos} />}
    </article>
  );
}

export default function GrupoVipGestao({ chamar, partes, campanhas, ocupado, executar }: {
  chamar: <T>(path: string, init?: RequestInit & { json?: unknown }) => Promise<T>;
  partes: ParticipacaoVip[]; campanhas: CampanhaVip[]; ocupado: string | null;
  executar: (chave: string, fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [membros, setMembros] = useState<Membro[]>([]);
  const [convites, setConvites] = useState<ConviteBolao[]>([]);
  const [auto, setAuto] = useState<Automacao | null>(null);
  const [erro, setErro] = useState(""); const [carregando, setCarregando] = useState(true);
  const { data: todos } = useListClients();
  const opcoes = useMemo(() => (todos ?? []).map((cl) => ({ id: cl.id, name: cl.name, cpf: cl.cpf ?? null, phone: cl.phone ?? null, photoUrl: (cl as { photoUrl?: string | null }).photoUrl ?? null })), [todos]);

  const [cliGrupo, setCliGrupo] = useState<number | null>(null);
  const [cliBolao, setCliBolao] = useState<number | null>(null); const [campBolao, setCampBolao] = useState("");
  const [f, setF] = useState({ nome: "", concurso: "", data: "", valor: "", cotas: "", escolha: "clinica", modalidade: "", dezenas: "", universo: "60", jogos: "1", regras: "" });

  async function recarregar() {
    setCarregando(true);
    try {
      const [g, a] = await Promise.all([
        chamar<{ membros: Membro[]; convitesBolao: ConviteBolao[] }>("/grupo-vip"),
        chamar<Automacao>("/automacao"),
      ]);
      setMembros(g.membros); setConvites(g.convitesBolao); setAuto(a); setErro("");
    } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); }
  }
  useEffect(() => { void recarregar(); }, []);
  const rodar = async (chave: string, fn: () => Promise<unknown>, ok: string) => { await executar(chave, fn, ok); await recarregar(); };

  const abertas = campanhas.filter((c) => c.status === "aberto");
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const criar = () => {
    const corpo: Record<string, unknown> = { nome: f.nome.trim(), escolhaJogos: f.escolha };
    if (f.concurso.trim()) corpo.concurso = f.concurso.trim();
    if (f.data) corpo.dataSorteio = f.data;
    if (f.modalidade.trim()) corpo.modalidade = f.modalidade.trim();
    if (f.regras.trim()) corpo.regrasTexto = f.regras.trim();
    const valor = f.valor.trim() ? Math.round(Number(f.valor.replace(",", ".")) * 100) : undefined;
    if (valor !== undefined) corpo.valorCotaCentavos = valor;
    for (const [k, v] of [["cotasTotal", num(f.cotas)], ["dezenasPorJogo", num(f.dezenas)], ["universoMax", num(f.universo)], ["jogosPorCota", num(f.jogos)]] as const) if (v !== undefined) corpo[k] = v;
    void rodar("vip-criar", () => chamar("/campanhas", { method: "POST", json: corpo }), "Bolão criado como rascunho. Abra-o quando as regras estiverem prontas.");
  };

  return (
    <div className="space-y-3" data-testid="grupo-vip-gestao">
      <Bloco titulo="Grupo VIP e Conexão Milionária" id="vip-intro">
        <p className="text-muted-foreground text-xs leading-relaxed flex items-start gap-2">
          <Crown className="w-4 h-4 text-accent shrink-0" aria-hidden="true" />
          O Grupo VIP é independente da categoria comercial do cliente. O convite fica registrado aqui e aparece no portal do cliente; este sistema não envia mensagem.
          Só o próprio cliente aceita, recusa ou sai. Nada aqui cobra, compra ou aposta.
        </p>
        {erro && <p className="text-destructive text-xs" role="alert">{erro}</p>}
        {auto && (
          <div className="concave-3d rounded-lg p-3 text-xs space-y-1" data-testid="vip-automacao" data-estado={auto.estado}>
            <p className="text-primary font-black uppercase tracking-wider flex items-center gap-2"><ShieldAlert className="w-4 h-4" aria-hidden="true" /> Automação CAIXA: {auto.estado}</p>
            <p className="text-muted-foreground">{auto.motivo}</p>
            <p className="text-muted-foreground">Um jogo só é considerado efetivado quando existe comprovante oficial anexado e conferido.</p>
          </div>
        )}
      </Bloco>

      <Bloco titulo="Convidar cliente para o Grupo VIP" id="vip-convidar-grupo">
        <label className={LBL}>Cliente</label>
        <PaxterClientSelector clientes={opcoes} value={cliGrupo} onChange={setCliGrupo} placeholder="Selecionar cliente…" />
        <button type="button" className={BTN} disabled={!cliGrupo || ocupado !== null} data-testid="vip-convidar-grupo"
          onClick={() => { void rodar("vip-cg", () => chamar("/grupo-vip/convites", { method: "POST", json: { clientId: cliGrupo } }), "Convite registrado. O cliente decide no portal."); setCliGrupo(null); }}>Registrar convite</button>
        {carregando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
        {membros.length === 0 && !carregando && <p className="concave-3d rounded-lg p-3 text-center text-muted-foreground text-xs">Nenhum convite registrado ainda.</p>}
        {membros.map((m) => (
          <p key={m.id} className="concave-3d rounded-lg px-3 py-2 text-xs flex flex-wrap justify-between gap-2" data-testid="vip-membro" data-status={m.status}>
            <span className="text-primary font-black">{m.cliente.nome}</span>
            <span className="text-muted-foreground">{STATUS_MEMBRO[m.status] ?? m.status} · convite em {brDateTime(m.convidadoEm)}{m.respondidoEm ? ` · resposta em ${brDateTime(m.respondidoEm)}` : ""}</span>
          </p>
        ))}
      </Bloco>

      <Bloco titulo="Criar bolão com regras" id="vip-criar-bolao">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div><label className={LBL} htmlFor="vb-nome">Nome</label><input id="vb-nome" className={INP} maxLength={120} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
          <div><label className={LBL} htmlFor="vb-conc">Concurso</label><input id="vb-conc" className={INP} maxLength={60} value={f.concurso} onChange={(e) => setF({ ...f, concurso: e.target.value })} /></div>
          <div><label className={LBL} htmlFor="vb-data">Data do sorteio</label><input id="vb-data" type="date" className={INP} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
          <div><label className={LBL} htmlFor="vb-mod">Modalidade</label><input id="vb-mod" className={INP} maxLength={60} value={f.modalidade} onChange={(e) => setF({ ...f, modalidade: e.target.value })} /></div>
          <div><label className={LBL} htmlFor="vb-valor">Valor da cota (R$)</label><input id="vb-valor" inputMode="decimal" className={INP} value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value.replace(/[^\d,.]/g, "") })} /></div>
          <div><label className={LBL} htmlFor="vb-cotas">Total de cotas</label><input id="vb-cotas" inputMode="numeric" className={INP} value={f.cotas} onChange={(e) => setF({ ...f, cotas: e.target.value.replace(/\D/g, "") })} /></div>
          <div><label className={LBL} htmlFor="vb-dz">Dezenas por jogo</label><input id="vb-dz" inputMode="numeric" className={INP} value={f.dezenas} onChange={(e) => setF({ ...f, dezenas: e.target.value.replace(/\D/g, "") })} /></div>
          <div><label className={LBL} htmlFor="vb-un">Maior dezena possível</label><input id="vb-un" inputMode="numeric" className={INP} value={f.universo} onChange={(e) => setF({ ...f, universo: e.target.value.replace(/\D/g, "") })} /></div>
          <div><label className={LBL} htmlFor="vb-jc">Jogos por cota</label><input id="vb-jc" inputMode="numeric" className={INP} value={f.jogos} onChange={(e) => setF({ ...f, jogos: e.target.value.replace(/\D/g, "") })} /></div>
          <div><label className={LBL} htmlFor="vb-esc">Quem escolhe os jogos</label>
            <select id="vb-esc" className={INP} value={f.escolha} onChange={(e) => setF({ ...f, escolha: e.target.value })}>
              <option value="clinica">A clínica define os jogos</option><option value="participante">O participante escolhe os jogos</option>
            </select></div>
        </div>
        <label className={LBL} htmlFor="vb-reg">Regras para o participante (texto)</label>
        <textarea id="vb-reg" rows={3} maxLength={2000} className="field-engraved w-full px-2 py-2 text-sm" value={f.regras} onChange={(e) => setF({ ...f, regras: e.target.value })} />
        <button type="button" className={BTN} disabled={!f.nome.trim() || ocupado !== null} onClick={criar} data-testid="vip-criar">Criar bolão (rascunho)</button>
        {campanhas.map((c) => (
          <p key={c.id} className="concave-3d rounded-lg px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2" data-testid="vip-campanha" data-status={c.status}>
            <span className="text-primary font-black">{c.nome}</span>
            <span className="text-muted-foreground">{STATUS_CAMP[c.status ?? "rascunho"]}{c.dezenasPorJogo ? ` · ${c.dezenasPorJogo} dezenas` : ""}{c.cotasTotal ? ` · ${c.cotasTotal} cotas` : ""}</span>
            <span className="flex gap-2">
              {c.status === "rascunho" && <button type="button" className={BTN} disabled={ocupado !== null} onClick={() => void rodar(`ab${c.id}`, () => chamar(`/campanhas/${c.id}/status`, { method: "POST", json: { status: "aberto" } }), "Bolão aberto aos membros do Grupo VIP.")}>Abrir</button>}
              {c.status !== "encerrado" && <button type="button" className={BTN} disabled={ocupado !== null} onClick={() => void rodar(`en${c.id}`, () => chamar(`/campanhas/${c.id}/status`, { method: "POST", json: { status: "encerrado" } }), "Bolão encerrado.")}>Encerrar</button>}
            </span>
          </p>
        ))}
      </Bloco>

      <Bloco titulo="Convidar membro para um bolão aberto" id="vip-convidar-bolao">
        <label className={LBL} htmlFor="vcb-camp">Bolão aberto</label>
        <select id="vcb-camp" className={INP} value={campBolao} onChange={(e) => setCampBolao(e.target.value)}>
          <option value="">Escolha…</option>{abertas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <label className={LBL}>Membro do Grupo VIP</label>
        <PaxterClientSelector clientes={opcoes.filter((o) => membros.some((m) => m.cliente.id === o.id && m.status === "ativo"))} value={cliBolao} onChange={setCliBolao} placeholder="Selecionar cliente…" />
        <button type="button" className={BTN} disabled={!cliBolao || !campBolao || ocupado !== null} data-testid="vip-convidar-bolao"
          onClick={() => { void rodar("vip-cb", () => chamar(`/campanhas/${campBolao}/convites`, { method: "POST", json: { clientId: cliBolao } }), "Convite ao bolão registrado."); setCliBolao(null); }}>Registrar convite ao bolão</button>
        {convites.map((c) => (
          <p key={c.id} className="concave-3d rounded-lg px-3 py-2 text-xs flex flex-wrap justify-between gap-2" data-testid="vip-convite-bolao" data-status={c.status}>
            <span className="text-primary font-black">{c.cliente.nome} · {c.campanha.nome}</span>
            <span className="text-muted-foreground">{STATUS_CONVITE[c.status] ?? c.status} · {brDateTime(c.convidadoEm)}</span>
          </p>
        ))}
      </Bloco>

      <Bloco titulo="Jogos, cobrança Asaas e comprovantes" id="vip-acompanhamento">
        {partes.filter((p) => p.regras).length === 0 && <p className="concave-3d rounded-lg p-3 text-center text-muted-foreground text-xs"><Ticket className="w-4 h-4 inline mr-1" aria-hidden="true" />Nenhuma participação para acompanhar.</p>}
        {partes.map((p) => (
          <LinhaVip key={p.id} p={p} ocupado={ocupado !== null}
            onJogos={(jogos) => void rodar(`jg${p.id}`, () => chamar(`/participacoes/${p.id}/jogos`, { method: "PUT", json: { jogos } }), "Jogos salvos. Sem comprovante oficial, continuam não efetivados.")}
            onCobranca={(chargeId) => void rodar(`cb${p.id}`, () => chamar(`/participacoes/${p.id}/cobranca`, { method: "POST", json: { chargeId } }), "Cobrança vinculada (somente leitura do Asaas).")}
            onNatureza={(cid, natureza) => void rodar(`nt${cid}`, () => chamar(`/comprovantes/${cid}/natureza`, { method: "POST", json: { natureza } }), "Tipo do comprovante registrado.")} />
        ))}
      </Bloco>
      <MeusJogosGestao />
    </div>
  );
}
