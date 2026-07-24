import { useState, useCallback, useRef } from "react";
import { Upload, CheckCircle, Loader2, AlertCircle, FileUp, User, ChevronRight } from "lucide-react";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import { PAXTER_SITE_URL } from "@/lib/brand";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const FILE_TYPES = [
  { value: "exame_sangue", label: "EXAME DE SANGUE / BIOQUÍMICA" },
  { value: "ultrassom", label: "ULTRASSOM" },
  { value: "tomografia", label: "TOMOGRAFIA" },
  { value: "ressonancia", label: "RESSONÂNCIA" },
  { value: "densitometria", label: "DENSITOMETRIA" },
  { value: "laudo", label: "LAUDO" },
  { value: "comprovante_pagamento", label: "COMPROVANTE DE PAGAMENTO" },
  { value: "foto", label: "FOTO / IMAGEM" },
  { value: "receita", label: "RECEITA MÉDICA" },
  { value: "atestado", label: "ATESTADO" },
  { value: "outro", label: "OUTRO" },
];

const BODY_REGIONS = [
  { value: "ABDOME", label: "ABDOME" },
  { value: "CABECA", label: "CABEÇA" },
  { value: "COLUNA", label: "COLUNA" },
  { value: "FACE", label: "FACE" },
  { value: "FIGADO", label: "FÍGADO" },
  { value: "JOELHO", label: "JOELHO" },
  { value: "MAMAS", label: "MAMAS" },
  { value: "MAO", label: "MÃO" },
  { value: "OMBRO", label: "OMBRO" },
  { value: "PELVE", label: "PELVE" },
  { value: "PESCOCO", label: "PESCOÇO" },
  { value: "RINS", label: "RINS" },
  { value: "TIREOIDE", label: "TIREOIDE" },
  { value: "TORAX", label: "TÓRAX" },
  { value: "QUADRIL", label: "QUADRIL" },
];

const TYPES_WITH_BODY = ["ultrassom", "tomografia", "ressonancia", "densitometria"];

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

