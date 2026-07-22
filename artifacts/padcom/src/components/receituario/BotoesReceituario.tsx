// ─────────────────────────────────────────────────────────────────────────────
// BOTOES RECEITUARIO — componente compartilhado para TODAS as telas que emitem
// Botão 1: Motor Único (server-side, dados estruturados)
// Botão 2: PDF Visual (captura html2canvas do ReceituarioPreview ao vivo)
// ─────────────────────────────────────────────────────────────────────────────
import { FileText, Camera, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface BotoesReceituarioProps {
  /** Chamado ao clicar "Emitir Receituário" — motor único server-side */
  onEmitirMotorUnico: () => Promise<void>;
  /** Chamado ao clicar "Gerar PDF Visual" — captura html2canvas */
  onGerarPdfVisual: () => Promise<void>;
  /** Indicador de loading do motor único */
  loadingMotorUnico?: boolean;
  /** Indicador de loading do PDF visual */
  loadingPdfVisual?: boolean;
  /** Se fornecido, exibe badge de resultado abaixo dos botões */
  resultado?: {
    ok: boolean;
    driveUrl?: string | null;
    emailSent?: boolean;
    error?: string;
  } | null;
  /** Desabilita ambos os botões */
  disabled?: boolean;
  /** Layout compacto (sem labels longos) */
  compact?: boolean;
}

export function BotoesReceituario({
  onEmitirMotorUnico,
  onGerarPdfVisual,
  loadingMotorUnico = false,
  loadingPdfVisual = false,
  resultado,
  disabled = false,
  compact = false,
}: BotoesReceituarioProps) {
  const loading = loadingMotorUnico || loadingPdfVisual;

  return (
    <div className="space-y-2">
      {/* Linha dos botões */}
      <div className="flex flex-wrap gap-2">
        {/* Botão 1: Motor Único — dados estruturados → Puppeteer server-side */}
        <button
          onClick={() => { void onEmitirMotorUnico(); }}
          disabled={disabled || loading}
          className="btn-3d flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          title="Gera o PDF diretamente no servidor usando o motor único — modelo ativo do banco"
        >
          {loadingMotorUnico
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <FileText className="w-4 h-4" />}
          {compact ? "Emitir" : "Emitir Receituário"}
        </button>

        {/* Botão 2: PDF Visual — html2canvas captura o preview ao vivo */}
        <button
          onClick={() => { void onGerarPdfVisual(); }}
          disabled={disabled || loading}
          className="btn-3d-soft flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          title="Captura o preview visual exato que aparece na tela e converte em PDF"
        >
          {loadingPdfVisual
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Camera className="w-4 h-4" />}
          {compact ? "PDF Visual" : "Gerar PDF Visual"}
        </button>
      </div>

      {/* Badge de resultado */}
      {resultado && (
        <div className={`text-xs rounded px-3 py-2 flex items-start gap-2 ${
          resultado.ok
            ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {resultado.ok
            ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-600" />
            : <span className="shrink-0 mt-0.5">⚠</span>}
          <div className="flex flex-col gap-0.5">
            {resultado.ok ? (
              <>
                <span className="font-semibold">Receituário gerado e assinado!</span>
                {resultado.emailSent && <span>E-mail enviado.</span>}
                {resultado.driveUrl && (
                  <a
                    href={resultado.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline text-emerald-700"
                  >
                    <ExternalLink className="w-3 h-3" /> Ver no Drive
                  </a>
                )}
              </>
            ) : (
              <span>{resultado.error ?? "Erro ao gerar o receituário"}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
