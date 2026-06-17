import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle,
  Loader2,
  AlertCircle,
  ClipboardList,
  User,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  Play,
  X,
} from "lucide-react";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Opcao = { label: string; valor: string | number; peso?: number };
type Pergunta = {
  perguntaId: string;
  bloco: string;
  pergunta: string;
  tipoResposta: string | null;
  opcoes: Opcao[] | null;
  ordem: number | null;
  termoTecnico?: string | null;
  orientacao?: string | null;
  porqueClinico?: string | null;
  videoUrl?: string | null;
};
type Bloco = { bloco: string; perguntas: Pergunta[] };
type Client = { id: number; name: string; cpf: string; token: string };

function formatCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return digits.slice(0, 3) + "." + digits.slice(3);
  if (digits.length <= 9) return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6);
  return digits.slice(0, 3) + "." + digits.slice(3, 6) + "." + digits.slice(6, 9) + "-" + digits.slice(9);
}

function formatDate(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
}

function isNumeric(tipo: string | null): boolean {
  if (!tipo) return false;
  const t = tipo.toUpperCase();
  return t.includes("NUMERO") || t.includes("NÚMERO") || t.includes("ESCALA") || t.includes("IDADE");
}

function blocoTransition(idx: number, total: number, nome: string): string {
  if (idx === 0) {
    return "Vamos começar. Responda com calma — leva poucos minutos e cada resposta fica salva.";
  }
  if (idx === total - 1) {
    return "Este é o último bloco. Confira suas respostas e envie a ficha.";
  }
  return `Agora vamos falar sobre ${nome.toLowerCase()}. Responda com base no que você sente hoje.`;
}

const ORIENTACAO_PADRAO =
  "Responda com base no que você sente hoje. Não existe resposta certa ou errada — o objetivo é entender o seu momento.";
const PORQUE_PADRAO =
  "Cada resposta ajuda a equipe clínica a personalizar o seu protocolo com mais segurança e cuidado.";

