import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Syringe, CircleDot, Droplets, TestTube, Activity, FlaskConical, Library } from "lucide-react";

type Row = Record<string, unknown>;

interface ColumnDef {
  key: string;
  label: string;
}

interface CatalogDef {
  id: string;
  label: string;
  endpoint: string;
  icon: typeof Syringe;
  columns: ColumnDef[];
  searchKeys: string[];
  categoryKey?: string;
}

const CATALOGS: CatalogDef[] = [
  {
    id: "injetaveis",
    label: "Injetáveis",
    endpoint: "/api/catalogos/injetaveis",
    icon: Syringe,
    categoryKey: "eixoIntegrativo",
    searchKeys: ["nomeExibicao", "nomeAmpola", "codigoPadcom", "classificacao", "eixoIntegrativo"],
    columns: [
      { key: "codigoPadcom", label: "Código" },
      { key: "nomeExibicao", label: "Nome" },
      { key: "dosagem", label: "Dosagem" },
      { key: "volume", label: "Volume" },
      { key: "via", label: "Via" },
      { key: "classificacao", label: "Classificação" },
      { key: "eixoIntegrativo", label: "Eixo" },
    ],
  },
  {
    id: "implantes",
    label: "Implantes",
    endpoint: "/api/catalogos/implantes",
    icon: CircleDot,
    categoryKey: "via",
    searchKeys: ["nomeImplante", "substanciaAtiva", "codigoPadcom", "indicacao"],
    columns: [
      { key: "codigoPadcom", label: "Código" },
      { key: "nomeImplante", label: "Implante" },
      { key: "substanciaAtiva", label: "Substância ativa" },
      { key: "dosagem", label: "Dosagem" },
      { key: "unidade", label: "Unidade" },
      { key: "tempoAcao", label: "Tempo de ação" },
      { key: "indicacao", label: "Indicação" },
    ],
  },
  {
    id: "endovenosos",
    label: "Endovenosos",
    endpoint: "/api/catalogos/endovenosos",
    icon: Droplets,
    categoryKey: "eixoIntegrativo",
    searchKeys: ["nomeExibicao", "nomeSoro", "codigoPadcom", "classificacao", "eixoIntegrativo"],
    columns: [
      { key: "codigoPadcom", label: "Código" },
      { key: "nomeExibicao", label: "Soro / Nome" },
      { key: "dosagem", label: "Dosagem" },
      { key: "volume", label: "Volume" },
      { key: "via", label: "Via" },
      { key: "frequenciaPadrao", label: "Frequência" },
      { key: "eixoIntegrativo", label: "Eixo" },
    ],
  },
  {
    id: "exames",
    label: "Exames",
    endpoint: "/api/catalogos/exames",
    icon: TestTube,
    categoryKey: "grupoPrincipal",
    searchKeys: ["nomeExame", "codigoExame", "grupoPrincipal", "subgrupo", "modalidade", "materialOuSetor"],
    columns: [
      { key: "codigoExame", label: "Código" },
      { key: "nomeExame", label: "Exame" },
      { key: "grupoPrincipal", label: "Grupo" },
      { key: "modalidade", label: "Modalidade" },
      { key: "materialOuSetor", label: "Material / Setor" },
      { key: "finalidadePrincipal", label: "Finalidade" },
      { key: "preparo", label: "Preparo" },
    ],
  },
  {
    id: "analitos",
    label: "Analitos",
    endpoint: "/api/catalogos/analitos",
    icon: Activity,
    categoryKey: "grupo",
    searchKeys: ["nome", "codigo", "grupo", "observacaoClinica"],
    columns: [
      { key: "codigo", label: "Código" },
      { key: "nome", label: "Analito" },
      { key: "grupo", label: "Grupo" },
      { key: "unidadePadraoIntegrativa", label: "Unidade" },
      { key: "tercoExcelente", label: "Terço excelente" },
      { key: "observacaoClinica", label: "Observação clínica" },
    ],
  },
  {
    id: "formulas",
    label: "Fórmulas",
    endpoint: "/api/catalogos/formulas",
    icon: FlaskConical,
    categoryKey: "area",
    searchKeys: ["identificador", "codigoPadcom", "conteudo", "area", "funcao"],
    columns: [
      { key: "codigoPadcom", label: "Código" },
      { key: "identificador", label: "Identificador" },
      { key: "conteudo", label: "Conteúdo (ativos)" },
      { key: "area", label: "Área" },
      { key: "funcao", label: "Função" },
      { key: "viaAdministracao", label: "Via" },
      { key: "formaFarmaceutica", label: "Forma" },
    ],
  },
];

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value).trim();
  return s.length ? s : "—";
}

function CatalogTable({ def }: { def: CatalogDef }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("__all__");

  const { data, isLoading, isError } = useQuery<Row[]>({
    queryKey: ["catalogo", def.id],
    queryFn: async () => {
      const r = await fetch(def.endpoint);
      if (!r.ok) throw new Error(`Falha ao carregar ${def.label}`);
      return r.json();
    },
  });

  const categories = useMemo(() => {
    if (!data || !def.categoryKey) return [];
    const set = new Set<string>();
    for (const row of data) {
      const v = row[def.categoryKey];
      if (v !== null && v !== undefined && String(v).trim()) set.add(String(v).trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [data, def.categoryKey]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((row) => {
      if (def.categoryKey && category !== "__all__") {
        if (String(row[def.categoryKey] ?? "").trim() !== category) return false;
      }
      if (!q) return true;
      return def.searchKeys.some((k) => String(row[k] ?? "").toLowerCase().includes(q));
    });
  }, [data, search, category, def]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar em ${def.label.toLowerCase()}...`}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-3">
          {def.categoryKey && categories.length > 0 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="outline" className="whitespace-nowrap text-xs font-semibold">
            {isLoading ? "..." : `${filtered.length} de ${data?.length ?? 0}`}
          </Badge>
        </div>
      </div>

      {isError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          Não foi possível carregar este catálogo. Verifique se o servidor está ativo.
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60">
                {def.columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className="whitespace-nowrap text-xs font-bold uppercase tracking-wide"
                  >
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={def.columns.length} className="h-24 text-center text-sm text-muted-foreground">
                    Nenhum item encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row, idx) => (
                  <TableRow key={(row.id as number) ?? idx}>
                    {def.columns.map((c) => (
                      <TableCell key={c.key} className="align-top text-sm">
                        {cellText(row[c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export default function Catalogos() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Library className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Central de Catálogos</h1>
          <p className="text-sm text-muted-foreground">
            Todos os catálogos do sistema em um só lugar: injetáveis, implantes, endovenosos, exames, analitos e fórmulas.
          </p>
        </div>
      </div>

      <Tabs defaultValue={CATALOGS[0].id} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {CATALOGS.map((c) => {
            const Icon = c.icon;
            return (
              <TabsTrigger key={c.id} value={c.id} className="gap-1.5">
                <Icon className="h-4 w-4" />
                {c.label}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {CATALOGS.map((c) => (
          <TabsContent key={c.id} value={c.id}>
            <CatalogTable def={c} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