export default function Portal() {
  const [step, setStep] = useState<"identify" | "upload" | "success">("identify");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [client, setClient] = useState<{ id: number; name: string; cpf: string; token: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fileType, setFileType] = useState("");
  const [bodyRegion, setBodyRegion] = useState("");
  const [description, setDescription] = useState("");
  const [examDate, setExamDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ fileName: string; folder: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const TYPES_NEED_DATE = ["exame_sangue", "ultrassom", "tomografia", "ressonancia", "densitometria", "laudo", "outro"];

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
      setStep("upload");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }, [cpf, birthDate]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !fileType || !client) return;

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("token", client.token);
      formData.append("fileType", fileType);
      if (bodyRegion) formData.append("bodyRegion", bodyRegion);
      if (description) formData.append("description", description);
      if (examDate) formData.append("examDate", examDate);

      const res = await fetch(`${API_BASE}/api/client-portal/upload`, {
        method: "POST",
        body: formData,
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

      setUploadResult(data);
      setStep("success");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }, [selectedFile, fileType, bodyRegion, description, examDate, client]);

  const handleNewUpload = useCallback(() => {
    setStep("upload");
    setFileType("");
    setBodyRegion("");
    setDescription("");
    setExamDate("");
    setSelectedFile(null);
    setUploadResult(null);
    setError("");
  }, []);

  const handleRestart = useCallback(() => {
    setStep("identify");
    setCpf("");
    setBirthDate("");
    setClient(null);
    setFileType("");
    setBodyRegion("");
    setDescription("");
    setSelectedFile(null);
    setUploadResult(null);
    setError("");
  }, []);

  const showBodyRegion = TYPES_WITH_BODY.includes(fileType);
  const needsDate      = TYPES_NEED_DATE.includes(fileType);

  return (
    <div className="min-h-screen bg-[#0d1830] flex flex-col">
      <header className="bg-[#0b1426] border-b border-[#223358] px-4 py-4 flex items-center justify-center">
        <a
          href={PAXTER_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="PAXTER — site institucional"
          className="flex items-center gap-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70 transition-opacity hover:opacity-90"
        >
          <PaxterSymbolGlass size={26} tone="dark" />
          <div>
            <h1 className="text-white font-bold text-lg tracking-[0.16em] uppercase">PAXTER</h1>
            <p className="text-[#7e93b8] text-xs uppercase tracking-widest">PORTAL DO CLIENTE</p>
          </div>
        </a>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 py-6">
        <div className="w-full max-w-md">

          {step === "identify" && (
            <div className="bg-[#11203c] border border-[#223358] rounded-md overflow-hidden">
              <div className="bg-[#0b1426] px-5 py-4 border-b border-[#223358]">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-[#c2a05a]" />
                  <h2 className="text-white font-semibold text-sm uppercase tracking-wide">IDENTIFICAÇÃO</h2>
                </div>
                <p className="text-[#7e93b8] text-xs mt-1">
                  Digite seu CPF e data de nascimento para continuar
                </p>
              </div>

              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[#9fb2d2] text-xs font-semibold uppercase tracking-wider mb-1.5">
                    CPF
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => { setCpf(formatCpf(e.target.value)); setError(""); }}
                    className="w-full h-12 bg-[#0b1426] border border-[#223358] rounded-md px-4 text-white text-lg placeholder:text-[#5a6f96] focus:outline-none focus:ring-2 focus:ring-[#c2a05a] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-[#9fb2d2] text-xs font-semibold uppercase tracking-wider mb-1.5">
                    DATA DE NASCIMENTO
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="DD/MM/AAAA"
                    value={birthDate}
                    onChange={(e) => { setBirthDate(formatDate(e.target.value)); setError(""); }}
                    className="w-full h-12 bg-[#0b1426] border border-[#223358] rounded-md px-4 text-white text-lg placeholder:text-[#5a6f96] focus:outline-none focus:ring-2 focus:ring-[#c2a05a] focus:border-transparent"
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
                  className="w-full h-12 bg-[#c2a05a] hover:bg-[#b8924d] text-[#0b1426] font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      CONTINUAR
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {step === "upload" && client && (
            <div className="space-y-4">
              <div className="bg-[#11203c] border border-[#223358] rounded-md px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[#7e93b8] text-xs uppercase tracking-wider">CLIENTE</p>
                  <p className="text-white font-semibold text-sm">{client.name}</p>
                </div>
                <button onClick={handleRestart} className="text-[#7e93b8] text-xs underline hover:text-white">
                  Trocar
                </button>
              </div>

              <div className="bg-[#11203c] border border-[#223358] rounded-md overflow-hidden">
                <div className="bg-[#0b1426] px-5 py-4 border-b border-[#223358]">
                  <div className="flex items-center gap-3">
                    <FileUp className="w-5 h-5 text-[#c2a05a]" />
                    <h2 className="text-white font-semibold text-sm uppercase tracking-wide">ENVIAR ARQUIVO</h2>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div>
                    <label className="block text-[#9fb2d2] text-xs font-semibold uppercase tracking-wider mb-1.5">
                      TIPO DO ARQUIVO
                    </label>
                    <select
                      value={fileType}
                      onChange={(e) => { setFileType(e.target.value); setBodyRegion(""); setError(""); }}
                      className="w-full h-12 bg-[#0b1426] border border-[#223358] rounded-md px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#c2a05a] focus:border-transparent appearance-none"
                    >
                      <option value="" disabled>Selecione o tipo...</option>
                      {FILE_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {needsDate && (
                    <div>
                      <label className="block text-[#9fb2d2] text-xs font-semibold uppercase tracking-wider mb-1.5">
                        DATA DO EXAME <span className="text-[#c2a05a]">(DD/MM/AAAA)</span>
                      </label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        placeholder="Ex: 26/06/2026"
                        value={examDate}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                          let fmt = digits;
                          if (digits.length > 4) fmt = digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
                          else if (digits.length > 2) fmt = digits.slice(0, 2) + "/" + digits.slice(2);
                          setExamDate(fmt);
                        }}
                        className="w-full h-12 bg-[#0b1426] border border-[#223358] rounded-md px-4 text-white text-lg font-mono placeholder:text-[#5a6f96] focus:outline-none focus:ring-2 focus:ring-[#c2a05a] focus:border-transparent"
                      />
                      <p className="text-[#5a6f96] text-[10px] mt-1">
                        Se o sistema encontrar uma data diferente no arquivo, usará a data extraída.
                      </p>
                    </div>
                  )}

                  {showBodyRegion && (
                    <div>
                      <label className="block text-[#9fb2d2] text-xs font-semibold uppercase tracking-wider mb-1.5">
                        REGIÃO DO CORPO <span className="text-[#5a6f96]">(OPCIONAL)</span>
                      </label>
                      <select
                        value={bodyRegion}
                        onChange={(e) => setBodyRegion(e.target.value)}
                        className="w-full h-12 bg-[#0b1426] border border-[#223358] rounded-md px-4 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#c2a05a] focus:border-transparent appearance-none"
                      >
                        <option value="">Selecione a região...</option>
                        {BODY_REGIONS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[#9fb2d2] text-xs font-semibold uppercase tracking-wider mb-1.5">
                      DESCRIÇÃO <span className="text-[#5a6f96]">(OPCIONAL)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: hemograma completo, raio-x do joelho..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full h-12 bg-[#0b1426] border border-[#223358] rounded-md px-4 text-white text-sm placeholder:text-[#5a6f96] focus:outline-none focus:ring-2 focus:ring-[#c2a05a] focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-[#9fb2d2] text-xs font-semibold uppercase tracking-wider mb-1.5">
                      ARQUIVO
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.doc,.docx"
                      onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setError(""); }}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-24 bg-[#0b1426] border-2 border-dashed border-[#223358] rounded-md flex flex-col items-center justify-center gap-2 hover:border-[#c2a05a] transition-colors"
                    >
                      {selectedFile ? (
                        <>
                          <CheckCircle className="w-6 h-6 text-green-400" />
                          <span className="text-white text-sm font-medium truncate max-w-[90%]">{selectedFile.name}</span>
                          <span className="text-[#7e93b8] text-xs">{(selectedFile.size / 1024 / 1024).toFixed(1)} MB — toque para trocar</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-6 h-6 text-[#7e93b8]" />
                          <span className="text-[#7e93b8] text-sm">Toque para selecionar arquivo</span>
                        </>
                      )}
                    </button>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-md px-3 py-2">
                      <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-red-300 text-sm">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleUpload}
                    disabled={uploading || !selectedFile || !fileType}
                    className="w-full h-12 bg-[#c2a05a] hover:bg-[#b8924d] text-[#0b1426] font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        ENVIANDO...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        ENVIAR ARQUIVO
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "success" && (
            <div className="bg-[#11203c] border border-[#223358] rounded-md overflow-hidden">
              <div className="p-8 flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 bg-green-900/30 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h2 className="text-white font-bold text-lg uppercase">ARQUIVO ENVIADO!</h2>
                <p className="text-[#9fb2d2] text-sm">
                  Seu arquivo foi recebido com sucesso e será processado pela equipe da clínica.
                </p>
                {uploadResult && (
                  <div className="bg-[#0b1426] rounded-md px-4 py-3 w-full text-left">
                    <p className="text-[#7e93b8] text-xs uppercase">Arquivo</p>
                    <p className="text-white text-sm font-mono truncate">{uploadResult.fileName}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 w-full pt-2">
                  <button
                    onClick={handleNewUpload}
                    className="w-full h-12 bg-[#c2a05a] hover:bg-[#b8924d] text-[#0b1426] font-bold text-sm uppercase tracking-wider rounded-md flex items-center justify-center gap-2 transition-colors"
                  >
                    ENVIAR OUTRO ARQUIVO
                  </button>
                  <button
                    onClick={handleRestart}
                    className="w-full h-10 bg-transparent border border-[#223358] text-[#9fb2d2] font-semibold text-sm uppercase tracking-wider rounded-md hover:bg-[#223358] transition-colors"
                  >
                    TROCAR CLIENTE
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="text-center text-[#5a6f96] text-xs mt-6 uppercase tracking-wider">
            Instituto Pádua · Paxter — desenvolvido pela Padcon
          </p>
        </div>
      </main>
    </div>
  );
}
