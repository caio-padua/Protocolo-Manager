import { useEffect, useMemo, useState } from "react";
import "./pulso-telegram.css";

// Mini aplicativo aberto pelo botao "Registrar meu pulso" no Telegram.
// Publico: a credencial e o initData assinado pelo Telegram; o servidor descobre quem e.

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
};
declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp } } }

type Sessao = {
  nome: string; data: string; periodo: "manha" | "tarde" | "noite";
  atual: Record<string, number | null> | null;
  perguntas: Array<{ campo: "sono" | "energia" | "libido"; pendente: string | null; enunciado: string; gravaEm: "hoje" | "ontem_noite" }>;
};
type Valores = Record<"energia" | "libido" | "sono" | "pressaoSistolica" | "pressaoDiastolica" | "frequenciaCardiaca" | "glicemia", string>;

const VAZIO: Valores = { energia: "", libido: "", sono: "", pressaoSistolica: "", pressaoDiastolica: "", frequenciaCardiaca: "", glicemia: "" };
const NOME_PERIODO = { manha: "da manhã", tarde: "da tarde", noite: "da noite" } as const;
const ROTULO = { sono: "Sono", energia: "Energia", libido: "Libido (opcional, toque de novo para limpar)" } as const;
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const api = (caminho: string) => `${import.meta.env.BASE_URL}api/pulso-telegram/${caminho}`;

function Escala({ rotulo, valor, onChange, aviso, enunciado }: { rotulo: string; valor: string; onChange: (v: string) => void; aviso?: string | null; enunciado?: string }) {
  return (
    <div className="pt-bloco">
      <div className="pt-rotulo">{rotulo}<span>de 0 a 10</span></div>
      {aviso && <p className="pt-msg"><b>{aviso}</b></p>}
      {enunciado && <p className="pt-msg">{enunciado}</p>}
      <div className="pt-fileira pt-fileira-11" role="group" aria-label={rotulo}>
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" className="pt-q" aria-pressed={valor === String(n)}
            onClick={() => onChange(valor === String(n) ? "" : String(n))}>{n}</button>
        ))}
      </div>
    </div>
  );
}

function Medida({ rotulo, unidade, rapidos, valor, onChange, max }: {
  rotulo: string; unidade: string; rapidos: number[]; valor: string; onChange: (v: string) => void; max: number;
}) {
  return (
    <div className="pt-bloco">
      <div className="pt-rotulo">{rotulo}<span>{unidade}</span></div>
      <div className="pt-fileira" role="group" aria-label={`${rotulo}, valores comuns`}>
        {rapidos.map((n) => (
          <button key={n} type="button" className="pt-q" aria-pressed={valor === String(n)}
            onClick={() => onChange(String(n))}>{n}</button>
        ))}
      </div>
      <input className="pt-campo" inputMode="numeric" pattern="[0-9]*" placeholder="ou digite o valor"
        aria-label={`${rotulo}, digitar`} value={valor} maxLength={String(max).length}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
    </div>
  );
}

