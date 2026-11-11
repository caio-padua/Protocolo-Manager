import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  AlertCircle,
  Building2,
  Check,
  ChevronDown,
  Factory,
  FileText,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import * as ApiClient from "@workspace/api-client-react";
import type { Fornecedor, FornecedorEntrada } from "@workspace/api-client-react";
import { COLLAB_EVENT, collabAuthHeaders } from "@/lib/collab-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const fornecedorSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(200, "Use até 200 caracteres."),
  razaoSocial: z.string().max(500, "Use até 500 caracteres."),
  cnpj: z.string().max(500, "Use até 500 caracteres."),
  endereco: z.string().max(500, "Use até 500 caracteres."),
  telefone: z.string().max(500, "Use até 500 caracteres."),
  email: z.string().max(500, "Use até 500 caracteres."),
  site: z.string().max(500, "Use até 500 caracteres."),
  instagram: z.string().max(500, "Use até 500 caracteres."),
  fabricante: z.enum(["sim", "nao", "desconhecido"]),
  fornecedor: z.enum(["sim", "nao", "desconhecido"]),
  fonte: z.string().max(500, "Use até 500 caracteres."),
  ativo: z.boolean(),
});

type FormValues = z.infer<typeof fornecedorSchema>;
type FiltroStatus = "todos" | "ativos" | "inativos";
let fornecedorMountSequence = 0;

const FORMULARIO_VAZIO: FormValues = {
  nome: "",
  razaoSocial: "",
  cnpj: "",
  endereco: "",
  telefone: "",
  email: "",
  site: "",
  instagram: "",
  fabricante: "desconhecido",
  fornecedor: "desconhecido",
  fonte: "",
  ativo: true,
};

function statusErro(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

function mensagemServidor(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const data = (error as { data?: unknown }).data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data === "object" && data !== null) {
    const detail = data as Record<string, unknown>;
    for (const key of ["message", "detail", "error", "title"]) {
      if (typeof detail[key] === "string" && (detail[key] as string).trim()) {
        return (detail[key] as string).trim();
      }
    }
  }
  return null;
}

function mensagemErro(error: unknown, contexto: "lista" | "criacao" | "atualizacao"): string {
  const status = statusErro(error);
  if (status === 401) return "Sua sessão não foi reconhecida. Entre novamente e tente de novo; os campos preenchidos continuam nesta tela.";
  if (status === 403) return "Seu acesso não permite consultar ou alterar fornecedores desta clínica. Nenhuma alteração foi aplicada.";
  if (status === 404) {
    if (contexto === "atualizacao") {
      const detail = mensagemServidor(error);
      return detail
        ? `O registro não foi encontrado para atualização e nada foi sobrescrito. Resposta do serviço: ${detail}`
        : "Este registro não foi encontrado para atualização. A rota respondeu à solicitação, mas o cadastro pode ter sido removido em outra sessão; seus campos permanecem preservados.";
    }
    const detail = mensagemServidor(error);
    return detail
      ? `A rota de fornecedores não está disponível nesta versão do serviço. Resposta do serviço: ${detail}`
      : "A rota de fornecedores não está disponível neste servidor. A tela não consegue confirmar os dados ou concluir esta ação; tente novamente após a atualização segura do serviço.";
  }
  if (status === 409) {
    const detail = mensagemServidor(error);
    const conflictText = detail ?? (error instanceof Error ? error.message : "");
    const serverSaysDuplicate = /duplicad|já existe|ja existe|nome.*(em uso|cadastrad)/i.test(conflictText);
    const serverSaysVersion = /vers[aã]o|version|concorr[eê]ncia|alterad[oa].*sess[aã]o/i.test(conflictText);
    if (serverSaysDuplicate) return `Conflito de nome duplicado: ${detail ?? conflictText} Seus campos foram preservados; revise o cadastro antes de tentar novamente.`;
    if (serverSaysVersion) return `Conflito de versão: ${detail ?? conflictText} Seus campos foram preservados; atualize e compare os dados antes de tentar novamente.`;
    if (detail) return `Conflito informado pelo serviço: ${detail} Seus campos foram preservados; revise a mensagem antes de tentar novamente.`;
    return "O serviço recusou a alteração por conflito: pode haver um nome já cadastrado ou uma versão mais recente. Seus campos foram preservados; revise os dados e tente novamente.";
  }
  if (status === 503) return "O serviço está temporariamente indisponível. Seus campos foram preservados; tente novamente mais tarde.";
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return contexto === "lista"
    ? "Não foi possível carregar fornecedores. Tente novamente."
    : "Não foi possível salvar. Os campos preenchidos foram preservados.";
}

