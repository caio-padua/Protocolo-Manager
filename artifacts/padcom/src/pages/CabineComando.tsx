/**
 * Cabine de Comando do CEO — organograma de permissões, mapa de sistemas e fluxos,
 * biblioteca de documentos e documentação de referência. Só o CEO (o servidor recusa os demais).
 */
import { useState } from "react";
import { Crown, Network, Map, FolderOpen, BookOpen } from "lucide-react";
import OrganogramaPermissoes from "./cabine/OrganogramaPermissoes";
import MapaSistemas from "./cabine/MapaSistemas";
import DocumentosCeo from "./cabine/DocumentosCeo";
import DocumentacaoReferencia from "./cabine/DocumentacaoReferencia";

const ABAS = [
  { id: "organograma", nome: "Organograma de permissões", icon: Network },
  { id: "mapa", nome: "Mapa de sistemas e fluxos", icon: Map },
  { id: "documentos", nome: "Documentos", icon: FolderOpen },
  { id: "docs", nome: "Documentação", icon: BookOpen },
] as const;

export default function CabineComando() {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("organograma");
  return (
    <div className="space-y-4 p-4" data-testid="cabine-comando">
      <div className="bevel-3d p-3 flex items-center gap-3">
        <Crown className="h-5 w-5" />
        <div>
          <h1 className="font-semibold uppercase text-base">Cabine de Comando do CEO</h1>
          <p className="text-xs text-muted-foreground">Visão geral da estrutura, permissões e documentos. Acesso exclusivo do CEO.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="tablist">
        {ABAS.map((a) => (
          <button key={a.id} role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)} data-testid={`aba-${a.id}`}
            className={`${aba === a.id ? "bevel-3d" : "concave-3d"} px-3 py-1.5 text-sm inline-flex items-center gap-2`}>
            <a.icon className="h-4 w-4" /> {a.nome}
          </button>
        ))}
      </div>
      {aba === "organograma" && <OrganogramaPermissoes />}
      {aba === "mapa" && <MapaSistemas />}
      {aba === "documentos" && <DocumentosCeo />}
      {aba === "docs" && <DocumentacaoReferencia />}
    </div>
  );
}
