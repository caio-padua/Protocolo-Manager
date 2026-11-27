import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Lock, Check } from "lucide-react";
import EstadoRecursoBadge, { type EstadoRecurso } from "@/components/EstadoRecursoBadge";

// Tela informativa de módulo (destino do cadeado dourado do menu lateral).
// Não cobra, não vende e não ativa nada: a ativação é decisão do responsável e feita no Cadastro de Empresas.
// O estado exibido vem do mesmo /api/menu que o menu lateral usa; o bloqueio real continua no servidor.
const MODULOS: Record<string, { nome: string; beneficios: string[] }> = {
  agenda: { nome: "Agenda & Recepção", beneficios: ["Marcação, remarcação e cancelamento de consultas e sessões", "Agendas por local e por profissional, com espelho no Google Agenda", "Confirmação e acompanhamento das visitas"] },
  exames_lab: { nome: "Exames", beneficios: ["Pedido de exames com PDF e link seguro para o cliente", "Leitura e conferência dos resultados com validação humana", "Evolução dos exames ao longo do tempo"] },
  protocolos: { nome: "Protocolos e Arsenal Clínico", beneficios: ["Protocolos injetáveis com substâncias, doses e intervalos", "Planejamento de sessões e consumo", "Catálogo clínico da clínica"] },
  financeiro: { nome: "Financeiro e PAX FINANCE", beneficios: ["Cobranças, recebimentos e conciliação", "Visão de caixa e tributos", "Relatórios financeiros da clínica"] },
  comunicacao: { nome: "Comunicação", beneficios: ["Mensagens padronizadas por clínica", "Lembretes por período do dia", "Histórico unificado de conversas"] },
};

export default function AtivarModuloPage() {
  const [, params] = useRoute("/ativar-modulo/:modulo");
  const modulo = params?.modulo ?? "";
  const [ativos, setAtivos] = useState<Set<string> | null>(null);

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("padcom_collab_token") : null;
    fetch("/api/menu", { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { items?: { moduloRequerido?: string | null }[] } | null) => {
        // Resposta inválida: estado desconhecido (nunca presumir plano atual).
        if (!d?.items) { setAtivos(null); return; }
        setAtivos(new Set(d.items.map((i) => i.moduloRequerido).filter((m): m is string => !!m)));
      })
      .catch(() => setAtivos(null));
  }, []);

  const estadoDe = (m: string): EstadoRecurso | null => (ativos === null ? null : ativos.has(m) ? "plano_atual" : "disponivel");
  const atual = MODULOS[modulo];

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4" data-testid="ativar-modulo">
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4 flex items-center gap-3">
          <Lock className="w-6 h-6" style={{ color: "#C9A227" }} />
          <div className="flex-1 min-w-0">
            <p className="text-accent text-[9px] font-black uppercase tracking-widest">Módulo</p>
            <h1 className="text-primary font-black text-xl" style={{ fontFamily: "'EB Garamond', serif" }}>{atual?.nome ?? modulo}</h1>
          </div>
          {estadoDe(modulo) && <EstadoRecursoBadge estado={estadoDe(modulo)!} />}
        </div>
        <div className="p-5 space-y-3 text-sm text-primary">
          {atual && (
            <ul className="space-y-1.5" data-testid="beneficios-modulo">
              {atual.beneficios.map((b) => <li key={b} className="flex items-start gap-2"><Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "#C9A227" }} />{b}</li>)}
            </ul>
          )}
          <p className="text-muted-foreground text-xs">Esta tela só informa. Nada foi contratado, alterado ou cobrado, e o acesso real é decidido pelo servidor. Para ativar, o responsável pela plataforma liga o módulo no cadastro da empresa, na aba de módulos.</p>
          <Link href="/cadastros/empresas"><span className="btn-3d inline-flex items-center justify-center px-4 min-h-[44px] text-[11px] font-black uppercase tracking-widest cursor-pointer">Abrir Cadastro de Empresas</span></Link>
        </div>
      </div>

      <div className="panel-3d-sub rounded-xl p-4 space-y-2" data-testid="todos-modulos">
        <p className="text-accent text-[9px] font-black uppercase tracking-widest">Todos os módulos</p>
        {Object.entries(MODULOS).map(([k, v]) => (
          <Link key={k} href={`/ativar-modulo/${k}`}>
            <div className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <span className="flex-1 text-primary text-xs font-black uppercase tracking-widest">{v.nome}</span>
              {estadoDe(k) ? <EstadoRecursoBadge estado={estadoDe(k)!} /> : <span className="w-[9.5rem] shrink-0" />}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
