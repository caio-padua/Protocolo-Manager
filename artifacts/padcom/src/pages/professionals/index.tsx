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
} from "lucide-react";
import { tituloProprio } from "@/lib/utils";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { getCollabToken } from "@/lib/collab-auth";

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
type LinkRow = { id: number; locationId: number; role: string; agendaCalendarId: number | null };
type LocRow  = {
  id: number; name: string; type: string; address: string | null;
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

const STATE_META: Record<string, { icon: string; label: string; accent: string }> = {
  SP: { icon: "🌆", label: "São Paulo",   accent: "border-cyan-400/60" },
  RJ: { icon: "🏖️", label: "Rio de Janeiro", accent: "border-sky-400/60" },
  DF: { icon: "🏛️", label: "Brasília (DF)", accent: "border-amber-400/60" },
  MG: { icon: "⛏️", label: "Minas Gerais", accent: "border-orange-400/60" },
  PB: { icon: "🌴", label: "Paraíba",     accent: "border-emerald-400/60" },
  RS: { icon: "🧉", label: "Rio Grande do Sul", accent: "border-teal-400/60" },
  PR: { icon: "🌲", label: "Paraná",      accent: "border-green-400/60" },
  SC: { icon: "🏔️", label: "Santa Catarina", accent: "border-blue-400/60" },
  BA: { icon: "☀️", label: "Bahia",       accent: "border-yellow-400/60" },
  PE: { icon: "🎭", label: "Pernambuco",  accent: "border-rose-400/60" },
  GO: { icon: "🌿", label: "Goiás",       accent: "border-lime-400/60" },
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
  const meta = STATE_META[state] ?? { icon: "📍", label: state === "—" ? "Sem endereço" : state, accent: "border-muted/40" };
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
        <span className="text-base leading-none">{meta.icon}</span>
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

function VinculosPanel({ professionalId }: { professionalId: number }) {
  const { toast } = useToast();
  const [locations, setLocations] = useState<LocRow[]>([]);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  const fetchLinks = useCallback(async () => {
    const [locRes, lnkRes] = await Promise.all([
      fetch(`${BASE}/api/locations`),
      fetch(`${BASE}/api/professionals/${professionalId}/locations`),
    ]);
    const [locs, lnks] = await Promise.all([locRes.json(), lnkRes.json()]);
    setLocations(locs ?? []);
    setLinks(lnks ?? []);
    setLoading(false);
  }, [professionalId]);

  useEffect(() => { fetchLinks(); }, [fetchLinks]);

  const isLinked  = useCallback((id: number) => links.some((l) => l.locationId === id), [links]);
  const isBusy    = useCallback((id: number) => toggling === id, [toggling]);

  async function toggle(locationId: number) {
    setToggling(locationId);
    try {
      const linked = isLinked(locationId);
      const t = getCollabToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (t) headers.Authorization = `Bearer ${t}`;
      if (linked) {
        await fetch(`${BASE}/api/professionals/${professionalId}/locations/${locationId}`, {
          method: "DELETE", headers,
        });
        setLinks((prev) => prev.filter((l) => l.locationId !== locationId));
        toast({ title: "Vínculo removido" });
      } else {
        const r = await fetch(`${BASE}/api/professionals/${professionalId}/locations`, {
          method: "POST", headers, body: JSON.stringify({ locationId, role: "executor" }),
        });
        if (!r.ok) throw new Error("link");
        const row = await r.json() as LinkRow;
        setLinks((prev) => [...prev, row]);
        toast({ title: "Vínculo adicionado" });
      }
    } catch {
      toast({ title: "Falha ao alterar vínculo", variant: "destructive" });
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

  // ── Agrupar por estado — usa campo direto `loc.estado` (data-binder) ─────
  const byState = new Map<string, LocRow[]>();
  for (const loc of locations) {
    const state = loc.estado?.toUpperCase().trim() || (extractGeo(loc.address).state);
    byState.set(state, [...(byState.get(state) ?? []), loc]);
  }

  // Ordem: estados com vínculos ativos primeiro, depois alfabético
  const statesSorted = [...byState.entries()].sort(([sa, la], [sb, lb]) => {
    const aActive = la.some((l) => isLinked(l.id));
    const bActive = lb.some((l) => isLinked(l.id));
    if (aActive !== bActive) return aActive ? -1 : 1;
    return sa.localeCompare(sb, "pt-BR");
  });

  return (
    <div className="space-y-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        O vínculo é salvo imediatamente ao acionar o switch.
      </p>
      {statesSorted.map(([state, locs]) => (
        <StateBucket
          key={state}
          state={state}
          locs={locs}
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
  category: "medico" as string,
  role: "",
  areaId: "" as string,
  specialtyId: "" as string,
  registrationCouncil: "",
  registrationNumber: "",
  phone: "",
  email: "",
  unit: "",
  serviceTypes: ["presencial"] as string[],
  active: true,
  nurseType: "" as string,
  cpf: "",
  cnpj: "",
  homeServiceFeePerVisit: "" as string,
  contractType: "" as string,
};

type FormState = typeof EMPTY_FORM;

// Iniciais (máx. 2 letras) para fallback no card
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function Professionals() {
  const { data: professionals, isLoading, refetch } = useListProfessionals();
  const { data: areas } = useListProfessionalAreas();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSignatureUrl, setEditingSignatureUrl] = useState<string | null>(null);
  const [editingPhotoUrl, setEditingPhotoUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("dados");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const areasForType = useMemo(
    () => (areas ?? []).filter((a) => a.professionalType === form.professionalType),
    [areas, form.professionalType],
  );

  const { data: allSpecialties } = useListProfessionalSpecialties();
  const areaIdNum = form.areaId ? Number(form.areaId) : undefined;
  const specialties = useMemo(
    () => (allSpecialties ?? []).filter((s) => s.areaId === areaIdNum),
    [allSpecialties, areaIdNum],
  );

  useEffect(() => {
    if (!open) return;
    if (form.areaId && !areasForType.some((a) => String(a.id) === form.areaId)) {
      setForm((f) => ({ ...f, areaId: "", specialtyId: "" }));
    }
  }, [open, form.professionalType, areasForType, form.areaId]);

  const createMutation = useCreateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Profissional cadastrado!" });
        closeDialog();
        refetch();
      },
      onError: () => toast({ title: "Erro ao cadastrar", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateProfessional({
    mutation: {
      onSuccess: () => {
        toast({ title: "Alterações salvas!" });
        closeDialog();
        refetch();
      },
      onError: () => toast({ title: "Erro ao salvar", variant: "destructive" }),
    },
  });

  const closeDialog = () => {
    setOpen(false);
    setEditingId(null);
    setEditingSignatureUrl(null);
    setEditingPhotoUrl(null);
    setActiveTab("dados");
    setForm(EMPTY_FORM);
  };

  const openCreate = () => {
    setEditingId(null);
    setActiveTab("dados");
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (pro: Professional) => {
    setEditingId(pro.id);
    setActiveTab("dados");
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
      unit: pro.unit ?? "",
      serviceTypes: pro.serviceTypes?.length ? pro.serviceTypes : ["presencial"],
      active: pro.active ?? true,
      nurseType: p.nurseType ?? "",
      cpf: p.cpf ?? "",
      cnpj: p.cnpj ?? "",
      homeServiceFeePerVisit: p.homeServiceFeePerVisit != null ? String(p.homeServiceFeePerVisit) : "",
      contractType: p.contractType ?? "",
    });
    setOpen(true);
  };

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
    if (!form.areaId) {
      toast({ title: "Área é obrigatória", variant: "destructive" });
      return;
    }
    if (!form.specialtyId) {
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
      specialtyId: Number(form.specialtyId),
      registrationCouncil: form.registrationCouncil.trim() || null,
      registrationNumber: form.registrationNumber.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      unit: form.unit.trim() || null,
      serviceTypes: form.serviceTypes,
      active: form.active,
      ...(isNurse ? {
        nurseType: form.nurseType || null,
        cpf: form.cpf.trim() || null,
        cnpj: form.cnpj.trim() || null,
        homeServiceFeePerVisit: form.homeServiceFeePerVisit ? Number(form.homeServiceFeePerVisit) : null,
        contractType: form.contractType || null,
      } : {
        nurseType: null, cpf: null, cnpj: null,
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

  // Agrupamento por categoria para exibição ordenada
  const grouped = useMemo(() => {
    if (!professionals) return [];
    const order = ["medico", "enfermagem", "recepcao", "administrativo", "financeiro", "outro"];
    const map = new Map<string, typeof professionals>();
    for (const p of professionals) {
      const cat = (p as typeof p & { category?: string }).category ?? "outro";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(p);
    }
    return order.filter((c) => map.has(c)).map((c) => ({ category: c, items: map.get(c)! }));
  }, [professionals]);

  const catLabel = (c: string) => CATEGORY_OPTIONS.find((o) => o.value === c)?.label ?? c;

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

          <DialogContent className="panel-3d max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader className="pb-2 border-b border-border/30">
              <DialogTitle className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                {editingId ? `Editar — ${form.name || "Profissional"}` : "Cadastrar Profissional"}
              </DialogTitle>
            </DialogHeader>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3">
              {/* Painel superior saliente — barra de abas como botões físicos */}
              <TabsList className="panel-3d-sub w-full border-none h-auto p-2 flex gap-2 mb-5">
                {[
                  { value: "dados", label: "DADOS", icon: User },
                  { value: "vinculos", label: "VÍNCULOS", icon: Link2, disabled: !editingId },
                  { value: "documentos", label: "DOCUMENTOS", icon: FileText, disabled: !editingId },
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Categoria funcional</Label>
                    <Select value={form.category} onValueChange={(v) => v && set("category", v)}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {CATEGORY_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Área *</Label>
                    <Select value={form.areaId} onValueChange={(v) => setForm((f) => ({ ...f, areaId: v, specialtyId: "" }))}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {areasForType.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {form.professionalType === "medico" ? "Especialidade *" : "Especialização *"}
                    </Label>
                    <Select value={form.specialtyId} onValueChange={(v) => set("specialtyId", v)} disabled={!form.areaId}>
                      <SelectTrigger className="field-engraved"><SelectValue placeholder={form.areaId ? "Selecione" : "Escolha a área"} /></SelectTrigger>
                      <SelectContent>
                        {(specialties ?? []).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

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

                <div className="grid grid-cols-2 gap-4">
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
                    <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">E-mail profissional</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                      placeholder="nome@clinica.com.br"
                      className="field-engraved"
                    />
                  </div>
                </div>

                {/* Localização */}
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 pt-2">
                  — Localização &amp; Atendimento
                </p>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unidade principal</Label>
                  <Input
                    value={form.unit}
                    onChange={(e) => set("unit", e.target.value)}
                    placeholder="Clínica Principal"
                    className="field-engraved"
                  />
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
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Regime de atuação</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: "fisica", label: "Física (fixa na clínica)" },
                            { value: "home", label: "Home / Itinerante" },
                          ] as const).map((opt) => {
                            const active = form.nurseType === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => set("nurseType", opt.value)}
                                className={`${active ? "bevel-3d text-primary" : "concave-3d text-muted-foreground"} px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all text-left`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">CPF (contratos / NF)</Label>
                        <Input value={form.cpf} onChange={(e) => set("cpf", e.target.value)} placeholder="000.000.000-00" className="field-engraved" />
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

                <div className="flex justify-end gap-3 pt-2">
                  <Button className="btn-3d-soft" onClick={closeDialog}>CANCELAR</Button>
                  <Button className="btn-3d" onClick={handleSubmit} disabled={isPending}>
                    {isPending ? "SALVANDO..." : editingId ? "SALVAR ALTERAÇÕES" : "CADASTRAR"}
                  </Button>
                </div>

                {!editingId && (
                  <p className="text-[10px] text-muted-foreground font-medium text-center">
                    Salve para liberar as abas <strong>VÍNCULOS</strong> e <strong>DOCUMENTOS</strong>.
                  </p>
                )}
              </TabsContent>

              {/* ── Aba: Vínculos ── */}
              <TabsContent value="vinculos" className="focus:outline-none">
                {editingId
                  ? <VinculosPanel professionalId={editingId} />
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
                  </>
                ) : (
                  <div className="concave-3d px-4 py-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Salve o profissional primeiro.</p>
                  </div>
                )}
              </TabsContent>
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
          {grouped.map(({ category, items }) => (
            /* ── Cada categoria num painel bevel-3d elevado ── */
            <div key={category} className="bevel-3d p-5 space-y-4">

              {/* Cabeçalho dentro do painel */}
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-foreground">
                  {catLabel(category)}
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
