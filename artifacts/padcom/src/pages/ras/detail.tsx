import { useRoute, useLocation } from "wouter";
import { useGetRAS } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ArrowLeft, Printer } from "lucide-react";

export default function RASDetail() {
  const [, params] = useRoute("/ras/:id");
  const [, setLocation] = useLocation();
  const id = params ? parseInt(params.id) : 0;

  const { data: ras, isLoading } = useGetRAS(id, {
    query: { enabled: !!id }
  });

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
      <div className="flex items-center gap-4 print:hidden">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/ras")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <h1 className="text-2xl font-bold flex-1">RAS — {ras.clientName}</h1>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" />
          Imprimir
        </Button>
      </div>

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
          <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Dados do Paciente</h3>
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
                {format(new Date(ras.serviceDate), "dd/MM/yyyy", { locale: ptBR })}
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
                        ? "bg-green-100 text-green-800"
                        : sub.status === "missed"
                          ? "bg-red-100 text-red-800"
                          : "bg-gray-100 text-gray-600"
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

        {/* Signature Section */}
        <div className="mt-10 pt-6 border-t border-gray-300 dark:border-gray-700">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <div className="border-b border-gray-800 dark:border-gray-200 mb-1 h-12 flex items-end pb-1">
                {ras.professionalSignature && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 italic">Assinado digitalmente</span>
                )}
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
                  <span className="text-sm text-gray-500 dark:text-gray-400 italic">Assinado digitalmente</span>
                )}
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Assinatura do Paciente</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center mt-0.5">{ras.clientName}</p>
            </div>
            <div>
              <div className="border-b border-gray-800 dark:border-gray-200 mb-1 h-12" />
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Data e Hora</p>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 text-center mt-0.5">
                {format(new Date(ras.serviceDate), "dd/MM/yyyy", { locale: ptBR })}
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
