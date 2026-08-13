import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Send,
  Copy,
  Check,
  Pencil,
  Save,
  X,
  Loader2,
  CalendarDays,
  Clock,
  Quote,
  MessageSquareText,
  Stethoscope,
  Award,
  PenLine,
  Users,
} from "lucide-react";
import { BASE, ConsoleShell, BlockTitle } from "./_shared";

// ===========================================================================
// CARTA DE ENCANTAMENTO (Mensageria Opus) — compositor editável da mensagem
// rica do WhatsApp, portado do primo IHE, nativo, com marca PAXTER e design 3D
// Paxter. A mesma composição roda no servidor (montarMensagemOpus) para o motor
// automático de lembrete por período. Aqui o CEO pré-visualiza, edita cada bloco
// (persiste no catálogo) e copia/abre no WhatsApp.
// ===========================================================================

type Conteudo = Record<string, string>;
interface Bloco {
  id: number;
  categoria: string;
  chave: string;
  ordem: number;
  conteudo: Conteudo;
  ativo: boolean;
}
type Catalogo = Record<string, Bloco[]>;

const DIAS = [
  { chave: "segunda", label: "Segunda-feira" },
  { chave: "terca", label: "Terça-feira" },
  { chave: "quarta", label: "Quarta-feira" },
  { chave: "quinta", label: "Quinta-feira" },
  { chave: "sexta", label: "Sexta-feira" },
  { chave: "sabado", label: "Sábado" },
  { chave: "domingo", label: "Domingo" },
];

// Bloco de prescrição de EXEMPLO (só na prévia). No motor real, entra a
// prescrição verdadeira do cliente.
const BLOCO_EXEMPLO = [
  "⬛ *Período:* _Início da Manhã_",
  "🟩 *Programado* para administrar:",
  "",
  "🟩 *Complexo B Metilado*",
  "   Metilcobalamina — 5.000 mcg",
  "   Horário: 07:00",
  "   Posologia: 1 dose ao acordar",
].join("\n");

function diaSemanaHojeBRT(): string {
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(new Date());
  const mapa: Record<string, string> = {
    Sun: "domingo", Mon: "segunda", Tue: "terca", Wed: "quarta",
    Thu: "quinta", Fri: "sexta", Sat: "sabado",
  };
  return mapa[wd] ?? "segunda";
}

function semanaDoMesHojeBRT(): string {
  const diaStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
  }).format(new Date());
  const dia = parseInt(diaStr, 10) || 1;
  return String(Math.min(4, Math.max(1, Math.ceil(dia / 7))));
}

// Sulco côncavo com <select> nativo (robusto; evita a armadilha do Radix Select
// controlado que perde o valor no reset).
function SelectWell({
  icon: Icon,
  label,
  value,
  onChange,
  children,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="concave-3d flex items-center gap-2 px-3 py-2">
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field-engraved h-8 w-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none"
      >
        {children}
      </select>
    </label>
  );
}

