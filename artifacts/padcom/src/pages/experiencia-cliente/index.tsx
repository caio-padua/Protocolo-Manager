import { useState } from "react";
import { Users, Eye, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { useListClients } from "@workspace/api-client-react";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type ClientOption = { id: number; name: string; cpf?: string | null; phone?: string | null };

export default function ExperienciaCliente() {
  const { data: clientes, isLoading } = useListClients();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const options: ClientOption[] = (clientes ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    cpf: c.cpf,
    phone: c.phone,
  }));

  const selected = options.find((c) => c.id === selectedId) ?? null;

  async function handlePreview() {
    if (!selectedId || !selected) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/preview-client/${selectedId}`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError((data as { error?: string }).error ?? "Erro ao gerar preview");
        return;
      }
      const data = await res.json() as { id: number; name: string; cpf: string | null; token: string };
      const params = new URLSearchParams({
        preview_id: String(data.id),
        preview_name: encodeURIComponent(data.name),
        preview_token: data.token,
      });
      // Abre a Área do Cliente em nova aba, já logado como o cliente selecionado
      window.open(`${API_BASE}/area?${params.toString()}`, "_blank");
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="panel-3d rounded-xl overflow-hidden">
        <div className="bg-primary px-6 py-5">
          <div className="flex items-center gap-3">
            <Eye className="w-6 h-6 text-accent" />
            <div>
              <h1 className="text-white font-black text-base uppercase tracking-widest leading-none">
                EXPERIÊNCIA DO CLIENTE
              </h1>
              <p className="text-primary-foreground/70 text-xs mt-1">
                Veja a Área do Cliente exatamente como o paciente vê — selecione um cliente e abra a visualização
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Seletor de cliente */}
          <div>
            <label className="block text-primary text-xs font-black uppercase tracking-widest mb-2">
              Selecionar Cliente
            </label>
            {isLoading ? (
              <div className="concave-3d rounded-lg p-4 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando clientes...
              </div>
            ) : (
              <PaxterClientSelector
                clientes={options}
                value={selectedId}
                onChange={setSelectedId}
                placeholder="Selecionar cliente…"
              />
            )}
          </div>

          {/* Cartão do cliente selecionado */}
          {selected && (
            <div className="concave-3d rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-primary font-black text-sm uppercase tracking-wide truncate">
                    {selected.name}
                  </p>
                  {selected.cpf && (
                    <p className="text-muted-foreground text-xs font-mono mt-0.5">
                      CPF {selected.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Botão de ação */}
          <button
            onClick={handlePreview}
            disabled={!selectedId || loading}
            className="btn-3d w-full h-12 flex items-center justify-center gap-2 text-sm font-black uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Abrindo...</>
            ) : (
              <><Eye className="w-5 h-5" /> VER COMO CLIENTE</>
            )}
          </button>

          <p className="text-center text-muted-foreground text-[11px] uppercase tracking-wider">
            A visualização abre em nova aba com faixa de aviso ADMIN visível
          </p>
        </div>
      </div>

      {/* O que o cliente vê */}
      <div className="panel-3d rounded-xl p-6 space-y-4">
        <h2 className="text-primary font-black text-xs uppercase tracking-widest">
          O QUE O CLIENTE VÊ NA ÁREA DELE
        </h2>
        <div className="grid grid-cols-1 gap-3">
          {[
            { icon: "🏠", tab: "INÍCIO", desc: "Boas-vindas, próximos atendimentos, progresso dos protocolos ativos" },
            { icon: "💉", tab: "PROTOCOLOS", desc: "Lista de protocolos com substâncias, status de cada sessão e benefícios" },
            { icon: "📅", tab: "AGENDA", desc: "Agenda de aplicações com possibilidade de reagendamento" },
            { icon: "📄", tab: "DOCUMENTOS", desc: "RAS, laudos e documentos clínicos gerados" },
            { icon: "📤", tab: "ENVIAR", desc: "Upload de exames, comprovantes e outros arquivos para o Drive" },
          ].map((item) => (
            <div key={item.tab} className="concave-3d rounded-lg px-4 py-3 flex items-start gap-3">
              <span className="text-xl leading-none mt-0.5">{item.icon}</span>
              <div>
                <p className="text-primary font-black text-xs uppercase tracking-wider">{item.tab}</p>
                <p className="text-muted-foreground text-xs mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Nota sobre o token */}
      <div className="flex items-start gap-2 text-muted-foreground text-xs">
        <RefreshCw className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span>
          O link de visualização expira em 30 minutos por segurança. Se fechar a aba, clique em
          &quot;VER COMO CLIENTE&quot; novamente para gerar um novo acesso.
        </span>
      </div>
    </div>
  );
}
