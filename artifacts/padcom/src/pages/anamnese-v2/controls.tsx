import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, Check, Minus, Plus } from "lucide-react";
import type { AnamneseQuestion } from "@workspace/api-client-react";
import { controlKind, parseOpcoes, type Valor, type Opcao } from "./types";

const PETROLEO = "#3D7A7A";
const CIANO = "#45B8CC";

interface ControlProps {
  question: AnamneseQuestion;
  value: Valor | undefined;
  onChange: (v: Valor, opts?: { commit?: boolean }) => void;
}

export function ControlRenderer({ question, value, onChange }: ControlProps) {
  const kind = controlKind(question);
  const opcoes = parseOpcoes(question.opcoes);

  // single/multi sem opcoes no banco -> degrada para texto (nunca trava o fluxo)
  if ((kind === "single" || kind === "multi") && opcoes.length === 0) {
    return <TextoControl question={question} value={value} onChange={onChange} />;
  }

  switch (kind) {
    case "boolean":
      return <YesNoControl value={value} onChange={onChange} />;
    case "single":
      return <SingleControl opcoes={opcoes} value={value} onChange={onChange} />;
    case "multi":
      return <MultiControl opcoes={opcoes} value={value} onChange={onChange} />;
    case "escala":
      return <EscalaControl opcoes={opcoes} value={value} onChange={onChange} />;
    case "number":
      return <NumberControl value={value} onChange={onChange} />;
    default:
      return <TextoControl question={question} value={value} onChange={onChange} />;
  }
}

