import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetRAS } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Printer, FileDown, ShieldCheck, Loader2, FolderUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CertInfo {
  subject: string;
  issuer: string;
  serial: string;
  validFrom: string;
  validTo: string;
  cpf: string | null;
}

export default function RASDetail() {
  const [, params] = useRoute("/ras/:id");
  const [, setLocation] = useLocation();
  const id = params ? parseInt(params.id) : 0;
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);

  const { data: ras, isLoading } = useGetRAS(id, {
    query: { enabled: !!id }
  });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/ras/certificate-info`)
      .then(r => r.ok ? r.json() : null)
      .then(setCertInfo)
      .catch(() => {});
  }, []);

  async function uploadToDrive() {
    setUploading(true);
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}api/ras/${id}/upload-drive`, { method: "POST" });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || "Erro ao enviar ao Drive");
      }
      const data = await resp.json();
      toast({ title: "RAS enviado ao Google Drive!", description: data.message });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}api/ras/${id}/pdf`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.details || "Erro ao gerar PDF");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = resp.headers.get("Content-Disposition");
      const filenameMatch = cd?.match(/filename="(.+)"/);
      a.download = filenameMatch?.[1] ?? `RAS_${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF assinado baixado!", description: "Documento com assinatura digital ICP-Brasil." });
    } catch (err: any) {
      toast({ title: "Erro ao gerar PDF", description: err.message, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!ras) return <div className="p-8 text-muted-foreground">RAS não encontrado.</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-4 print:hidden flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/ras")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold flex-1">RAS — {ras.clientName}</h1>
        <Button
          variant="default"
          onClick={downloadPdf}
          disabled={downloading}
          className="gap-2"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          {downloading ? "Gerando..." : "Baixar PDF Assinado"}
        </Button>
        <Button
          variant="outline"
          onClick={uploadToDrive}
          disabled={uploading}
          className="gap-2"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderUp className="h-4 w-4" />}
          {uploading ? "Enviando..." : "Enviar ao Drive"}
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" />
          Imprimir
        </Button>
      </div>

      {/* Certificate info badge */}
      {certInfo && (
        <div className="flex items-center gap-2 text-xs print:hidden bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
          <ShieldCheck className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="text-blue-700 dark:text-blue-300">
            Certificado A1 ICP-Brasil ativo — <strong>{certInfo.cpf ?? "CPF vinculado"}</strong> ·
            Válido até {new Date(certInfo.validTo).toLocaleDateString("pt-BR")} ·
            Emissor: {certInfo.issuer.split(",").find(p => p.includes("CN="))?.replace("CN=", "").trim() ?? certInfo.issuer}
          </span>
        </div>
      )}

      {/* RAS Document - styled like official medical form */}
      <div className="bg-white dark:bg-gray-950 border rounded-xl p-8 max-w-4xl print:border-none print:rounded-none print:p-4">
        {/* Header */}
        <div className="border-b-2 border-gray-800 dark:border-gray-200 pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                REGISTRO DE ADMINISTRAÇÃO DE SUBSTÂNCIAS
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                Protocolo de Injetáveis — Medicina Estética
              </p>
            </div>
            <div className="text-right text-sm text-gray-600 dark:text-gray-400">
              <p>RAS N.° <strong className="text-gray-900 dark:text-gray-100">{String(ras.id).padStart(6, "0")}</strong></p>
              <p>Sessão ID: <strong className="text-gray-900 dark:text-gray-100">{ras.sessionId}</strong></p>
            </div>
          </div>
        </div>

        {/* Client Info */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Dados do Cliente</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="border-b border-gray-300 dark:border-gray-700 pb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Nome Completo</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{ras.clientName}</p>
            </div>
            <div className="border-b border-gray-300 dark:border-gray-700 pb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">CPF</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{ras.clientCpf}</p>
            </div>
            <div className="border-b border-gray-300 dark:border-gray-700 pb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Data do Atendimento</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {format(new Date(ras.serviceDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
            <div className="border-b border-gray-300 dark:border-gray-700 pb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">Tipo de Atendimento</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {ras.serviceType === "homecare" ? "Nurse Care Domiciliar" : "Clínica"}
              </p>
            </div>
          </div>
        </div>

        {/* Professional Info */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Dados do Profissional</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="border-b border-gray-300 dark:border-gray-700 pb-1 col-span-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">Profissional Responsável</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{ras.professionalName}</p>
            </div>
            <div className="border-b border-gray-300 dark:border-gray-700 pb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400">CRM / COREN</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{ras.professionalCrm ?? "—"}</p>
            </div>
            <div className="border-b border-gray-300 dark:border-gray-700 pb-1 col-span-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Unidade</p>
              <p className="font-medium text-gray-900 dark:text-gray-100">{ras.unit}</p>
            </div>
          </div>
        </div>

        {/* Substances Table */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Substâncias Administradas</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <th className="text-left p-2 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400">Substância</th>
                <th className="text-left p-2 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400">Dose</th>
                <th className="text-center p-2 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400">Sessão N.°</th>
                <th className="text-left p-2 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400">Via</th>
                <th className="text-left p-2 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400">Lote</th>
                <th className="text-left p-2 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400">Validade</th>
                <th className="text-center p-2 border border-gray-300 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {ras.substances.map((sub, idx) => (
                <tr key={idx} className={`border border-gray-300 dark:border-gray-700 ${idx % 2 === 0 ? "" : "bg-gray-50 dark:bg-gray-900/40"}`}>
                  <td className="p-2 border border-gray-300 dark:border-gray-700 font-medium text-gray-900 dark:text-gray-100">{sub.substanceName}</td>
                  <td className="p-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">{sub.dose}</td>
                  <td className="p-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-center">{sub.sessionNumber}/{sub.totalSessions}</td>
                  <td className="p-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">{sub.route}</td>
                  <td className="p-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">{sub.lot ?? "—"}</td>
                  <td className="p-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300">{sub.validity ?? "—"}</td>
                  <td className="p-2 border border-gray-300 dark:border-gray-700 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      sub.status === "applied"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400"
                        : sub.status === "missed"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {sub.status === "applied" ? "Aplicado" : sub.status === "missed" ? "Não Aplicado" : sub.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Observations */}
        {ras.observations && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">Observações</h3>
            <div className="border border-gray-300 dark:border-gray-700 rounded p-3 min-h-[60px] text-sm text-gray-700 dark:text-gray-300">
              {ras.observations}
            </div>
          </div>
        )}

        {/* Digital Signature Info */}
        <div className="mb-6 print:mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Assinatura Digital ICP-Brasil</h3>
          <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-blue-800 dark:text-blue-300 mb-1">DOCUMENTO ASSINADO DIGITALMENTE</p>
                {certInfo ? (
                  <div className="text-xs text-blue-700 dark:text-blue-400 space-y-0.5">
                    <p>Certificado: {certInfo.subject.split(",").find(p => p.includes("CN="))?.replace("CN=", "").trim()}</p>
                    <p>CPF: {certInfo.cpf ?? "—"}</p>
                    <p>Emissor: {certInfo.issuer.split(",").find(p => p.includes("CN="))?.replace("CN=", "").trim()}</p>
                    <p>Válido: {new Date(certInfo.validFrom).toLocaleDateString("pt-BR")} a {new Date(certInfo.validTo).toLocaleDateString("pt-BR")}</p>
                  </div>
                ) : (
                  <p className="text-xs text-blue-600">O PDF baixado contém assinatura digital embarcada com certificado A1 ICP-Brasil.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Signature Boxes */}
        <div className="mt-10 pt-6 border-t border-gray-300 dark:border-gray-700">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <div className="border-b border-gray-800 dark:border-gray-200 mb-1 h-12 flex items-end pb-1">
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                  <ShieldCheck className="h-3 w-3 mr-1" />
                  Assinado A1
                </Badge>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Assinatura do Profissional</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center mt-0.5">{ras.professionalName}</p>
              {ras.professionalCrm && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">{ras.professionalCrm}</p>
              )}
            </div>
            <div>
              <div className="border-b border-gray-800 dark:border-gray-200 mb-1 h-12 flex items-end pb-1">
                {ras.patientSignature && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 italic">Assinado</span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Assinatura do Cliente</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center mt-0.5">{ras.clientName}</p>
            </div>
            <div>
              <div className="border-b border-gray-800 dark:border-gray-200 mb-1 h-12" />
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Data e Hora</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center mt-0.5">
                {format(new Date(ras.serviceDate + "T12:00:00"), "dd/MM/yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 dark:border-gray-800 text-xs text-gray-400 dark:text-gray-600 text-center">
          Documento gerado pelo sistema PADCOM — Protocolos Injetáveis · {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
        </div>
      </div>
    </div>
  );
}