// Campo editável inline: mostra texto gravado; ao clicar em editar, vira textarea
// e persiste (PUT) no catálogo.
function CampoEditavel({
  bloco,
  campo,
  rotulo,
  onSaved,
}: {
  bloco: Bloco;
  campo: string;
  rotulo: string;
  onSaved: (novo: Bloco) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(bloco.conteudo[campo] ?? "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!editando) setValor(bloco.conteudo[campo] ?? "");
  }, [bloco, campo, editando]);

  async function salvar() {
    setSalvando(true);
    try {
      const novoConteudo = { ...bloco.conteudo, [campo]: valor };
      const r = await fetch(`${BASE}/api/mensagens-catalogo/${bloco.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conteudo: novoConteudo }),
      });
      if (r.ok) {
        const atualizado = (await r.json()) as Bloco;
        onSaved(atualizado);
        setEditando(false);
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {rotulo}
        </span>
        {!editando ? (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary hover:opacity-80"
          >
            <Pencil className="h-3 w-3" /> Editar
          </button>
        ) : (
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 hover:opacity-80 disabled:opacity-50 dark:text-emerald-400"
            >
              {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
            </button>
            <button
              type="button"
              onClick={() => setEditando(false)}
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:opacity-80"
            >
              <X className="h-3 w-3" /> Cancelar
            </button>
          </span>
        )}
      </div>
      {editando ? (
        <textarea
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          rows={Math.min(8, Math.max(2, valor.split("\n").length + 1))}
          className="field-engraved concave-3d w-full resize-y bg-transparent px-3 py-2 text-[12px] leading-relaxed text-foreground outline-none"
        />
      ) : (
        <p className="concave-3d whitespace-pre-wrap px-3 py-2 text-[12px] leading-relaxed text-foreground/80">
          {bloco.conteudo[campo] || <span className="italic text-muted-foreground">(vazio)</span>}
        </p>
      )}
    </div>
  );
}

export default function CartaEncantamento() {
  const [data, setData] = useState<Catalogo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  const [nome, setNome] = useState("João");
  const [periodoChave, setPeriodoChave] = useState("inicioManha");
  const [diaChave, setDiaChave] = useState(diaSemanaHojeBRT());
  const [semanaChave, setSemanaChave] = useState(semanaDoMesHojeBRT());
  const [statusChave, setStatusChave] = useState("op1");
  const [falaChave, setFalaChave] = useState("absorcao_idade");
  const [versiculoChave, setVersiculoChave] = useState("1");
  const [mostrarBloco, setMostrarBloco] = useState(true);
  const [copiado, setCopiado] = useState(false);

  // Seletor "Cliente real": "" = exemplo estático (default). Ao escolher um
  // cliente com lembrete, busca a mensagem REAL do motor e a exibe no lugar do
  // BLOCO_EXEMPLO. O exemplo estático NUNCA é removido — só substituído na tela.
  const [clientesReais, setClientesReais] = useState<{ clienteId: number; nome: string }[]>([]);
  const [clienteRealId, setClienteRealId] = useState("");
  const [previaReal, setPreviaReal] = useState("");
  const [previaRealLoading, setPreviaRealLoading] = useState(false);

  const carregar = useCallback(() => {
    setLoading(true);
    return fetch(`${BASE}/api/mensagens-catalogo`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("catalogo"))))
      .then((d: Catalogo) => {
        setData(d);
        setErro(false);
      })
      .catch(() => setErro(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Substitui um bloco no catálogo após edição (mantém a prévia em dia).
  const substituirBloco = useCallback((novo: Bloco) => {
    setData((prev) => {
      if (!prev) return prev;
      const lista = (prev[novo.categoria] ?? []).map((b) => (b.id === novo.id ? novo : b));
      return { ...prev, [novo.categoria]: lista };
    });
  }, []);

  function pegar(categoria: string, chave: string): Bloco | undefined {
    return data?.[categoria]?.find((b) => b.chave === chave);
  }

  const periodo = pegar("PERIODO", periodoChave);
  const dia = pegar("DIA_SEMANA", diaChave);
  const semana = pegar("SEMANA_MES", semanaChave);
  const status = pegar("DR_CAIO_STATUS", statusChave);
  const fala = pegar("DR_CAIO_FALA", falaChave);
  const versiculo = pegar("VERSICULO_SABADO", versiculoChave);
  const elogio = pegar("ELOGIO_SEMANA", semanaChave);
  const obs = data?.["OBS_DOSE"]?.[0];
  const ass = data?.["ASSINATURA"]?.[0];

  const isSabado = diaChave === "sabado";

  // Composição — espelha montarMensagemOpus (server) e o mensagemFinal (IHE).
  const mensagem = useMemo(() => {
    if (!periodo || !dia || !semana) return "";
    const saudacao = periodo.conteudo.saudacao || "Olá";
    const diaLabel = (dia.conteudo.label || "").toLowerCase();
    const semanaFrase = semana.conteudo.frase || "";

    let abertura = `${saudacao}!\n\n${nome || "cliente"}, tudo bem?\n\n`;
    if (status?.conteudo.texto) abertura += `${status.conteudo.texto}\n\n`;

    if (isSabado && versiculo?.conteudo.texto) {
      abertura += `*Feliz Sábado!* Hoje estamos na *${semanaFrase}*.\n\n`;
      abertura += `${versiculo.conteudo.texto}\n\n`;
      abertura += `${periodo.conteudo.abertura || ""}\n\n${dia.conteudo.frase || ""}\n\n${periodo.conteudo.desejo || ""}`;
    } else {
      abertura += `Hoje é *${diaLabel}* — estamos na *${semanaFrase}*.\n\n`;
      abertura += `${periodo.conteudo.abertura || ""}\n\n${dia.conteudo.frase || ""}\n\n${periodo.conteudo.desejo || ""}`;
    }

    const prescricao = mostrarBloco ? BLOCO_EXEMPLO : "{BLOCO_DE_PRESCRIÇÃO}";
    const drCaio = fala?.conteudo.texto || "";
    const elogioTxt = elogio?.conteudo.texto
      ? `*${elogio.conteudo.texto}*\n\nParabéns, ${nome || "cliente"}. Continue firme.`
      : "";
    const obsTxt = obs?.conteudo.texto || "";
    const assBlock = ass
      ? `${ass.conteudo.saudacao_fechamento || ""}\n\n*${ass.conteudo.nome || ""}*\n_${ass.conteudo.papel || ""}_\n\n───────────\n${ass.conteudo.rodape_linha1 || ""}\n_${ass.conteudo.rodape_subtitulo1 || ""}_\n\n${ass.conteudo.rodape_linha2 || ""}\n_${ass.conteudo.rodape_subtitulo2 || ""}_\n───────────`
      : "";

    return [abertura, prescricao, drCaio, elogioTxt, obsTxt, assBlock]
      .filter(Boolean)
      .join("\n\n");
  }, [periodo, dia, semana, status, versiculo, elogio, obs, ass, nome, isSabado, mostrarBloco, fala]);

  // Popula o dropdown "Cliente real" com os clientes que têm lembrete.
  useEffect(() => {
    let alive = true;
    fetch(`${BASE}/api/lembretes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("lembretes"))))
      .then((d: { lembretes: { clienteId: number; nome: string }[] }) => {
        if (alive) setClientesReais(d.lembretes.map((l) => ({ clienteId: l.clienteId, nome: l.nome })));
      })
      .catch(() => {
        if (alive) setClientesReais([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Busca a mensagem REAL do cliente escolhido (vazio = exemplo estático).
  useEffect(() => {
    if (!clienteRealId) {
      setPreviaReal("");
      return;
    }
    let alive = true;
    setPreviaRealLoading(true);
    fetch(`${BASE}/api/lembretes/${clienteRealId}/preview`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("preview"))))
      .then((d: { mensagem: string }) => {
        if (alive) setPreviaReal(d.mensagem);
      })
      .catch(() => {
        if (alive) setPreviaReal("");
      })
      .finally(() => {
        if (alive) setPreviaRealLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [clienteRealId]);

  // Mensagem exibida: real (se cliente escolhido e prévia pronta) ou o exemplo.
  const mensagemExibida = clienteRealId && previaReal ? previaReal : mensagem;

  function copiar() {
    navigator.clipboard.writeText(mensagemExibida).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    });
  }

  function abrirWhatsapp() {
    const url = `https://wa.me/?text=${encodeURIComponent(mensagemExibida)}`;
    window.open(url, "_blank", "noopener");
  }

  if (loading) {
    return (
      <ConsoleShell icon={Sparkles} title="Carta de Encantamento" subtitle="Mensageria Opus — compositor da mensagem rica do WhatsApp">
        <div className="panel-3d flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </ConsoleShell>
    );
  }

  if (erro || !data) {
    return (
      <ConsoleShell icon={Sparkles} title="Carta de Encantamento" subtitle="Mensageria Opus — compositor da mensagem rica do WhatsApp">
        <div className="panel-3d p-6 text-sm text-rose-700 dark:text-rose-400">
          Não foi possível carregar o catálogo de mensagens. Tente recarregar a página.
        </div>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      icon={Sparkles}
      title="Carta de Encantamento"
      subtitle="Mensageria Opus — a mesma composição do lembrete automático por período"
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
        {/* ── COLUNA ESQUERDA: controles + editor ── */}
        <div className="space-y-5">
          <section className="panel-3d p-5">
            <BlockTitle icon={PenLine}>Contexto da mensagem</BlockTitle>
            <div className="space-y-2.5">
              <label className="concave-3d flex items-center gap-2 px-3 py-2">
                <MessageSquareText className="h-4 w-4 shrink-0 text-primary" />
                <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Nome
                </span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Primeiro nome do cliente"
                  className="field-engraved h-8 w-full min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none"
                />
              </label>

              <SelectWell icon={Clock} label="Período" value={periodoChave} onChange={setPeriodoChave}>
                {(data["PERIODO"] ?? []).map((b) => (
                  <option key={b.chave} value={b.chave}>
                    {b.conteudo.label} ({b.conteudo.horario})
                  </option>
                ))}
              </SelectWell>

              <SelectWell icon={CalendarDays} label="Dia da semana" value={diaChave} onChange={setDiaChave}>
                {DIAS.map((d) => (
                  <option key={d.chave} value={d.chave}>
                    {d.label}
                  </option>
                ))}
              </SelectWell>

              <SelectWell icon={CalendarDays} label="Semana do mês" value={semanaChave} onChange={setSemanaChave}>
                {(data["SEMANA_MES"] ?? []).map((b) => (
                  <option key={b.chave} value={b.chave}>
                    {b.chave}ª semana
                  </option>
                ))}
              </SelectWell>

              <SelectWell icon={Stethoscope} label="Status Dr. Caio" value={statusChave} onChange={setStatusChave}>
                {(data["DR_CAIO_STATUS"] ?? []).map((b) => (
                  <option key={b.chave} value={b.chave}>
                    {b.conteudo.texto ? b.conteudo.texto.slice(0, 40) + "…" : "(sem status)"}
                  </option>
                ))}
              </SelectWell>

              <SelectWell icon={Quote} label="Fala Dr. Caio" value={falaChave} onChange={setFalaChave}>
                {(data["DR_CAIO_FALA"] ?? []).map((b) => (
                  <option key={b.chave} value={b.chave}>
                    {b.conteudo.label}
                  </option>
                ))}
              </SelectWell>

              {isSabado ? (
                <SelectWell icon={Quote} label="Versículo" value={versiculoChave} onChange={setVersiculoChave}>
                  {(data["VERSICULO_SABADO"] ?? []).map((b) => (
                    <option key={b.chave} value={b.chave}>
                      Versículo {b.chave}
                    </option>
                  ))}
                </SelectWell>
              ) : null}

              <label className="concave-3d flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-[12px] font-semibold uppercase tracking-wide text-foreground/80">
                  Mostrar bloco de prescrição (exemplo)
                </span>
                <input
                  type="checkbox"
                  checked={mostrarBloco}
                  onChange={(e) => setMostrarBloco(e.target.checked)}
                  className="h-4 w-4 accent-[var(--paxter-accent,#c9a24a)]"
                />
              </label>
            </div>
          </section>

          {/* Editor dos blocos em jogo */}
          <section className="panel-3d p-5">
            <BlockTitle icon={Pencil}>Editar blocos desta mensagem</BlockTitle>
            <p className="mb-3 text-[12px] text-muted-foreground">
              As edições ficam salvas no catálogo e valem também para o lembrete automático por período.
            </p>
            <div className="space-y-4">
              {periodo ? (
                <div className="panel-3d-sub space-y-3 p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                    Período · {periodo.conteudo.label}
                  </h4>
                  <CampoEditavel bloco={periodo} campo="saudacao" rotulo="Saudação" onSaved={substituirBloco} />
                  <CampoEditavel bloco={periodo} campo="abertura" rotulo="Abertura" onSaved={substituirBloco} />
                  <CampoEditavel bloco={periodo} campo="desejo" rotulo="Desejo / chamada às fórmulas" onSaved={substituirBloco} />
                </div>
              ) : null}

              {dia ? (
                <div className="panel-3d-sub space-y-3 p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                    Dia · {dia.conteudo.label}
                  </h4>
                  <CampoEditavel bloco={dia} campo="frase" rotulo="Frase do dia" onSaved={substituirBloco} />
                </div>
              ) : null}

              {fala ? (
                <div className="panel-3d-sub space-y-3 p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                    Fala do Dr. Caio · {fala.conteudo.label}
                  </h4>
                  <CampoEditavel bloco={fala} campo="texto" rotulo="Texto" onSaved={substituirBloco} />
                </div>
              ) : null}

              {elogio ? (
                <div className="panel-3d-sub space-y-3 p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                    Elogio · {semanaChave}ª semana
                  </h4>
                  <CampoEditavel bloco={elogio} campo="texto" rotulo="Texto" onSaved={substituirBloco} />
                </div>
              ) : null}

              {isSabado && versiculo ? (
                <div className="panel-3d-sub space-y-3 p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                    Versículo de sábado {versiculoChave}
                  </h4>
                  <CampoEditavel bloco={versiculo} campo="texto" rotulo="Texto" onSaved={substituirBloco} />
                </div>
              ) : null}

              {obs ? (
                <div className="panel-3d-sub space-y-3 p-3">
                  <h4 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                    Observação de dose
                  </h4>
                  <CampoEditavel bloco={obs} campo="texto" rotulo="Texto" onSaved={substituirBloco} />
                </div>
              ) : null}

              {ass ? (
                <div className="panel-3d-sub space-y-3 p-3">
                  <h4 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-primary">
                    <Award className="h-3.5 w-3.5" /> Assinatura (marca PAXTER)
                  </h4>
                  <CampoEditavel bloco={ass} campo="saudacao_fechamento" rotulo="Fechamento" onSaved={substituirBloco} />
                  <CampoEditavel bloco={ass} campo="nome" rotulo="Nome" onSaved={substituirBloco} />
                  <CampoEditavel bloco={ass} campo="papel" rotulo="Papel" onSaved={substituirBloco} />
                  <CampoEditavel bloco={ass} campo="rodape_linha1" rotulo="Rodapé — linha 1" onSaved={substituirBloco} />
                  <CampoEditavel bloco={ass} campo="rodape_subtitulo1" rotulo="Rodapé — subtítulo 1" onSaved={substituirBloco} />
                  <CampoEditavel bloco={ass} campo="rodape_linha2" rotulo="Rodapé — linha 2" onSaved={substituirBloco} />
                  <CampoEditavel bloco={ass} campo="rodape_subtitulo2" rotulo="Rodapé — subtítulo 2" onSaved={substituirBloco} />
                </div>
              ) : null}
            </div>
          </section>
        </div>

        {/* ── COLUNA DIREITA: prévia WhatsApp ── */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <section className="panel-3d p-4">
            <BlockTitle icon={Send}>Prévia no WhatsApp</BlockTitle>

            {/* Seletor Cliente real — no TOPO, como antes (ordem do CEO, 10/07/2026) */}
            <div className="mb-3">
              <SelectWell
                icon={Users}
                label="Cliente real"
                value={clienteRealId}
                onChange={setClienteRealId}
              >
                <option value="">— exemplo —</option>
                {clientesReais.map((c) => (
                  <option key={c.clienteId} value={String(c.clienteId)}>
                    {c.nome}
                  </option>
                ))}
              </SelectWell>
              <p className="mt-1 px-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {clienteRealId
                  ? "Mostrando a mensagem REAL deste cliente (motor por período)."
                  : "Mostrando o exemplo estático — escolha um cliente para ver a mensagem real."}
              </p>
            </div>

            <div
              className="concave-3d whitespace-pre-wrap px-4 py-4 text-[13px] leading-relaxed text-foreground/90"
              style={{ maxHeight: "62vh", overflowY: "auto", fontFamily: "PaxmedNum, 'Georgia', serif" }}
            >
              {previaRealLoading ? "Carregando mensagem real…" : mensagemExibida}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={copiar}
                className="btn-3d-soft inline-flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide"
              >
                {copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
              <button
                type="button"
                onClick={abrirWhatsapp}
                className="btn-3d inline-flex items-center justify-center gap-2 px-3 py-2 text-[12px] font-semibold uppercase tracking-wide"
              >
                <Send className="h-4 w-4" /> WhatsApp
              </button>
            </div>
          </section>
        </div>
      </div>
    </ConsoleShell>
  );
}