function formularioDe(item: Fornecedor): FormValues {
  return {
    nome: item.nome ?? "",
    razaoSocial: item.razaoSocial ?? "",
    cnpj: item.cnpj ?? "",
    endereco: item.endereco ?? "",
    telefone: item.telefone ?? "",
    email: item.email ?? "",
    site: item.site ?? "",
    instagram: item.instagram ?? "",
    fabricante: item.fabricante == null ? "desconhecido" : item.fabricante ? "sim" : "nao",
    fornecedor: item.fornecedor == null ? "desconhecido" : item.fornecedor ? "sim" : "nao",
    fonte: item.fonte ?? "",
    ativo: item.ativo,
  };
}

function paraEntrada(values: FormValues): FornecedorEntrada {
  return {
    nome: values.nome.trim(),
    razaoSocial: values.razaoSocial.trim() || null,
    cnpj: values.cnpj.trim() || null,
    endereco: values.endereco.trim() || null,
    telefone: values.telefone.trim() || null,
    email: values.email.trim() || null,
    site: values.site.trim() || null,
    instagram: values.instagram.trim() || null,
    fabricante: values.fabricante === "desconhecido" ? null : values.fabricante === "sim",
    fornecedor: values.fornecedor === "desconhecido" ? null : values.fornecedor === "sim",
    fonte: values.fonte.trim() || null,
    ativo: values.ativo,
  };
}

function rotuloTipo(value: boolean | null, singular: string): string {
  return value == null ? `${singular}: não informado` : value ? singular : `Não é ${singular.toLocaleLowerCase("pt-BR")}`;
}

