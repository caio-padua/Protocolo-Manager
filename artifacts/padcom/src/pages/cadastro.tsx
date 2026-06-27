import { useState, useEffect, useCallback, useRef } from "react";
import {
  Camera,
  CheckCircle,
  Loader2,
  AlertCircle,
  Upload,
  Image as ImageIcon,
  X,
  Mic,
  Search,
  Send,
} from "lucide-react";
import { PaxterLockup } from "@/components/layout/paxter-fx/PaxterLockup";
import { PAXTER_SITE_URL } from "@/lib/brand";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const CAMERA_FALLBACK_MSG =
  "Não foi possível abrir a câmera neste navegador. No iPhone, abra o link no Safari; no Android, no Chrome. Você ainda pode enviar pela galeria abaixo.";

function getToken(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("token") || "";
}

// ---------- Máscaras (mesmas regras do cadastro do admin) ----------
function formatCPF(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function formatCEP(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
function formatDate(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

// dd/mm/aaaa -> aaaa-mm-dd (ISO) para gravar igual ao cadastro do admin.
function brDateToIso(br: string): string {
  const d = br.replace(/\D/g, "");
  if (d.length !== 8) return "";
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}
// aaaa-mm-dd (vindo do prefill) -> dd/mm/aaaa para exibir mascarado.
function isoToBrDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso.replace(/\D/g, "").length ? formatDate(iso) : "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Converte números FALADOS em português (dígito a dígito ou compostos simples)
// para uma string de dígitos. A ditada natural de CPF/telefone/CEP/data é dígito
// a dígito ("dois, três, meia..."), mas também tratamos dezenas compostas
// ("vinte e um" -> 21). Acentos são removidos antes de comparar.
function spokenPtBrToDigits(input: string): string {
  const units: Record<string, number> = {
    zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    seis: 6, meia: 6, sete: 7, oito: 8, nove: 9,
  };
  const teens: Record<string, number> = {
    dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
    dezesseis: 16, dezasseis: 16, dezessete: 17, dezassete: 17, dezoito: 18,
    dezenove: 19, dezanove: 19,
  };
  const tens: Record<string, number> = {
    vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60,
    setenta: 70, oitenta: 80, noventa: 90,
  };
  const clean = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const tokens = clean.split(/[^a-z0-9]+/).filter(Boolean);
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d+$/.test(t)) {
      out += t;
      continue;
    }
    if (t in tens) {
      let val = tens[t];
      // "vinte e um" / "vinte um" -> 21
      let consumedUnit = false;
      let j = i + 1;
      if (tokens[j] === "e") j++;
      if (tokens[j] !== undefined && tokens[j] in units) {
        val += units[tokens[j]];
        consumedUnit = true;
      }
      out += String(val);
      if (consumedUnit) i = j;
      continue;
    }
    if (t in teens) {
      out += String(teens[t]);
      continue;
    }
    if (t in units) {
      out += String(units[t]);
      continue;
    }
    // "e" e quaisquer outras palavras são ignoradas.
  }
  return out;
}

type MaskKind = "cpf" | "phone" | "cep" | "date" | "none";
function applyMask(kind: MaskKind, value: string): string {
  switch (kind) {
    case "cpf":
      return formatCPF(value);
    case "phone":
      return formatPhone(value);
    case "cep":
      return formatCEP(value);
    case "date":
      return formatDate(value);
    default:
      return value;
  }
}

interface LocationOption {
  id: number;
  name: string;
  active: boolean;
}

// ---------- Reconhecimento de voz (Web Speech API) ----------
function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export default function Cadastro() {
  const [token] = useState(getToken);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingCep, setLoadingCep] = useState(false);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  // Campos do formulário (estado controlado para máscara e voz funcionarem).
  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [cpf, setCpf] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [pais, setPais] = useState("BRASIL");
  const [instagram, setInstagram] = useState("");
  const [comoConheceu, setComoConheceu] = useState("");
  const [locationId, setLocationId] = useState("");

  // Modo do formulário: "simples" (só os 5 obrigatórios + foto) ou "completo"
  // (todos os campos do cliente). Trocar de modo NÃO apaga o que já foi digitado.
  const [mode, setMode] = useState<"simples" | "completo">("simples");

  // Preenchimento por IA: foto do documento (RG/CNH) lida pelo Gemini.
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState("");
  const docInputRef = useRef<HTMLInputElement>(null);

  // Convite animado para o cadastro completo (toca 1x, no penúltimo obrigatório).
  const inviteShownRef = useRef(false);
  const [invitePlaying, setInvitePlaying] = useState(false);
  const [toggleGlow, setToggleGlow] = useState(false);

  // Voz
  const [voiceOn, setVoiceOn] = useState(false);
  const [listeningField, setListeningField] = useState<string | null>(null);
  const recognitionRef = useRef<unknown>(null);
  const cepReqSeqRef = useRef(0);

  // Foto (mesmo motor do /foto)
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const [cameraNote, setCameraNote] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setVoiceOn(speechSupported());
    const ok = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
    setCameraSupported(ok);
    if (!ok) setCameraNote(CAMERA_FALLBACK_MSG);
  }, []);

  // Prefill + clínicas
  useEffect(() => {
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/client-registration/info?token=${encodeURIComponent(token)}`,
        );
        if (!res.ok) {
          setInvalid(true);
          return;
        }
        const d = await res.json();
        setName(d.name || "");
        setCpf(d.cpf ? formatCPF(d.cpf) : "");
        setEmail(d.email || "");
        setPhone(d.phone ? formatPhone(d.phone) : "");
        setBirthDate(d.birthDate ? isoToBrDate(d.birthDate) : "");
        setInstagram(d.instagram || "");
        setComoConheceu(d.comoConheceu || "");
        setPais(d.pais || "BRASIL");
        setLocationId(d.locationId ? String(d.locationId) : "");
        setCurrentPhoto(d.photoUrl || null);
      } catch {
        setInvalid(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/locations`);
        if (res.ok) setLocations(await res.json());
      } catch {
        /* clínica é opcional */
      }
    })();
  }, []);

  // ---------- Voz: escuta um campo por vez ----------
  const startVoice = useCallback(
    (fieldKey: string, kind: MaskKind, setter: (v: string) => void) => {
      if (!speechSupported()) return;
      const w = window as unknown as Record<string, unknown>;
      const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
        | (new () => {
            lang: string;
            interimResults: boolean;
            maxAlternatives: number;
            onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
            onerror: (() => void) | null;
            onend: (() => void) | null;
            start: () => void;
            stop: () => void;
          })
        | undefined;
      if (!Ctor) return;

      // Encerra qualquer reconhecimento anterior.
      try {
        (recognitionRef.current as { stop?: () => void } | null)?.stop?.();
      } catch {
        /* noop */
      }

      const rec = new Ctor();
      rec.lang = "pt-BR";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (e) => {
        const transcript = e.results?.[0]?.[0]?.transcript ?? "";
        if (kind === "none") {
          setter(transcript.trim());
        } else {
          // Campos com máscara: converte números falados por extenso ("dois três",
          // "vinte e um", "meia") em dígitos e aplica a máscara.
          const digits = spokenPtBrToDigits(transcript);
          setter(applyMask(kind, digits));
        }
      };
      rec.onerror = () => setListeningField(null);
      rec.onend = () => setListeningField(null);
      recognitionRef.current = rec;
      setListeningField(fieldKey);
      try {
        rec.start();
      } catch {
        setListeningField(null);
      }
    },
    [],
  );

  // ---------- CEP / ViaCEP ----------
  // Recebe o CEP EXPLÍCITO (recém-digitado ou falado). Não lê o estado `cep` do
  // closure — o estado do React é assíncrono e o disparo automático veria o valor
  // antigo. Quem chama passa o valor atual.
  const lookupCepByValue = useCallback(async (rawInput: string) => {
    const raw = rawInput.replace(/\D/g, "");
    if (raw.length !== 8) return;
    // Guarda de corrida: se uma busca mais nova começar, a resposta antiga é
    // ignorada (não sobrescreve o endereço com dados de um CEP já trocado).
    const seq = ++cepReqSeqRef.current;
    setLoadingCep(true);
    try {
      const res = await fetch(`${API_BASE}/api/cep/${raw}`);
      if (!res.ok) return;
      const data = await res.json();
      if (seq !== cepReqSeqRef.current) return;
      setLogradouro(data.logradouro || "");
      setBairro(data.bairro || "");
      setCidade(data.localidade || "");
      setEstado(data.uf || "");
      // Sempre sincroniza: CEP sem complemento limpa o campo (evita resíduo do
      // CEP anterior).
      setComplemento(data.complemento || "");
    } catch {
      /* silencioso: cliente pode digitar à mão */
    } finally {
      if (seq === cepReqSeqRef.current) setLoadingCep(false);
    }
  }, []);
  // Botão da lupa: usa o estado atual do campo.
  const lookupCep = useCallback(() => lookupCepByValue(cep), [cep, lookupCepByValue]);

  // ---------- Câmera ----------
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);
  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      setCameraNote(CAMERA_FALLBACK_MSG);
      fileInputRef.current?.click();
      return;
    }
    setCameraStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraNote("");
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setCameraSupported(false);
      setCameraNote(CAMERA_FALLBACK_MSG);
      fileInputRef.current?.click();
    } finally {
      setCameraStarting(false);
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const w = video.videoWidth || 720;
    const h = video.videoHeight || 720;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Não foi possível capturar a foto. Tente novamente.");
          return;
        }
        const file = new File([blob], "foto.jpg", { type: "image/jpeg" });
        setSelectedFile(file);
        setPreview(URL.createObjectURL(file));
        stopCamera();
      },
      "image/jpeg",
      0.92,
    );
  }, [stopCamera]);

  const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem (foto).");
      return;
    }
    setError("");
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
  }, []);

  // ---------- Envio ----------
  const handleSubmit = useCallback(async () => {
    setError("");
    const missing: string[] = [];
    if (name.trim().length < 3) missing.push("nome");
    if (cpf.replace(/\D/g, "").length !== 11) missing.push("CPF");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) missing.push("e-mail");
    if (phone.replace(/\D/g, "").length < 10) missing.push("celular");
    if (birthDate.replace(/\D/g, "").length !== 8) missing.push("data de nascimento");
    if (missing.length) {
      setError(`Preencha corretamente: ${missing.join(", ")}.`);
      return;
    }

    const addressParts = [
      logradouro,
      numero,
      complemento,
      bairro,
      cidade ? `${cidade} - ${estado || ""}` : estado,
      cep ? `CEP ${cep}` : "",
    ].filter(Boolean);
    const address = addressParts.join(", ");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("token", token);
      fd.append("name", name.trim());
      fd.append("cpf", cpf.trim());
      fd.append("email", email.trim());
      fd.append("phone", phone.trim());
      fd.append("birthDate", brDateToIso(birthDate));
      if (mode === "completo") {
        if (address) fd.append("address", address);
        if (pais.trim()) fd.append("pais", pais.trim());
        if (instagram.trim()) fd.append("instagram", instagram.trim());
        if (comoConheceu) fd.append("comoConheceu", comoConheceu);
        if (locationId) fd.append("locationId", locationId);
      }
      if (selectedFile) fd.append("file", selectedFile);

      const res = await fetch(`${API_BASE}/api/client-registration/submit`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Não foi possível salvar o cadastro.");
        return;
      }
      setDone(true);
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }, [
    name,
    cpf,
    email,
    phone,
    birthDate,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    cep,
    pais,
    instagram,
    comoConheceu,
    locationId,
    selectedFile,
    token,
    mode,
  ]);

  // ---------- Preenchimento por IA (foto do documento) ----------
  const scanDocument = useCallback(
    async (file: File) => {
      setError("");
      setScanNote("");
      setScanning(true);
      try {
        const fd = new FormData();
        fd.append("token", token);
        fd.append("file", file);
        const res = await fetch(`${API_BASE}/api/client-registration/scan-document`, {
          method: "POST",
          body: fd,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setScanNote(data.error || "Não foi possível ler o documento. Tente outra foto.");
          return;
        }
        let filled = 0;
        if (data.name) {
          setName(String(data.name));
          filled++;
        }
        if (data.cpf) {
          setCpf(formatCPF(String(data.cpf)));
          filled++;
        }
        if (data.birthDate) {
          setBirthDate(formatDate(String(data.birthDate)));
          filled++;
        }
        setScanNote(
          filled
            ? "Dados lidos do documento. Confira e ajuste se precisar."
            : "Não consegui ler os dados. Preencha à mão ou tente outra foto.",
        );
      } catch {
        setScanNote("Erro ao ler o documento. Tente novamente.");
      } finally {
        setScanning(false);
      }
    },
    [token],
  );

  const onPickDoc = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setScanNote("Selecione uma imagem (foto do documento).");
        return;
      }
      void scanDocument(file);
    },
    [scanDocument],
  );

  // ---------- Convite animado (toca 1x no penúltimo obrigatório do Simples) ----------
  const maybeShowInvite = useCallback(() => {
    if (mode !== "simples" || inviteShownRef.current) return;
    const ready =
      name.trim().length >= 3 &&
      cpf.replace(/\D/g, "").length === 11 &&
      birthDate.replace(/\D/g, "").length === 8 &&
      /^\S+@\S+\.\S+$/.test(email.trim());
    if (!ready) return;
    inviteShownRef.current = true;
    setInvitePlaying(true);
  }, [mode, name, cpf, birthDate, email]);

  const onInviteEnd = useCallback(() => {
    setInvitePlaying(false);
    setToggleGlow(true);
    window.setTimeout(() => setToggleGlow(false), 6000);
  }, []);

  const activeLocations = locations.filter((l) => l.active || String(l.id) === locationId);

  // ---------- Campo reutilizável (label + input mascarado + microfone) ----------
  const Field = ({
    fieldKey,
    label,
    value,
    setter,
    kind = "none",
    required = false,
    placeholder,
    type = "text",
    inputMode,
    onBlur,
  }: {
    fieldKey: string;
    label: string;
    value: string;
    setter: (v: string) => void;
    kind?: MaskKind;
    required?: boolean;
    placeholder?: string;
    type?: string;
    inputMode?: "text" | "numeric" | "email" | "tel";
    onBlur?: () => void;
  }) => (
    <div className="space-y-1.5">
      <label className="uppercase tracking-widest text-[10px] font-extrabold text-[#8aa0c4] block">
        {label} {required && <span className="text-[#c2a05a]">*</span>}
      </label>
      <div className="flex gap-2">
        <input
          type={type}
          inputMode={inputMode}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setter(applyMask(kind, e.target.value))}
          onBlur={onBlur}
          className="field-engraved flex-1 h-11 px-3 text-white text-sm rounded-[6px] bg-transparent outline-none"
        />
        {voiceOn && (
          <button
            type="button"
            aria-label={`Falar ${label}`}
            onClick={() => startVoice(fieldKey, kind, setter)}
            className={`bevel-3d h-11 w-11 shrink-0 flex items-center justify-center rounded-[6px] ${
              listeningField === fieldKey ? "text-red-400 animate-pulse" : "text-[#c2a05a]"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="dark min-h-screen bg-[#0d1830] flex flex-col">
      <header className="bg-[#0b1426] border-b border-[rgba(184,146,77,0.22)] px-4 py-5 flex flex-col items-center justify-center gap-1">
        <PaxterLockup tone="dark" orientation="vertical" showTagline href={PAXTER_SITE_URL} symbolPx={48} wordWidth={180} />
        <p className="text-[#7e93b8] text-[11px] uppercase tracking-[0.28em] mt-1">Cadastro do Cliente</p>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-md">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-[#7e93b8]">
              <Loader2 className="w-8 h-8 animate-spin mb-3" />
              <p className="text-sm">Carregando...</p>
            </div>
          )}

          {!loading && invalid && (
            <div className="panel-3d p-6 text-center">
              <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <h2 className="text-white font-semibold text-sm uppercase tracking-wide mb-1">
                LINK INVÁLIDO OU EXPIRADO
              </h2>
              <p className="text-[#7e93b8] text-xs">
                Solicite um novo link à clínica para completar seu cadastro.
              </p>
            </div>
          )}

          {!loading && !invalid && done && (
            <div className="panel-3d p-6 text-center">
              <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-white font-semibold text-base uppercase tracking-wide mb-1">
                CADASTRO ENVIADO!
              </h2>
              <p className="text-[#7e93b8] text-sm">
                Obrigado{name ? `, ${name.split(" ")[0]}` : ""}. Seus dados foram recebidos pela clínica.
              </p>
            </div>
          )}

          {!loading && !invalid && !done && (
            <div className="space-y-5">
              <style>{`
                @keyframes paxterInvite {
                  0%   { transform: translateX(120%) scale(0.6); opacity: 0; }
                  16%  { transform: translateX(0%) scale(1); opacity: 1; }
                  34%  { transform: translateX(0%) scale(1.12); opacity: 1; }
                  84%  { transform: translateX(0%) scale(0.96); opacity: 1; }
                  100% { transform: translateX(120%) scale(0.6); opacity: 0; }
                }
                @keyframes paxterToggleGlow {
                  0%, 100% { box-shadow: 0 0 0 0 rgba(76,201,140,0.0); }
                  50%      { box-shadow: 0 0 0 4px rgba(76,201,140,0.45); }
                }
              `}</style>

              {/* Seletor de modo: Simples x Completo */}
              <div className="concave-3d p-1 grid grid-cols-2 gap-1" role="tablist" aria-label="Modo do cadastro">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "simples"}
                  onClick={() => setMode("simples")}
                  className={`h-10 rounded-[6px] text-[11px] font-extrabold uppercase tracking-widest transition-all ${
                    mode === "simples" ? "bevel-3d text-[#c2a05a]" : "text-[#7e93b8]"
                  }`}
                >
                  Modo Simples
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "completo"}
                  onClick={() => setMode("completo")}
                  style={toggleGlow && mode !== "completo" ? { animation: "paxterToggleGlow 1.1s ease-in-out 3" } : undefined}
                  className={`h-10 rounded-[6px] text-[11px] font-extrabold uppercase tracking-widest transition-all ${
                    mode === "completo" ? "bevel-3d text-[#c2a05a]" : "text-[#7e93b8]"
                  }`}
                >
                  Cadastro Completo
                </button>
              </div>
              <p className="text-[#7e93b8] text-[11px] leading-snug -mt-2 px-1">
                {mode === "simples"
                  ? "Modo rápido: só os dados essenciais. Você pode completar o resto quando quiser."
                  : "Cadastro completo: endereço e dados adicionais para aproveitar tudo que a clínica oferece."}
              </p>

              {voiceOn && (
                <div className="concave-3d p-3 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-[#c2a05a] shrink-0" />
                  <p className="text-[#9fb1d0] text-[11px] leading-snug">
                    Você pode preencher falando: toque no microfone ao lado de cada campo e diga o dado.
                  </p>
                </div>
              )}

              {/* Preenchimento rápido por IA (foto do documento) */}
              <div className="panel-3d p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Preenchimento Rápido</h2>
                  <span className="text-[9px] font-extrabold uppercase tracking-widest text-[#0b1426] bg-[#c2a05a] px-2 py-0.5 rounded-[4px]">IA grátis</span>
                </div>
                <p className="text-[#9fb1d0] text-[11px] leading-snug">
                  Tire uma foto do seu documento (RG ou CNH) e a inteligência artificial preenche nome, CPF e data de nascimento para você. A imagem não é guardada.
                </p>
                <button
                  type="button"
                  onClick={() => docInputRef.current?.click()}
                  disabled={scanning}
                  className="btn-3d-soft w-full h-11 flex items-center justify-center gap-2 rounded-[6px] text-[#c2a05a] text-xs font-extrabold uppercase tracking-widest disabled:opacity-60"
                >
                  {scanning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Lendo documento...
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4" /> Fotografar documento
                    </>
                  )}
                </button>
                <input
                  ref={docInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onPickDoc}
                />
                {scanNote && (
                  <p className="text-[#9fb1d0] text-[11px] leading-snug">{scanNote}</p>
                )}
              </div>

              {/* Dados pessoais */}
              <div className="panel-3d p-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Dados Pessoais</h2>
                </div>
                <Field fieldKey="name" label="Nome Completo" value={name} setter={setName} required placeholder="Ex: João da Silva" />
                <Field fieldKey="birthDate" label="Data de Nascimento" value={birthDate} setter={setBirthDate} kind="date" required placeholder="00/00/0000" inputMode="numeric" />
                <Field fieldKey="cpf" label="CPF" value={cpf} setter={setCpf} kind="cpf" required placeholder="000.000.000-00" inputMode="numeric" />
                <Field fieldKey="email" label="E-mail" value={email} setter={setEmail} required placeholder="joao@exemplo.com" type="email" inputMode="email" onBlur={maybeShowInvite} />
                <Field fieldKey="phone" label="Celular" value={phone} setter={setPhone} kind="phone" required placeholder="(00) 00000-0000" inputMode="tel" />
              </div>

              {/* Endereço (opcional) — só no modo completo */}
              {mode === "completo" && (
              <div className="panel-3d p-5 space-y-4">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Endereço (opcional)</h2>
                <div className="space-y-1.5">
                  <label className="uppercase tracking-widest text-[10px] font-extrabold text-[#8aa0c4] block">CEP</label>
                  <div className="flex gap-2">
                    <input
                      inputMode="numeric"
                      placeholder="00000-000"
                      value={cep}
                      onChange={(e) => {
                        const f = formatCEP(e.target.value);
                        setCep(f);
                        if (f.replace(/\D/g, "").length === 8) lookupCepByValue(f);
                      }}
                      onBlur={() => lookupCepByValue(cep)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          lookupCepByValue(cep);
                        }
                      }}
                      className="field-engraved flex-1 h-11 px-3 text-white text-sm rounded-[6px] bg-transparent outline-none"
                    />
                    {voiceOn && (
                      <button
                        type="button"
                        aria-label="Falar CEP"
                        onClick={() =>
                          startVoice("cep", "cep", (v) => {
                            setCep(v);
                            if (v.replace(/\D/g, "").length === 8) lookupCepByValue(v);
                          })
                        }
                        className={`bevel-3d h-11 w-11 shrink-0 flex items-center justify-center rounded-[6px] ${
                          listeningField === "cep" ? "text-red-400 animate-pulse" : "text-[#c2a05a]"
                        }`}
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label="Buscar CEP"
                      onClick={lookupCep}
                      disabled={loadingCep}
                      className="bevel-3d h-11 w-11 shrink-0 flex items-center justify-center rounded-[6px] text-[#c2a05a] disabled:opacity-50"
                    >
                      {loadingCep ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <Field fieldKey="logradouro" label="Logradouro" value={logradouro} setter={setLogradouro} placeholder="Rua, Avenida..." />
                <div className="grid grid-cols-2 gap-3">
                  <Field fieldKey="numero" label="Número" value={numero} setter={setNumero} placeholder="123" />
                  <Field fieldKey="complemento" label="Complemento" value={complemento} setter={setComplemento} placeholder="Apto, Sala" />
                </div>
                <Field fieldKey="bairro" label="Bairro" value={bairro} setter={setBairro} placeholder="Bairro" />
                <div className="grid grid-cols-2 gap-3">
                  <Field fieldKey="cidade" label="Cidade" value={cidade} setter={setCidade} placeholder="São Paulo" />
                  <Field fieldKey="estado" label="Estado" value={estado} setter={setEstado} placeholder="SP" />
                </div>
                <Field fieldKey="pais" label="País" value={pais} setter={setPais} placeholder="BRASIL" />
              </div>
              )}

              {/* Adicionais (opcional) — só no modo completo */}
              {mode === "completo" && (
              <div className="panel-3d p-5 space-y-4">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Adicionais (opcional)</h2>
                <Field fieldKey="instagram" label="Instagram" value={instagram} setter={setInstagram} placeholder="@usuario" />
                <div className="space-y-1.5">
                  <label className="uppercase tracking-widest text-[10px] font-extrabold text-[#8aa0c4] block">Como nos conheceu?</label>
                  <div className="concave-3d p-1">
                    <select
                      value={comoConheceu}
                      onChange={(e) => setComoConheceu(e.target.value)}
                      className="w-full h-9 bg-transparent text-white text-sm px-2 outline-none"
                    >
                      <option value="" className="bg-[#0b1426]">Selecione...</option>
                      <option value="INDICACAO" className="bg-[#0b1426]">Indicação</option>
                      <option value="INSTAGRAM" className="bg-[#0b1426]">Instagram</option>
                      <option value="GOOGLE" className="bg-[#0b1426]">Google</option>
                      <option value="FACEBOOK" className="bg-[#0b1426]">Facebook</option>
                      <option value="FORM" className="bg-[#0b1426]">Formulário</option>
                      <option value="OUTROS" className="bg-[#0b1426]">Outros</option>
                    </select>
                  </div>
                </div>
                {activeLocations.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="uppercase tracking-widest text-[10px] font-extrabold text-[#8aa0c4] block">Clínica de origem</label>
                    <div className="concave-3d p-1">
                      <select
                        value={locationId}
                        onChange={(e) => setLocationId(e.target.value)}
                        className="w-full h-9 bg-transparent text-white text-sm px-2 outline-none"
                      >
                        <option value="" className="bg-[#0b1426]">Selecione...</option>
                        {activeLocations.map((l) => (
                          <option key={l.id} value={String(l.id)} className="bg-[#0b1426]">
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
              )}

              {/* Foto (opcional) */}
              <div className="panel-3d p-5 space-y-4">
                <h2 className="text-white font-semibold text-sm uppercase tracking-wide">Sua Foto (opcional)</h2>
                <div className="flex justify-center">
                  <div className="concave-3d w-44 h-44 rounded-[6px] overflow-hidden flex items-center justify-center relative">
                    {cameraActive ? (
                      <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-cover" />
                    ) : preview ? (
                      <img src={preview} alt="Pré-visualização" className="w-full h-full object-cover" />
                    ) : currentPhoto ? (
                      <img src={currentPhoto} alt="Foto atual" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-12 h-12 text-[#5a6f96]" />
                    )}
                  </div>
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />

                {cameraActive ? (
                  <div className="flex gap-2">
                    <button onClick={capturePhoto} className="btn-3d flex-1 h-12 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                      <Camera className="w-4 h-4" /> TIRAR FOTO
                    </button>
                    <button onClick={stopCamera} aria-label="Cancelar câmera" className="bevel-3d h-12 px-4 flex items-center justify-center text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {cameraSupported && (
                      <button onClick={startCamera} disabled={cameraStarting} className="bevel-3d w-full h-12 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 text-white disabled:opacity-50">
                        {cameraStarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4 text-[#c2a05a]" />}
                        ABRIR CÂMERA
                      </button>
                    )}
                    <button onClick={() => fileInputRef.current?.click()} className="bevel-3d w-full h-12 font-semibold text-sm uppercase tracking-wider flex items-center justify-center gap-2 text-white">
                      <ImageIcon className="w-4 h-4 text-[#c2a05a]" />
                      {selectedFile ? "ESCOLHER OUTRA FOTO" : "ESCOLHER DA GALERIA"}
                    </button>
                  </div>
                )}
                {cameraNote && (
                  <p className="text-[#9fb1d0] text-[11px] text-center leading-relaxed px-1">{cameraNote}</p>
                )}
              </div>

              {/* Convite animado para o Cadastro Completo (bloqueia digitação ~1,2s) */}
              {invitePlaying && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center px-6"
                  style={{ background: "rgba(8,14,28,0.55)", backdropFilter: "blur(2px)" }}
                  aria-live="polite"
                >
                  <div
                    onAnimationEnd={onInviteEnd}
                    style={{ animation: "paxterInvite 1.2s cubic-bezier(0.22,1,0.36,1) forwards" }}
                    className="w-full max-w-xs rounded-[10px] p-6 text-center"
                  >
                    <div
                      className="rounded-[10px] p-6"
                      style={{
                        background: "linear-gradient(160deg, rgba(38,108,82,0.92), rgba(24,74,58,0.92))",
                        border: "1px solid rgba(120,210,170,0.45)",
                        boxShadow: "0 18px 50px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
                        backdropFilter: "blur(6px)",
                      }}
                    >
                      <CheckCircle className="w-9 h-9 text-emerald-200 mx-auto mb-3" />
                      <h3 className="text-white font-bold text-sm uppercase tracking-wide mb-2">
                        Quer descontos exclusivos?
                      </h3>
                      <p className="text-emerald-50 text-[12px] leading-snug">
                        Clientes com cadastro completo recebem condições e benefícios especiais da clínica. Toque em <span className="font-bold">Cadastro Completo</span> aqui em cima e aproveite.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="btn-3d w-full h-13 py-4 font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" /> ENVIAR CADASTRO
                  </>
                )}
              </button>
              <p className="text-[#5a6f96] text-[11px] text-center pb-6">
                Campos com <span className="text-[#c2a05a]">*</span> são obrigatórios. O restante é opcional.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
