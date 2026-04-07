import { CheckCircle2, Circle, Clock, XCircle, AlertCircle } from "lucide-react";

export function getStatusColor(status: string) {
  switch (status) {
    case 'scheduled': return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800";
    case 'confirmed': return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case 'completed': return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
    case 'missed': return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    case 'cancelled': return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800";
    case 'suggested': return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800";
    case 'validated': return "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800";
    case 'active': return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    default: return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  }
}

export function getStatusIcon(status: string) {
  switch (status) {
    case 'scheduled': return Clock;
    case 'confirmed': return CheckCircle2;
    case 'completed': return CheckCircle2;
    case 'missed': return XCircle;
    case 'cancelled': return XCircle;
    case 'suggested': return Circle;
    case 'validated': return CheckCircle2;
    case 'active': return CheckCircle2;
    default: return Circle;
  }
}

export function formatStatus(status: string) {
  const map: Record<string, string> = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    completed: "Concluído",
    missed: "Faltou",
    cancelled: "Cancelado",
    suggested: "Sugerido",
    validated: "Validado",
    active: "Ativo",
    pending: "Pendente",
    paid: "Pago",
    partial: "Parcial",
    overdue: "Atrasado",
    refunded: "Reembolsado",
    ok: "Normal",
    low: "Baixo",
    critical: "Crítico",
    expired: "Expirado"
  };
  return map[status] || status;
}
