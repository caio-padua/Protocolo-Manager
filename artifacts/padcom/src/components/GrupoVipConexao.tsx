import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert, Ticket, UserCheck } from "lucide-react";

// Grupo VIP no portal do cliente (autenticado por token do portal; nunca escolhe outro cliente).
// Adesão e entrada em bolões são VOLUNTÁRIAS e só acontecem por clique do próprio cliente.
// Nada aqui cobra, aposta, emite bilhete ou envia mensagem. Jogo escolhido NUNCA é mostrado como registrado
// sem comprovante oficial. Não lê nem mostra a categoria comercial.

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type StatusMembro = "convidado" | "ativo" | "recusou" | "saiu" | null;
type Cobranca = { estado: "sem_cobranca" | "aguardando" | "confirmado" | "vencido" | "outro" | "indisponivel"; statusAsaas: string | null; brutoCentavos: number | null; dataPagamento: string | null; extratoConferido: boolean };
type Disponivel = {
  id: number; nome: string; concurso: string | null; dataSorteio: string | null; valorCotaCentavos: number | null; cotasRestantes: number | null;
  escolhaJogos: "clinica" | "participante"; modalidade: string | null; dezenasPorJogo: number | null; universoMax: number; jogosPorCota: number;
  regrasTexto: string | null; convite: "convidado" | "aceito" | "recusado" | null; participacaoId: number | null;
};
type Minha = {
  id: number; cotas: number; status: string; campanha: { nome: string };
  jogos?: { ordem: number; dezenas: number[]; origem: string }[];
  situacaoJogos?: "sem_jogos" | "escolhido_sem_comprovante" | "efetivado_com_comprovante";
  natureza?: "nominativo" | "cota_oficial_individual" | null;
  cobranca?: Cobranca; escolhaJogos?: "clinica" | "participante";
  regras?: { dezenasPorJogo: number | null; universoMax: number; jogosPorCota: number; esperado: number; bolaoAberto: boolean };
};
export type GrupoVipDados = { status: StatusMembro; boloes: Disponivel[]; participacoes: Minha[] };

const brDate = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const brl = (c: number) => `R$ ${(c / 100).toFixed(2).replace(".", ",")}`;
const dz = (n: number) => String(n).padStart(2, "0");

export function useGrupoVip(token: string) {
  const [data, setData] = useState<GrupoVipDados | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/area-paciente/grupo-vip`, { headers: { Authorization: `Bearer ${token}` } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada. Entre novamente." : body.error ?? "Não foi possível carregar o Grupo VIP.");
      setData({ status: body.status ?? null, boloes: Array.isArray(body.boloes) ? body.boloes : [], participacoes: Array.isArray(body.participacoes) ? body.participacoes : [] });
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  return { data, error, load };
}

async function enviar(token: string, metodo: "POST" | "PUT", caminho: string, corpo?: unknown): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/area-paciente/grupo-vip${caminho}`, {
      method: metodo, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (res.ok) return null;
    const b = await res.json().catch(() => ({}));
    return res.status === 401 ? "Sessão expirada. Entre novamente." : b.error ?? "Não foi possível concluir.";
  } catch { return "Sem conexão. Tente novamente."; }
}