function YesNoControl({
  value,
  onChange,
}: {
  value: Valor | undefined;
  onChange: ControlProps["onChange"];
}) {
  const cur = value?.tipo === "boolean" ? value.bool : undefined;
  return (
    <div className="grid grid-cols-2 gap-3">
      {[
        { b: true, label: "SIM" },
        { b: false, label: "NÃO" },
      ].map((opt) => {
        const active = cur === opt.b;
        return (
          <button
            key={opt.label}
            type="button"
            onClick={() => onChange({ tipo: "boolean", bool: opt.b }, { commit: true })}
            className="panel-3d-sub flex h-20 items-center justify-center gap-2 rounded-md text-lg font-bold uppercase tracking-wide transition-all"
            style={
              active
                ? { boxShadow: `0 0 0 3px ${CIANO}`, color: PETROLEO }
                : { color: "#4b5563" }
            }
          >
            {active && <Check className="h-5 w-5" style={{ color: CIANO }} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SingleControl({
  opcoes,
  value,
  onChange,
}: {
  opcoes: Opcao[];
  value: Valor | undefined;
  onChange: ControlProps["onChange"];
}) {
  const cur = value?.tipo === "single" ? value.opcao : undefined;
  return (
    <div className="flex flex-col gap-2.5">
      {opcoes.map((o) => {
        const active = cur === o.label;
        return (
          <button
            key={String(o.valor)}
            type="button"
            onClick={() => onChange({ tipo: "single", opcao: o.label, valor: o.valor }, { commit: true })}
            className="panel-3d-sub flex items-center justify-between gap-2 rounded-md px-4 py-3.5 text-left text-base font-medium transition-all"
            style={active ? { boxShadow: `0 0 0 3px ${CIANO}`, color: PETROLEO } : { color: "#374151" }}
          >
            <span>{o.label}</span>
            {active && <Check className="h-5 w-5 shrink-0" style={{ color: CIANO }} />}
          </button>
        );
      })}
    </div>
  );
}

function MultiControl({
  opcoes,
  value,
  onChange,
}: {
  opcoes: Opcao[];
  value: Valor | undefined;
  onChange: ControlProps["onChange"];
}) {
  const sel = value?.tipo === "multi" ? value.selecionados : [];
  const toggle = (label: string) => {
    const next = sel.includes(label) ? sel.filter((s) => s !== label) : [...sel, label];
    onChange({ tipo: "multi", selecionados: next });
  };
  return (
    <div className="flex flex-wrap gap-2.5">
      {opcoes.map((o) => {
        const active = sel.includes(o.label);
        return (
          <button
            key={String(o.valor)}
            type="button"
            onClick={() => toggle(o.label)}
            className="panel-3d-sub flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all"
            style={active ? { boxShadow: `0 0 0 3px ${CIANO}`, color: PETROLEO } : { color: "#374151" }}
          >
            {active && <Check className="h-4 w-4" style={{ color: CIANO }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function EscalaControl({
  opcoes,
  value,
  onChange,
}: {
  opcoes: Opcao[];
  value: Valor | undefined;
  onChange: ControlProps["onChange"];
}) {
  const nums = opcoes
    .map((o) => Number(o.valor))
    .filter((n) => Number.isFinite(n));
  const ladder = nums.length > 0 ? nums : [0, 1, 2, 3, 4, 5];
  const max = Math.max(...ladder);
  const cur = value?.tipo === "escala" ? value.escala : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {ladder.map((n) => {
          const active = cur === n;
          const filled = cur != null && n <= cur;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ tipo: "escala", escala: n, max }, { commit: true })}
              className="concave-3d flex h-12 w-12 items-center justify-center rounded-md text-base font-bold transition-all"
              style={{
                boxShadow: active ? `0 0 0 3px ${CIANO}` : undefined,
                background: filled ? PETROLEO : undefined,
                color: filled ? "#fff" : "#4b5563",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        <span>Menos / ausente</span>
        <span>Mais / intenso</span>
      </div>
    </div>
  );
}

function NumberControl({
  value,
  onChange,
}: {
  value: Valor | undefined;
  onChange: ControlProps["onChange"];
}) {
  const cur = value?.tipo === "number" ? value.numero : "";
  const set = (n: number) => onChange({ tipo: "number", numero: Math.max(0, n) });
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => set((typeof cur === "number" ? cur : 0) - 1)}
        className="btn-3d-soft flex h-12 w-12 items-center justify-center rounded-md"
        aria-label="Diminuir"
      >
        <Minus className="h-5 w-5" />
      </button>
      <input
        inputMode="numeric"
        value={cur}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/[^0-9]/g, ""));
          set(Number.isFinite(n) ? n : 0);
        }}
        className="field-engraved h-12 w-24 rounded-md text-center text-xl font-bold"
        style={{ color: PETROLEO }}
      />
      <button
        type="button"
        onClick={() => set((typeof cur === "number" ? cur : 0) + 1)}
        className="btn-3d-soft flex h-12 w-12 items-center justify-center rounded-md"
        aria-label="Aumentar"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

function TextoControl({
  question,
  value,
  onChange,
}: {
  question: AnamneseQuestion;
  value: Valor | undefined;
  onChange: ControlProps["onChange"];
}) {
  const cur = value?.tipo === "texto" ? value.texto : "";
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);

  const sttAvailable =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const ttsAvailable = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop?.();
      } catch {
        /* noop */
      }
    };
  }, []);

  const startVoice = () => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "pt-BR";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (ev: any) => {
      const txt = Array.from(ev.results)
        .map((r: any) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      const base = cur ? cur + " " : "";
      onChange({ tipo: "texto", texto: (base + txt).trim() });
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stopVoice = () => {
    try {
      recRef.current?.stop?.();
    } catch {
      /* noop */
    }
    setListening(false);
  };

  const readAloud = () => {
    if (!ttsAvailable || !question.pergunta) return;
    const u = new SpeechSynthesisUtterance(question.pergunta);
    u.lang = "pt-BR";
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={cur}
        onChange={(e) => onChange({ tipo: "texto", texto: e.target.value })}
        rows={3}
        placeholder="Escreva ou use o microfone..."
        className="field-engraved w-full rounded-md p-3 text-base"
        style={{ color: PETROLEO }}
      />
      <div className="flex items-center gap-2">
        {sttAvailable && (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            className="btn-3d-soft flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
            style={listening ? { boxShadow: `0 0 0 2px ${CIANO}`, color: PETROLEO } : undefined}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {listening ? "Ouvindo..." : "Falar"}
          </button>
        )}
        {ttsAvailable && (
          <button
            type="button"
            onClick={readAloud}
            className="btn-3d-soft flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
          >
            <Volume2 className="h-4 w-4" />
            Ouvir
          </button>
        )}
      </div>
      {(sttAvailable || ttsAvailable) && (
        <p className="text-[11px] text-gray-400">
          A voz é processada pelo seu próprio navegador/dispositivo, não enviada a servidores externos.
        </p>
      )}
    </div>
  );
}
