import { ArrowRight } from "lucide-react";

type Selo = "confirmado" | "planejado";
const Etiqueta = ({ s }: { s: Selo }) => (
  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${s === "confirmado" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{s}</span>
);

const SISTEMAS: { nome: string; funcao: string; selo: Selo }[] = [
  { nome: "Manager (padcom)", funcao: "Telas da clínica, incluindo esta cabine", selo: "confirmado" },
  { nome: "API Server", funcao: "Regras, autorização por papel e clínica, rotas", selo: "confirmado" },
  { nome: "api-worker", funcao: "Tarefas em segundo plano (perfil Telegram em desenvolvimento)", selo: "confirmado" },
  { nome: "Banco PostgreSQL", funcao: "Dados, papéis por clínica, registro de documentos", selo: "confirmado" },
  { nome: "Armazenamento de objetos", funcao: "Arquivos enviados (privado)", selo: "confirmado" },
  { nome: "Vitrine e site Parxis", funcao: "Páginas públicas", selo: "confirmado" },
  { nome: "Integrações conectadas", funcao: "Asaas, Twilio, Evolution, Google Drive e Agenda, Gmail, Slack, Telegram", selo: "confirmado" },
  { nome: "Seletor de transmutação", funcao: "Simulação visual de perfis pelo CEO", selo: "planejado" },
];

const FLUXOS: { titulo: string; passos: string[]; selo: Selo }[] = [
  { titulo: "Autorização de uma requisição", passos: ["Login (token)", "Clínica da sessão", "Papéis na clínica", "Matriz do domínio", "200 / 401 / 403"], selo: "confirmado" },
  { titulo: "Documento do CEO", passos: ["Upload na cabine", "Validação de tipo e conteúdo", "Arquivo privado", "Registro no banco", "Abrir pela API autenticada"], selo: "confirmado" },
  { titulo: "Visão simulada de um perfil", passos: ["CEO escolhe perfil", "Tela limpa o estado", "Menu com cadeado", "Servidor continua decidindo"], selo: "planejado" },
];

export default function MapaSistemas() {
  return (
    <div className="space-y-5" data-testid="mapa-sistemas">
      <section className="space-y-2">
        <h3 className="font-semibold uppercase text-sm">Mapa de sistemas</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {SISTEMAS.map((s) => (
            <div key={s.nome} className="panel-3d-sub p-3 space-y-1">
              <div className="flex items-center justify-between gap-2"><h4 className="text-sm font-semibold">{s.nome}</h4><Etiqueta s={s.selo} /></div>
              <p className="text-xs text-muted-foreground">{s.funcao}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold uppercase text-sm">Fluxos importantes</h3>
        {FLUXOS.map((f) => (
          <div key={f.titulo} className="concave-3d p-3 space-y-2">
            <div className="flex items-center gap-2"><h4 className="text-sm font-semibold">{f.titulo}</h4><Etiqueta s={f.selo} /></div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {f.passos.map((p, i) => (
                <span key={p} className="inline-flex items-center gap-2">
                  <span className="bevel-3d px-2 py-1">{p}</span>
                  {i < f.passos.length - 1 ? <ArrowRight className="h-3 w-3" /> : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
