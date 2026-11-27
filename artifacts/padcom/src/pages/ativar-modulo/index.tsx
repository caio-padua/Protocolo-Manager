import { Link, useRoute } from "wouter";
import { Lock } from "lucide-react";

// Tela de ativação de módulo (destino do cadeado dourado do menu lateral).
// Não cobra nem ativa nada sozinha: a ativação é decisão do responsável e feita no Cadastro de Empresas.
const NOMES: Record<string, string> = {
  agenda: "Agenda & Recepção", exames_lab: "Exames", protocolos: "Protocolos e Arsenal Clínico",
  financeiro: "Financeiro e PAX FINANCE", comunicacao: "Comunicação",
};

export default function AtivarModuloPage() {
  const [, params] = useRoute("/ativar-modulo/:modulo");
  const modulo = params?.modulo ?? "";
  const nome = NOMES[modulo] ?? modulo;
  return (
    <div className="p-6 max-w-xl mx-auto space-y-4" data-testid="ativar-modulo">
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4 flex items-center gap-3">
          <Lock className="w-6 h-6" style={{ color: "#C9A227" }} />
          <div>
            <p className="text-accent text-[9px] font-black uppercase tracking-widest">Módulo não ativo</p>
            <h1 className="text-primary font-black text-xl" style={{ fontFamily: "'EB Garamond', serif" }}>{nome}</h1>
          </div>
        </div>
        <div className="p-5 space-y-3 text-sm text-primary">
          <p>Este módulo não está ativo para a sua clínica. Nenhum dado seu foi alterado e nada foi cobrado.</p>
          <p>Para ativar, o responsável pela plataforma liga o módulo no cadastro da empresa, na aba de módulos.</p>
          <Link href="/cadastros/empresas"><span className="btn-3d inline-flex items-center justify-center px-4 min-h-[44px] text-[11px] font-black uppercase tracking-widest cursor-pointer">Abrir Cadastro de Empresas</span></Link>
        </div>
      </div>
    </div>
  );
}
