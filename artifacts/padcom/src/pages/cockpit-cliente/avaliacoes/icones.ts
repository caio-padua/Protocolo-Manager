import { Activity, ClipboardList, HeartPulse, Ruler, ScanLine, Scale } from "lucide-react";
import type { ComponentType } from "react";
import type { TipoAvaliacao } from "@workspace/avaliacoes-corporais";

export const ICONES_AVALIACAO: Record<TipoAvaliacao, ComponentType<{ className?: string; size?: number }>> = {
  bioimpedancia: Scale,
  antropometria: Ruler,
  dinamometria: HeartPulse,
  calorimetria: Activity,
  ultrassom: ScanLine,
  outras: ClipboardList,
};
