import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Check, Minus, Plus, Square, RotateCcw } from "lucide-react";
import type { AnamneseQuestion } from "@workspace/api-client-react";
import { controlKind, parseOpcoes, type Valor, type Opcao } from "./types";

const GOLD = "#c9a24e";

interface ControlProps {
  question: AnamneseQuestion;
  value: Valor | undefined;
  onChange: (v: Valor, opts?: { commit?: boolean }) => void;
}

export function ControlRenderer({ question, value, onChange }: ControlProps) {
  const kind = controlKind(question);
  const opcoes = parseOpcoes(question.opcoes);

  // Escala validada "macos-ano": dois campos (cigarros/dia + anos) -> numero.
  if (question.escalaValidada === "MACOS_ANO") {
    return <MacosAnoControl value={value} onChange={onChange} />;
  }

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
            data-active={active}
            onClick={() => onChange({ tipo: "boolean", bool: opt.b }, { commit: true })}
            className="leva-chip flex h-12 items-center justify-center gap-2 text-base font-bold uppercase tracking-normal"
          >
            {active && <Check className="h-5 w-5" />}
            <span className="leva-chip-txt">{opt.label}</span>
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
            data-active={active}
            onClick={() => onChange({ tipo: "single", opcao: o.label, valor: o.valor }, { commit: true })}
            className="leva-chip flex items-center justify-between gap-2 px-4 py-3 text-left text-base font-medium"
          >
            <span className="leva-chip-txt">{o.label}</span>
            {active && <Check className="h-5 w-5 shrink-0" />}
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
    const isNenhum = /nunca|nenhum/i.test(label);
    let next: string[];
    if (sel.includes(label)) {
      next = sel.filter((s) => s !== label);
    } else if (isNenhum) {
      // "Nunca / Nenhum" e exclusivo: limpa as demais selecoes.
      next = [label];
    } else {
      // qualquer outra opcao desmarca o "Nunca / Nenhum".
      next = [...sel.filter((s) => !/nunca|nenhum/i.test(s)), label];
    }
    onChange({ tipo: "multi", selecionados: next });
  };
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {opcoes.map((o) => {
        const active = sel.includes(o.label);
        return (
          <button
            key={String(o.valor)}
            type="button"
            data-active={active}
            onClick={() => toggle(o.label)}
            className="leva-chip flex min-w-0 items-center gap-2 px-4 py-2.5 text-left text-sm font-medium"
          >
            {active && <Check className="h-4 w-4 shrink-0" />}
            <span className="leva-chip-txt truncate">{o.label}</span>
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
  const minN = Math.min(...ladder);
  const cur = value?.tipo === "escala" ? value.escala : undefined;

  // Rotulo de texto por degrau (so quando difere do proprio numero).
  const labelByNum = new Map<number, string>();
  for (const o of opcoes) {
    const n = Number(o.valor);
    if (Number.isFinite(n) && o.label && o.label !== String(o.valor)) {
      labelByNum.set(n, o.label);
    }
  }
  const hasTextLabels = labelByNum.size > 0;
  const curLabel = cur != null ? labelByNum.get(cur) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${ladder.length}, minmax(0, 1fr))` }}
      >
        {ladder.map((n) => {
          const active = cur === n;
          const filled = cur != null && n <= cur;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ tipo: "escala", escala: n, max }, { commit: true })}
              className="concave-3d flex h-12 items-center justify-center rounded-md px-2 text-base font-bold transition-all"
              style={{
                boxShadow: active ? `0 0 0 3px ${GOLD}` : undefined,
                background: filled ? "hsl(var(--primary))" : undefined,
                color: filled ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))",
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      {hasTextLabels ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            <span>{labelByNum.get(minN) ?? "Menos"}</span>
            <span>{labelByNum.get(max) ?? "Mais"}</span>
          </div>
          {curLabel && (
            <div
              className="concave-3d rounded-md px-3 py-2 text-center text-sm font-semibold"
              style={{ color: "hsl(var(--primary))" }}
            >
              {curLabel}
            </div>
          )}
        </div>
      ) : (
        <div className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <span>Menos / ausente</span>
          <span>Mais / intenso</span>
        </div>
      )}
    </div>
  );
}

// Escala "macos-ano": cigarros/dia + anos -> numero (macos-ano). O valor salvo
// e SEMPRE o numero calculado; os dois campos sao auxiliares de entrada.
function MacosAnoControl({
  value,
  onChange,
}: {
  value: Valor | undefined;
  onChange: ControlProps["onChange"];
}) {
  const saved = value?.tipo === "number" ? value.numero : undefined;
  const [cigs, setCigs] = useState("");
  const [anos, setAnos] = useState("");

  const calc = (c: string, a: string) => {
    const cc = Number(c.replace(/[^0-9]/g, "")) || 0;
    const aa = Number(a.replace(/[^0-9]/g, "")) || 0;
    return Math.round((cc / 20) * aa * 10) / 10;
  };
  const macosAno = calc(cigs, anos);
  const emit = (c: string, a: string) => onChange({ tipo: "number", numero: calc(c, a) });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Cigarros por dia
          </label>
          <input
            inputMode="numeric"
            value={cigs}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setCigs(v);
              emit(v, anos);
            }}
            placeholder="ex.: 20"
            className="field-engraved h-12 rounded-md text-center text-xl font-bold"
            style={{ color: "hsl(var(--foreground))" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Por quantos anos
          </label>
          <input
            inputMode="numeric"
            value={anos}
            onChange={(e) => {
              const v = e.target.value.replace(/[^0-9]/g, "");
              setAnos(v);
              emit(cigs, v);
            }}
            placeholder="ex.: 10"
            className="field-engraved h-12 rounded-md text-center text-xl font-bold"
            style={{ color: "hsl(var(--foreground))" }}
          />
        </div>
      </div>
      <div className="concave-3d flex items-center justify-between rounded-md px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Maços-ano (cálculo automático)
        </span>
        <span className="text-lg font-bold" style={{ color: "hsl(var(--primary))" }}>
          {cigs || anos ? macosAno : saved != null ? saved : "—"}
        </span>
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
        style={{ color: "hsl(var(--foreground))" }}
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

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={cur}
        onChange={(e) => onChange({ tipo: "texto", texto: e.target.value })}
        rows={3}
        placeholder="Escreva ou use o microfone..."
        className="field-engraved w-full rounded-md p-3 text-base"
        style={{ color: "hsl(var(--foreground))" }}
      />
      <div className="flex items-center gap-2">
        {sttAvailable && (
          <button
            type="button"
            onClick={listening ? stopVoice : startVoice}
            className="leva-action leva-action-rec inline-flex items-center gap-2 px-3 py-2 text-sm font-bold"
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            {listening ? "Ouvindo..." : "Falar"}
          </button>
        )}
      </div>
      {sttAvailable && (
        <p className="text-[11px] text-gray-400">
          O ditado (microfone) é processado pelo seu próprio navegador/dispositivo.
        </p>
      )}
      <AudioRecorder />
    </div>
  );
}

// Gravacao de audio para perguntas abertas (gravar/parar/regravar + duracao + ouvir).
// O audio fica no proprio navegador como complemento da resposta escrita; se o
// microfone for negado ou indisponivel, degrada com aviso claro sem travar o fluxo.
function AudioRecorder() {
  const [supported] = useState(
    () => typeof window !== "undefined" && typeof (window as any).MediaRecorder !== "undefined",
  );
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Espelha a URL atual do blob para o cleanup de unmount revogar a versao
  // vigente (e nao o valor capturado no mount, que seria sempre null).
  const urlRef = useRef<string | null>(null);

  const limparTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const pararStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    urlRef.current = audioUrl;
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      limparTimer();
      pararStream();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iniciar = async () => {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        pararStream();
      };
      recRef.current = rec;
      rec.start();
      setSeconds(0);
      setRecording(true);
      limparTimer();
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setErro("Não foi possível acessar o microfone. Verifique a permissão do navegador. Você pode responder por escrito normalmente.");
    }
  };

  const parar = () => {
    limparTimer();
    setRecording(false);
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
  };

  const regravar = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setSeconds(0);
    iniciar();
  };

  if (!supported) return null;

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-2 border-t pt-2" style={{ borderColor: "rgba(0,0,0,.06)" }}>
      <div className="flex flex-wrap items-center gap-2">
        {!recording && !audioUrl && (
          <button
            type="button"
            onClick={iniciar}
            className="leva-action leva-action-rec inline-flex items-center gap-2 px-3 py-2 text-sm font-bold"
            data-testid="button-gravar-audio"
          >
            <Mic className="h-4 w-4" /> Gravar áudio
          </button>
        )}
        {recording && (
          <button
            type="button"
            onClick={parar}
            className="leva-action leva-action-rec inline-flex items-center gap-2 px-3 py-2 text-sm font-bold"
            data-testid="button-parar-audio"
          >
            <Square className="h-4 w-4" /> Parar
          </button>
        )}
        {(recording || audioUrl) && (
          <span className="text-sm font-bold tabular-nums" style={{ color: recording ? "#ef4444" : "hsl(var(--primary))" }}>
            {mmss}
          </span>
        )}
        {audioUrl && !recording && (
          <button
            type="button"
            onClick={regravar}
            className="leva-action leva-action-rec inline-flex items-center gap-2 px-3 py-2 text-sm font-bold"
            data-testid="button-regravar-audio"
          >
            <RotateCcw className="h-4 w-4" /> Regravar
          </button>
        )}
      </div>
      {audioUrl && !recording && (
        <audio src={audioUrl} controls className="w-full" data-testid="audio-gravado" />
      )}
      {erro ? (
        <p className="text-[11px] text-red-500">{erro}</p>
      ) : (
        <p className="text-[11px] text-gray-400">
          A gravação de áudio fica no seu dispositivo como complemento da resposta escrita.
        </p>
      )}
    </div>
  );
}