export default function PulsoTelegram() {
  const tg = useMemo(() => window.Telegram?.WebApp, []);
  const [pronto, setPronto] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [erroSessao, setErroSessao] = useState<string | null>(null);
  const [v, setV] = useState<Valores>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);

  // O Telegram injeta window.Telegram.WebApp pelo script oficial; carregado aqui apenas nesta pagina.
  useEffect(() => {
    if (window.Telegram?.WebApp) { setPronto(true); return; }
    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-web-app.js";
    s.onload = () => setPronto(true);
    s.onerror = () => { setErroSessao("Não foi possível carregar o Telegram."); setPronto(true); };
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!pronto) return;
    const app = window.Telegram?.WebApp;
    if (!app?.initData) { setErroSessao((e) => e ?? "Abra este formulário pelo botão enviado no Telegram."); return; }
    app.ready(); app.expand();
    const ctl = new AbortController();
    fetch(api("sessao"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: app.initData }), signal: ctl.signal })
      .then(async (r) => {
        const corpo = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(corpo.error ?? "Não foi possível abrir o formulário.");
        const s = corpo as Sessao;
        setSessao(s);
        if (s.atual) {
          const t = (n: number | null | undefined) => (n == null ? "" : String(n));
          setV({ energia: t(s.atual.energia), libido: t(s.atual.libido), sono: t(s.atual.sono),
            pressaoSistolica: t(s.atual.pressaoSistolica), pressaoDiastolica: t(s.atual.pressaoDiastolica),
            frequenciaCardiaca: t(s.atual.frequenciaCardiaca), glicemia: t(s.atual.glicemia) });
        }
      })
      .catch((e: Error) => { if (e.name !== "AbortError") setErroSessao(e.message); });
    return () => ctl.abort();
  }, [pronto, tg]);

  const set = (k: keyof Valores) => (x: string) => setV((a) => ({ ...a, [k]: x }));
  const manha = sessao?.periodo === "manha";

  const enviar = async () => {
    const app = window.Telegram?.WebApp;
    if (!app || !sessao) return;
    const n = (x: string) => (x === "" ? null : Number(x));
    const sis = n(v.pressaoSistolica), dia = n(v.pressaoDiastolica);
    if ((sis === null) !== (dia === null)) { setErro("Informe sístole e diástole juntas."); return; }
    if (sis !== null && dia !== null && sis <= dia) { setErro("A sístole deve ser maior que a diástole."); return; }
    setErro(null); setEnviando(true);
    try {
      const r = await fetch(api("registrar"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        initData: app.initData,
        valores: { ...Object.fromEntries(sessao.perguntas.map((q) => [q.gravaEm === "ontem_noite" ? "libidoOntem" : q.campo, n(v[q.campo])])),
          pressaoSistolica: sis, pressaoDiastolica: dia, frequenciaCardiaca: n(v.frequenciaCardiaca), glicemia: manha ? n(v.glicemia) : null },
      }) });
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo.error ?? "Não foi possível registrar.");
      setFeito(true);
      window.setTimeout(() => app.close(), 1600);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  if (erroSessao) return <main className="pt"><p className="pt-msg" role="alert">{erroSessao}</p></main>;
  if (!sessao) return <main className="pt"><p className="pt-msg" role="status">Abrindo…</p></main>;
  if (feito) return <main className="pt"><div className="pt-ok" role="status"><h2>Registrado</h2><p>Obrigado, {sessao.nome}. Sua equipe já pode ver.</p></div></main>;

  return (
    <main className="pt">
      <div className="pt-miolo">
        <header className="pt-topo">
          <small>Pulso diário</small>
          <h1>Olá, {sessao.nome}</h1>
          <p>Registro {NOME_PERIODO[sessao.periodo]} · {dataBr(sessao.data)}</p>
        </header>
        {sessao.perguntas.map((q) => (
          <Escala key={q.campo} rotulo={ROTULO[q.campo]} valor={v[q.campo]} onChange={set(q.campo)} aviso={q.pendente} enunciado={q.enunciado} />
        ))}
        <Medida rotulo="Sístole (máxima)" unidade="mmHg" rapidos={[100, 110, 120, 130, 140]} valor={v.pressaoSistolica} onChange={set("pressaoSistolica")} max={260} />
        <Medida rotulo="Diástole (mínima)" unidade="mmHg" rapidos={[60, 70, 80, 90, 100]} valor={v.pressaoDiastolica} onChange={set("pressaoDiastolica")} max={160} />
        <Medida rotulo="Frequência cardíaca" unidade="bpm" rapidos={[60, 70, 80, 90, 100]} valor={v.frequenciaCardiaca} onChange={set("frequenciaCardiaca")} max={220} />
        {manha && <Medida rotulo="Glicemia" unidade="mg/dL" rapidos={[80, 90, 100, 110, 120]} valor={v.glicemia} onChange={set("glicemia")} max={600} />}
        {erro && <p className="pt-erro" role="alert">{erro}</p>}
        <button type="button" className="pt-enviar" disabled={enviando} onClick={() => void enviar()}>
          {enviando ? "Registrando…" : "Registrar"}
        </button>
      </div>
    </main>
  );
}