// ------------------------------------------------------------------ adesão (dentro da tela do Grupo VIP)
export function GrupoVipAdesao({ token }: { token: string }) {
  const { data, error, load } = useGrupoVip(token);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  async function responder(acao: "aceitar" | "recusar" | "sair") {
    setOcupado(true); setErro("");
    const e = await enviar(token, "POST", `/${acao}`);
    if (e) setErro(e); else await load();
    setOcupado(false);
  }
  const s = data?.status ?? null;
  const texto: Record<string, string> = {
    none: "Você ainda não recebeu um convite para o Grupo VIP. Quando o Instituto convidar, ele aparecerá aqui e você decide se quer participar.",
    convidado: "O Instituto convidou você para o Grupo VIP. Participar é uma escolha sua: você pode aceitar ou recusar.",
    ativo: "Você participa do Grupo VIP por escolha própria. Pode sair quando quiser; o que já foi registrado continua guardado.",
    recusou: "Você recusou o convite. Se o Instituto convidar novamente, você poderá decidir de novo.",
    saiu: "Você saiu do Grupo VIP. Se o Instituto convidar novamente, você poderá decidir de novo.",
  };
  return (
    <section className="panel-3d rounded-xl overflow-hidden" aria-label="Minha participação" data-testid="grupo-vip-adesao">
      <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
        <UserCheck className="w-4 h-4 text-accent" aria-hidden="true" />
        <h3 className="text-primary text-xs font-black uppercase tracking-widest">Minha participação</h3>
      </div>
      <div className="p-4 space-y-3">
        {error && <p className="text-destructive text-xs" role="alert">{error}</p>}
        {!data && !error && <p className="text-muted-foreground text-xs flex items-center gap-2" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
        {data && <p className="text-muted-foreground text-xs leading-relaxed" data-testid="grupo-vip-situacao" data-status={s ?? "sem_convite"}>{texto[s ?? "none"]}</p>}
        {data && s === "convidado" && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={ocupado} onClick={() => void responder("aceitar")} data-testid="grupo-vip-aceitar"
              className="btn-3d-soft min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60">Aceitar convite</button>
            <button type="button" disabled={ocupado} onClick={() => void responder("recusar")} data-testid="grupo-vip-recusar"
              className="btn-3d-soft min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60">Recusar</button>
          </div>
        )}
        {data && s === "ativo" && (
          <button type="button" disabled={ocupado} onClick={() => void responder("sair")} data-testid="grupo-vip-sair"
            className="btn-3d-soft w-full min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60">Sair do Grupo VIP</button>
        )}
        {erro && <p className="text-destructive text-xs" role="alert">{erro}</p>}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ bolões (dentro de Conexão Milionária)
function textoCobranca(c: Cobranca): string {
  switch (c.estado) {
    case "sem_cobranca": return "Nenhuma cobrança vinculada pela clínica ainda.";
    case "aguardando": return "Cobrança do Asaas aguardando pagamento.";
    case "confirmado": return `Pagamento confirmado no Asaas${c.dataPagamento ? ` em ${brDate(c.dataPagamento)}` : ""}${c.extratoConferido ? ", com crédito conferido no extrato" : ", ainda sem conferência no extrato"}.`;
    case "vencido": return "Cobrança do Asaas vencida.";
    case "indisponivel": return "Situação da cobrança indisponível no momento.";
    default: return `Cobrança em situação especial no Asaas (${c.statusAsaas ?? "desconhecida"}).`;
  }
}
function textoJogos(m: Minha): string {
  if (m.situacaoJogos === "efetivado_com_comprovante") return "Registrado, com comprovante oficial conferido.";
  if (m.situacaoJogos === "escolhido_sem_comprovante") return "Jogos escolhidos. Sem comprovante oficial, ainda NÃO estão registrados na CAIXA.";
  return "Jogos ainda não definidos.";
}
const NATUREZA: Record<string, string> = {
  nominativo: "Comprovante nominativo (identifica você, mas não é a cota oficial individual).",
  cota_oficial_individual: "Cota oficial individual (comprovante da sua própria cota).",
};

function Jogos({ token, m, aoSalvar }: { token: string; m: Minha; aoSalvar: () => void }) {
  const [txt, setTxt] = useState((m.jogos ?? []).map((j) => j.dezenas.map(dz).join(" ")).join("\n"));
  const [erro, setErro] = useState(""); const [ocupado, setOcupado] = useState(false);
  const r = m.regras!;
  async function salvar() {
    const linhas = txt.split("\n").map((l) => l.trim()).filter(Boolean);
    const jogos = linhas.map((l) => l.split(/[\s,;-]+/).filter(Boolean).map(Number));
    if (jogos.some((j) => j.some((n) => !Number.isInteger(n)))) { setErro("Use apenas números nas dezenas."); return; }
    setOcupado(true); setErro("");
    const e = await enviar(token, "PUT", `/participacoes/${m.id}/jogos`, { jogos });
    if (e) setErro(e); else aoSalvar();
    setOcupado(false);
  }
  return (
    <div className="space-y-2" data-testid="jogos-editor">
      <label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor={`jg-${m.id}`}>
        Seus jogos: {r.esperado} jogo(s), {r.dezenasPorJogo} dezenas cada (1 a {r.universoMax}), um jogo por linha
      </label>
      <textarea id={`jg-${m.id}`} rows={Math.min(8, Math.max(3, r.esperado))} className="field-engraved w-full px-2 py-2 text-sm font-mono" value={txt} onChange={(e) => setTxt(e.target.value)} />
      <button type="button" disabled={ocupado} onClick={() => void salvar()} data-testid="jogos-salvar"
        className="btn-3d-soft w-full min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60">Salvar meus jogos</button>
      {erro && <p className="text-destructive text-xs" role="alert">{erro}</p>}
    </div>
  );
}

function Minha({ token, m, aoSalvar }: { token: string; m: Minha; aoSalvar: () => void }) {
  if (!m.regras || !m.cobranca) return null;
  const editavel = m.escolhaJogos === "participante" && m.status !== "cancelada" && m.regras.bolaoAberto && m.situacaoJogos !== "efetivado_com_comprovante" && m.regras.dezenasPorJogo !== null;
  return (
    <article className="panel-3d-sub rounded-xl p-3 space-y-2" data-testid="grupo-vip-minha" aria-label={`Minha participação em ${m.campanha.nome}`}>
      <h4 className="text-primary font-black text-sm uppercase tracking-wide break-words">{m.campanha.nome} · {m.cotas} cota(s)</h4>
      <p className="concave-3d rounded-lg px-3 py-2 text-xs text-muted-foreground" data-testid="cobranca-estado" data-estado={m.cobranca.estado}>{textoCobranca(m.cobranca)}</p>
      <p className="concave-3d rounded-lg px-3 py-2 text-xs text-muted-foreground" data-testid="jogos-situacao" data-situacao={m.situacaoJogos}>{textoJogos(m)}</p>
      {m.situacaoJogos === "efetivado_com_comprovante" && (
        <p className="concave-3d rounded-lg px-3 py-2 text-xs text-muted-foreground" data-testid="comprovante-natureza">{m.natureza ? NATUREZA[m.natureza] : "A clínica ainda não classificou o tipo do comprovante."}</p>
      )}
      {(m.jogos ?? []).length > 0 && (
        <ul className="space-y-1" data-testid="jogos-lista">
          {m.jogos!.map((j) => (
            <li key={j.ordem} className="concave-3d rounded-lg px-3 py-1.5 text-xs font-mono text-primary">Jogo {j.ordem}: {j.dezenas.map(dz).join(" ")} <span className="text-muted-foreground font-sans">({j.origem === "clinica" ? "definido pela clínica" : "escolhido por você"})</span></li>
          ))}
        </ul>
      )}
      {m.escolhaJogos === "clinica" && m.situacaoJogos === "sem_jogos" && <p className="text-muted-foreground text-[11px]">Neste bolão a clínica define os jogos.</p>}
      {editavel && <Jogos token={token} m={m} aoSalvar={aoSalvar} />}
    </article>
  );
}

export function GrupoVipBoloes({ token }: { token: string }) {
  const { data, error, load } = useGrupoVip(token);
  const [cotas, setCotas] = useState<Record<number, string>>({});
  const [erro, setErro] = useState(""); const [ocupado, setOcupado] = useState(false);
  async function entrar(id: number) {
    setOcupado(true); setErro("");
    const e = await enviar(token, "POST", `/boloes/${id}/entrar`, { cotas: Number(cotas[id] || "1") || 1 });
    if (e) setErro(e); else await load();
    setOcupado(false);
  }
  async function recusar(id: number) {
    setOcupado(true); setErro("");
    const e = await enviar(token, "POST", `/boloes/${id}/recusar`);
    if (e) setErro(e); else await load();
    setOcupado(false);
  }
  const membro = data?.status === "ativo";
  return (
    <section className="space-y-3" aria-label="Bolões do Grupo VIP" data-testid="grupo-vip-boloes">
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar flex items-center gap-2 px-4 py-3">
          <Ticket className="w-4 h-4 text-accent" aria-hidden="true" />
          <h2 className="text-primary text-xs font-black uppercase tracking-widest">Bolões disponíveis</h2>
        </div>
        <div className="p-4 space-y-3">
          {error && <p className="text-destructive text-xs" role="alert">{error}</p>}
          {!data && !error && <p className="text-muted-foreground text-xs flex items-center gap-2" role="status"><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando…</p>}
          {data && !membro && (
            <p className="concave-3d rounded-lg px-3 py-2 text-muted-foreground text-xs flex items-start gap-2" data-testid="boloes-so-membros">
              <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
              Os bolões abertos aparecem aqui para quem participa do Grupo VIP. Aceite o convite na aba Grupo VIP, se quiser participar.
            </p>
          )}
          {data && membro && data.boloes.length === 0 && <p className="text-muted-foreground text-xs" data-testid="boloes-nenhum-aberto">Nenhum bolão aberto no momento.</p>}
          {membro && data?.boloes.map((b) => (
            <article key={b.id} className="panel-3d-sub rounded-xl p-3 space-y-2" data-testid="bolao-disponivel" aria-label={`Bolão ${b.nome}`}>
              <h3 className="text-primary font-black text-sm uppercase tracking-wide break-words">{b.nome}</h3>
              <p className="text-muted-foreground text-xs leading-snug">
                {[b.concurso ? `Concurso ${b.concurso}` : null, b.dataSorteio ? `Sorteio ${brDate(b.dataSorteio)}` : null, b.valorCotaCentavos != null ? `Cota ${brl(b.valorCotaCentavos)}` : null,
                  b.cotasRestantes != null ? `${b.cotasRestantes} cota(s) restante(s)` : null, b.dezenasPorJogo ? `${b.dezenasPorJogo} dezenas por jogo, ${b.jogosPorCota} jogo(s) por cota` : null,
                  b.escolhaJogos === "participante" ? "Você escolhe os jogos" : "A clínica define os jogos"].filter(Boolean).join(" · ")}
              </p>
              {b.regrasTexto && <p className="concave-3d rounded-lg px-3 py-2 text-xs text-muted-foreground whitespace-pre-line">{b.regrasTexto}</p>}
              {b.convite === "convidado" && <p className="text-accent text-[10px] font-black uppercase tracking-widest">Você foi convidado(a) para este bolão</p>}
              {b.participacaoId ? (
                <p className="text-primary text-xs font-black">Você já participa deste bolão.</p>
              ) : (
                <div className="space-y-2">
                  <label className="block text-[11px] font-black uppercase tracking-wider text-primary" htmlFor={`ct-${b.id}`}>Quantas cotas</label>
                  <input id={`ct-${b.id}`} inputMode="numeric" className="field-engraved w-full min-h-[44px] px-2 text-sm" value={cotas[b.id] ?? "1"} onChange={(e) => setCotas((c) => ({ ...c, [b.id]: e.target.value.replace(/\D/g, "") }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={ocupado} onClick={() => void entrar(b.id)} data-testid="bolao-entrar" className="btn-3d-soft min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60">Quero participar</button>
                    <button type="button" disabled={ocupado || b.convite !== "convidado"} onClick={() => void recusar(b.id)} data-testid="bolao-recusar" className="btn-3d-soft min-h-[48px] px-3 text-xs font-black uppercase tracking-wider disabled:opacity-60">Recusar convite</button>
                  </div>
                  <p className="text-muted-foreground text-[11px]">Entrar registra apenas a sua adesão. Não gera cobrança nem aposta; a clínica combina o pagamento com você.</p>
                </div>
              )}
            </article>
          ))}
          {erro && <p className="text-destructive text-xs" role="alert">{erro}</p>}
        </div>
      </div>

      {data && data.participacoes.some((p) => p.regras) && (
        <div className="panel-3d rounded-xl overflow-hidden" data-testid="grupo-vip-minhas">
          <div className="login-card-topbar px-4 py-3"><h2 className="text-primary text-xs font-black uppercase tracking-widest">Meus jogos e pagamento</h2></div>
          <div className="p-3 space-y-2">{data.participacoes.map((m) => <Minha key={m.id} token={token} m={m} aoSalvar={() => void load()} />)}</div>
        </div>
      )}
    </section>
  );
}
