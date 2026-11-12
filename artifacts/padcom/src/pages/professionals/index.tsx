import {
  useListProfessionals,
  useCreateProfessional,
  useUpdateProfessional,
  useListProfessionalAreas,
  useListProfessionalSpecialties,
} from "@workspace/api-client-react";
import type { Professional } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentosProfissional } from "@/components/profissionais/DocumentosProfissional";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  User,
  Plus,
  Phone,
  Mail,
  Stethoscope,
  Building2,
  Landmark,
  Pencil,
  BadgeCheck,
  ShieldCheck,
  HeartPulse,
  PenLine,
  UploadCloud,
  Camera,
  Link2,
  FileText,
  MapPin,
  CheckCircle2,
  Circle,
  Loader2,
  ChevronDown,
  KeyRound,
  History,
} from "lucide-react";
import { tituloProprio } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";
import { formatCpfInput } from "@/lib/cpf";
import AccountAccessPanel from "./AccountAccessPanel";
import ProfessionalHistoryPanel from "./ProfessionalHistoryPanel";
import { AreasAtuacao, type EstadoAreas } from "./AreasAtuacao";
import { NovaCategoria } from "./NovaCategoria";
import { nomeDaProfissao } from "@/lib/categoria-profissional";
import {
  EmpresaOriginariaSelect,
  EmpresasPrestacaoPanel,
  lerErroDoServidor,
  rotuloDaPosicao,
  textoDoErro,
  useEmpresasOpcoes,
  type EmpresaOpcao,
  type VinculoEmpresaLinha,
} from "./empresas-vinculo";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Foto de Perfil — padrão idêntico ao ClientPhotoCard ─────────────────────
// Foto quadrada (rounded-[6px]), moldura concave-3d, título bevel-3d flutuante.
function PhotoUpload({
  professionalId,
  currentUrl,
  onUploaded,
}: {
  professionalId: number;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Selecione uma imagem", variant: "destructive" });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "Imagem acima de 4 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const t = getCollabToken();
      const r = await fetch(`${BASE}/api/professionals/${professionalId}/photo`, {
        method: "POST",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      if (!r.ok) throw new Error("upload");
      const d = (await r.json()) as { photoUrl?: string };
      const url = d.photoUrl ?? null;
      setPreview(url);
      if (url) onUploaded(url);
      toast({ title: "Foto enviada com sucesso" });
    } catch {
      toast({ title: "Falha ao enviar a foto", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="panel-3d-sub p-5 space-y-5 relative overflow-visible mt-4">
      {/* Título flutuante — mesmo padrão do ClientPhotoCard */}
      <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
        <Camera className="h-3 w-3 text-primary" /> Foto de Perfil
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        {/* Foto quadrada — mesmo padrão do ClientPhotoCard */}
        <div className="concave-3d rounded-[10px] p-1.5 shrink-0">
          <div className="w-28 h-28 rounded-[6px] overflow-hidden bg-muted flex items-center justify-center">
            {preview ? (
              <img src={`${BASE}${preview}`} alt="Foto" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-10 h-10 text-muted-foreground/50" />
            )}
          </div>
        </div>

        <div className="flex-1 w-full space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Anexe uma foto do profissional pelo computador. PNG ou JPEG, máx. 4 MB.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button
            type="button"
            className="btn-3d"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> ENVIANDO...</>
              : <><UploadCloud className="mr-2 h-4 w-4" /> {preview ? "TROCAR FOTO" : "ENVIAR FOTO"}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Assinatura / Rubrica ─────────────────────────────────────────────────────
function SignatureUpload({
  professionalId,
  currentUrl,
  onUploaded,
}: {
  professionalId: number;
  currentUrl: string | null;
  onUploaded: () => void;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function handleFile(file: File) {
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast({ title: "Use PNG ou JPEG", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem acima de 2 MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const t = getCollabToken();
      const r = await fetch(`${BASE}/api/professionals/${professionalId}/signature`, {
        method: "POST",
        headers: t ? { Authorization: `Bearer ${t}` } : {},
        body: fd,
      });
      if (!r.ok) throw new Error("upload");
      const d = (await r.json()) as { signatureUrl?: string };
      setPreview(d.signatureUrl ?? null);
      toast({ title: "Assinatura enviada" });
      onUploaded();
    } catch {
      toast({ title: "Falha ao enviar a assinatura", variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="panel-3d-sub p-5 space-y-5 relative overflow-visible mt-4">
      <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
        <PenLine className="h-3 w-3 text-primary" /> Assinatura / Rubrica
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 pt-2">
        <div className="concave-3d rounded-[10px] p-1.5 shrink-0">
          <div className="w-28 h-16 rounded-[6px] overflow-hidden bg-white flex items-center justify-center">
            {preview ? (
              <img src={`${BASE}${preview}`} alt="Assinatura" className="max-h-full max-w-full object-contain" />
            ) : (
              <PenLine className="w-8 h-8 text-muted-foreground/40" />
            )}
          </div>
        </div>

        <div className="flex-1 w-full space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Fundo branco, PNG ou JPEG, máx. 2 MB.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button
            type="button"
            className="btn-3d"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> ENVIANDO...</>
              : <><UploadCloud className="mr-2 h-4 w-4" /> {preview ? "TROCAR ASSINATURA" : "ENVIAR ASSINATURA"}</>
            }
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Vínculos (clínicas) — agrupamento geográfico ──────────────────
type LinkRow = { id: number; locationId: number; role: string; agendaCalendarId: number | null; empresaId?: number };
type LocRow  = {
  id: number; name: string; type: string; address: string | null;
  // Empresa dona do local (null = Instituto Pádua, empresa padrão 5) e situação do local.
  empresaId?: number | null; active?: boolean;
  // Campos estruturados — data-binders para agrupamento geográfico automático
  zona: string | null; bairro: string | null; cidade: string | null; estado: string | null;
};

// ── Mapeamento de bairros SP → zonas ──────────────────────────────────────────
const SP_ZONES: Record<string, string[]> = {
  "Zona Leste":         ["tatuapé", "mooca", "belém", "penha", "itaquera", "são mateus", "vila formosa", "sapopemba", "aricanduva"],
  "Zona Sul / Moema":   ["moema", "saúde", "vila mariana", "ipiranga", "campo belo", "jabaquara", "santo amaro"],
  "Centro / Higienópolis": ["higienópolis", "bela vista", "república", "sé", "consolação", "cerqueira césar", "liberdade", "santa cecília"],
  "Zona Oeste / Pinheiros": ["pinheiros", "perdizes", "lapa", "alto de pinheiros", "vila madalena", "butantã", "vila sônia"],
  "Zona Norte":         ["santana", "tucuruvi", "pirituba", "casa verde", "cachoeirinha", "mandaqui"],
  "Grande ABC / ABCD":  ["santo andré", "são bernardo", "são caetano", "diadema", "mauá", "ribeirão pires"],
};

const STATE_META: Record<string, { label: string; accent: string }> = {
  SP: { label: "São Paulo",          accent: "border-cyan-400/60" },
  RJ: { label: "Rio de Janeiro",     accent: "border-sky-400/60" },
  DF: { label: "Brasília (DF)",      accent: "border-amber-400/60" },
  MG: { label: "Minas Gerais",       accent: "border-orange-400/60" },
  PB: { label: "Paraíba",            accent: "border-emerald-400/60" },
  RS: { label: "Rio Grande do Sul",  accent: "border-teal-400/60" },
  PR: { label: "Paraná",             accent: "border-green-400/60" },
  SC: { label: "Santa Catarina",     accent: "border-blue-400/60" },
  BA: { label: "Bahia",              accent: "border-yellow-400/60" },
  PE: { label: "Pernambuco",         accent: "border-rose-400/60" },
  GO: { label: "Goiás",              accent: "border-lime-400/60" },
};

function extractGeo(address: string | null): { state: string; city: string; neighborhood: string } {
  if (!address) return { state: "—", city: "—", neighborhood: "" };
  // ex.: "Rua X, 100 - Tatuapé - São Paulo - SP, CEP ..." ou "Av X, Bairro, Cidade - UF"
  const stateMatch = address.match(/\b([A-Z]{2})\b(?:\s*[\-,]\s*[\d\s-]*)?$/);
  const state = stateMatch ? stateMatch[1] : "—";

  const cleanedForCity = address.replace(/\s*[\-,]?\s*[A-Z]{2}\b.*$/, "").trim();
  const parts = cleanedForCity.split(/[\-,]/).map((s) => s.trim()).filter(Boolean);

  // Cidade = penúltima ou última parte substancial (≥3 letras)
  const city = [...parts].reverse().find((p) => p.length >= 3 && /\p{L}/u.test(p) && !/^\d/.test(p)) ?? "—";

  // Bairro = antepenúltima parte substancial diferente da cidade
  const cityLow = city.toLowerCase();
  const neighborhood = [...parts]
    .reverse()
    .find((p) => p.length >= 3 && p.toLowerCase() !== cityLow && !/^\d/.test(p) && p !== city) ?? "";

  return { state, city, neighborhood };
}

// Pirâmide de resolução — nunca retorna "Outras Regiões":
// 1. zona cadastrada (campo direto)
// 2. bairro → lookup canônico SP_ZONES → ou o próprio bairro
// 3. cidade (estruturada ou extraída do address legado)
// 4. estado como último recurso
// 5. "Sem Endereço" apenas se não há absolutamente nada
function resolveZone(loc: LocRow): string {
  if (loc.zona?.trim()) return loc.zona.trim();

  // Tenta bairro estruturado
  const bairro = loc.bairro?.trim() || extractGeo(loc.address).neighborhood;
  if (bairro) {
    const n = bairro.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
    for (const [zone, bairros] of Object.entries(SP_ZONES)) {
      if (bairros.some((b) => n.includes(b.normalize("NFD").replace(/\p{Mn}/gu, "")))) return zone;
    }
    return bairro; // bairro real como agrupador (ex.: "Guaxupé", "Vila Aurora")
  }

  // Cidade estruturada ou extraída do address legado
  const cidade = loc.cidade?.trim() || extractGeo(loc.address).city;
  if (cidade) return cidade;

  // Estado como último recurso antes do placeholder
  if (loc.estado?.trim()) return loc.estado.trim();
  return "Sem Endereço";
}

// ── Linha individual de local ─────────────────────────────────────────────────
function LocRow({ loc, linked, busy, onToggle }: {
  loc: LocRow; linked: boolean; busy: boolean; onToggle: () => void;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 transition-all rounded-none ${linked ? "bevel-3d" : "concave-3d"}`}>
      <div className="flex-shrink-0">
        {linked
          ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          : <Circle className="h-4 w-4 text-muted-foreground/30" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-black uppercase tracking-wide leading-tight text-foreground truncate">
          {loc.name}
        </p>
        {loc.address && loc.address !== loc.type && (
          <p className="text-[9px] font-semibold text-muted-foreground/70 flex items-center gap-1 mt-0.5 truncate">
            <MapPin className="h-2 w-2 shrink-0" />
            {loc.address}
          </p>
        )}
      </div>
      <Switch checked={linked} disabled={busy} onCheckedChange={onToggle} />
    </div>
  );
}

// ── Painel de um estado ───────────────────────────────────────────────────────
function StateBucket({ state, locs, linkedFn, busyFn, onToggle }: {
  state: string;
  locs: LocRow[];
  linkedFn: (id: number) => boolean;
  busyFn: (id: number) => boolean;
  onToggle: (id: number) => void;
}) {
  const meta = STATE_META[state] ?? { label: state === "—" ? "Sem endereço" : state, accent: "border-muted/40" };
  const linkedCount = locs.filter((l) => linkedFn(l.id)).length;
  const [open, setOpen] = useState(true);

  // Para SP: agrupar por zona de bairros
  const renderContent = () => {
    if (state === "SP") {
      const byZone = new Map<string, LocRow[]>();
      for (const loc of locs) {
        const zone = resolveZone(loc);
        byZone.set(zone, [...(byZone.get(zone) ?? []), loc]);
      }
      // Ordenar: zonas com vínculos ativos primeiro
      const sorted = [...byZone.entries()].sort(([, a], [, b]) => {
        const aLinked = a.some((l) => linkedFn(l.id));
        const bLinked = b.some((l) => linkedFn(l.id));
        return bLinked ? 1 : aLinked ? -1 : 0;
      });
      return (
        <div className="space-y-2 pt-1">
          {sorted.map(([zone, zoneLocs]) => {
            const zoneLinked = zoneLocs.filter((l) => linkedFn(l.id)).length;
            return (
              <div key={zone} className="panel-3d-sub px-2 py-2">
                <div className="flex items-center gap-2 mb-1.5 px-1">
                  <MapPin className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">{zone}</span>
                  {zoneLinked > 0 && (
                    <span className="ml-auto text-[9px] font-bold bg-emerald-500/15 text-emerald-600 px-1.5 py-0.5 rounded-sm">
                      {zoneLinked} ativo{zoneLinked > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  {zoneLocs.map((loc) => (
                    <LocRow
                      key={loc.id}
                      loc={loc}
                      linked={linkedFn(loc.id)}
                      busy={busyFn(loc.id)}
                      onToggle={() => onToggle(loc.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    // Outros estados: lista plana
    return (
      <div className="space-y-1.5 pt-1">
        {locs.map((loc) => (
          <LocRow
            key={loc.id}
            loc={loc}
            linked={linkedFn(loc.id)}
            busy={busyFn(loc.id)}
            onToggle={() => onToggle(loc.id)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={`bevel-3d border-l-2 ${meta.accent} overflow-hidden`}>
      {/* Cabeçalho do estado — clicável para recolher */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/5 transition-colors"
      >
        <div className="flex-1 text-left">
          <span className="text-[11px] font-black uppercase tracking-widest text-foreground">{meta.label}</span>
          <span className="ml-2 text-[9px] text-muted-foreground">{locs.length} local{locs.length !== 1 ? "is" : ""}</span>
        </div>
        {linkedCount > 0 && (
          <span className="text-[9px] font-bold bg-emerald-500/15 text-emerald-700 px-2 py-0.5 rounded-sm shrink-0">
            {linkedCount} vinculado{linkedCount > 1 ? "s" : ""}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && <div className="px-2 pb-2">{renderContent()}</div>}
    </div>
  );
}

// Agendas liberadas por empresa: só aparecem as empresas em que o profissional está cadastrado.
function EmpresaAgendas({ vinculo, locs, linkedFn, busyFn, onToggle }: {
  vinculo: VinculoEmpresaLinha;
  locs: LocRow[];
  linkedFn: (id: number) => boolean;
  busyFn: (id: number) => boolean;
  onToggle: (id: number) => void;
}) {
  // Estados com agenda liberada primeiro; depois ordem alfabética.
  const byState = new Map<string, LocRow[]>();
  for (const loc of locs) {
    const state = loc.estado?.toUpperCase().trim() || (extractGeo(loc.address).state);
    byState.set(state, [...(byState.get(state) ?? []), loc]);
  }
  const statesSorted = [...byState.entries()].sort(([sa, la], [sb, lb]) => {
    const aActive = la.some((l) => linkedFn(l.id));
    const bActive = lb.some((l) => linkedFn(l.id));
    if (aActive !== bActive) return aActive ? -1 : 1;
    return sa.localeCompare(sb, "pt-BR");
  });
  const liberadas = locs.filter((l) => linkedFn(l.id)).length;

  return (
    <section className="panel-3d-sub space-y-2 px-2 py-2.5" aria-label={`Agendas de ${vinculo.nome}`}>
      <div className="flex items-center gap-2 px-1">
        <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="truncate text-[11px] font-black uppercase tracking-widest text-foreground">{vinculo.nome}</p>
        <span className="concave-3d shrink-0 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
          {rotuloDaPosicao(vinculo.ordem)}
        </span>
        <span className="ml-auto shrink-0 text-[9px] font-bold uppercase tracking-widest text-muted-foreground tabular-nums">
          {liberadas}/{locs.length} agenda{locs.length === 1 ? "" : "s"}
        </span>
      </div>
      {statesSorted.length === 0 ? (
        <div className="concave-3d px-3 py-3 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Nenhum local cadastrado nesta empresa.
          </p>
        </div>
      ) : (
        statesSorted.map(([state, stateLocs]) => (
          <StateBucket
            key={state}
            state={state}
            locs={stateLocs}
            linkedFn={linkedFn}
            busyFn={busyFn}
            onToggle={onToggle}
          />
        ))
      )}
    </section>
  );
}

function VinculosPanel({ professionalId, empresas, empresasErro, canEdit, onEmpresasChanged }: {
  professionalId: number;
  empresas: EmpresaOpcao[];
  empresasErro: string | null;
  canEdit: boolean;
  onEmpresasChanged: () => void;
}) {
  const { toast } = useToast();
  const [locations, setLocations] = useState<LocRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [vinculos, setVinculos] = useState<VinculoEmpresaLinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);

  const fetchLinks = useCallback(async () => {
    try {
      const authHeaders = { Authorization: `Bearer ${getCollabToken() ?? ""}` };
      const [locRes, lnkRes, empRes] = await Promise.all([
        fetch(`${BASE}/api/locations`),
        fetch(`${BASE}/api/professionals/${professionalId}/locations`, { headers: authHeaders }),
        fetch(`${BASE}/api/professionals/${professionalId}/empresas`, { headers: authHeaders }),
      ]);
      for (const res of [locRes, lnkRes, empRes]) {
        if (!res.ok) {
          const corpo = await res.json().catch(() => null);
          throw new Error(lerErroDoServidor(corpo, "Não foi possível carregar os vínculos.").mensagem);
        }
      }
      const [locs, lnks, emps] = await Promise.all([locRes.json(), lnkRes.json(), empRes.json()]);
      setLocations(locs ?? []);
      setLinks(lnks ?? []);
      setVinculos((emps as { vinculos: VinculoEmpresaLinha[] }).vinculos ?? []);
      setLoadError(null);
    } catch (falha) {
      setLoadError(falha instanceof Error ? falha.message : "Não foi possível carregar os vínculos.");
    } finally {
      setLoading(false);
    }
  }, [professionalId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const isLinked  = useCallback((id: number) => links.some((l) => l.locationId === id), [links]);
  const isBusy    = useCallback((id: number) => toggling === id, [toggling]);

  // Mudou a lista de empresas: o servidor passa a mostrar (ou esconder) as agendas dessas empresas.
  async function aoMudarEmpresas(proximos: VinculoEmpresaLinha[]) {
    setVinculos(proximos);
    onEmpresasChanged();
    await fetchLinks();
  }

  async function toggle(locationId: number) {
    setToggling(locationId);
    try {
      const linked = isLinked(locationId);
      const t = getCollabToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (t) headers.Authorization = `Bearer ${t}`;
      if (linked) {
        const r = await fetch(`${BASE}/api/professionals/${professionalId}/locations/${locationId}`, {
          method: "DELETE", headers,
        });
        if (!r.ok) {
          const erro = lerErroDoServidor(await r.json().catch(() => null), "Não foi possível remover o vínculo.");
          toast({ title: "Falha ao alterar vínculo", description: textoDoErro(erro), variant: "destructive" });
          return;
        }
        setLinks((prev) => prev.filter((l) => l.locationId !== locationId));
        toast({ title: "Vínculo removido" });
      } else {
        const r = await fetch(`${BASE}/api/professionals/${professionalId}/locations`, {
          method: "POST", headers, body: JSON.stringify({ locationId, role: "executor" }),
        });
        if (!r.ok) {
          const erro = lerErroDoServidor(await r.json().catch(() => null), "Não foi possível adicionar o vínculo.");
          toast({ title: "Falha ao alterar vínculo", description: textoDoErro(erro), variant: "destructive" });
          return;
        }
        const row = await r.json() as LinkRow;
        setLinks((prev) => [...prev, row]);
        toast({ title: "Vínculo adicionado" });
      }
    } catch {
      toast({ title: "Falha ao alterar vínculo", description: "Sem resposta do servidor. Nada foi alterado.", variant: "destructive" });
    } finally {
      setToggling(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 py-4">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 panel-3d-sub" />)}
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="concave-3d px-4 py-6 text-center space-y-3">
        <p className="text-[11px] font-bold text-destructive">{loadError}</p>
        <Button type="button" className="btn-3d-soft min-h-10" onClick={() => { setLoading(true); void fetchLinks(); }}>
          TENTAR DE NOVO
        </Button>
      </div>
    );
  }

  // Agendas por empresa: só empresas do profissional; local sem empresa gravada = Instituto Pádua (5).
  const locaisDaEmpresa = (empresaId: number) =>
    locations.filter((l) => (l.empresaId ?? 5) === empresaId && (l.active !== false || isLinked(l.id)));

  return (
    <div className="space-y-3 py-2">
      <EmpresasPrestacaoPanel
        professionalId={professionalId}
        vinculos={vinculos}
        empresas={empresas}
        empresasErro={empresasErro}
        canEdit={canEdit}
        onChange={(proximos) => { void aoMudarEmpresas(proximos); }}
      />
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Agendas liberadas — só das empresas acima. O vínculo é salvo imediatamente ao acionar o switch.
      </p>
      {vinculos.map((vinculo) => (
        <EmpresaAgendas
          key={vinculo.empresaId}
          vinculo={vinculo}
          locs={locaisDaEmpresa(vinculo.empresaId)}
          linkedFn={isLinked}
          busyFn={isBusy}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

// ─── Constantes ───────────────────────────────────────────────────────────────
type ProfType = "medico" | "nao_medico";

const CATEGORY_OPTIONS = [
  { value: "medico", label: "Médico(a)" },
  { value: "enfermagem", label: "Enfermagem" },
  { value: "recepcao", label: "Recepção" },
  { value: "administrativo", label: "Administrativo" },
  { value: "financeiro", label: "Financeiro" },
  { value: "outro", label: "Outro" },
];

const SERVICE_OPTIONS = [
  { value: "presencial", label: "Presencial" },
  { value: "online", label: "Online" },
];

const EMPTY_FORM = {
  name: "",
  professionalType: "medico" as ProfType,
  category: "" as string,
  role: "",
  areaId: "" as string,
  specialtyId: "" as string,
  registrationCouncil: "",
  registrationNumber: "",
  phone: "",
  email: "",
  secondaryEmail: "",
  unit: "",
  complemento: "",
  serviceTypes: ["presencial"] as string[],
  active: true,
  nurseType: "" as string,
  cpf: "",
  cnpj: "",
  homeServiceFeePerVisit: "" as string,
  contractType: "" as string,
  // Empresa de origem (posição 1 do vínculo empresarial); "" = ainda não escolhida.
  empresaOriginariaId: "" as string,
};

type FormState = typeof EMPTY_FORM;

// Campos de vínculo empresarial que o servidor acrescenta à lista de profissionais (dono da plataforma).
type ProfissionalComEmpresas = Professional & {
  empresaOriginariaId?: number | null;
  empresaOriginariaNome?: string | null;
  empresasVinculadas?: VinculoEmpresaLinha[];
};

// Iniciais (máx. 2 letras) para fallback no card
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Professionals() {
  const [location, navigate] = useLocation();
  const { data: professionals, isLoading, refetch } = useListProfessionals();
  const { data: areas, refetch: refetchAreas, isFetching: carregandoCategorias } = useListProfessionalAreas();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [estadoAreas, setEstadoAreas] = useState<EstadoAreas>({ ids: [], disponivel: false, alterado: false });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [sessionProfessionalId, setSessionProfessionalId] = useState<number | null>(null);
  const [sessionIsPlatformOwner, setSessionIsPlatformOwner] = useState(false);
  const [sessionIdentityLoaded, setSessionIdentityLoaded] = useState(false);
  const selfAccessLaunchHandled = useRef(false);
  const isSelfEditing = editingId !== null && editingId === sessionProfessionalId;
  const canViewProfessionalHistory =
    isSelfEditing || (sessionIdentityLoaded && sessionIsPlatformOwner);
  const [editingSignatureUrl, setEditingSignatureUrl] = useState<string | null>(null);
  const [editingPhotoUrl, setEditingPhotoUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dados");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Vínculo originário gravado hoje (para enviar só quando mudar e para mostrar o nome mesmo se a empresa estiver inativa).
  const [originariaGravada, setOriginariaGravada] = useState<{ id: string; nome: string | null }>({ id: "", nome: null });
  const { empresas, carregando: empresasCarregando, erro: empresasErro } = useEmpresasOpcoes();

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const areasForType = useMemo(
    () => (areas ?? []).filter((a) => a.professionalType === form.professionalType),
    [areas, form.professionalType],
  );

  const { data: allSpecialties, isLoading: carregandoEspecialidades, isError: erroEspecialidades } = useListProfessionalSpecialties();
  const areaIdNum = form.areaId ? Number(form.areaId) : undefined;
  const specialties = useMemo(
    () => (allSpecialties ?? []).filter((s) => s.areaId === areaIdNum),
    [allSpecialties, areaIdNum],
  );

  useEffect(() => {
    if (!open) return;
    if (!carregandoCategorias && form.areaId && !areasForType.some((a) => String(a.id) === form.areaId)) {
      setForm((f) => ({ ...f, areaId: "", specialtyId: "" }));
    }
  }, [open, form.professionalType, areasForType, form.areaId, carregandoCategorias]);

  const createMutation = useCreateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profissional cadastrado!" });
        closeDialog();
        refetch();
      },
      onError: (error) => {
        const erro = lerErroDoServidor(error, "Não foi possível cadastrar o profissional.");
        toast({ title: "Erro ao cadastrar", description: textoDoErro(erro), variant: "destructive" });
      },
    },
  });

  const updateMutation = useUpdateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Alterações salvas!" });
        closeDialog();
        refetch();
      },
      onError: (error) => {
        const erro = lerErroDoServidor(error, "Não foi possível salvar as alterações.");
        toast({ title: "Erro ao salvar", description: textoDoErro(erro), variant: "destructive" });
      },
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setEditingSignatureUrl(null);
    setEditingPhotoUrl(null);
    setActiveTab("dados");
    setForm(EMPTY_FORM);
    setOriginariaGravada({ id: "", nome: null });
  };

  const openCreate = () => {
    setEstadoAreas({ ids: [], disponivel: false, alterado: false });
    setEditingId(null);
    setActiveTab("dados");
    setForm(EMPTY_FORM);
    setOriginariaGravada({ id: "", nome: null });
    setOpen(true);
  };

  const openEdit = (pro: Professional) => {
    setEstadoAreas({ ids: [], disponivel: false, alterado: false });
    setEditingId(pro.id);
    setActiveTab("dados");
    const comEmpresas = pro as ProfissionalComEmpresas;
    const originariaId = comEmpresas.empresaOriginariaId != null ? String(comEmpresas.empresaOriginariaId) : "";
    setOriginariaGravada({ id: originariaId, nome: comEmpresas.empresaOriginariaNome ?? null });
    const p = pro as Professional & {
      nurseType?: string | null;
      cpf?: string | null;
      cnpj?: string | null;
      homeServiceFeePerVisit?: number | null;
      contractType?: string | null;
      signatureUrl?: string | null;
      photoUrl?: string | null;
    };
    setEditingSignatureUrl(p.signatureUrl ?? null);
    setEditingPhotoUrl(p.photoUrl ?? null);
    setForm({
      name: pro.name ?? "",
      professionalType: (pro.professionalType as ProfType) || "medico",
      category: (pro as Professional & { category?: string | null }).category ?? "medico",
      role: (pro as Professional & { role?: string | null }).role ?? "",
      areaId: pro.areaId ? String(pro.areaId) : "",
      specialtyId: pro.specialtyId ? String(pro.specialtyId) : "",
      registrationCouncil: pro.registrationCouncil ?? "",
      registrationNumber: pro.registrationNumber ?? "",
      phone: pro.phone ?? "",
      email: pro.email ?? "",
      secondaryEmail: pro.secondaryEmail ?? "",
      unit: pro.unit ?? "",
      complemento: (pro as any).complemento ?? "",
      serviceTypes: pro.serviceTypes?.length ? pro.serviceTypes : ["presencial"],
      active: pro.active ?? true,
      nurseType: p.nurseType ?? "",
      cpf: formatCpfInput(p.cpf ?? ""),
      cnpj: p.cnpj ?? "",
      homeServiceFeePerVisit: p.homeServiceFeePerVisit != null ? String(p.homeServiceFeePerVisit) : "",
      contractType: p.contractType ?? "",
      empresaOriginariaId: originariaId,
    });
    setOpen(true);
  };

  useEffect(() => {
    let mounted = true;
    const token = getCollabToken();
    if (!token) {
      setSessionIdentityLoaded(true);
      return () => { mounted = false; };
    }
    void fetch("/api/collaborator/me", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível validar a conta da sessão.");
        const result = await response.json() as {
          professional?: { id?: number; isPlatformOwner?: boolean };
        };
        if (mounted && Number.isInteger(result.professional?.id)) {
          setSessionProfessionalId(result.professional!.id!);
          setSessionIsPlatformOwner(result.professional?.isPlatformOwner === true);
        }
      })
      .catch(() => {
        if (mounted) {
          setSessionProfessionalId(null);
          setSessionIsPlatformOwner(false);
        }
      })
      .finally(() => {
        if (mounted) setSessionIdentityLoaded(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("selfAccess") === "1";
    if (
      !requested ||
      selfAccessLaunchHandled.current ||
      !sessionIdentityLoaded ||
      isLoading ||
      !professionals
    ) return;
    selfAccessLaunchHandled.current = true;
    const ownProfessional = sessionProfessionalId == null
      ? undefined
      : professionals.find((professional) => professional.id === sessionProfessionalId);
    if (ownProfessional) {
      openEdit(ownProfessional);
    } else {
      toast({
        title: "Cadastro próprio não localizado nesta clínica",
        description: "A ficha não foi aberta. A sessão não recebeu acesso a outro cadastro.",
        variant: "destructive",
      });
    }
    navigate("/professionals", { replace: true });
  }, [
    location,
    navigate,
    professionals,
    isLoading,
    sessionIdentityLoaded,
    sessionProfessionalId,
    sessionIsPlatformOwner,
    toast,
  ]);

  const toggleService = (value: string) => {
    setForm((f) => {
      const has = f.serviceTypes.includes(value);
      const next = has ? f.serviceTypes.filter((s) => s !== value) : [...f.serviceTypes, value];
      return { ...f, serviceTypes: next.length ? next : f.serviceTypes };
    });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    if (!editingId && !form.email.trim()) {
      toast({
        title: "E-mail principal obrigatório",
        description: "Use o e-mail da conta Google que será vinculada ao profissional.",
        variant: "destructive",
      });
      return;
    }
    if (!editingId && !form.empresaOriginariaId) {
      toast({
        title: "Clínica vinculada é obrigatória",
        description: "Escolha a empresa de origem do profissional na aba DADOS.",
        variant: "destructive",
      });
      return;
    }
    if (!form.category) {
      toast({ title: "Perfil de acesso é obrigatório", variant: "destructive" });
      return;
    }
    if (!form.areaId) {
      toast({ title: "Categoria profissional é obrigatória", variant: "destructive" });
      return;
    }
    if (!form.specialtyId && (carregandoEspecialidades || erroEspecialidades || specialties.length > 0)) {
      toast({
        title: form.professionalType === "medico" ? "Especialidade é obrigatória" : "Especialização é obrigatória",
        variant: "destructive",
      });
      return;
    }

    const isNurse = form.category === "enfermagem";
    const body = {
      name: form.name.trim(),
      professionalType: form.professionalType,
      category: form.category,
      role: form.role.trim() || null,
      areaId: Number(form.areaId),
      specialtyId: form.specialtyId ? Number(form.specialtyId) : null,
      ...(estadoAreas.disponivel && (!editingId || estadoAreas.alterado) ? { workAreaIds: estadoAreas.ids } : {}),
      registrationCouncil: form.registrationCouncil.trim() || null,
      registrationNumber: form.registrationNumber.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim(),
      secondaryEmail: form.secondaryEmail.trim() || null,
      cpf: form.cpf.trim() || null,
      unit: form.unit.trim() || null,
      complemento: form.complemento.trim() || null,
      serviceTypes: form.serviceTypes,
      active: form.active,
      // Número (nunca texto): o servidor recusa texto. Na edição só vai quando a empresa mudou.
      ...(form.empresaOriginariaId && (!editingId || form.empresaOriginariaId !== originariaGravada.id)
        ? { empresaOriginariaId: Number(form.empresaOriginariaId) }
        : {}),
      ...(isNurse ? {
        nurseType: form.nurseType || null,
        cnpj: form.cnpj.trim() || null,
        homeServiceFeePerVisit: form.homeServiceFeePerVisit ? Number(form.homeServiceFeePerVisit) : null,
        contractType: form.contractType || null,
      } : {
        nurseType: null, cnpj: null,
        homeServiceFeePerVisit: null, contractType: null,
      }),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: body });
    } else {
      createMutation.mutate({ data: body });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const councilPlaceholder = form.professionalType === "medico" ? "CRM" : "COREN / CRP / CRN";

  // A categoria profissional é independente do perfil de acesso legado.
  const grouped = useMemo(() => {
    if (!professionals) return [];
    const map = new Map<string, { category: string; label: string; items: typeof professionals }>();
    for (const p of professionals) {
      const key = p.areaId ? String(p.areaId) : "nao-informada";
      if (!map.has(key)) map.set(key, {
        category: key,
        label: p.areaName ? nomeDaProfissao(p.areaName) : (p.areaId ? "Categoria indisponível" : "Categoria não informada"),
        items: [],
      });
      map.get(key)!.items.push(p);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [professionals]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ─── Cabeçalho ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Corpo Clínico</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mt-1">
            Profissionais · Vínculos · Agendas
          </p>
        </div>

        {/* ─── Dialog de Cadastro / Edição ─── */}
        <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : closeDialog())}>
          <DialogTrigger asChild>
            <Button className="btn-3d" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              NOVO PROFISSIONAL
            </Button>
          </DialogTrigger>

          <DialogContent className="panel-3d flex h-[92dvh] max-h-[92dvh] max-w-2xl flex-col overflow-hidden sm:h-[92vh] sm:max-h-[92vh]">
            <DialogHeader className="shrink-0 pb-2 border-b border-border/30">
              <DialogTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                {editingId ? `Editar — ${form.name || "Profissional"}` : "Cadastrar Profissional"}
              </DialogTitle>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3 flex min-h-0 flex-1 flex-col">
              {/* Painel superior saliente — barra de abas como botões físicos */}
              <TabsList className="panel-3d-sub w-full shrink-0 border-none h-auto p-2 flex flex-wrap gap-2 mb-4">
                {[
                  { value: "dados", label: "DADOS", icon: User },
                  ...(isSelfEditing
                    ? [{ value: "acesso", label: "ACESSO", icon: KeyRound }]
                    : []),
                  { value: "vinculos", label: "VÍNCULOS", icon: Link2, disabled: !editingId },
                  { value: "documentos", label: "DOCUMENTOS", icon: FileText, disabled: !editingId },
                  ...(canViewProfessionalHistory
                    ? [{ value: "historico", label: "HISTÓRICO", icon: History }]
                    : []),
                ].map(({ value, label, icon: Icon, disabled }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && setActiveTab(value)}
                    className={`${activeTab === value ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/60"} flex items-center gap-1.5 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
                  >
                    <Icon className="h-3 w-3" /> {label}
                  </button>
                ))}
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              {/* ── Aba: Dados ── */}
              <TabsContent value="dados" className="space-y-4 focus:outline-none">

                {/* Identidade */}
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                  — Identidade
                </p>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Nome Completo *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="Nome completo do profissional"
                    className="field-engraved"
                  />
                </div>

                <EmpresaOriginariaSelect
                  value={form.empresaOriginariaId}
                  onChange={(id) => set("empresaOriginariaId", id)}
                  empresas={empresas}
                  carregando={empresasCarregando}
                  erro={empresasErro}
                  valorAtual={originariaGravada.id}
                  nomeAtual={originariaGravada.nome}
                  disabled={!!editingId && !sessionIsPlatformOwner}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Perfil de acesso *</Label>
                    <Select value={form.category} onValueChange={(v) => v && set("category", v)}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">Controle de acesso existente; não define a categoria profissional.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cargo / Título</Label>
                    <Input
                      value={form.role}
                      onChange={(e) => set("role", e.target.value)}
                      placeholder="Ex.: Recepcionista, Gerente"
                      className="field-engraved"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {(["medico", "nao_medico"] as ProfType[]).map((t) => {
                      const active = form.professionalType === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, professionalType: t, areaId: "", specialtyId: "" }))}
                          className={`${active ? "bevel-3d text-primary" : "concave-3d text-muted-foreground"} flex items-center justify-center gap-2 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest transition-all`}
                        >
                          {t === "medico" ? <Stethoscope className="h-3.5 w-3.5" /> : <HeartPulse className="h-3.5 w-3.5" />}
                          {t === "medico" ? "Médico(a)" : "Não-médico"}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Registro profissional */}
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 pt-2">
                  — Registro Profissional
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoria profissional *</Label>
                    <Select value={form.areaId} onValueChange={(v) => setForm((f) => ({ ...f, areaId: v, specialtyId: "" }))}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {areasForType.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{nomeDaProfissao(a.name)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {sessionIsPlatformOwner && <NovaCategoria onCreated={async (category) => {
                      await refetchAreas();
                      setForm((f) => ({ ...f, professionalType: category.professionalType, areaId: String(category.id), specialtyId: "" }));
                    }} />}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {form.professionalType === "medico" ? "Especialidade" : "Especialização"}{specialties.length > 0 ? " *" : ""}
                    </Label>
                    <Select value={form.specialtyId} onValueChange={(v) => set("specialtyId", v)} disabled={!form.areaId}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder={form.areaId ? (specialties.length ? "Selecione" : "Nenhuma cadastrada") : "Escolha a categoria"} /></SelectTrigger>
                      <SelectContent>
                        {(specialties ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <AreasAtuacao key={editingId ?? "novo"} professionalId={editingId} canEdit={sessionIsPlatformOwner} onChange={setEstadoAreas}
                  categorySlug={areas?.find((a) => String(a.id) === form.areaId)?.slug ?? null} />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Conselho</Label>
                    <Input
                      value={form.registrationCouncil}
                      onChange={(e) => set("registrationCouncil", e.target.value)}
                      placeholder={councilPlaceholder}
                      className="field-engraved"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Número de registro</Label>
                    <Input
                      value={form.registrationNumber}
                      onChange={(e) => set("registrationNumber", e.target.value)}
                      placeholder="SP 123456"
                      className="field-engraved"
                    />
                  </div>
                </div>

                {/* Contato */}
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 pt-2">
                  — Contato
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Telefone / WhatsApp</Label>
                    <Input
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      placeholder="(11) 99999-9999"
                      className="field-engraved"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail principal — login e Google</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="nome@clinica.com.br"
                      className="field-engraved"
                      required={!editingId}
                      disabled={editingId !== null && (!sessionIdentityLoaded || isSelfEditing)}
                    />
                    {isSelfEditing ? (
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        Para proteger sua conta, altere este e-mail na aba “Acesso”.
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail secundário — contato opcional</Label>
                    <Input
                      type="email"
                      value={form.secondaryEmail}
                      onChange={(e) => set("secondaryEmail", e.target.value)}
                      placeholder="contato@clinica.com.br"
                      className="field-engraved"
                      disabled={editingId !== null && (!sessionIdentityLoaded || isSelfEditing)}
                    />
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      Não pode ser usado para entrar nem recuperar a senha.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CPF do profissional</Label>
                    <Input
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={14}
                      value={form.cpf}
                      onChange={(e) => set("cpf", formatCpfInput(e.target.value))}
                      placeholder="000.000.000-00"
                      className="field-engraved"
                      disabled={editingId !== null && (!sessionIdentityLoaded || isSelfEditing)}
                    />
                  </div>
                </div>

                {/* Localização */}
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 pt-2">
                  — Localização &amp; Atendimento
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Local informado anteriormente</Label>
                    <Input
                      value={form.unit}
                      onChange={(e) => set("unit", e.target.value)}
                      placeholder="Informação complementar, se houver"
                      className="field-engraved"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Complemento</Label>
                    <Input
                      value={form.complemento}
                      onChange={(e) => set("complemento", e.target.value)}
                      placeholder="Sala 01, Andar 2…"
                      className="field-engraved"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipos de atendimento</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {SERVICE_OPTIONS.map((opt) => (
                      <div key={opt.value} className="concave-3d flex items-center gap-3 px-3 py-2.5">
                        <Switch checked={form.serviceTypes.includes(opt.value)} onCheckedChange={() => toggleService(opt.value)} />
                        <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Dados de Enfermagem */}
                {form.category === "enfermagem" && (
                  <>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-accent/80 pt-2">
                      — Dados de Enfermagem
                    </p>
                    <div className="space-y-4 p-4 bevel-3d" style={{ borderLeft: "3px solid hsl(187 72% 44%)" }}>
                      <div className="concave-3d flex items-center gap-3 px-4 py-3" data-testid="toggle-home-nurse">
                        <Switch
                          id="toggle-home-nurse"
                          checked={form.nurseType === "home"}
                          onCheckedChange={(v) => set("nurseType", v ? "home" : "fisica")}
                          aria-label="Home Nurse"
                        />
                        <Label htmlFor="toggle-home-nurse" className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                          {form.nurseType === "home"
                            ? "Home Nurse — atende no endereço do paciente (Home Care)"
                            : "Home Nurse desligado — enfermagem fixa na clínica"}
                        </Label>
                      </div>

                      {form.nurseType === "home" && (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CNPJ MEI (opcional)</Label>
                            <Input value={form.cnpj} onChange={(e) => set("cnpj", e.target.value)} placeholder="00.000.000/0001-00" className="field-engraved" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Taxa por visita (R$)</Label>
                            <Input type="number" min="0" step="0.01" value={form.homeServiceFeePerVisit} onChange={(e) => set("homeServiceFeePerVisit", e.target.value)} placeholder="250,00" className="field-engraved" />
                          </div>
                        </div>
                      )}

                      {(form.nurseType === "home" || form.nurseType === "fisica") && (
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tipo de contrato</Label>
                          <div className="grid grid-cols-3 gap-2">
                            {([{ value: "clt", label: "CLT" }, { value: "pj", label: "PJ" }, { value: "mei", label: "MEI" }] as const).map((opt) => {
                              const active = form.contractType === opt.value;
                              return (
                                <button key={opt.value} type="button" onClick={() => set("contractType", opt.value)}
                                  className={`${active ? "bevel-3d text-primary" : "concave-3d text-muted-foreground"} px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all`}>
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Status */}
                <div className="concave-3d flex items-center gap-3 px-4 py-3">
                  <Switch checked={form.active} onCheckedChange={(v) => set("active", v)} />
                  <Label className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {form.active ? "Ativo — disponível para agenda" : "Inativo — não aparece na agenda"}
                  </Label>
                </div>

                {!editingId && (
                  <p className="text-[10px] text-muted-foreground font-medium text-center">
                    Salve para liberar as abas <strong>VÍNCULOS</strong> e <strong>DOCUMENTOS</strong>.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="acesso" className="space-y-4 focus:outline-none">
                {isSelfEditing && editingId !== null ? (
                  <AccountAccessPanel
                    key={editingId}
                    professionalId={editingId}
                    onIdentityUpdated={(identity) => {
                      setForm((current) => ({
                        ...current,
                        email: identity.email ?? "",
                        secondaryEmail: identity.secondaryEmail ?? "",
                        cpf: formatCpfInput(identity.cpf ?? ""),
                      }));
                    }}
                  />
                ) : null}
              </TabsContent>

              <TabsContent value="historico" className="focus:outline-none">
                {canViewProfessionalHistory && editingId !== null ? (
                  <ProfessionalHistoryPanel
                    key={editingId}
                    professionalId={editingId}
                    isOwnRecord={isSelfEditing}
                    canViewOtherRecords={sessionIsPlatformOwner}
                  />
                ) : null}
              </TabsContent>

              {/* ── Aba: Vínculos ── */}
              <TabsContent value="vinculos" className="focus:outline-none">
                {editingId
                  ? <VinculosPanel
                      key={editingId}
                      professionalId={editingId}
                      empresas={empresas}
                      empresasErro={empresasErro}
                      canEdit={sessionIdentityLoaded && sessionIsPlatformOwner}
                      onEmpresasChanged={() => { void refetch(); }}
                    />
                  : <div className="concave-3d px-4 py-6 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Salve o profissional primeiro.</p>
                    </div>
                }
              </TabsContent>

              {/* ── Aba: Documentos ── */}
              <TabsContent value="documentos" className="focus:outline-none pb-4">
                {editingId ? (
                  <>
                    <PhotoUpload
                      professionalId={editingId}
                      currentUrl={editingPhotoUrl}
                      onUploaded={(url) => { setEditingPhotoUrl(url); refetch(); }}
                    />
                    <SignatureUpload
                      professionalId={editingId}
                      currentUrl={editingSignatureUrl}
                      onUploaded={() => refetch()}
                    />
                    <DocumentosProfissional professionalId={editingId} />
                  </>
                ) : (
                  <div className="concave-3d px-4 py-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Salve o profissional primeiro.</p>
                  </div>
                )}
              </TabsContent>
              </div>

              {activeTab === "dados" ? (
                <div className="flex shrink-0 justify-end gap-3 border-t border-border/30 bg-background/95 pt-3">
                  <Button className="btn-3d-soft min-h-10" onClick={closeDialog}>CANCELAR</Button>
                  <Button className="btn-3d min-h-10" onClick={handleSubmit} disabled={isPending}>
                    {isPending ? "SALVANDO..." : editingId ? "SALVAR ALTERAÇÕES" : "CADASTRAR"}
                  </Button>
                </div>
              ) : null}
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* ─── Grid de profissionais agrupados por categoria ─── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-44 panel-3d-sub" />)}
        </div>
      ) : !professionals?.length ? (
        <Card className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="concave-3d p-6">
              <User className="h-10 w-10 text-muted-foreground opacity-30" />
            </div>
            <p className="text-base font-black uppercase tracking-tight text-primary">Nenhum profissional cadastrado</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, label, items }) => (
            /* ── Cada categoria num painel bevel-3d elevado ── */
            <div key={category} className="bevel-3d p-5 space-y-4">

              {/* Cabeçalho dentro do painel */}
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-foreground">
                  {label}
                </p>
                <span className="concave-3d px-2 py-0.5 text-[9px] font-black text-muted-foreground tabular-nums">
                  {items.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((pro) => {
                  const p = pro as typeof pro & {
                    nurseType?: string | null;
                    photoUrl?: string | null;
                  };
                  const specialtyLabel = pro.specialtyName ?? pro.specialty ?? "";
                  const registro = [pro.registrationCouncil, pro.registrationNumber].filter(Boolean).join(" ") || pro.crm || "";
                  const isActive = pro.active ?? true;
                  const ini = initials(pro.name ?? "?");
                  const hasPhoto = !!p.photoUrl;
                  const hasContact = !!(pro.unit || pro.phone || pro.email);
                  const empresasDoPro = pro as ProfissionalComEmpresas;
                  const empresaOrigem = empresasDoPro.empresaOriginariaNome ?? null;
                  const outrasEmpresas = (empresasDoPro.empresasVinculadas ?? []).filter((v) => v.papel === "adicional");

                  return (
                    <Card key={pro.id} className="panel-3d-sub overflow-hidden neon-hover transition-all">
                      <CardContent className="p-3 space-y-2.5">

                        {/* ── TOP BAR: foto + nome + LED + editar ── */}
                        <div className="flex items-center gap-2.5">

                          {/* Foto quadrada — padrão ClientPhotoCard */}
                          <div className="concave-3d rounded-[6px] p-1 shrink-0">
                            <div className="w-10 h-10 rounded-[4px] overflow-hidden bg-muted flex items-center justify-center">
                              {hasPhoto ? (
                                <img
                                  src={`${BASE}${p.photoUrl}`}
                                  alt={pro.name ?? ""}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-[12px] font-black uppercase text-muted-foreground">
                                  {ini}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Nome + especialidade */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-base font-bold leading-tight text-primary tracking-tight line-clamp-1">
                              {tituloProprio(pro.name ?? "")}
                            </h3>
                            {specialtyLabel && (
                              <p className="text-[10px] font-semibold text-muted-foreground truncate">
                                {specialtyLabel}
                              </p>
                            )}
                          </div>

                          {/* LED respiratório de status — quadrado 9×9px */}
                          <div
                            className={`paxter-led paxter-led-breathe shrink-0 ${isActive ? "paxter-led-green" : "paxter-led-amber"}`}
                            title={isActive ? "Ativo" : "Inativo"}
                          />

                          {/* Botão editar — bevel-3d (saliente, como botão físico) */}
                          <button
                            type="button"
                            onClick={() => openEdit(pro)}
                            className="bevel-3d shrink-0 p-1.5 text-muted-foreground hover:text-primary transition-colors active:scale-95"
                            aria-label={`Editar ${pro.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* ── IDENTIDADE: registro + HOME NURSE ── */}
                        <div className="flex flex-wrap items-center gap-1.5">
                          {registro && (
                            <div className="concave-3d px-2 py-0.5 flex items-center gap-1 text-[10px] font-bold text-foreground">
                              <BadgeCheck className="h-3 w-3 text-primary shrink-0" />
                              {registro}
                            </div>
                          )}
                          {p.nurseType === "home" && (
                            <div className="bevel-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-accent">
                              HOME NURSE
                            </div>
                          )}
                        </div>

                        {/* ── EMPRESAS: originária + "+N" adicionais — slots fixos, vazio = "—" / "+0" ── */}
                        <div className="flex items-center gap-1.5">
                          <div
                            className="concave-3d flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1"
                            title="Clínica vinculada"
                          >
                            <Landmark className="h-3 w-3 shrink-0 text-primary" />
                            <span className="truncate text-[10px] font-black uppercase tracking-wide text-foreground">
                              {empresaOrigem ?? "—"}
                            </span>
                          </div>
                          <div
                            className="bevel-3d shrink-0 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-primary tabular-nums"
                            title={outrasEmpresas.length
                              ? `Também presta serviço em: ${outrasEmpresas.map((v) => v.nome).join(" · ")}`
                              : "Sem empresas adicionais"}
                            aria-label={`Empresas adicionais: ${outrasEmpresas.length}`}
                          >
                            +{outrasEmpresas.length}
                          </div>
                        </div>

                        {/* ── CAMPOS DE CONTATO em concave-3d — sempre visível (slot vazio = "—") ── */}
                        <div className="concave-3d px-3 py-2 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <Building2 className="h-3 w-3 text-primary shrink-0" />
                            <span className="truncate">{pro.unit || "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="truncate">{pro.phone || "—"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{pro.email || "—"}</span>
                          </div>
                        </div>

                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