function CampoTexto({
  control,
  name,
  label,
  placeholder,
  type = "text",
}: {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  name: keyof FormValues;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="space-y-1.5">
          <FormLabel className="text-xs font-bold text-foreground">{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={typeof field.value === "string" ? field.value : ""}
              type={type}
              maxLength={500}
              className="field-engraved min-h-11"
              placeholder={placeholder}
              data-testid={`input-fornecedor-${String(name)}`}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CampoClassificacao({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  name: "fabricante" | "fornecedor";
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="space-y-1.5">
          <FormLabel className="text-xs font-bold text-foreground">{label}</FormLabel>
          <FormControl>
            <select
              ref={field.ref}
              name={field.name}
              onBlur={field.onBlur}
              value={String(field.value)}
              onChange={field.onChange}
              className="field-engraved min-h-11 w-full border border-input px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid={`select-fornecedor-${name}`}
            >
              <option value="desconhecido">Não informado</option>
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export default function Fornecedores() {
  const queryClient = useQueryClient();
  const [mountId] = useState(() => ++fornecedorMountSequence);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const scopeId = `${mountId}:${sessionEpoch}`;

  useEffect(() => {
    const mudouSessao = () => {
      const oldKey = [...ApiClient.getListFornecedoresQueryKey(), "fornecedores-session", scopeId] as const;
      void queryClient.cancelQueries({ queryKey: oldKey, exact: true });
      queryClient.removeQueries({ queryKey: oldKey, exact: true });
      setSessionEpoch((current) => current + 1);
    };
    const storageMudou = (event: StorageEvent) => {
      if (!event.key || event.key === "padcom_collab_token" || event.key === "padcom_collab_prof") {
        mudouSessao();
      }
    };
    window.addEventListener(COLLAB_EVENT, mudouSessao);
    window.addEventListener("storage", storageMudou);
    return () => {
      window.removeEventListener(COLLAB_EVENT, mudouSessao);
      window.removeEventListener("storage", storageMudou);
    };
  }, [queryClient, scopeId]);

  return <FornecedoresSessao key={scopeId} scopeId={scopeId} />;
}

function FornecedoresSessao({ scopeId }: { scopeId: string }) {
  const queryClient = useQueryClient();
  const queryKey = [...ApiClient.getListFornecedoresQueryKey(), "fornecedores-session", scopeId] as const;
  const fornecedoresQuery = ApiClient.useListFornecedores({
    request: { headers: collabAuthHeaders() },
    query: {
      queryKey,
      staleTime: 0,
      gcTime: 0,
      refetchOnMount: "always",
    },
  });
  const criarFornecedor = ApiClient.useCreateFornecedor();
  const atualizarFornecedor = ApiClient.useUpdateFornecedor();
  const fornecedores = fornecedoresQuery.data ?? [];
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("ativos");
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [editando, setEditando] = useState<Fornecedor | null>(null);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const formulario = useForm<FormValues>({
    resolver: zodResolver(fornecedorSchema),
    defaultValues: FORMULARIO_VAZIO,
  });
  const salvando = criarFornecedor.isPending || atualizarFornecedor.isPending;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return fornecedores.filter((item) => {
      const buscaOk = !termo || [
        item.nome,
        item.razaoSocial ?? "",
        item.cnpj ?? "",
        item.email ?? "",
        item.fonte ?? "",
      ].some((valor) => valor.toLocaleLowerCase("pt-BR").includes(termo));
      const statusOk = filtroStatus === "todos"
        || (filtroStatus === "ativos" && item.ativo)
        || (filtroStatus === "inativos" && !item.ativo);
      return buscaOk && statusOk;
    });
  }, [fornecedores, busca, filtroStatus]);

  const iniciarNovo = () => {
    if (formularioAberto) return;
    setEditando(null);
    setErroFormulario(null);
    setAviso(null);
    formulario.reset(FORMULARIO_VAZIO);
    setFormularioAberto(true);
  };

  const iniciarEdicao = (item: Fornecedor) => {
    if (formularioAberto) return;
    setEditando(item);
    setErroFormulario(null);
    setAviso(null);
    formulario.reset(formularioDe(item));
    setFormularioAberto(true);
  };

  const fecharFormulario = () => {
    if (salvando) return;
    setFormularioAberto(false);
    setEditando(null);
    setErroFormulario(null);
  };

  const salvar = formulario.handleSubmit(async (values) => {
    setErroFormulario(null);
    setAviso(null);
    const payload = paraEntrada(values);
    try {
      if (editando) {
        await atualizarFornecedor.mutateAsync({
          id: editando.id,
          data: { ...payload, versao: editando.versao },
        });
      } else {
        await criarFornecedor.mutateAsync({ data: payload });
      }
      await queryClient.invalidateQueries({ queryKey, exact: true });
      setFormularioAberto(false);
      setEditando(null);
      setAviso(editando ? "Cadastro atualizado." : "Fornecedor cadastrado.");
    } catch (error) {
      setErroFormulario(mensagemErro(error, editando ? "atualizacao" : "criacao"));
      if (statusErro(error) === 409) await fornecedoresQuery.refetch();
    }
  });

  const alternarAtivo = async (item: Fornecedor) => {
    const proximoAtivo = !item.ativo;
    const verbo = proximoAtivo ? "reativar" : "inativar";
    if (!window.confirm(`Deseja ${verbo} “${item.nome}”? O cadastro será preservado; não há exclusão.`)) return;
    setAviso(null);
    try {
      await atualizarFornecedor.mutateAsync({
        id: item.id,
        data: {
          nome: item.nome,
          razaoSocial: item.razaoSocial,
          cnpj: item.cnpj,
          endereco: item.endereco,
          telefone: item.telefone,
          email: item.email,
          site: item.site,
          instagram: item.instagram,
          fabricante: item.fabricante,
          fornecedor: item.fornecedor,
          fonte: item.fonte,
          ativo: proximoAtivo,
          versao: item.versao,
        },
      });
      await queryClient.invalidateQueries({ queryKey, exact: true });
      setAviso(proximoAtivo ? "Cadastro reativado." : "Cadastro inativado. Os dados foram preservados.");
    } catch (error) {
      const message = mensagemErro(error, "atualizacao");
      setAviso(message);
      if (statusErro(error) === 409) await fornecedoresQuery.refetch();
    }
  };

  const erroLista = fornecedoresQuery.error;
  const statusLista = statusErro(erroLista);

  return (
    <main className="mx-auto w-full max-w-[1480px] space-y-5 pb-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="panel-3d-hero p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="bevel-3d mb-3 inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Cadastro operacional
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">Fornecedores</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Consulte fabricantes e fornecedores vinculados à clínica da sessão.
            </p>
          </div>
          <Button
            type="button"
            className="btn-3d min-h-11 w-full shrink-0 gap-2 sm:w-auto"
            onClick={iniciarNovo}
            disabled={formularioAberto || fornecedoresQuery.isError}
            data-testid="button-new-fornecedor"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Novo cadastro
          </Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="concave-3d flex items-center gap-3 p-3">
            <span className="screen-3d grid h-10 w-10 shrink-0 place-items-center text-primary"><Users className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Cadastros</p><p className="text-xl font-extrabold tabular-nums text-primary">{fornecedoresQuery.data ? fornecedores.length : "—"}</p></div>
          </div>
          <div className="concave-3d flex items-center gap-3 p-3">
            <span className="screen-3d grid h-10 w-10 shrink-0 place-items-center text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" /></span>
            <div><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ativos</p><p className="text-xl font-extrabold tabular-nums text-primary">{fornecedoresQuery.data ? fornecedores.filter((item) => item.ativo).length : "—"}</p></div>
          </div>
          <div className="concave-3d flex items-center gap-3 p-3">
            <span className="screen-3d grid h-10 w-10 shrink-0 place-items-center text-amber-700"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Escopo</p><p className="truncate text-sm font-bold text-primary">Clínica da sessão</p></div>
          </div>
        </div>
      </header>

      <div className="bevel-3d flex items-start gap-3 p-4" role="note" data-testid="notice-fornecedores">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-primary">Cadastro sem exclusão</p>
          <p className="mt-1 text-sm text-foreground/80">Inativar preserva o registro e sua origem. Fabricante e fornecedor podem permanecer como não informados até confirmação da clínica.</p>
        </div>
      </div>

      {aviso && (
        <div className="panel-3d-sub flex items-start gap-3 p-3 text-sm" role="status" data-testid="status-fornecedores">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{aviso}</span>
          <button type="button" aria-label="Fechar aviso" className="ml-auto rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setAviso(null)} data-testid="button-dismiss-fornecedor-notice">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {fornecedoresQuery.isLoading && (
        <section className="panel-3d space-y-4 p-5" aria-label="Carregando fornecedores" data-testid="loading-fornecedores">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </section>
      )}

      {fornecedoresQuery.isError && (
        <section className="panel-3d p-5" role="alert" data-testid="error-fornecedores">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-bold text-primary">{statusLista === 404 ? "Cadastro ainda não disponível neste servidor" : "Não foi possível consultar fornecedores"}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{mensagemErro(erroLista, "lista")}</p>
              {statusLista === 404 && <p className="mt-2 text-xs text-muted-foreground">A rota pode ainda não estar presente na versão em execução. Nenhum dado foi criado ou simulado; esta tela não reinicia o servidor.</p>}
            </div>
          </div>
          <Button type="button" variant="outline" className="btn-3d-soft mt-4 min-h-10 gap-2" onClick={() => fornecedoresQuery.refetch()} data-testid="button-retry-fornecedores">
            <RotateCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
          </Button>
        </section>
      )}

      {formularioAberto && (
        <section className="panel-3d p-4 sm:p-6" aria-labelledby="form-fornecedor-titulo">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {editando ? "Edição do cadastro" : "Novo cadastro"}
              </div>
              <h2 id="form-fornecedor-titulo" className="mt-3 text-xl font-extrabold text-primary">{editando ? "Editar fornecedor ou fabricante" : "Cadastrar fornecedor ou fabricante"}</h2>
              {editando && <p className="mt-1 text-xs text-muted-foreground">Versão de edição: {editando.versao}. Ela será enviada para proteger alterações simultâneas.</p>}
            </div>
            <Button type="button" variant="outline" size="icon" className="btn-3d-soft h-10 w-10 shrink-0" aria-label="Fechar formulário" onClick={fecharFormulario} disabled={salvando} data-testid="button-close-fornecedor-form">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <Form {...formulario}>
            <form onSubmit={salvar} className="space-y-4">
              {erroFormulario && <div className="paxter-alert paxter-alert-amber flex items-start gap-3 p-3 text-sm" role="alert" data-testid="error-fornecedor-form"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{erroFormulario}</span></div>}
              <section className="panel-3d-sub space-y-3 p-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Identificação</h3>
                <CampoTexto control={formulario.control} name="nome" label="Nome *" placeholder="Nome usado pela clínica" />
                <CampoTexto control={formulario.control} name="razaoSocial" label="Razão social" />
                <CampoTexto control={formulario.control} name="cnpj" label="CNPJ" />
              </section>
              <section className="panel-3d-sub space-y-3 p-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Contato e endereço</h3>
                <CampoTexto control={formulario.control} name="endereco" label="Endereço" />
                <CampoTexto control={formulario.control} name="telefone" label="Telefone" />
                <CampoTexto control={formulario.control} name="email" label="E-mail" type="email" />
                <CampoTexto control={formulario.control} name="site" label="Site" />
                <CampoTexto control={formulario.control} name="instagram" label="Instagram" />
              </section>
              <section className="panel-3d-sub space-y-3 p-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Classificação e origem</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CampoClassificacao control={formulario.control} name="fabricante" label="Fabricante" />
                  <CampoClassificacao control={formulario.control} name="fornecedor" label="Fornecedor" />
                </div>
                <CampoTexto control={formulario.control} name="fonte" label="Origem / fonte" placeholder="Registre de onde veio esta informação" />
                <FormField control={formulario.control} name="ativo" render={({ field }) => (
                  <FormItem className="concave-3d flex items-center gap-3 p-3">
                    <FormControl><input type="checkbox" ref={field.ref} name={field.name} onBlur={field.onBlur} checked={field.value} onChange={(event) => field.onChange(event.target.checked)} className="h-4 w-4 accent-[#16284a]" data-testid="checkbox-fornecedor-ativo" /></FormControl>
                    <FormLabel className="cursor-pointer text-sm font-bold">Cadastro ativo</FormLabel>
                  </FormItem>
                )} />
              </section>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" className="btn-3d-soft min-h-11" onClick={fecharFormulario} disabled={salvando} data-testid="button-cancel-fornecedor">Cancelar</Button>
                <Button type="submit" className="btn-3d min-h-11 gap-2" disabled={salvando} data-testid="button-save-fornecedor">
                  {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Cadastrar"}
                </Button>
              </div>
            </form>
          </Form>
        </section>
      )}

      {!fornecedoresQuery.isLoading && !fornecedoresQuery.isError && (
        <section className="panel-3d p-4 sm:p-5" aria-labelledby="lista-fornecedores-titulo">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="lista-fornecedores-titulo" className="text-xl font-extrabold text-primary">Cadastros da clínica</h2>
                <p className="mt-1 text-sm text-muted-foreground">A origem informada permanece visível em cada registro.</p>
              </div>
              <Button type="button" variant="outline" size="icon" className="btn-3d-soft h-10 w-10 shrink-0" aria-label="Atualizar lista" onClick={() => fornecedoresQuery.refetch()} disabled={fornecedoresQuery.isFetching} data-testid="button-refresh-fornecedores">
                <RotateCw className={`h-4 w-4 ${fornecedoresQuery.isFetching ? "animate-spin" : ""}`} aria-hidden="true" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input className="field-engraved min-h-11 pl-9" type="search" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar nome, CNPJ, e-mail ou origem" aria-label="Buscar fornecedores" data-testid="input-search-fornecedores" />
              </label>
              <label className="relative block">
                <span className="sr-only">Filtrar por situação</span>
                <select value={filtroStatus} onChange={(event) => setFiltroStatus(event.target.value as FiltroStatus)} className="field-engraved min-h-11 w-full appearance-none border border-input px-3 pr-9 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="select-filtro-fornecedores">
                  <option value="ativos">Ativos</option><option value="todos">Todos</option><option value="inativos">Inativos</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              </label>
            </div>
          </div>

          {fornecedores.length === 0 ? (
            <div className="concave-3d mt-5 flex flex-col items-center px-5 py-10 text-center" data-testid="empty-fornecedores">
              <span className="screen-3d grid h-14 w-14 place-items-center text-primary"><Building2 className="h-6 w-6" aria-hidden="true" /></span>
              <h3 className="mt-4 text-lg font-extrabold text-primary">Nenhum cadastro nesta clínica</h3>
              <p className="mt-1 max-w-lg text-sm text-muted-foreground">A lista está vazia. Cadastre somente informações confirmadas; nenhum fornecedor ou fabricante será sugerido automaticamente.</p>
              <Button type="button" className="btn-3d mt-5 min-h-11 gap-2" onClick={iniciarNovo} disabled={formularioAberto} data-testid="button-create-first-fornecedor"><Plus className="h-4 w-4" aria-hidden="true" /> Novo cadastro</Button>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="concave-3d mt-5 p-6 text-center" data-testid="empty-filtered-fornecedores">
              <p className="font-bold text-primary">Nenhum resultado para este filtro</p>
              <p className="mt-1 text-sm text-muted-foreground">Altere a busca ou selecione outra situação.</p>
            </div>
          ) : (
            <div className="mt-5 space-y-4" data-testid="list-fornecedores">
              {filtrados.map((item) => (
                <article key={item.id} className="panel-3d-sub p-4" data-testid={`card-fornecedor-${item.id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-extrabold text-primary" title={item.nome} data-testid={`text-fornecedor-nome-${item.id}`}>{item.nome}</h3>
                      <p className="mt-1 text-xs text-muted-foreground">{item.razaoSocial || "Razão social não informada"}</p>
                    </div>
                    <span className={`concave-3d flex min-w-[88px] shrink-0 items-center justify-center gap-2 px-2 py-1.5 text-[10px] font-black uppercase tracking-wider ${item.ativo ? "text-emerald-800" : "text-muted-foreground"}`} data-testid={`status-fornecedor-${item.id}`}>
                      <span className={`paxter-led ${item.ativo ? "paxter-led-green" : "paxter-led-off"}`} aria-hidden="true" />{item.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
                    <div className="concave-3d min-w-0 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">CNPJ</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{item.cnpj || "—"}</p></div>
                    <div className="concave-3d min-w-0 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Contato</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{item.telefone || item.email || "—"}</p></div>
                    <div className="concave-3d min-w-0 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Endereço</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{item.endereco || "—"}</p></div>
                    <div className="concave-3d min-w-0 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Classificação</p><p className="mt-1 break-words text-sm font-semibold text-foreground">{rotuloTipo(item.fabricante, "Fabricante")} · {rotuloTipo(item.fornecedor, "Fornecedor")}</p></div>
                    <div className="concave-3d col-span-2 min-w-0 p-3 lg:col-span-1"><p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Origem / fonte</p><p className="mt-1 break-words text-sm font-semibold text-foreground" data-testid={`text-fornecedor-fonte-${item.id}`}>{item.fonte || "Não informada"}</p></div>
                  </div>
                  <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" className="btn-3d-soft min-h-10 gap-2" onClick={() => iniciarEdicao(item)} disabled={formularioAberto || salvando} data-testid={`button-edit-fornecedor-${item.id}`}>
                      <FileText className="h-4 w-4" aria-hidden="true" /> Editar
                    </Button>
                    <Button type="button" variant="outline" className="btn-3d-soft min-h-10 gap-2" onClick={() => alternarAtivo(item)} disabled={salvando} data-testid={`button-toggle-fornecedor-${item.id}`}>
                      {item.ativo ? <X className="h-4 w-4" aria-hidden="true" /> : <Factory className="h-4 w-4" aria-hidden="true" />}
                      {item.ativo ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
