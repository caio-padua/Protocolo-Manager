import { useEffect, useState } from "react";
import { Crown, Lock, Check, X, ArrowLeft, Repeat } from "lucide-react";
import { cabineJson } from "./api";

interface Perfil {
  id: string; ordem: number; nome: string; quem: string;
  responsabilidades: string[]; limites: string[]; exemplo: string; analogia: string;
  dominios: { dominio: string; ler: boolean; escrever: boolean }[];
}
interface Mapa { perfis: Perfil[]; dominios: Record<string, string> }

export default function OrganogramaPermissoes() {
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Perfil | null>(null);

  useEffect(() => {
    cabineJson<Mapa>("/ceo/permissoes/mapa").then(setMapa).catch((e: Error) => setErro(e.message));
  }, []);

  if (erro) return <p role="alert" className="text-red-700 text-sm">{erro}</p>;
  if (!mapa) return <p className="text-sm text-muted-foreground">Carregando organograma…</p>;

  if (aberto) {
    return (
      <div data-testid="perfil-detalhe" className="space-y-4">
        <button onClick={() => setAberto(null)} className="bevel-3d px-3 py-1.5 text-sm inline-flex items-center gap-2" data-testid="voltar-organograma">
          <ArrowLeft className="h-4 w-4" /> Voltar ao organograma
        </button>
        <div className="panel-3d-sub p-4 space-y-3">
          <h3 className="text-lg font-semibold uppercase">{aberto.ordem}. {aberto.nome}</h3>
          <p className="text-sm text-muted-foreground">{aberto.quem}</p>
          <div className="grid md:grid-cols-2 gap-3">
            <div className="concave-3d p-3"><h4 className="font-semibold text-sm mb-1">Responsabilidades</h4><ul className="list-disc pl-5 text-sm">{aberto.responsabilidades.map((t) => <li key={t}>{t}</li>)}</ul></div>
            <div className="concave-3d p-3"><h4 className="font-semibold text-sm mb-1">Limites</h4><ul className="list-disc pl-5 text-sm">{aberto.limites.map((t) => <li key={t}>{t}</li>)}</ul></div>
          </div>
          <div className="concave-3d p-3 text-sm"><b>Exemplo prático: </b>{aberto.exemplo}</div>
          <div className="concave-3d p-3 text-sm"><b>Analogia: </b>{aberto.analogia}</div>
          <div className="concave-3d p-3">
            <h4 className="font-semibold text-sm mb-2">O que o servidor realmente permite (calculado da regra real)</h4>
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>Domínio</th><th>Ler</th><th>Escrever</th></tr></thead>
              <tbody>
                {aberto.dominios.map((d) => (
                  <tr key={d.dominio} data-testid={`dom-${aberto.id}-${d.dominio}`}>
                    <td className="py-1">{mapa.dominios[d.dominio] ?? d.dominio}</td>
                    <td>{d.ler ? <Check className="h-4 w-4 text-emerald-700" aria-label="permitido" /> : <X className="h-4 w-4 text-red-700" aria-label="bloqueado" />}</td>
                    <td>{d.escrever ? <Check className="h-4 w-4 text-emerald-700" aria-label="permitido" /> : <X className="h-4 w-4 text-red-700" aria-label="bloqueado" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="organograma">
      <div className="panel-3d-sub p-4 text-center space-y-1">
        <Crown className="h-6 w-6 mx-auto" />
        <h3 className="font-semibold uppercase">Nível 1 — CEO da plataforma</h3>
        <p className="text-sm text-muted-foreground">Dr. Caio, único master. Acesso global a todas as clínicas.</p>
      </div>
      <div className="concave-3d p-3 text-center text-sm">
        <Repeat className="h-4 w-4 inline mr-2" />
        <b>Seletor de transmutação</b> (planejado, Fatia 3): alterna a VISÃO entre CEO e cada perfil.
        <span className="block text-xs text-muted-foreground">Simulação visual não concede nem retira acesso. A autorização real é sempre do servidor.</span>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {mapa.perfis.map((p) => (
          <button key={p.id} onClick={() => setAberto(p)} data-testid={`perfil-${p.id}`} className="panel-3d-sub p-3 text-left space-y-1 hover:brightness-105">
            <span className="text-xs text-muted-foreground">Perfil {p.ordem}</span>
            <h4 className="font-semibold uppercase text-sm">{p.nome}</h4>
            <p className="text-xs text-muted-foreground">{p.quem}</p>
            <p className="text-xs flex flex-wrap gap-1 pt-1">
              {p.dominios.map((d) => (
                <span key={d.dominio} className="concave-3d px-1.5 py-0.5 inline-flex items-center gap-1">
                  {!d.ler && !d.escrever ? <Lock className="h-3 w-3" /> : null}
                  {mapa.dominios[d.dominio] ?? d.dominio}: {d.escrever ? "ler/escrever" : d.ler ? "só ler" : "bloqueado"}
                </span>
              ))}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
