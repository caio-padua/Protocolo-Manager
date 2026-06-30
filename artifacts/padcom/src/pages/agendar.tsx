import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListSiteContent,
  useListSchedulingAreas,
  useListSchedulingProfessionals,
  useGetAgendaSlots,
  useCreateSchedulingRequest,
  getGetAgendaSlotsQueryKey,
} from "@workspace/api-client-react";
import { PaxterLockup } from "@/components/layout/paxter-fx/PaxterLockup";
import { useScreenTheme } from "@/components/theme/useScreenTheme";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import {
  Loader2,
  ChevronRight,
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  AlertCircle,
  Syringe,
  Sparkles,
  Star,
  User,
  Clock,
  CreditCard,
  Stethoscope,
  HeartPulse,
  Info,
  ArrowRight,
  Check
} from "lucide-react";

// --- Helpers ---
function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

const formatCpf = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

export default function Agendar() {
  const [, setLocation] = useLocation();
  const { theme, toggle } = useScreenTheme();
  const [flow, setFlow] = useState<"menu" | "estetico" | "drcaio" | "assistente">("menu");

  const { data: contents = [], isLoading: isLoadingContents } = useListSiteContent();

  const getPhrase = (key: string, fallback: string) => {
    const item = contents.find((c) => c.category === "button_phrase" && c.contentKey === key);
    return item?.body || fallback;
  };

  const getText = (key: string, fallback: string) => {
    const item = contents.find((c) => c.category === "payment_text" && c.contentKey === key);
    return item?.body || fallback;
  };

  const getLink = (key: string) => {
    const item = contents.find((c) => c.category === "payment_link" && c.contentKey === key);
    return (item?.body || "").trim();
  };

  const videoItem = contents.find((c) => c.category === "video" && c.contentKey === "video_apresentacao_geral");

  const btnInjetavel = getPhrase("btn_entrada_injetavel", "PROTOCOLOS INJETÁVEIS");
  const btnEstetico = getPhrase("btn_entrada_estetico", "PROTOCOLOS ESTÉTICOS");
  const btnDrCaio = getPhrase("btn_entrada_drcaio", "DR. CAIO HENRIQUE FERNANDES PÁDUA");
  const btnAssistente = getPhrase("btn_entrada_assistentes", "Corpo Clínico / Profissionais");

  const txtEstetico = getText("pay_text_estetico", "Procedimentos estéticos são acertados presencialmente.");
  const txtConcierge = getText("pay_text_concierge", "O serviço Concierge garante encaixe prioritário.");
  const txtAssistente = getText("pay_text_assistente", "Sinal de 25% para reserva da agenda.");

  const linkEstetico = getLink("pay_link_estetico");
  const linkConcierge = getLink("pay_link_concierge");
  const linkAssistente = getLink("pay_link_assistente");

  if (isLoadingContents) {
    return (
      <div className={theme === "dark" ? "dark" : ""}>
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-accent animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className={theme === "dark" ? "dark" : ""}>
    <div className="min-h-[100dvh] bg-background text-foreground font-sans flex flex-col">
      {/* Header Público */}
      <header className="panel-3d sticky top-0 z-20 px-3 sm:px-4 py-3 border-b border-border rounded-none rounded-b-lg">
        <div className="flex items-center justify-between gap-2 min-w-0 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-2.5 min-w-0">
            <PaxterLockup orientation="horizontal" symbolPx={34} wordWidth={130} showTagline tone="dark" />
          </div>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto p-4 sm:p-6 pb-20 flex flex-col gap-6">
        {flow === "menu" && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center space-y-2 mt-4">
              <h2 className="text-2xl font-serif text-primary">Como podemos ajudar?</h2>
              <p className="text-sm text-muted-foreground">Escolha o serviço desejado para iniciar seu atendimento.</p>
            </div>

            {videoItem?.mediaUrl && <VideoPlayer url={videoItem.mediaUrl} />}

            <div className="space-y-4">
              {/* Door 3: Dr Caio - Maximum Emphasis */}
              <button
                onClick={() => setFlow("drcaio")}
                className="w-full relative group text-left"
              >
                <div className="panel-3d-hero rounded-xl p-6 transition-all duration-300 group-hover:panel-3d-active overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#c2a05a] to-yellow-600" />
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="w-4 h-4 text-yellow-600 fill-yellow-600" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-yellow-700">
                          ATENDIMENTO EXCLUSIVO
                        </span>
                      </div>
                      <h3 className="font-serif text-xl text-primary font-medium leading-tight">
                        {btnDrCaio}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-2">Consulta premium e protocolos avançados com o Dr. Caio.</p>
                    </div>
                    <ChevronRight className="w-6 h-6 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
                  </div>
                </div>
              </button>

              {/* Door 4: Assistentes - Subordinate to Dr Caio */}
              <button
                onClick={() => setFlow("assistente")}
                className="w-full relative group text-left pl-6"
              >
                <div className="panel-3d rounded-xl p-5 transition-all duration-300 group-hover:panel-3d-active">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="w-4 h-4 text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent">
                          CORPO CLÍNICO
                        </span>
                      </div>
                      <h3 className="font-serif text-lg text-primary">{btnAssistente}</h3>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
                  </div>
                </div>
              </button>

              <div className="pt-4 pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    OUTROS SERVIÇOS
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </div>

              {/* Door 1: Injetaveis */}
              <button
                onClick={() => setLocation("/anamnese/v2")}
                className="w-full relative group text-left"
              >
                <div className="panel-3d rounded-xl p-5 transition-all duration-300 group-hover:panel-3d-active">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Syringe className="w-4 h-4 text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent">
                          INJETÁVEIS
                        </span>
                      </div>
                      <h3 className="font-sans text-sm font-bold text-primary uppercase tracking-wide">{btnInjetavel}</h3>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
                  </div>
                </div>
              </button>

              {/* Door 2: Esteticos */}
              <button
                onClick={() => setFlow("estetico")}
                className="w-full relative group text-left"
              >
                <div className="panel-3d rounded-xl p-5 transition-all duration-300 group-hover:panel-3d-active">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-accent" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-accent">
                          ESTÉTICA
                        </span>
                      </div>
                      <h3 className="font-sans text-sm font-bold text-primary uppercase tracking-wide">{btnEstetico}</h3>
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-accent transition-colors shrink-0" />
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {flow === "estetico" && (
          <EsteticoFlow
            onBack={() => setFlow("menu")}
            title={btnEstetico}
            payText={txtEstetico}
            payLink={linkEstetico}
          />
        )}

        {flow === "drcaio" && (
          <DrCaioFlow
            onBack={() => setFlow("menu")}
            title={btnDrCaio}
            payTextConcierge={txtConcierge}
            payLink={linkConcierge}
            theme={theme}
          />
        )}

        {flow === "assistente" && (
          <AssistenteFlow
            onBack={() => setFlow("menu")}
            title={btnAssistente}
            payText={txtAssistente}
            payLink={linkAssistente}
          />
        )}
      </main>
    </div>
    </div>
  );
}

// --- DOOR 2: ESTETICOS ---
function EsteticoFlow({ onBack, title, payText, payLink }: { onBack: () => void; title: string; payText: string; payLink: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [desire, setDesire] = useState("");
  const [prefWeekday, setPrefWeekday] = useState<string>("");
  const [prefPeriod, setPrefPeriod] = useState<string>("");

  const createReq = useCreateSchedulingRequest();
  const [success, setSuccess] = useState(false);

  const handleSubmit = () => {
    if (!name || phone.replace(/\D/g,"").length < 10) return;
    createReq.mutate({
      data: {
        entrada: "estetico",
        patientName: name,
        patientPhone: phone.replace(/\D/g,""),
        patientEmail: email || undefined,
        patientCpf: cpf.replace(/\D/g,"") || undefined,
        desire: desire || undefined,
        preferredWeekday: prefWeekday ? parseInt(prefWeekday, 10) : undefined,
        preferredPeriod: prefPeriod || undefined,
      }
    }, {
      onSuccess: () => setSuccess(true)
    });
  };

  if (success) return <SuccessState onBack={onBack} />;

  return (
    <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="w-8 h-8 shrink-0 rounded-md bg-card border border-border flex items-center justify-center text-primary hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="font-serif text-xl text-primary truncate">{title}</h2>
      </div>

      <div className="panel-3d-sub p-5 space-y-4">
        <div className="bg-muted/50 p-4 rounded border border-border">
          <p className="text-xs text-foreground leading-relaxed">{payText}</p>
          <PaymentLinkButton url={payLink} label="Combinar pagamento" />
        </div>

        <div className="space-y-3">
          <Field label="NOME COMPLETO *" value={name} onChange={setName} placeholder="Seu nome" />
          <Field label="TELEFONE (WHATSAPP) *" value={phone} onChange={(v) => setPhone(formatPhone(v))} placeholder="(00) 00000-0000" type="tel" />
          <Field label="CPF (OPCIONAL)" value={cpf} onChange={(v) => setCpf(formatCpf(v))} placeholder="000.000.000-00" type="tel" />
          <Field label="EMAIL (OPCIONAL)" value={email} onChange={setEmail} placeholder="seu@email.com" type="email" />
          
          <div className="pt-2">
            <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">O QUE VOCÊ DESEJA FAZER?</label>
            <textarea
              className="field-engraved w-full p-3 rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[80px]"
              placeholder="Ex: botox, preenchimento..."
              value={desire}
              onChange={(e) => setDesire(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">DIA PREFERIDO</label>
              <select 
                className="field-engraved w-full h-10 px-3 rounded-md text-sm text-foreground focus:outline-none bg-transparent"
                value={prefWeekday} onChange={(e) => setPrefWeekday(e.target.value)}
              >
                <option value="">Qualquer dia</option>
                <option value="1">Segunda-feira</option>
                <option value="2">Terça-feira</option>
                <option value="3">Quarta-feira</option>
                <option value="4">Quinta-feira</option>
                <option value="5">Sexta-feira</option>
                <option value="6">Sábado</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-1.5">PERÍODO</label>
              <select 
                className="field-engraved w-full h-10 px-3 rounded-md text-sm text-foreground focus:outline-none bg-transparent"
                value={prefPeriod} onChange={(e) => setPrefPeriod(e.target.value)}
              >
                <option value="">Qualquer horário</option>
                <option value="manha">Manhã</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={!name || phone.replace(/\D/g,"").length < 10 || createReq.isPending}
        className="btn-3d w-full h-12 flex items-center justify-center gap-2 font-black uppercase tracking-widest text-sm disabled:opacity-50"
      >
        {createReq.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "SOLICITAR ATENDIMENTO"}
      </button>
    </div>
  );
}

// --- DOOR 3: DR CAIO ---
function DrCaioFlow({ onBack, title, payTextConcierge, payLink, theme }: { onBack: () => void; title: string; payTextConcierge: string; payLink: string; theme: "dark" | "light" }) {
  const isDark = theme === "dark";
  const [step, setStep] = useState<1 | 2>(1);
  const [dateTouched, setDateTouched] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");
  const [desire, setDesire] = useState("");
  
  const [earliestDate, setEarliestDate] = useState("");
  const [prefWeekday, setPrefWeekday] = useState("");
  const [prefPeriod, setPrefPeriod] = useState("");
  
  const [path, setPath] = useState<"concierge" | "fila" | "">("");

  const createReq = useCreateSchedulingRequest();
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Data minima dinamica: hoje + 3 meses, calculada em runtime (Regra de Ouro).
  // Nunca hardcoded, para nao "congelar" com o passar do tempo.
  const MIN_DATE_CAIO = useMemo(
    () => addMonths(new Date(), 3).toISOString().split("T")[0],
    [],
  );

  const handleNext = () => {
    if (!name || phone.replace(/\D/g,"").length < 10) return;
    if (!earliestDate) return;
    const picked = new Date(earliestDate);
    const min = new Date(MIN_DATE_CAIO);
    if (picked < min) {
      setErrorMsg("A data deve ser a partir de " + MIN_DATE_CAIO.split("-").reverse().join("/"));
      return;
    }
    setErrorMsg("");
    setStep(2);
  };

  const handleSubmit = () => {
    if (!path) return;
    setErrorMsg("");
    createReq.mutate({
      data: {
        entrada: "dr_caio",
        path: path as "concierge" | "fila",
        patientName: name,
        patientPhone: phone.replace(/\D/g,""),
        patientEmail: email || undefined,
        patientCpf: cpf.replace(/\D/g,"") || undefined,
        desire: desire || undefined,
        earliestDate: earliestDate,
        preferredWeekday: prefWeekday ? parseInt(prefWeekday, 10) : undefined,
        preferredPeriod: prefPeriod || undefined,
      }
    }, {
      onSuccess: () => setSuccess(true),
      onError: (err: any) => {
        setErrorMsg(err.message || "Erro ao processar solicitação.");
      }
    });
  };

  if (success) return <SuccessState onBack={onBack} isExclusive />;

  return (
    <div className={`dc-luxo space-y-10 animate-in fade-in duration-500 ${isDark ? "dc-dark" : "dc-light"}`}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&display=swap');
        .dc-luxo .dc-serif { font-family: 'Playfair Display', Georgia, serif; }
        .dc-luxo .dc-gold {
          background: linear-gradient(135deg, #f4e2a8 0%, #c2a05a 50%, #8a6d2f 100%);
          -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;
        }
        .dc-luxo .dc-input {
          width: 100%; background: transparent; border: none;
          border-bottom: 1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(22,40,74,0.2)"};
          padding: 13px 0; font-size: 15px; color: ${isDark ? "#e8edf6" : "#16284a"};
          outline: none; transition: border-color .3s ease; border-radius: 0;
        }
        .dc-luxo .dc-input:focus { border-bottom-color: #c2a05a; }
        .dc-luxo .dc-input::placeholder {
          color: ${isDark ? "rgba(255,255,255,0.32)" : "rgba(22,40,74,0.4)"};
          font-family: 'Playfair Display', Georgia, serif; font-style: italic;
        }
        .dc-luxo .dc-select {
          appearance: none;
          background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='${isDark ? "%23c2a05a" : "%238a6d2f"}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
          background-repeat: no-repeat; background-position: right 2px center; background-size: 1em; padding-right: 22px;
        }
        .dc-luxo .dc-chip {
          border: 1px solid ${isDark ? "rgba(255,255,255,0.15)" : "rgba(22,40,74,0.2)"};
          background: transparent; color: ${isDark ? "rgba(255,255,255,0.72)" : "rgba(22,40,74,0.72)"};
          transition: all .25s ease; border-radius: 6px;
        }
        .dc-luxo .dc-chip[data-active="true"] {
          border-color: #c2a05a; color: ${isDark ? "#f4e2a8" : "#8a6d2f"};
          background: rgba(194,160,90,0.1);
        }
        .dc-luxo .dc-concierge {
          background: ${isDark ? "linear-gradient(180deg, #1d335c 0%, #16284a 100%)" : "linear-gradient(180deg, #ffffff 0%, #f4f2ee 100%)"};
          border: 1px solid rgba(194,160,90,${isDark ? "0.35" : "0.45"});
          box-shadow: ${isDark ? "0 12px 32px -12px rgba(0,0,0,0.55)" : "0 12px 32px -12px rgba(22,40,74,0.12)"};
          border-radius: 8px;
        }
        .dc-luxo .dc-reveal { animation: dcReveal .6s cubic-bezier(0.16,1,0.3,1) both; }
        @keyframes dcReveal { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Cabeçalho editorial */}
      <div className="flex items-center gap-3">
        <button onClick={step === 1 ? onBack : () => setStep(1)} className={`w-9 h-9 shrink-0 rounded-md border flex items-center justify-center transition-colors ${isDark ? "border-[#2a4470] text-stone-300 hover:bg-white/5" : "border-stone-300 text-[#16284a] hover:bg-black/5"}`}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] dc-gold mb-1">Acesso Exclusivo</p>
          <h2 className={`dc-serif text-2xl leading-none truncate ${isDark ? "text-white" : "text-[#16284a]"}`}>{title}</h2>
        </div>
      </div>

      {step === 1 ? (
        <div className="flex flex-col gap-12">
          {/* Ato I — Credenciais */}
          <section>
            <h3 className="dc-serif italic dc-gold text-xl mb-6">I. Suas Credenciais</h3>
            <div className="flex flex-col gap-1">
              <input className="dc-input" placeholder="Nome completo" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="dc-input" type="tel" placeholder="Telefone / WhatsApp" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
              <div className="grid grid-cols-2 gap-5">
                <input className="dc-input" type="tel" placeholder="CPF (opcional)" value={cpf} onChange={(e) => setCpf(formatCpf(e.target.value))} />
                <input className="dc-input" type="email" placeholder="E-mail (opcional)" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </section>

          {/* Ato II — Desejo */}
          <section>
            <h3 className="dc-serif italic dc-gold text-xl mb-6">II. O Desejo</h3>
            <p className={`text-[11px] uppercase tracking-widest mb-4 font-semibold ${isDark ? "text-stone-500" : "text-stone-400"}`}>O que motiva sua busca?</p>
            <div className="flex flex-wrap gap-2.5 mb-5">
              {["Harmonização", "Rejuvenescimento", "Toxina Botulínica", "Protocolos Corporais", "Avaliação Exclusiva"].map((m) => (
                <button key={m} type="button" onClick={() => setDesire(m)} data-active={desire === m} className="dc-chip px-4 py-2.5 text-sm">{m}</button>
              ))}
            </div>
            <input className="dc-input" placeholder="Ou descreva em suas próprias palavras..." value={desire} onChange={(e) => setDesire(e.target.value)} />
          </section>

          {/* Ato III — O Tempo. Escassez é MOTOR DE RESPOSTA: revela ao tocar a data. */}
          <section>
            <h3 className="dc-serif italic dc-gold text-xl mb-6">III. O Tempo</h3>

            <div className="flex flex-col gap-1 mb-1">
              <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>A partir de qual data? (mínimo 3 meses) *</span>
              <input
                type="date"
                min={MIN_DATE_CAIO}
                value={earliestDate}
                onFocus={() => setDateTouched(true)}
                onClick={() => setDateTouched(true)}
                onChange={(e) => { setDateTouched(true); setEarliestDate(e.target.value); }}
                className="dc-input"
                style={{ colorScheme: isDark ? "dark" : "light" }}
              />
            </div>

            {dateTouched && (
              <div className={`dc-reveal p-5 my-5 rounded-lg flex items-start gap-4 ${isDark ? "bg-[#0d182b] border border-[#233f75]" : "bg-white border border-stone-200"}`}>
                <Info className="w-5 h-5 text-[#c2a05a] shrink-0 mt-0.5" />
                <p className={`text-sm leading-relaxed ${isDark ? "text-stone-300" : "text-[#16284a]"}`}>
                  Devido à altíssima procura, nossas primeiras datas regulares abrem a partir de <strong className="dc-gold font-semibold">~3 meses</strong>. Trabalhamos com pouquíssimos horários por semana para preservar a excelência de cada atendimento.
                </p>
              </div>
            )}

            <p className={`text-[11px] uppercase tracking-widest mb-4 mt-6 font-semibold ${isDark ? "text-stone-500" : "text-stone-400"}`}>Sua preferência de agenda</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-1">
                <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>Dia da semana</span>
                <select className="dc-input dc-select" value={prefWeekday} onChange={(e) => setPrefWeekday(e.target.value)}>
                  <option value="">Qualquer dia</option>
                  <option value="1">Segunda-feira</option>
                  <option value="2">Terça-feira</option>
                  <option value="3">Quarta-feira</option>
                  <option value="4">Quinta-feira</option>
                  <option value="5">Sexta-feira</option>
                  <option value="6">Sábado</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-stone-500" : "text-stone-400"}`}>Período</span>
                <select className="dc-input dc-select" value={prefPeriod} onChange={(e) => setPrefPeriod(e.target.value)}>
                  <option value="">Qualquer horário</option>
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                </select>
              </div>
            </div>
          </section>

          {errorMsg && (
            <div className={`p-3 rounded text-xs flex items-start gap-2 ${isDark ? "bg-red-950/40 border border-red-900 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          <button
            onClick={handleNext}
            disabled={!name || phone.replace(/\D/g,"").length < 10 || !earliestDate}
            className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            Prosseguir <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-right-4">
          <section>
            <h3 className="dc-serif italic dc-gold text-xl mb-2">IV. A Jornada</h3>
            <p className={`text-sm ${isDark ? "text-stone-400" : "text-stone-600"}`}>Escolha como deseja garantir seu atendimento.</p>
          </section>

          <div className="flex flex-col gap-6">
            {/* Caminho Concierge */}
            <button type="button" onClick={() => setPath("concierge")} className={`dc-concierge p-7 relative overflow-hidden text-left transition-all ${path === "concierge" ? "ring-2 ring-[#c2a05a]" : ""}`}>
              <div className="absolute top-0 right-0 p-4 opacity-[0.06] pointer-events-none"><Star className="w-28 h-28 text-[#c2a05a]" /></div>
              {path === "concierge" && <div className="absolute top-0 right-0 w-9 h-9 bg-gradient-to-br from-[#f4e2a8] to-[#c2a05a] rounded-bl-xl flex items-center justify-center"><CheckCircle className="w-4 h-4 text-[#16284a]" /></div>}
              <div className="relative z-10 flex flex-col gap-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#f4e2a8] to-[#c2a05a] flex items-center justify-center shadow-lg"><Check className="w-5 h-5 text-[#16284a]" /></div>
                  <h4 className="dc-serif text-2xl dc-gold">Via Concierge</h4>
                </div>
                <p className={`text-[15px] leading-relaxed ${isDark ? "text-stone-300" : "text-[#16284a]"}`}>
                  {payTextConcierge} O cliente antecipa <strong className="dc-gold font-semibold">R$ 150,00</strong> (20% do valor da consulta, total de R$ 750,00) para reservar seu horário com prioridade.
                </p>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#c2a05a] font-semibold">
                  <span>PIX</span><span className="opacity-30">•</span><span>Cartão</span><span className="opacity-30">•</span><span>Boleto</span>
                </div>
              </div>
            </button>

            {path === "concierge" && (
              <div className="dc-reveal"><PaymentLinkButton url={payLink} label="Garantir prioridade (Concierge)" dark={isDark} /></div>
            )}

            <div className="flex items-center justify-center gap-5 my-1">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent via-stone-500/30 to-transparent" />
              <span className="dc-serif italic text-base text-stone-500">ou</span>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent via-stone-500/30 to-transparent" />
            </div>

            {/* Caminho Fila */}
            <button type="button" onClick={() => setPath("fila")} className={`w-full p-6 border rounded-lg flex flex-col items-center gap-2 text-center transition-all ${path === "fila" ? (isDark ? "border-slate-400 bg-[#1c335c]" : "border-stone-400 bg-stone-100") : (isDark ? "border-[#233f75] hover:border-[#325291] hover:bg-[#1d335c]" : "border-stone-300 hover:border-stone-400 hover:bg-stone-100")}`}>
              <span className={`dc-serif text-xl ${isDark ? "text-stone-200" : "text-[#16284a]"}`}>Fila comum</span>
              <span className="text-sm text-stone-500">Sem custo. A clínica fará contato apenas se houver viabilidade de encaixe após o período de 3 meses.</span>
            </button>
          </div>

          {errorMsg && (
            <div className={`p-3 rounded text-xs flex items-start gap-2 ${isDark ? "bg-red-950/40 border border-red-900 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{errorMsg}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!path || createReq.isPending}
            className="w-full py-4 bg-gradient-to-b from-[#f4e2a8] via-[#c2a05a] to-[#8a6d2f] text-[#16284a] rounded-lg font-bold uppercase tracking-[0.2em] text-xs shadow-[0_4px_14px_rgba(194,160,90,0.3)] hover:brightness-105 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
          >
            {createReq.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Confirmar solicitação <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      )}
    </div>
  );
}

// --- DOOR 4: CORPO CLÍNICO / PROFISSIONAIS ---
// Fluxo estratificado em 4 passos: Área -> Especialização -> Profissional -> Horário.
function AssistenteFlow({ onBack, title, payText, payLink }: { onBack: () => void; title: string; payText: string; payLink: string }) {
  const { data: areas = [], isLoading: isLoadingAreas } = useListSchedulingAreas();
  const { data: professionals = [], isLoading: isLoadingPros } = useListSchedulingProfessionals();

  const [areaId, setAreaId] = useState<number | null>(null);
  const [specialtyId, setSpecialtyId] = useState<number | null>(null);
  const [proId, setProId] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [cpf, setCpf] = useState("");

  const area = useMemo(() => areas.find((a) => a.id === areaId), [areas, areaId]);
  const specialties = area?.specialties ?? [];

  const prosForSelection = useMemo(
    () => professionals.filter((p) => p.areaId === areaId && p.specialtyId === specialtyId),
    [professionals, areaId, specialtyId],
  );
  const pro = useMemo(() => professionals.find((p) => p.id === proId), [professionals, proId]);

  const { data: agendaData, isLoading: isLoadingAgenda } = useGetAgendaSlots(
    { resourceId: pro?.resourceId ?? 0, date },
    { query: { enabled: !!pro?.resourceId && !!date, queryKey: getGetAgendaSlotsQueryKey({ resourceId: pro?.resourceId ?? 0, date }) } },
  );

  const createReq = useCreateSchedulingRequest();
  const [success, setSuccess] = useState(false);

  const handleAreaChange = (id: number) => {
    setAreaId(id);
    setSpecialtyId(null);
    setProId(null);
    setDate("");
    setTime("");
  };

  const handleSpecialtyChange = (id: number) => {
    setSpecialtyId(id);
    setProId(null);
    setDate("");
    setTime("");
  };

  const handleProChange = (id: number) => {
    setProId(id);
    setDate("");
    setTime("");
  };

  const handleDateChange = (d: string) => {
    setDate(d);
    setTime("");
  };

  const handleSubmit = () => {
    if (!pro || !date || !time || !name || phone.replace(/\D/g, "").length < 10) return;
    createReq.mutate({
      data: {
        entrada: "assistente",
        professionalId: pro.id,
        resourceId: pro.resourceId,
        chosenDate: date,
        chosenTime: time,
        patientName: name,
        patientPhone: phone.replace(/\D/g, ""),
        patientEmail: email || undefined,
        patientCpf: cpf.replace(/\D/g, "") || undefined,
      },
    }, {
      onSuccess: () => setSuccess(true),
    });
  };

  if (success) return <SuccessState onBack={onBack} />;

  const isLoading = isLoadingAreas || isLoadingPros;

  return (
    <div className="space-y-6 animate-in slide-in-from-right-8 duration-300">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="w-8 h-8 shrink-0 rounded-md bg-card border border-border flex items-center justify-center text-primary hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0">
          <h2 className="font-serif text-xl text-primary leading-none truncate">{title}</h2>
          <p className="text-[10px] font-black uppercase tracking-widest text-accent mt-1">Corpo Clínico / Profissionais</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-accent animate-spin" /></div>
      ) : areas.length === 0 ? (
        <div className="panel-3d-sub p-8 text-center text-muted-foreground">
          Nenhuma área disponível para agendamento no momento.
        </div>
      ) : (
        <div className="space-y-5">
          {/* Passo 1: Área */}
          <div className="panel-3d-sub p-5">
            <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-3">1. ESCOLHA A ÁREA</label>
            <div className="grid grid-cols-2 gap-2">
              {areas.map((a) => {
                const sel = areaId === a.id;
                const isMedico = a.professionalType === "medico";
                return (
                  <button
                    key={a.id}
                    onClick={() => handleAreaChange(a.id)}
                    className={`text-left p-3 rounded-lg border transition-colors flex items-center gap-2 ${
                      sel ? "border-accent bg-accent/10" : "border-border bg-card hover:border-accent"
                    }`}
                  >
                    {isMedico ? <Stethoscope className="w-4 h-4 text-accent shrink-0" /> : <HeartPulse className="w-4 h-4 text-accent shrink-0" />}
                    <span className="font-sans font-bold text-foreground text-sm leading-tight">{a.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Passo 2: Especialização */}
          {area && (
            <div className="panel-3d-sub p-5 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-3">
                2. ESCOLHA A {area.professionalType === "medico" ? "ESPECIALIDADE" : "ESPECIALIZAÇÃO"}
              </label>
              {specialties.length === 0 ? (
                <div className="p-3 bg-muted border border-border rounded text-sm text-muted-foreground text-center">
                  Nenhuma especialização cadastrada nesta área.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {specialties.map((s) => {
                    const sel = specialtyId === s.id;
                    return (
                      <button
                        key={s.id}
                        onClick={() => handleSpecialtyChange(s.id)}
                        className={`px-3 py-2 rounded-md border text-sm font-semibold transition-colors ${
                          sel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-accent"
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Passo 3: Profissional */}
          {specialtyId && (
            <div className="panel-3d-sub p-5 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-3">3. ESCOLHA O PROFISSIONAL</label>
              {prosForSelection.length === 0 ? (
                <div className="p-3 bg-muted border border-border rounded text-sm text-muted-foreground text-center">
                  Nenhum profissional disponível nesta especialização.
                </div>
              ) : (
                <div className="space-y-2">
                  {prosForSelection.map((p) => {
                    const sel = proId === p.id;
                    const registro = [p.registrationCouncil, p.registrationNumber].filter(Boolean).join(" ");
                    return (
                      <button
                        key={p.id}
                        onClick={() => handleProChange(p.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center justify-between gap-2 ${
                          sel ? "border-accent bg-accent/10" : "border-border bg-card hover:border-accent"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-sans font-bold text-foreground text-sm">{p.name}</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                              p.professionalType === "medico" ? "bg-primary/10 text-primary" : "bg-accent/15 text-accent"
                            }`}>
                              {p.professionalType === "medico" ? "Médico" : "Não-médico"}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {p.specialtyName}{registro ? ` (${registro})` : ""}
                          </div>
                        </div>
                        {sel && <CheckCircle className="w-5 h-5 text-accent shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Passo 4: Horário */}
          {pro && (
            <div className="panel-3d-sub p-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary">4. ESCOLHA O HORÁRIO</label>

              {!pro.resourceId ? (
                <div className="p-3 bg-muted border border-border rounded text-sm text-muted-foreground text-center">
                  Sem horários disponíveis para este profissional.
                </div>
              ) : (
                <>
                  <input
                    type="date"
                    min={new Date().toISOString().split("T")[0]}
                    value={date}
                    onChange={(e) => handleDateChange(e.target.value)}
                    className="field-engraved w-full h-11 px-3 rounded-md text-sm text-foreground focus:outline-none"
                  />

                  {date && (
                    <div className="pt-2">
                      {isLoadingAgenda ? (
                        <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-accent animate-spin" /></div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {!agendaData?.slots?.length ? (
                            <div className="col-span-3 text-center py-4 text-xs text-muted-foreground">Nenhum horário livre neste dia.</div>
                          ) : (
                            agendaData.slots.map((s, i) => {
                              const isFree = ["free", "livre", "available"].includes(s.state.toLowerCase());
                              const isSel = time === s.time;
                              if (!isFree) {
                                return (
                                  <div key={i} className="h-10 rounded border border-border bg-muted flex items-center justify-center text-muted-foreground text-xs line-through opacity-70">
                                    {s.time}
                                  </div>
                                );
                              }
                              return (
                                <button
                                  key={i}
                                  onClick={() => setTime(s.time)}
                                  className={`h-10 rounded border text-sm font-semibold transition-colors ${
                                    isSel ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-accent"
                                  }`}
                                >
                                  {s.time}
                                </button>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Passo 5: Dados do paciente */}
          {time && (
            <div className="panel-3d-sub p-5 space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <label className="block text-[10px] font-black uppercase tracking-widest text-primary mb-2">5. SEUS DADOS</label>
              <div className="bg-muted/50 p-4 rounded border border-border mb-4">
                <p className="text-xs text-foreground leading-relaxed">{payText}</p>
                <PaymentLinkButton url={payLink} label="Pagar sinal de 25%" />
              </div>

              <div className="space-y-3">
                <Field label="NOME COMPLETO *" value={name} onChange={setName} placeholder="Seu nome" />
                <Field label="TELEFONE (WHATSAPP) *" value={phone} onChange={(v) => setPhone(formatPhone(v))} placeholder="(00) 00000-0000" type="tel" />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="CPF (OPCIONAL)" value={cpf} onChange={(v) => setCpf(formatCpf(v))} placeholder="000.000.000-00" type="tel" />
                  <Field label="EMAIL (OPCIONAL)" value={email} onChange={setEmail} placeholder="seu@email.com" type="email" />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!name || phone.replace(/\D/g, "").length < 10 || createReq.isPending}
                className="btn-3d w-full h-12 mt-4 flex items-center justify-center gap-2 font-black uppercase tracking-widest text-sm disabled:opacity-50"
              >
                {createReq.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "CONFIRMAR RESERVA"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Common UI Components ---

// Player do vídeo de apresentação. Escolhe o modo pela URL:
// 1) arquivo de vídeo ou Object Storage (nosso /api/storage) -> <video> nativo;
// 2) YouTube/Vimeo -> iframe embarcado; 3) qualquer outra -> link clicável.
function VideoPlayer({ url }: { url: string }) {
  const raw = (url || "").trim();
  if (!raw) return null;

  const embed = toEmbedUrl(raw);
  if (embed) {
    return (
      <div className="panel-3d rounded-xl overflow-hidden aspect-video bg-black">
        <iframe
          src={embed}
          title="Vídeo de apresentação"
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  const isFile = /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(raw) || raw.includes("/api/storage/objects/");
  if (isFile) {
    return (
      <div className="panel-3d rounded-xl overflow-hidden bg-black">
        <video src={raw} controls playsInline className="w-full aspect-video" />
      </div>
    );
  }

  return (
    <a
      href={raw}
      target="_blank"
      rel="noreferrer"
      className="panel-3d rounded-xl aspect-video bg-black flex items-center justify-center text-white/80 text-sm font-bold uppercase tracking-widest"
    >
      Assistir ao vídeo de apresentação
    </a>
  );
}

// Converte links de YouTube/Vimeo para a URL de incorporação (embed).
function toEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function PaymentLinkButton({ url, label, dark = false }: { url: string; label: string; dark?: boolean }) {
  const enabled = /^https?:\/\//i.test((url || "").trim());

  if (!enabled) {
    return (
      <div
        aria-disabled="true"
        className={`w-full h-11 mt-3 flex items-center justify-center gap-2 rounded-md font-black uppercase tracking-widest text-xs opacity-60 cursor-not-allowed ${
          dark
            ? "border border-[#2a4470] text-slate-300/70"
            : "border border-border bg-muted text-muted-foreground"
        }`}
      >
        <CreditCard className="w-4 h-4" /> Pagamento em breve
      </div>
    );
  }

  return (
    <a
      href={url.trim()}
      target="_blank"
      rel="noreferrer"
      className={`w-full h-11 mt-3 flex items-center justify-center gap-2 rounded-md font-black uppercase tracking-widest text-xs transition-all active:translate-y-px ${
        dark
          ? "bg-gradient-to-b from-[#c2a05a] to-[#a3803c] text-[#152b2b] shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_4px_10px_rgba(0,0,0,0.3)] hover:brightness-110"
          : "btn-3d"
      }`}
    >
      <CreditCard className="w-4 h-4" /> {label}
    </a>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", dark = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; dark?: boolean }) {
  return (
    <div>
      <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${dark ? "text-[#c2a05a]" : "text-primary"}`}>{label}</label>
      <input
        type={type}
        className={`w-full h-11 px-3 rounded-md text-sm focus:outline-none ${
          dark 
            ? "field-engraved placeholder:text-slate-400"
            : "field-engraved text-foreground placeholder:text-muted-foreground"
        }`}
        style={dark ? { background: "linear-gradient(180deg, #16284a 0%, #0b1a33 28%)", color: "#e2e8f0", borderColor: "#2a4470" } : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function SuccessState({ onBack, isExclusive }: { onBack: () => void; isExclusive?: boolean }) {
  return (
    <div className={`rounded-xl p-8 text-center space-y-6 animate-in zoom-in-95 duration-500 ${isExclusive ? "bg-[#0b1a33] text-slate-100 border border-[#2a4470]" : "panel-3d"}`}>
      <div className="flex justify-center">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isExclusive ? "bg-[#c2a05a]/20" : "bg-accent/15"}`}>
          <CheckCircle className={`w-8 h-8 ${isExclusive ? "text-[#c2a05a]" : "text-accent"}`} />
        </div>
      </div>
      <div>
        <h3 className={`font-serif text-2xl mb-2 ${isExclusive ? "text-[#c2a05a]" : "text-primary"}`}>Solicitação Recebida</h3>
        <p className={`text-sm ${isExclusive ? "text-slate-200/80" : "text-muted-foreground"}`}>
          Nossa equipe entrará em contato em breve para confirmar seu atendimento.
        </p>
      </div>
      <button
        onClick={onBack}
        className={`h-11 px-6 rounded-md font-black uppercase tracking-widest text-sm transition-all ${
          isExclusive 
            ? "bg-transparent border border-[#2a4470] text-slate-300 hover:border-slate-500" 
            : "btn-3d-soft"
        }`}
      >
        VOLTAR AO INÍCIO
      </button>
    </div>
  );
}