export default function Anamnese() {
  const [step, setStep] = useState<"identify" | "fill" | "success">("identify");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [blocoIdx, setBlocoIdx] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string | number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [helpFor, setHelpFor] = useState<Pergunta | null>(null);

  // Rola para o topo a cada troca de bloco
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [blocoIdx, step]);

  // Fecha o modal de ajuda com a tecla Escape
  useEffect(() => {
    if (!helpFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelpFor(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [helpFor]);

  const handleIdentify = useCallback(async () => {
    const cleanCpf = cpf.replace(/\D/g, "");
    if (cleanCpf.length !== 11) {
      setError("Digite os 11 dígitos do CPF");
      return;
    }
    const cleanDate = birthDate.replace(/\D/g, "");
    if (cleanDate.length !== 8) {
      setError("Digite a data completa (DD/MM/AAAA)");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/client-portal/identify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf: cleanCpf, birthDate: cleanDate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao identificar");
        return;
      }
      setClient(data);
      setStep("fill");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [cpf, birthDate]);

  useEffect(() => {
    if (step !== "fill" || blocos.length > 0) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/anamnese-portal/questionario`);
        const data = await res.json();
        if (active && res.ok) setBlocos(data.blocos || []);
      } catch {
        if (active) setError("Não foi possível carregar o questionário.");
      }
    })();
    return () => {
      active = false;
    };
  }, [step, blocos.length]);

  const setResposta = useCallback((perguntaId: string, valor: string | number) => {
    setRespostas((prev) => ({ ...prev, [perguntaId]: valor }));
  }, []);

  const handleRestart = useCallback(() => {
    setStep("identify");
    setCpf("");
    setBirthDate("");
    setClient(null);
    setBlocos([]);
    setBlocoIdx(0);
    setRespostas({});
    setError("");
    setHelpFor(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!client) return;
    const lista = Object.entries(respostas)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([perguntaId, valor]) => ({ perguntaId, valor }));
    if (lista.length === 0) {
      setError("Responda ao menos uma pergunta antes de enviar.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/anamnese-portal/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: client.token, respostas: lista }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setError("Sessão expirada. Identifique-se novamente.");
          setTimeout(() => handleRestart(), 2000);
          return;
        }
        setError(data.error || "Erro ao enviar");
        return;
      }
      setStep("success");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }, [client, respostas, handleRestart]);

  const blocoAtual = blocos[blocoIdx];
  const isLastBloco = blocoIdx === blocos.length - 1;
  const respondidasNoBloco = blocoAtual
    ? blocoAtual.perguntas.filter((p) => respostas[p.perguntaId] !== undefined && respostas[p.perguntaId] !== "").length
    : 0;

  return (
    <div className="min-h-screen bg-[#142e2e] flex flex-col">
      <header className="h-16 bg-[#0d1f1f] border-b border-[#1e4a4a] px-4 flex items-center justify-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#1a4040] rounded flex items-center justify-center">
            <span className="text-[#d4ae35] font-bold text-lg">P</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-base tracking-wide uppercase leading-tight">PADCON CONECT</h1>
            <p className="text-[#6b9b9b] text-[10px] uppercase tracking-widest">FICHA DE ANAMNESE</p>
          </div>
        </div>
      </header>

      {/* Linha do tempo fixa no topo (apenas no preenchimento) */}
      {step === "fill" && client && blocos.length > 0 && (
        <div className="sticky top-16 z-40 bg-[#0d1f1f]/95 backdrop-blur border-b border-[#1e4a4a]">
          <div className="max-w-md mx-auto px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider">
                Etapa {blocoIdx + 1} de {blocos.length}
              </span>
              <span className="text-[#d4ae35] text-xs font-semibold uppercase tracking-wide truncate max-w-[55%] text-right">
                {blocoAtual?.bloco}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              {blocos.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${
                    i < blocoIdx ? "bg-[#d4ae35]" : i === blocoIdx ? "bg-[#d4ae35]" : "bg-[#1e4a4a]"
                  } ${i === blocoIdx ? "ring-1 ring-[#d4ae35]/40" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-md">
          {step === "identify" && (
            <div className="bg-[#1a3a3a] border border-[#1e4a4a] rounded-md overflow-hidden">
              <div className="bg-[#0d1f1f] px-5 py-4 border-b border-[#1e4a4a]">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-[#d4ae35]" />
                  <h2 className="text-white font-semibold text-sm uppercase tracking-wide">IDENTIFICAÇÃO</h2>
                </div>
                <p className="text-[#6b9b9b] text-xs mt-1">
                  Digite seu CPF e data de nascimento para iniciar a ficha
                </p>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">CPF</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => { setCpf(formatCpf(e.target.value)); setError(""); }}
                    className="w-full h-12 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-lg placeholder:text-[#3a6666] focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[#8fbfbf] text-xs font-semibold uppercase tracking-wider mb-1.5">DATA DE NASCIMENTO</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="DD/MM/AAAA"
                    value={birthDate}
                    onChange={(e) => { setBirthDate(formatDate(e.target.value)); setError(""); }}
                    className="w-full h-12 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-lg placeholder:text-[#3a6666] focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    <p className="text-red-300 text-sm">{error}</p>
                  </div>
                )}
                <button
                  onClick={handleIdentify}
                  disabled={loading || cpf.replace(/\D/g, "").length !== 11 || birthDate.replace(/\D/g, "").length !== 8}
                  className="w-full h-12 bg-[#d4ae35] hover:bg-[#c9a330] text-[#0d1f1f] font-bold text-sm uppercase tracking-wider rounded-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>INICIAR<ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>
            </div>
          )}

          {step === "fill" && client && (
            <div className="space-y-4 pb-28">
              <div className="bg-[#1a3a3a] border border-[#1e4a4a] rounded-md px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[#6b9b9b] text-xs uppercase tracking-wider">CLIENTE</p>
                  <p className="text-white font-semibold text-sm">{client.name}</p>
                </div>
                <button onClick={handleRestart} className="text-[#6b9b9b] text-xs underline hover:text-white">Trocar</button>
              </div>

              {blocos.length === 0 ? (
                <div className="flex items-center justify-center gap-2 text-[#8fbfbf] py-10">
                  <Loader2 className="w-5 h-5 animate-spin" /> Carregando questionário...
                </div>
              ) : blocoAtual ? (
                <div className="space-y-4">
                  {/* Microtexto de transição do bloco */}
                  <div className="px-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <ClipboardList className="w-5 h-5 text-[#d4ae35]" />
                      <h2 className="text-white font-semibold text-base uppercase tracking-wide">{blocoAtual.bloco}</h2>
                    </div>
                    <p className="text-[#8fbfbf] text-sm leading-relaxed">
                      {blocoTransition(blocoIdx, blocos.length, blocoAtual.bloco)}
                    </p>
                    <p className="text-[#6b9b9b] text-xs mt-1">{respondidasNoBloco}/{blocoAtual.perguntas.length} respondidas neste bloco</p>
                  </div>

                  {/* Uma pergunta por cartão, com vídeo de ajuda */}
                  {blocoAtual.perguntas.map((p) => {
                    const valor = respostas[p.perguntaId];
                    return (
                      <div key={p.perguntaId} className="bg-[#1a3a3a] border border-[#1e4a4a] rounded-lg p-4 shadow-sm">
                        <label className="block text-[#eaf4f4] text-sm font-medium mb-1 leading-snug">{p.pergunta}</label>
                        <button
                          type="button"
                          onClick={() => setHelpFor(p)}
                          className="inline-flex items-center gap-1 text-[#d4ae35] text-xs font-medium hover:underline underline-offset-2 mb-3"
                        >
                          <HelpCircle className="w-3.5 h-3.5" /> Ver explicação
                        </button>
                        {p.opcoes && p.opcoes.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {p.opcoes.map((o) => {
                              const selected = String(valor) === String(o.valor);
                              return (
                                <button
                                  key={String(o.valor)}
                                  type="button"
                                  onClick={() => setResposta(p.perguntaId, o.valor)}
                                  className={`px-3.5 py-2.5 rounded-full text-sm border transition-colors ${
                                    selected
                                      ? "bg-[#d4ae35] border-[#d4ae35] text-[#0d1f1f] font-semibold"
                                      : "bg-[#0d1f1f] border-[#1e4a4a] text-[#8fbfbf] hover:border-[#d4ae35]"
                                  }`}
                                >
                                  {o.label}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            type={isNumeric(p.tipoResposta) ? "number" : "text"}
                            inputMode={isNumeric(p.tipoResposta) ? "numeric" : "text"}
                            value={valor === undefined ? "" : String(valor)}
                            onChange={(e) =>
                              setResposta(
                                p.perguntaId,
                                isNumeric(p.tipoResposta) && e.target.value !== ""
                                  ? Number(e.target.value)
                                  : e.target.value,
                              )
                            }
                            className="w-full h-11 bg-[#0d1f1f] border border-[#1e4a4a] rounded-md px-4 text-white text-sm placeholder:text-[#3a6666] focus:outline-none focus:ring-2 focus:ring-[#d4ae35] focus:border-transparent"
                            placeholder="Sua resposta..."
                          />
                        )}
                      </div>
                    );
                  })}

                  {error && (
                    <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-red-300 text-sm">{error}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {step === "success" && (
            <div className="bg-[#1a3a3a] border border-[#1e4a4a] rounded-md overflow-hidden">
              <div className="p-8 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-white font-bold text-lg uppercase">FICHA ENVIADA!</h2>
                <p className="text-[#8fbfbf] text-sm">
                  Suas respostas foram recebidas. A equipe da clínica fará a validação e entrará em contato.
                </p>
                <button
                  onClick={handleRestart}
                  className="w-full h-12 bg-[#d4ae35] hover:bg-[#c9a330] text-[#0d1f1f] font-bold text-sm uppercase tracking-wider rounded-full flex items-center justify-center gap-2 transition-colors"
                >
                  CONCLUIR
                </button>
              </div>
            </div>
          )}

          {step !== "fill" && (
            <p className="text-center text-[#3a6666] text-xs mt-6 uppercase tracking-wider">
              Clínica Padua — Padcon Conect
            </p>
          )}
        </div>
      </main>

      {/* Barra de ação fixa embaixo (apenas no preenchimento) */}
      {step === "fill" && client && blocoAtual && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0d1f1f]/95 backdrop-blur border-t border-[#1e4a4a] p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.35)]">
          <div className="max-w-md mx-auto flex gap-3">
            <button
              onClick={() => { setBlocoIdx((i) => Math.max(0, i - 1)); setError(""); }}
              disabled={blocoIdx === 0}
              className="h-14 px-5 bg-transparent border border-[#1e4a4a] text-[#8fbfbf] rounded-full flex items-center justify-center hover:bg-[#1e4a4a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
              aria-label="Voltar"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            {isLastBloco ? (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 h-14 bg-[#d4ae35] hover:bg-[#c9a330] text-[#0d1f1f] font-bold text-base uppercase tracking-wider rounded-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-md"
              >
                {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />ENVIANDO...</> : <><CheckCircle className="w-5 h-5" />ENVIAR FICHA</>}
              </button>
            ) : (
              <button
                onClick={() => { setBlocoIdx((i) => Math.min(blocos.length - 1, i + 1)); setError(""); }}
                className="flex-1 h-14 bg-[#d4ae35] hover:bg-[#c9a330] text-[#0d1f1f] font-bold text-base uppercase tracking-wider rounded-full flex items-center justify-center gap-2 transition-colors shadow-md"
              >
                CONTINUAR <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Quadro de vídeo de ajuda da pergunta */}
      {helpFor && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70"
          onClick={() => setHelpFor(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            className="w-full sm:max-w-lg bg-[#1a3a3a] border border-[#1e4a4a] rounded-t-2xl sm:rounded-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e4a4a] bg-[#0d1f1f]">
              <h3 id="help-modal-title" className="text-white font-semibold text-sm uppercase tracking-wide">Explicação</h3>
              <button onClick={() => setHelpFor(null)} className="text-[#6b9b9b] hover:text-white" aria-label="Fechar">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Área de vídeo (espaço reservado — plugar URL futuramente) */}
            <div className="relative bg-[#0d1f1f] aspect-video flex items-center justify-center">
              {helpFor.videoUrl ? (
                <video src={helpFor.videoUrl} controls className="w-full h-full" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-[#6b9b9b]">
                  <div className="w-14 h-14 rounded-full bg-[#1a4040] flex items-center justify-center">
                    <Play className="w-6 h-6 text-[#d4ae35] ml-0.5" />
                  </div>
                  <span className="text-xs uppercase tracking-wider">Vídeo explicativo em breve</span>
                </div>
              )}
            </div>

            <div className="p-5 space-y-4 max-h-[45vh] overflow-y-auto">
              <div>
                <p className="text-[#6b9b9b] text-[11px] font-semibold uppercase tracking-wider mb-1">Pergunta</p>
                <p className="text-white text-sm leading-snug">{helpFor.pergunta}</p>
              </div>
              {helpFor.termoTecnico && (
                <div>
                  <p className="text-[#6b9b9b] text-[11px] font-semibold uppercase tracking-wider mb-1">Termo técnico</p>
                  <p className="text-[#eaf4f4] text-sm">{helpFor.termoTecnico}</p>
                </div>
              )}
              <div>
                <p className="text-[#6b9b9b] text-[11px] font-semibold uppercase tracking-wider mb-1">Orientação</p>
                <p className="text-[#cfe3e3] text-sm leading-relaxed">{helpFor.orientacao || ORIENTACAO_PADRAO}</p>
              </div>
              <div className="pt-3 border-t border-[#1e4a4a]">
                <p className="text-[#6b9b9b] text-[11px] font-semibold uppercase tracking-wider mb-1">Por que perguntamos?</p>
                <p className="text-[#8fbfbf] text-sm leading-relaxed">{helpFor.porqueClinico || PORQUE_PADRAO}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
