// ─────────────────────────────────────────────────────────────────────────────
// MODELO DE RECEITUÁRIOS — /modelo-receituario
// Seleciona qual motor de PDF está ativo. Não substitui /configuracoes/receituario
// (designer de faixas), apenas governa qual modelo o SISTEMA usa ao emitir.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { LayoutTemplate, CheckCircle2, Circle, FlaskConical, Loader2, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Modelo {
  id: number;
  nome: string;
  tipo: "faixas_paxter" | "classico_anvisa";
  config: Record<string, unknown>;
  ativo: boolean;
  criadoEm: string;
}

interface EmitirTesteResult {
  ok: boolean;
  fileName?: string;
  modeloUsado?: string;
  tipoMotor?: string;
  pdfSizeBytes?: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

function tipoLabel(tipo: string): string {
  if (tipo === "faixas_paxter") return "Faixas Paxter";
  if (tipo === "classico_anvisa") return "Clássico ANVISA";
  return tipo;
}

function tipoDesc(tipo: string): string {
  if (tipo === "faixas_paxter")
    return "Motor visual HTML — arabescos, tipografia serifada, capturado pelo Puppeteer. Exatamente o que aparece na pré-visualização da tela.";
  if (tipo === "classico_anvisa")
    return "Motor vetorial PDF-lib — quatro caixas ANVISA, fontes padrão Helvetica, geração direta sem renderização de browser.";
  return "";
}

function tipoBadgeStyle(tipo: string): string {
  if (tipo === "faixas_paxter") return "bg-teal-100 text-teal-800 border border-teal-300";
  if (tipo === "classico_anvisa") return "bg-blue-100 text-blue-800 border border-blue-300";
  return "bg-gray-100 text-gray-700";
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ModeloReceituario() {
  const { toast } = useToast();
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ativando, setAtivando] = useState<number | null>(null);
  const [testando, setTestando] = useState<number | null>(null);
  const [ultimoTeste, setUltimoTeste] = useState<EmitirTesteResult | null>(null);
  const [carregouUmaVez, setCarregouUmaVez] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await fetch(`${API}/api/receituario-modelos`);
      const data = await r.json() as { modelos: Modelo[] };
      setModelos(data.modelos ?? []);
      setCarregouUmaVez(true);
    } catch {
      toast({ title: "Erro ao carregar modelos", variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  }

  if (!carregouUmaVez && !carregando) {
    carregar();
  }

  async function ativar(id: number) {
    setAtivando(id);
    try {
      const r = await fetch(`${API}/api/receituario-modelos/${id}/ativar`, { method: "POST" });
      const data = await r.json() as { ok: boolean; modelo?: Modelo };
      if (!data.ok) throw new Error("Falha ao ativar");
      await carregar();
      toast({ title: "Modelo ativado", description: `${data.modelo?.nome ?? ""} está ativo agora.` });
    } catch (e) {
      toast({ title: "Erro ao ativar modelo", description: String(e), variant: "destructive" });
    } finally {
      setAtivando(null);
    }
  }

  async function emitirTeste(modeloId: number) {
    setTestando(modeloId);
    setUltimoTeste(null);
    try {
      const r = await fetch(`${API}/api/receituario-modelos/emitir-teste`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modeloId }),
      });
      const data = await r.json() as EmitirTesteResult;
      setUltimoTeste(data);
      if (data.ok) {
        toast({
          title: "PDF de teste gerado",
          description: `${data.modeloUsado} — ${((data.pdfSizeBytes ?? 0) / 1024).toFixed(0)} KB`,
        });
      } else {
        toast({ title: "Falha no teste", description: data.error ?? "Erro desconhecido", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erro de conexão no teste", description: String(e), variant: "destructive" });
    } finally {
      setTestando(null);
    }
  }

  const modeloAtivo = modelos.find(m => m.ativo);

  return (
    <div className="min-h-screen bg-[#0e1b2e] text-white p-6">
      {/* CABEÇALHO */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[6px] bg-[#1e304a] border border-[#c9a24e]/40 flex items-center justify-center">
            <LayoutTemplate className="w-5 h-5 text-[#c9a24e]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-widest uppercase text-white">
              Modelo de Receituários
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Define qual motor de PDF está ativo para emissão de receitas
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={carregar}
          disabled={carregando}
          className="text-slate-400 hover:text-white"
        >
          {carregando
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <RefreshCw className="w-4 h-4" />}
        </Button>
      </div>

      {/* MODELO ATIVO — DESTAQUE */}
      {modeloAtivo && (
        <div className="mb-6 p-4 rounded-[6px] border border-[#c9a24e]/50 bg-[#c9a24e]/10">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-[#c9a24e]" />
            <span className="text-xs font-bold uppercase tracking-widest text-[#c9a24e]">Modelo Ativo</span>
          </div>
          <div className="text-white font-semibold text-base">{modeloAtivo.nome}</div>
          <div className="text-slate-400 text-xs mt-0.5">{tipoDesc(modeloAtivo.tipo)}</div>
        </div>
      )}

      {/* LISTA DE MODELOS */}
      {carregando && modelos.length === 0 && (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Carregando modelos…
        </div>
      )}

      <div className="space-y-3">
        {modelos.map(m => {
          const isAtivando = ativando === m.id;
          const isTestando = testando === m.id;

          return (
            <div
              key={m.id}
              className={`rounded-[6px] border transition-all ${
                m.ativo
                  ? "border-[#c9a24e]/60 bg-[#1e304a]"
                  : "border-slate-700 bg-[#16284a]/60 hover:border-slate-600"
              }`}
            >
              {/* LINHA PRINCIPAL */}
              <div className="flex items-center gap-4 p-4">
                {/* Indicador ativo */}
                <div className="flex-shrink-0">
                  {m.ativo
                    ? <CheckCircle2 className="w-5 h-5 text-[#c9a24e]" />
                    : <Circle className="w-5 h-5 text-slate-600" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white">{m.nome}</span>
                    {m.ativo && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#c9a24e]/20 text-[#c9a24e] border border-[#c9a24e]/30">
                        ATIVO
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${tipoBadgeStyle(m.tipo)}`}>
                      {tipoLabel(m.tipo)}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                    {tipoDesc(m.tipo)}
                  </p>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Emitir teste */}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isTestando}
                    onClick={() => emitirTeste(m.id)}
                    className="text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 text-xs gap-1.5"
                    title="Emitir PDF de demonstração com este modelo"
                  >
                    {isTestando
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <FlaskConical className="w-3.5 h-3.5" />}
                    Testar
                  </Button>

                  {/* Ativar */}
                  {!m.ativo && (
                    <Button
                      size="sm"
                      disabled={isAtivando}
                      onClick={() => ativar(m.id)}
                      className="bg-[#3D7A7A] hover:bg-[#4a9090] text-white text-xs gap-1.5 border-0"
                    >
                      {isAtivando
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ChevronRight className="w-3.5 h-3.5" />}
                      Ativar
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* RESULTADO DO ÚLTIMO TESTE */}
      {ultimoTeste && (
        <div className={`mt-6 p-4 rounded-[6px] border ${
          ultimoTeste.ok
            ? "border-emerald-700 bg-emerald-950/40"
            : "border-red-700 bg-red-950/40"
        }`}>
          <div className="text-xs font-bold uppercase tracking-widest mb-2 text-slate-400">
            Resultado do Último Teste
          </div>
          {ultimoTeste.ok ? (
            <table className="text-xs w-full">
              <tbody className="divide-y divide-slate-800">
                {[
                  ["Modelo Usado", ultimoTeste.modeloUsado],
                  ["Motor", ultimoTeste.tipoMotor === "faixas_paxter" ? "Faixas Paxter (Puppeteer)" : "Clássico ANVISA (PDF-lib)"],
                  ["Arquivo", ultimoTeste.fileName],
                  ["Tamanho do PDF", `${((ultimoTeste.pdfSizeBytes ?? 0) / 1024).toFixed(0)} KB`],
                ].map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1.5 text-slate-400 pr-4 w-36">{k}</td>
                    <td className="py-1.5 text-white font-medium">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-red-400 text-xs">{ultimoTeste.error}</p>
          )}
        </div>
      )}

      {/* NOTA INFORMATIVA */}
      <div className="mt-8 p-4 rounded-[6px] border border-slate-700 bg-[#16284a]/40 text-xs text-slate-400 space-y-1.5">
        <div className="font-semibold text-slate-300 uppercase tracking-wider text-[10px]">Como Funciona</div>
        <p>
          Todas as telas do sistema que emitem receituários (Prescrição, Emitir ao Cliente, Receituário Automático)
          usam o <span className="text-white font-medium">Motor Único</span> definido aqui.
          Trocar o modelo ativo redireciona instantaneamente todas as emissões para o novo motor — sem reiniciar o servidor.
        </p>
        <p>
          O botão <span className="text-white font-medium">Testar</span> emite um PDF de demonstração
          (paciente fictício, sem validade médica) e mostra o tamanho do PDF gerado.
          Use para validar visualmente antes de ativar em produção.
        </p>
        <p>
          A tela <span className="text-white font-medium">Faixas do Receituário</span> no menu de Configurações
          continua disponível para editar o design visual do modelo Faixas Paxter.
        </p>
      </div>
    </div>
  );
}
