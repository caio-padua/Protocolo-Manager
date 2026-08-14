import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import {
  ShoppingCart,
  Search,
  AlertTriangle,
  PackageSearch,
  Wallet,
  Send,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Mail,
} from "lucide-react";
import {
  Field,
  type Alimento,
  type Cliente,
  UNIDADE_COMPRA_OPTIONS,
  CATEGORIA_COMPRA_OPTIONS,
  unidadeLabel,
  categoriaLabel,
  formatBRL,
  parseApiError,
} from "./shared";

// -------------------------------------------------------------------------------
// ABA "LISTA DE COMPRAS" (Task 234) — a partir de um cardapio ja emitido
// (dieta_prescricao), soma as quantidades de cada alimento ao longo de 7/30 dias
// e calcula o custo estimado usando o preco do catalogo. Traz embutido, como
// sub-secao, o editor de precos do catalogo (fonte dos calculos).
// -------------------------------------------------------------------------------

interface PrescricaoResumo {
  id: number;
  objetivo: string | null;
  status: string;
  caloriasAlvo: number | null;
  createdAt: string;
}

interface ListaCompraItem {
  alimentoId: number;
  nome: string;
  categoriaCompra: string | null;
  quantidadeTotalG: number;
  unidadeCompra: string;
  unidadesComprar: number;
  precoUnitario: number;
  custoItem: number;
}
interface ListaSemPreco {
  alimentoId: number;
  nome: string;
  quantidadeTotalG: number;
  motivo: string;
}
interface ListaSemCatalogo {
  alimentoNome: string;
  quantidadeTotalG: number;
  motivo: string;
}
interface ListaCompras {
  prescricaoId: number;
  clientId: number;
  clientName: string;
  dias: number;
  itens: ListaCompraItem[];
  itensSemPreco: ListaSemPreco[];
  itensSemCatalogo: ListaSemCatalogo[];
  custoTotalEstimado: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

interface EnvioResultado {
  canal: string;
  sent: boolean;
  mock?: boolean;
  error?: string;
}

export default function ListaDeCompras() {
  const { toast } = useToast();
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [prescricaoId, setPrescricaoId] = useState<number | null>(null);
  const [dias, setDias] = useState<7 | 30>(7);
  const [canaisEnvio, setCanaisEnvio] = useState<Set<"WHATSAPP" | "EMAIL">>(new Set(["WHATSAPP"]));
  const [ultimoEnvio, setUltimoEnvio] = useState<EnvioResultado[] | null>(null);

  const { data: clientes } = useQuery<Cliente[]>({
    queryKey: ["dieta", "clientes"],
    queryFn: async () => {
      const r = await fetch("/api/clients");
      if (!r.ok) throw new Error("Falha ao carregar clientes");
      const d = await r.json();
      return Array.isArray(d) ? d : (d.data ?? []);
    },
  });

  const { data: prescricoes, isLoading: carregandoPrescricoes } = useQuery<PrescricaoResumo[]>({
    queryKey: ["dieta", "prescricoes", clienteId],
    queryFn: async () => {
      const r = await fetch(`/api/dieta/prescricoes?clientId=${clienteId}`);
      if (!r.ok) throw new Error("Falha ao carregar cardápios do cliente");
      return r.json();
    },
    enabled: !!clienteId,
  });

  const {
    data: lista,
    isLoading: carregandoLista,
    isError: erroLista,
    error: erroListaObj,
  } = useQuery<ListaCompras>({
    queryKey: ["dieta", "lista-compras", prescricaoId, dias],
    queryFn: async () => {
      const r = await fetch(`/api/dieta/prescricoes/${prescricaoId}/lista-compras?dias=${dias}`);
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao gerar lista de compras"));
      return r.json();
    },
    enabled: !!prescricaoId,
  });

  const enviarLista = useMutation({
    mutationFn: async (canais: string[]) => {
      const r = await fetch(`/api/dieta/prescricoes/${prescricaoId}/enviar-lista-compras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dias, canais }),
      });
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao enviar lista"));
      return r.json() as Promise<{ ok: boolean; resultados: EnvioResultado[] }>;
    },
    onSuccess: (data) => {
      setUltimoEnvio(data.resultados);
      if (data.ok) {
        toast({ title: "Lista enviada!", description: "O paciente recebeu a lista de compras." });
      } else {
        toast({ title: "Envio falhou", description: "Nenhum canal entregou a mensagem.", variant: "destructive" });
      }
    },
    onError: (e: Error) => {
      toast({ title: "Erro ao enviar", description: e.message, variant: "destructive" });
    },
  });

  function toggleCanal(canal: "WHATSAPP" | "EMAIL") {
    setCanaisEnvio((prev) => {
      const next = new Set(prev);
      if (next.has(canal)) {
        if (next.size > 1) next.delete(canal);
      } else {
        next.add(canal);
      }
      return next;
    });
    setUltimoEnvio(null);
  }

  function handleClienteChange(id: number | null) {
    setClienteId(id);
    setPrescricaoId(null);
    setUltimoEnvio(null);
  }

  return (
    <div className="space-y-5">
      <div className="concave-3d px-3 py-1.5 inline-flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 text-primary" />
        <span className="text-[10px] font-black uppercase tracking-widest text-primary">Lista de compras do cardápio</span>
      </div>

      <div className="panel-3d p-4 grid gap-3 sm:grid-cols-3">
        <Field label="Paciente">
          <PaxterClientSelector clientes={clientes ?? []} value={clienteId} onChange={handleClienteChange} placeholder="Selecionar cliente…" />
        </Field>

        <Field label="Cardápio (cardápios já montados na aba Montar Cardápio)">
          <Select
            value={prescricaoId ? String(prescricaoId) : ""}
            onValueChange={(v) => setPrescricaoId(Number(v))}
            disabled={!clienteId || carregandoPrescricoes || (prescricoes ?? []).length === 0}
          >
            <SelectTrigger className="field-engraved">
              <SelectValue placeholder={!clienteId ? "Selecione um paciente primeiro" : carregandoPrescricoes ? "Carregando…" : (prescricoes ?? []).length === 0 ? "Nenhum cardápio para este paciente" : "Selecionar cardápio…"} />
            </SelectTrigger>
            <SelectContent>
              {(prescricoes ?? []).map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  #{p.id} — {formatDate(p.createdAt)} — {p.status}{p.caloriasAlvo ? ` — ${p.caloriasAlvo} kcal` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Período">
          <div className="flex gap-2">
            <Button type="button" size="sm" className={dias === 7 ? "btn-3d flex-1" : "btn-3d-soft flex-1"} onClick={() => setDias(7)}>
              7 dias
            </Button>
            <Button type="button" size="sm" className={dias === 30 ? "btn-3d flex-1" : "btn-3d-soft flex-1"} onClick={() => setDias(30)}>
              30 dias
            </Button>
          </div>
        </Field>
      </div>

      {!prescricaoId && (
        <div className="panel-3d flex flex-col items-center justify-center gap-2 p-10 text-center">
          <ShoppingCart className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Selecione um paciente e um cardápio já montado para gerar a lista de compras.</p>
        </div>
      )}

      {prescricaoId && carregandoLista && (
        <div className="space-y-2">
          <Skeleton className="h-10 panel-3d-sub" />
          <Skeleton className="h-40 panel-3d-sub" />
        </div>
      )}

      {prescricaoId && erroLista && (
        <div className="panel-3d p-4 flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {(erroListaObj as Error)?.message ?? "Falha ao gerar lista de compras"}
        </div>
      )}

      {lista && !carregandoLista && (
        <div className="space-y-4">
          <div className="screen-3d p-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {lista.clientName} — {lista.dias} dias
              </p>
              <p className="text-2xl font-black text-primary flex items-center gap-2">
                <Wallet className="h-5 w-5" /> {formatBRL(lista.custoTotalEstimado)}
              </p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">custo total estimado</p>
            </div>
            <div className="text-[11px] text-muted-foreground text-right">
              {lista.itens.length} item(ns) com preço
              {lista.itensSemPreco.length > 0 && <><br />{lista.itensSemPreco.length} sem preço cadastrado</>}
              {lista.itensSemCatalogo.length > 0 && <><br />{lista.itensSemCatalogo.length} sem vínculo no catálogo</>}
            </div>
          </div>

          {/* — Painel de envio — */}
          <div className="panel-3d p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" /> Enviar ao paciente
            </p>
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => toggleCanal("WHATSAPP")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  canaisEnvio.has("WHATSAPP") ? "btn-3d" : "btn-3d-soft"
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
              </button>
              <button
                type="button"
                onClick={() => toggleCanal("EMAIL")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                  canaisEnvio.has("EMAIL") ? "btn-3d" : "btn-3d-soft"
                }`}
              >
                <Mail className="h-3.5 w-3.5" /> E-mail
              </button>
              <Button
                size="sm"
                className="btn-3d ml-auto"
                disabled={enviarLista.isPending || canaisEnvio.size === 0}
                onClick={() => {
                  setUltimoEnvio(null);
                  enviarLista.mutate([...canaisEnvio]);
                }}
              >
                {enviarLista.isPending ? "Enviando…" : "Enviar lista"}
              </Button>
            </div>

            {/* Resultado do último envio */}
            {ultimoEnvio && (
              <div className="space-y-1 pt-1">
                {ultimoEnvio.map((r) => (
                  <div key={r.canal} className="flex items-center gap-2 text-xs">
                    {r.sent ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                    )}
                    <span className={r.sent ? "text-emerald-600" : "text-destructive"}>
                      {r.canal === "WHATSAPP" ? "WhatsApp" : "E-mail"}:{" "}
                      {r.sent
                        ? r.mock
                          ? "enviado (modo teste)"
                          : "entregue com sucesso"
                        : r.error ?? "falha na entrega"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {lista.itens.length > 0 && (
            <div className="panel-3d p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="concave-3d text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="text-left px-3 py-2">Alimento</th>
                    <th className="text-left px-3 py-2">Categoria</th>
                    <th className="text-right px-3 py-2">Qtd. total</th>
                    <th className="text-right px-3 py-2">Comprar</th>
                    <th className="text-right px-3 py-2">Preço unit.</th>
                    <th className="text-right px-3 py-2">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.itens.map((it) => (
                    <tr key={it.alimentoId} className="border-t border-border/40">
                      <td className="px-3 py-2 font-medium">{it.nome}</td>
                      <td className="px-3 py-2 text-muted-foreground">{categoriaLabel(it.categoriaCompra)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{it.quantidadeTotalG.toLocaleString("pt-BR")} g</td>
                      <td className="px-3 py-2 text-right font-bold">
                        {it.unidadesComprar.toLocaleString("pt-BR")} {unidadeLabel(it.unidadeCompra)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatBRL(it.precoUnitario)}</td>
                      <td className="px-3 py-2 text-right font-black text-primary">{formatBRL(it.custoItem)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {lista.itensSemPreco.length > 0 && (
            <div className="panel-3d p-4 space-y-2 border-l-4 border-amber-500/60">
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Sem preço cadastrado — cadastre no catálogo abaixo
              </p>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                {lista.itensSemPreco.map((it) => (
                  <li key={it.alimentoId}>{it.nome} — {it.quantidadeTotalG.toLocaleString("pt-BR")} g no período</li>
                ))}
              </ul>
            </div>
          )}

          {lista.itensSemCatalogo.length > 0 && (
            <div className="panel-3d p-4 space-y-2 border-l-4 border-muted-foreground/40">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <PackageSearch className="h-3.5 w-3.5" /> Sem vínculo no catálogo (item de texto livre no cardápio)
              </p>
              <ul className="text-sm text-muted-foreground space-y-0.5">
                {lista.itensSemCatalogo.map((it, idx) => (
                  <li key={idx}>{it.alimentoNome} — {it.quantidadeTotalG.toLocaleString("pt-BR")} g no período</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <CatalogoPrecos />
    </div>
  );
}

function CatalogoPrecos() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const { data: alimentos, isLoading } = useQuery<Alimento[]>({
    queryKey: ["dieta", "alimentos"],
    queryFn: async () => {
      const r = await fetch("/api/dieta/catalogo/alimentos");
      if (!r.ok) throw new Error("Falha ao carregar alimentos");
      return r.json();
    },
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Partial<Alimento> }) => {
      const r = await fetch(`/api/dieta/catalogo/alimentos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(await parseApiError(r, "Falha ao atualizar alimento"));
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dieta", "alimentos"] });
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível salvar", description: e.message, variant: "destructive" });
    },
  });

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = alimentos ?? [];
    if (!q) return base;
    return base.filter((a) => a.nome.toLowerCase().includes(q));
  }, [alimentos, busca]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[11px] font-black uppercase tracking-widest text-primary">
          Preços do catálogo ({alimentos?.length ?? 0} alimentos)
        </h2>
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar alimento…" className="field-engraved pl-8" />
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Preço, unidade de compra e categoria são editáveis aqui a qualquer momento — a lista de compras acima usa estes valores.
      </p>

      {isLoading ? (
        <Skeleton className="h-64 panel-3d-sub" />
      ) : (
        <div className="panel-3d p-0 max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="concave-3d text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                <th className="text-left px-3 py-2">Alimento</th>
                <th className="text-left px-3 py-2 w-36">Categoria</th>
                <th className="text-right px-3 py-2 w-32">Preço médio</th>
                <th className="text-left px-3 py-2 w-36">Unidade compra</th>
                <th className="text-right px-3 py-2 w-32">Equiv. (g)</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <AlimentoPrecoRow key={a.id} alimento={a} onSave={(patch) => atualizar.mutate({ id: a.id, patch })} />
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground text-sm">
                    Nenhum alimento encontrado para "{busca}".
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AlimentoPrecoRow({ alimento, onSave }: { alimento: Alimento; onSave: (patch: Partial<Alimento>) => void }) {
  const [preco, setPreco] = useState(alimento.precoMedio != null ? String(alimento.precoMedio) : "");
  const [equivG, setEquivG] = useState(alimento.unidadeCompraEquivalenteG != null ? String(alimento.unidadeCompraEquivalenteG) : "");

  function commitPreco() {
    const v = preco ? parseFloat(preco.replace(",", ".")) : null;
    if (v !== alimento.precoMedio) onSave({ precoMedio: v });
  }
  function commitEquiv() {
    const v = equivG ? parseFloat(equivG.replace(",", ".")) : null;
    if (v !== alimento.unidadeCompraEquivalenteG) onSave({ unidadeCompraEquivalenteG: v });
  }

  return (
    <tr className="border-t border-border/40">
      <td className="px-3 py-1.5">
        <div className="font-medium">{alimento.nome}</div>
        <div className="text-[10px] text-muted-foreground">{alimento.codigo}{alimento.grupo ? ` · ${alimento.grupo}` : ""}</div>
      </td>
      <td className="px-3 py-1.5">
        <Select value={alimento.categoriaCompra ?? ""} onValueChange={(v) => onSave({ categoriaCompra: v })}>
          <SelectTrigger className="field-engraved h-8 text-xs">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIA_COMPRA_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-1.5">
        <Input
          value={preco}
          onChange={(e) => setPreco(e.target.value)}
          onBlur={commitPreco}
          placeholder="0,00"
          className="field-engraved h-8 text-xs text-right"
        />
      </td>
      <td className="px-3 py-1.5">
        <Select value={alimento.unidadeCompra ?? ""} onValueChange={(v) => onSave({ unidadeCompra: v })}>
          <SelectTrigger className="field-engraved h-8 text-xs">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {UNIDADE_COMPRA_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-1.5">
        <Input
          value={equivG}
          onChange={(e) => setEquivG(e.target.value)}
          onBlur={commitEquiv}
          placeholder="g"
          className="field-engraved h-8 text-xs text-right"
        />
      </td>
    </tr>
  );
}
