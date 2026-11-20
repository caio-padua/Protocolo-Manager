/**
 * Frases do assistente de agendamento no Telegram. O texto mora no banco (tabela telegram_frases);
 * esta tela lista, valida variáveis e grava. Só o CEO grava.
 */
import { useEffect, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { BASE } from "./_shared";
import { getCollabToken } from "@/lib/collab-auth";
import { ModelosComunicacao } from "./modelos-comunicacao";

interface Frase { chave: string; grupo: string; descricao: string; variaveis: string[]; obrigatorias: string[]; texto: string; padrao: string }
interface PerguntaAprendida {
  id: number; pergunta: string; variacoes: string[]; resposta: string; ativa: boolean; usos: number;
  economiaIa: number; respostaEditada: boolean; orientacaoId: number; fonteVigente: boolean;
  criadaEm: string; atualizadaEm: string;
}
interface VersaoAprendida {
  id: number; pergunta: string; variacoes: string[]; resposta: string; ativa: boolean; alteradaPor: string; criadaEm: string;
}

const auth = (): Record<string, string> => { const t = getCollabToken(); return t ? { Authorization: `Bearer ${t}` } : {}; };

export function FrasesAssistente() {
  const [frases, setFrases] = useState<Frase[] | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"frases" | "aprendidas" | "modelos">("frases");
  const [aprendidas, setAprendidas] = useState<PerguntaAprendida[] | null>(null);
  const [rascunhosAprendidos, setRascunhosAprendidos] = useState<Record<number, { pergunta: string; variacoes: string; resposta: string }>>({});
  const [versoes, setVersoes] = useState<Record<number, VersaoAprendida[]>>({});
  const [avisoAprendidas, setAvisoAprendidas] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/telegram-inbox/frases`, { headers: auth() })
      .then(async (r) => { if (!r.ok) throw new Error("Sem acesso às frases."); const j = await r.json() as { frases: Frase[] }; setFrases(j.frases); setRascunho(Object.fromEntries(j.frases.map((f) => [f.chave, f.texto]))); })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : "Não foi possível carregar."));
  }, []);

  const salvar = async (f: Frase, texto: string) => {
    setAviso((a) => ({ ...a, [f.chave]: "Gravando…" }));
    const r = await fetch(`${BASE}/api/telegram-inbox/frases/${f.chave}`, { method: "PUT", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ texto }) });
    const j = await r.json().catch(() => ({})) as { error?: string };
    if (r.ok) setFrases((l) => l?.map((x) => (x.chave === f.chave ? { ...x, texto } : x)) ?? l);
    setAviso((a) => ({ ...a, [f.chave]: r.ok ? "Gravada." : r.status === 403 ? "Somente o CEO pode gravar." : (j.error ?? "Não gravou.") }));
  };

  const carregarAprendidas = async () => {
    const r = await fetch(`${BASE}/api/telegram-inbox/faq/aprendidas`, { headers: auth() });
    if (!r.ok) throw new Error(r.status === 403 ? "Somente o CEO pode abrir as perguntas aprendidas." : "Não foi possível carregar as perguntas aprendidas.");
    const j = await r.json() as { itens: PerguntaAprendida[] };
    setAprendidas(j.itens);
    setRascunhosAprendidos(Object.fromEntries(j.itens.map((item) => [item.id, {
      pergunta: item.pergunta, variacoes: item.variacoes.join("\n"), resposta: item.resposta,
    }])));
  };

  useEffect(() => {
    if (aba !== "aprendidas" || aprendidas !== null) return;
    void carregarAprendidas().catch((e: unknown) => setAvisoAprendidas(e instanceof Error ? e.message : "Falha ao carregar."));
  }, [aba, aprendidas]);

  const salvarAprendida = async (item: PerguntaAprendida) => {
    const draft = rascunhosAprendidos[item.id];
    if (!draft) return;
    setAvisoAprendidas("Gravando correção…");
    const r = await fetch(`${BASE}/api/telegram-inbox/faq/aprendidas/${item.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...auth() },
      body: JSON.stringify({ ...draft, variacoes: draft.variacoes.split("\n").map((v) => v.trim()).filter(Boolean) }),
    });
    const j = await r.json().catch(() => ({})) as { error?: string };
    if (!r.ok) { setAvisoAprendidas(j.error ?? "Não foi possível salvar."); return; }
    setAvisoAprendidas("Correção salva. A próxima mensagem já usará a nova versão.");
    setAprendidas(null);
  };

  const alterarAtiva = async (item: PerguntaAprendida) => {
    const r = await fetch(`${BASE}/api/telegram-inbox/faq/aprendidas/${item.id}/estado`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify({ ativa: !item.ativa }),
    });
    if (!r.ok) { setAvisoAprendidas("Não foi possível alterar o estado."); return; }
    setAprendidas(null);
    setAvisoAprendidas(item.ativa ? "Pergunta desativada." : "Pergunta ativada.");
  };

  const arquivarAprendida = async (item: PerguntaAprendida) => {
    const r = await fetch(`${BASE}/api/telegram-inbox/faq/aprendidas/${item.id}`, { method: "DELETE", headers: auth() });
    if (!r.ok) { setAvisoAprendidas("Não foi possível arquivar."); return; }
    setAprendidas(null);
    setAvisoAprendidas("Pergunta arquivada sem apagar o histórico.");
  };

  const abrirVersoes = async (id: number) => {
    const r = await fetch(`${BASE}/api/telegram-inbox/faq/aprendidas/${id}/versoes`, { headers: auth() });
    if (!r.ok) { setAvisoAprendidas("Não foi possível carregar o histórico."); return; }
    const j = await r.json() as { versoes: VersaoAprendida[] };
    setVersoes((old) => ({ ...old, [id]: j.versoes }));
  };

  const grupos = [...new Set(frases?.map((f) => f.grupo) ?? [])];
  return (
    <section className="panel-3d overflow-hidden" data-testid="frases-assistente">
      <div className="bevel-3d flex items-center gap-3 px-5 py-3" style={{ borderLeft: "4px solid #b8924d" }}>
        <MessageSquareText className="h-5 w-5 text-[#b8924d]" />
        <div>
          <p className="text-[13px] font-bold uppercase tracking-wide">Frases do assistente de agendamento</p>
          <p className="text-[10px] text-muted-foreground">Texto cadastrado no banco. Use as variáveis entre chaves, como {"{nome1}"} e {"{lista}"}.</p>
        </div>
      </div>
      <div className="space-y-5 p-5">
        <div role="tablist" aria-label="Conteúdo do assistente" className="concave-3d flex flex-wrap gap-2 p-2">
          <button type="button" role="tab" aria-selected={aba === "frases"} className={`min-h-11 px-4 text-[12px] font-bold uppercase ${aba === "frases" ? "btn-3d" : "bevel-3d"}`} onClick={() => setAba("frases")}>Frases</button>
          <button type="button" role="tab" aria-selected={aba === "aprendidas"} className={`min-h-11 px-4 text-[12px] font-bold uppercase ${aba === "aprendidas" ? "btn-3d" : "bevel-3d"}`} onClick={() => setAba("aprendidas")}>Aprendidas</button>
          <button type="button" role="tab" aria-selected={aba === "modelos"} className={`min-h-11 px-4 text-[12px] font-bold uppercase ${aba === "modelos" ? "btn-3d" : "bevel-3d"}`} onClick={() => setAba("modelos")} data-testid="aba-modelos">Modelos de comunicação</button>
        </div>
        {aba === "frases" && <>
        {erro && <p role="alert" className="concave-3d p-3 text-[12px] text-rose-700">{erro}</p>}
        {grupos.map((g) => (
          <div key={g} className="space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#b8924d]">{g}</p>
            {frases!.filter((f) => f.grupo === g).map((f) => (
              <div key={f.chave} className="concave-3d space-y-2 p-3">
                <p className="text-[12px] font-semibold">{f.descricao}</p>
                <textarea className="w-full min-h-[84px] rounded-md border border-border bg-background p-2 text-[13px]" value={rascunho[f.chave] ?? ""} onChange={(e) => setRascunho((r) => ({ ...r, [f.chave]: e.target.value }))} aria-label={f.descricao} />
                <p className="text-[10px] text-muted-foreground">Variáveis: {f.variaveis.length ? f.variaveis.map((v) => `{${v}}${f.obrigatorias.includes(v) ? " (obrigatória)" : ""}`).join(", ") : "nenhuma"}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="bevel-3d min-h-11 px-4 text-[12px] font-bold uppercase" disabled={rascunho[f.chave] === f.texto} onClick={() => void salvar(f, rascunho[f.chave] ?? "")}>Gravar</button>
                  <button type="button" className="bevel-3d min-h-11 px-4 text-[12px] font-bold uppercase" onClick={() => setRascunho((r) => ({ ...r, [f.chave]: f.padrao }))}>Voltar ao texto original</button>
                  {aviso[f.chave] && <span role="status" className="text-[12px]">{aviso[f.chave]}</span>}
                </div>
              </div>
            ))}
          </div>
        ))}
        </>}
        {aba === "modelos" && <ModelosComunicacao />}
        {aba === "aprendidas" && <div className="space-y-4">
          <p className="text-[12px] leading-relaxed text-muted-foreground">A IA apenas agrupa perguntas repetidas. A resposta vem de uma orientação aprovada; nunca é escrita pela IA. Perguntas clínicas, comerciais, pessoais ou sem fonte seguem para a equipe.</p>
          {avisoAprendidas && <p role="status" className="concave-3d p-3 text-[12px]">{avisoAprendidas}</p>}
          {aprendidas === null && !avisoAprendidas && <p className="concave-3d p-3 text-[12px]">Carregando perguntas aprendidas…</p>}
          {aprendidas?.length === 0 && <p className="concave-3d p-3 text-[12px]">Ainda não há perguntas aprendidas nesta clínica.</p>}
          {aprendidas?.map((item) => {
            const draft = rascunhosAprendidos[item.id] ?? { pergunta: item.pergunta, variacoes: item.variacoes.join("\n"), resposta: item.resposta };
            return <article key={item.id} className="concave-3d space-y-3 p-3" data-testid={`faq-aprendida-${item.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
                  <span className="bevel-3d px-2 py-1">Aprendida pela IA</span>
                  <span className="bevel-3d px-2 py-1">{item.ativa ? "Ativa" : "Inativa"}</span>
                  <span className="bevel-3d px-2 py-1">{item.fonteVigente ? "Fonte aprovada vigente" : "Fonte mudou; conferir"}</span>
                </div>
                <span className="text-[11px] text-muted-foreground">Usos: {item.usos} · Consultas de IA evitadas: {item.economiaIa}</span>
              </div>
              <label className="block space-y-1 text-[11px] font-semibold">Pergunta padrão
                <textarea className="w-full min-h-14 rounded-md border border-border bg-background p-2 text-[13px]" value={draft.pergunta} onChange={(e) => setRascunhosAprendidos((old) => ({ ...old, [item.id]: { ...draft, pergunta: e.target.value } }))} />
              </label>
              <label className="block space-y-1 text-[11px] font-semibold">Variações reconhecidas, uma por linha
                <textarea className="w-full min-h-20 rounded-md border border-border bg-background p-2 text-[13px]" value={draft.variacoes} onChange={(e) => setRascunhosAprendidos((old) => ({ ...old, [item.id]: { ...draft, variacoes: e.target.value } }))} />
              </label>
              <label className="block space-y-1 text-[11px] font-semibold">Resposta aprovada ou corrigida
                <textarea className="w-full min-h-24 rounded-md border border-border bg-background p-2 text-[13px]" value={draft.resposta} onChange={(e) => setRascunhosAprendidos((old) => ({ ...old, [item.id]: { ...draft, resposta: e.target.value } }))} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-3d min-h-11 px-4 text-[11px] font-bold uppercase" onClick={() => void salvarAprendida(item)}>Salvar correção</button>
                <button type="button" className="bevel-3d min-h-11 px-4 text-[11px] font-bold uppercase" onClick={() => void alterarAtiva(item)}>{item.ativa ? "Desativar" : "Ativar"}</button>
                <button type="button" className="bevel-3d min-h-11 px-4 text-[11px] font-bold uppercase" onClick={() => void abrirVersoes(item.id)}>Histórico</button>
                <button type="button" className="bevel-3d min-h-11 px-4 text-[11px] font-bold uppercase text-rose-700" onClick={() => void arquivarAprendida(item)}>Arquivar</button>
              </div>
              {versoes[item.id] && <div className="space-y-2 border-t border-border/50 pt-3">
                <p className="text-[11px] font-bold uppercase">Histórico de versões</p>
                {versoes[item.id].map((v) => <div key={v.id} className="bevel-3d space-y-1 p-2 text-[11px]">
                  <p>{new Date(v.criadaEm).toLocaleString("pt-BR")} · {v.alteradaPor} · {v.ativa ? "ativa" : "inativa"}</p>
                  <p className="font-semibold">{v.pergunta}</p><p>{v.resposta}</p>
                </div>)}
              </div>}
            </article>;
          })}
        </div>}
      </div>
    </section>
  );
}
