import { useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as ApiClient from "@workspace/api-client-react";
import type { Substance } from "@workspace/api-client-react";
import {
  Activity,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Stethoscope,
  Syringe,
  Users,
  X,
} from "lucide-react";
import { usePermissoes } from "@/lib/permissoes";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { doseSugeridaProduto, duracaoValidaMinutos, nomeSugeridoProduto } from "./sugestao-produto";
import { ProfissionaisNecessarios, type GrupoProfissional } from "./ProfissionaisNecessarios";
import { CatalogoProdutos } from "./CatalogoProdutos";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

type TipoProcedimento = "consulta" | "enfermagem" | "medico";
type FiltroStatus = "todos" | "ativos" | "inativos";
type FontesCampos = { nome?: number; dose?: number; duracaoMinutos?: number };

interface ProcedimentoEntrada {
  nome: string;
  tipo?: TipoProcedimento | null;
  dose: string | null;
  profissionaisNecessarios: GrupoProfissional[];
  descricao: string | null;
  duracaoMinutos: number | null;
  ativo: boolean;
  produtoIds: number[];
  fontesCampos?: FontesCampos;
  confirmarDoseAtual?: boolean;
}

interface Procedimento extends ProcedimentoEntrada {
  id: number;
  empresaId: number;
  dosePendenteRevisao?: boolean;
  camposOrigemIndisponivel?: string[];
}

interface Formulario {
  nome: string;
  tipo: TipoProcedimento | "";
  dose: string;
  doseRevisada: boolean;
  profissionaisNecessarios: GrupoProfissional[];
  descricao: string;
  duracaoMinutos: string;
  ativo: boolean;
  produtoIds: number[];
  fontesCampos: FontesCampos;
}

const TIPO_LABEL: Record<TipoProcedimento, string> = {
  consulta: "Consulta",
  enfermagem: "Enfermagem",
  medico: "Médico",
};

const FORMULARIO_VAZIO: Formulario = {
  nome: "",
  tipo: "",
  dose: "",
  doseRevisada: false,
  profissionaisNecessarios: [],
  descricao: "",
  duracaoMinutos: "",
  ativo: true,
  produtoIds: [],
  fontesCampos: {},
};

function mensagemErro(erro: unknown): string {
  if (typeof erro === "object" && erro !== null && "status" in erro && erro.status === 401) {
    return "A sessão profissional não foi reconhecida. Entre novamente em outra aba e tente salvar; os campos preenchidos permanecem nesta tela.";
  }
  if (erro instanceof Error && erro.message) return erro.message;
  if (typeof erro === "object" && erro !== null && "message" in erro) {
    const message = (erro as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "Não foi possível concluir a comunicação com o serviço. Tente novamente.";
}

function formularioDe(procedimento: Procedimento): Formulario {
  return {
    nome: procedimento.nome,
    tipo: procedimento.tipo ?? "",
    dose: procedimento.dose ?? "",
    doseRevisada: !procedimento.dosePendenteRevisao,
    profissionaisNecessarios: procedimento.profissionaisNecessarios ?? [],
    descricao: procedimento.descricao ?? "",
    duracaoMinutos: procedimento.duracaoMinutos == null ? "" : String(procedimento.duracaoMinutos).replace(".", ","),
    ativo: procedimento.ativo,
    produtoIds: [...procedimento.produtoIds],
    fontesCampos: { ...procedimento.fontesCampos },
  };
}

function nomeSubstancia(substance: Substance): string {
  const dose = substance.defaultDose?.trim();
  return `${substance.name}${dose ? ` · ${dose}` : ""} · ID ${substance.id}`;
}

function quantidadeSubstancias(total: number): string {
  return total === 1 ? "1 substância vinculada" : `${total} substâncias vinculadas`;
}

function erroDeValidacao(formulario: Formulario): string | null {
  if (!formulario.nome.trim()) return "Informe o nome do procedimento.";
  if (formulario.ativo && !formulario.profissionaisNecessarios.length) return "Adicione os profissionais necessários.";
  if (formulario.profissionaisNecessarios.some((g) => !g.areaId || !g.localId || !g.professionalIds.length)) return "Escolha local, área e ao menos um profissional para cada necessidade.";
  if (formulario.produtoIds.length && !formulario.dose && !formulario.doseRevisada) return "Confira a dose e confirme se o procedimento não possui dose definida.";
  if (formulario.produtoIds.length && formulario.dose && !formulario.doseRevisada) return "Confirme a dose prescrita antes de salvar.";
  if (/(?:ml\b|%|\/)/i.test(formulario.dose)) return "Informe a dose sem volume ou concentração.";
  const duracao = Number(formulario.duracaoMinutos.replace(",", "."));
  if (!formulario.duracaoMinutos.trim() && formulario.ativo) {
    return "Informe a duração do procedimento ativo.";
  }
  if (formulario.duracaoMinutos.trim() && !duracaoValidaMinutos(duracao)) {
    return "Informe duração de até 1.440 minutos que corresponda a segundos inteiros.";
  }
  if (formulario.produtoIds.length > 100) return "É possível vincular até 100 substâncias.";
  return null;
}

export default function Procedimentos() {
  const queryClient = useQueryClient();
  const { isCeo, me, loading: carregandoPermissoes, refetch: verificarPermissoes } = usePermissoes();
  const procedimentosQuery = ApiClient.useListProcedimentos({
    request: { headers: collabAuthHeaders() },
    query: {
      queryKey: [...ApiClient.getListProcedimentosQueryKey(), me?.id ?? null],
      enabled: !!me,
      staleTime: 0,
    },
  });
  const substanciasQuery = ApiClient.useListSubstances({
    request: { headers: collabAuthHeaders() },
  });
  // Ler a credencial no momento da gravação, inclusive após renovação da sessão.
  const criarProcedimento = useMutation({
    mutationFn: ({ data }: { data: ProcedimentoEntrada }) =>
      ApiClient.createProcedimento(data, { headers: collabAuthHeaders() }),
  });
  const atualizarProcedimento = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ProcedimentoEntrada }) =>
      ApiClient.updateProcedimento(id, data, { headers: collabAuthHeaders() }),
  });
  const procedimentos = procedimentosQuery.data?.procedimentos ?? [];
  const substancias = substanciasQuery.data ?? [];
  const servidorAtualizado = procedimentosQuery.data?.duracaoSegundosHabilitada === true
    && procedimentosQuery.data?.profissionaisNecessariosHabilitado === true;
  const vinculosHabilitados = procedimentosQuery.data?.vinculosCamposHabilitados === true;

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("ativos");
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(FORMULARIO_VAZIO);
  const produtoComposto = formulario.produtoIds.some((id) =>
    (substancias.find((produto) => produto.id === id)?.components?.length ?? 0) > 1);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [termoSubstancia, setTermoSubstancia] = useState("");
  const camposEditados = useRef({ nome: false, duracaoMinutos: false, dose: false });
  const sugestoesAutomaticas = useRef<{ nome: string | null; duracaoMinutos: string | null; dose: string | null }>({ nome: null, duracaoMinutos: null, dose: null });

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return procedimentos.filter((item) => {
      const correspondeBusca = !termo || [
        item.nome,
        item.descricao ?? "",
        item.tipo ? TIPO_LABEL[item.tipo] : "",
      ].some((texto) => texto.toLocaleLowerCase("pt-BR").includes(termo));
      const correspondeStatus = filtroStatus === "todos"
        || (filtroStatus === "ativos" && item.ativo)
        || (filtroStatus === "inativos" && !item.ativo);
      return correspondeBusca && correspondeStatus;
    });
  }, [procedimentos, busca, filtroStatus]);

  const iniciarNovo = (produto?: Substance) => {
    if (formularioAberto) return;
    camposEditados.current = { nome: false, duracaoMinutos: false, dose: false };
    const nome = produto ? nomeSugeridoProduto(produto.name) : "";
    const duracao = produto?.durationMinutes;
    const minutos = typeof duracao === "number" && duracaoValidaMinutos(duracao)
      ? String(duracao).replace(".", ",") : "";
    const dose = doseSugeridaProduto(produto) ?? "";
    sugestoesAutomaticas.current = { nome: nome || null, duracaoMinutos: minutos || null, dose: dose || null };
    setEditandoId(null);
    const fontesCampos: FontesCampos = {};
    if (produto && nome) fontesCampos.nome = produto.id;
    if (produto && minutos) fontesCampos.duracaoMinutos = produto.id;
    if (produto && dose) fontesCampos.dose = produto.id;
    setFormulario({ ...FORMULARIO_VAZIO, nome, duracaoMinutos: minutos, dose, fontesCampos, produtoIds: produto ? [produto.id] : [] });
    setErroFormulario(null);
    setAviso(null);
    setTermoSubstancia("");
    setFormularioAberto(true);
  };

  const iniciarEdicao = (procedimento: Procedimento) => {
    if (formularioAberto) return;
    camposEditados.current = {
      nome: !procedimento.fontesCampos?.nome,
      duracaoMinutos: !procedimento.fontesCampos?.duracaoMinutos,
      dose: !procedimento.fontesCampos?.dose,
    };
    sugestoesAutomaticas.current = {
      nome: procedimento.fontesCampos?.nome ? procedimento.nome : null,
      duracaoMinutos: procedimento.fontesCampos?.duracaoMinutos && procedimento.duracaoMinutos != null
        ? String(procedimento.duracaoMinutos).replace(".", ",") : null,
      dose: procedimento.fontesCampos?.dose ? procedimento.dose : null,
    };
    setFormulario(formularioDe(procedimento));
    setEditandoId(procedimento.id);
    setErroFormulario(null);
    setAviso(null);
    setTermoSubstancia("");
    setFormularioAberto(true);
  };

  const fecharFormulario = () => {
    if (criarProcedimento.isPending || atualizarProcedimento.isPending) return;
    setFormularioAberto(false);
    setEditandoId(null);
    setErroFormulario(null);
  };

  const alterarCampo = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => {
    if (campo === "nome") camposEditados.current.nome = true;
    if (campo === "duracaoMinutos") camposEditados.current.duracaoMinutos = true;
    if (campo === "dose") camposEditados.current.dose = true;
    setFormulario((atual) => {
      const fontesCampos = { ...atual.fontesCampos };
      if (campo === "nome") delete fontesCampos.nome;
      if (campo === "duracaoMinutos") delete fontesCampos.duracaoMinutos;
      if (campo === "dose") delete fontesCampos.dose;
      return { ...atual, [campo]: valor, fontesCampos, ...(campo === "dose" ? { doseRevisada: false } : {}) };
    });
    setErroFormulario(null);
  };

  const vincularCampo = (campo: keyof FontesCampos) => {
    if (formulario.produtoIds.length !== 1) {
      setErroFormulario("Selecione apenas um produto para vincular um campo à origem.");
      return;
    }
    const produto = substancias.find((item) => item.id === formulario.produtoIds[0]);
    if (!produto) {
      setErroFormulario("O produto de origem está indisponível. Tente carregar o catálogo novamente.");
      return;
    }
    const valor = campo === "nome" ? nomeSugeridoProduto(produto.name)
      : campo === "dose" ? doseSugeridaProduto(produto)
      : typeof produto.durationMinutes === "number" && duracaoValidaMinutos(produto.durationMinutes)
        ? String(produto.durationMinutes).replace(".", ",") : null;
    if (!valor) {
      setErroFormulario("A apresentação não informa um valor inequívoco para este campo.");
      return;
    }
    camposEditados.current[campo] = false;
    sugestoesAutomaticas.current[campo] = valor;
    setFormulario((atual) => ({
      ...atual, [campo]: valor, fontesCampos: { ...atual.fontesCampos, [campo]: produto.id },
      ...(campo === "dose" ? { doseRevisada: false } : {}),
    }));
    setErroFormulario(null);
  };

  const alternarProduto = (substance: Substance, selecionado: boolean) => {
    const ids = selecionado
      ? [...new Set([...formulario.produtoIds, substance.id])]
      : formulario.produtoIds.filter((id) => id !== substance.id);
    if (ids[0] === formulario.produtoIds[0]) {
      const doseAutomatica = ids.length === 1
        ? doseSugeridaProduto(substancias.find((item) => item.id === ids[0])) ?? ""
        : "";
      const atualizarDose = !camposEditados.current.dose
        && (!formulario.dose || formulario.dose === sugestoesAutomaticas.current.dose);
      setFormulario((atual) => ({
        ...atual, produtoIds: ids, doseRevisada: false,
        dose: atualizarDose ? doseAutomatica : atual.dose,
        fontesCampos: {
          ...atual.fontesCampos,
          ...(atualizarDose ? { dose: doseAutomatica && ids.length === 1 ? ids[0] : undefined } : {}),
        },
      }));
      if (atualizarDose) sugestoesAutomaticas.current.dose = doseAutomatica || null;
      setErroFormulario(null);
      return;
    }
    const primeiro = ids[0] === substance.id ? substance : substancias.find((item) => item.id === ids[0]);
    const nome = primeiro ? nomeSugeridoProduto(primeiro.name) : "";
    const duracao = primeiro?.durationMinutes;
    const duracaoSugerida = typeof duracao === "number" && duracaoValidaMinutos(duracao)
      ? String(duracao).replace(".", ",") : "";
    const doseSugerida = ids.length === 1 ? doseSugeridaProduto(primeiro) ?? "" : "";
    const substituirNome = !camposEditados.current.nome
      && (!formulario.nome || formulario.nome === sugestoesAutomaticas.current.nome);
    const substituirDuracao = !camposEditados.current.duracaoMinutos
      && (!formulario.duracaoMinutos || formulario.duracaoMinutos === sugestoesAutomaticas.current.duracaoMinutos);
    const substituirDose = !camposEditados.current.dose
      && (!formulario.dose || formulario.dose === sugestoesAutomaticas.current.dose);
    setFormulario((atual) => ({
      ...atual,
      produtoIds: ids,
      nome: substituirNome ? nome : atual.nome,
      duracaoMinutos: substituirDuracao ? duracaoSugerida : atual.duracaoMinutos,
      dose: substituirDose ? doseSugerida : atual.dose,
      doseRevisada: false,
      fontesCampos: {
        nome: substituirNome ? (nome && primeiro ? primeiro.id : undefined)
          : ids.includes(atual.fontesCampos.nome ?? 0) ? atual.fontesCampos.nome : undefined,
        duracaoMinutos: substituirDuracao ? (duracaoSugerida && primeiro ? primeiro.id : undefined)
          : ids.includes(atual.fontesCampos.duracaoMinutos ?? 0) ? atual.fontesCampos.duracaoMinutos : undefined,
        dose: substituirDose ? (doseSugerida && primeiro ? primeiro.id : undefined)
          : ids.includes(atual.fontesCampos.dose ?? 0) && ids.length === 1 ? atual.fontesCampos.dose : undefined,
      },
    }));
    if (substituirNome) sugestoesAutomaticas.current.nome = nome || null;
    if (substituirDuracao) sugestoesAutomaticas.current.duracaoMinutos = duracaoSugerida || null;
    if (substituirDose) sugestoesAutomaticas.current.dose = doseSugerida || null;
    setErroFormulario(null);
  };

  const salvar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAviso(null);
    if (!servidorAtualizado) {
      setErroFormulario("O serviço de procedimentos ainda não está atualizado. O formulário foi preservado; tente novamente depois da atualização segura do serviço.");
      return;
    }
    const erro = erroDeValidacao(formulario);
    if (erro) {
      setErroFormulario(erro);
      return;
    }
    const payload: ProcedimentoEntrada = {
      nome: formulario.nome.trim(),
      tipo: formulario.tipo || null,
      dose: formulario.dose.trim() || null,
      profissionaisNecessarios: formulario.profissionaisNecessarios,
      descricao: formulario.descricao.trim() || null,
      duracaoMinutos: formulario.duracaoMinutos ? Number(formulario.duracaoMinutos.replace(",", ".")) : null,
      ativo: formulario.ativo,
      produtoIds: [...formulario.produtoIds],
      ...(vinculosHabilitados ? { fontesCampos: formulario.fontesCampos } : {}),
      ...(typeof procedimentosQuery.data?.vinculosCamposHabilitados === "boolean"
        ? { confirmarDoseAtual: formulario.doseRevisada } : {}),
    };

    try {
      if (editandoId == null) {
        await criarProcedimento.mutateAsync({ data: payload });
      } else {
        await atualizarProcedimento.mutateAsync({ id: editandoId, data: payload });
      }
      await queryClient.invalidateQueries({ queryKey: ApiClient.getListProcedimentosQueryKey() });
      setFormularioAberto(false);
      setEditandoId(null);
      setAviso(editandoId == null ? "Procedimento cadastrado." : "Alterações salvas.");
    } catch (erroSalvar) {
      setErroFormulario(mensagemErro(erroSalvar));
    }
  };

  const alternarAtivo = async (procedimento: Procedimento) => {
    if (!isCeo) return;
    if (!servidorAtualizado) {
      setAviso("O serviço de procedimentos ainda não está atualizado; a alteração não foi realizada.");
      return;
    }
    if (procedimento.dosePendenteRevisao || procedimento.camposOrigemIndisponivel?.length) {
      setAviso("Confira os campos vinculados e a dose antes de alterar o estado do procedimento.");
      return;
    }
    const proximoEstado = !procedimento.ativo;
    const acao = proximoEstado ? "reativar" : "inativar";
    if (!window.confirm(`Deseja ${acao} “${procedimento.nome}”? O cadastro e os vínculos serão preservados.`)) return;
    setAviso(null);
    try {
      await atualizarProcedimento.mutateAsync({
        id: procedimento.id,
        data: {
          nome: procedimento.nome,
          tipo: procedimento.tipo ?? null,
          dose: procedimento.dose ?? null,
          profissionaisNecessarios: procedimento.profissionaisNecessarios ?? [],
          descricao: procedimento.descricao,
          duracaoMinutos: procedimento.duracaoMinutos,
          ativo: proximoEstado,
          produtoIds: [...procedimento.produtoIds],
          ...(vinculosHabilitados ? { fontesCampos: procedimento.fontesCampos ?? {} } : {}),
          ...(typeof procedimentosQuery.data?.vinculosCamposHabilitados === "boolean" ? { confirmarDoseAtual: false } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ApiClient.getListProcedimentosQueryKey() });
      setAviso(proximoEstado ? "Procedimento reativado." : "Procedimento inativado. O cadastro foi preservado.");
    } catch (erroSalvar) {
      setAviso(`Não foi possível atualizar o procedimento: ${mensagemErro(erroSalvar)}`);
    }
  };

  const substanciasFiltradas = useMemo(() => {
    const termo = termoSubstancia.trim().toLocaleLowerCase("pt-BR");
    return [...substancias]
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id - b.id)
      .filter((substance) => !termo || nomeSubstancia(substance).toLocaleLowerCase("pt-BR").includes(termo));
  }, [substancias, termoSubstancia]);

  const substanciasVinculadasAusentes = formulario.produtoIds.filter(
    (id) => !substancias.some((substance) => substance.id === id),
  );

  const salvando = criarProcedimento.isPending || atualizarProcedimento.isPending;
  const erroLista = procedimentosQuery.error;
  const semResultados = procedimentos.length > 0 && filtrados.length === 0;

  return (
    <main className="mx-auto w-full max-w-[1480px] space-y-5 pb-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <header className="panel-3d-hero p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-2 bevel-3d px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
              <Activity className="h-3.5 w-3.5" aria-hidden="true" />
              Cadastro operacional
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-primary sm:text-4xl">Procedimentos</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Cadastros próprios da clínica, sem duplicar produtos do catálogo.
            </p>
          </div>
          {isCeo && (
            <Button
              type="button"
              className="btn-3d min-h-11 w-full shrink-0 gap-2 sm:w-auto"
              onClick={() => iniciarNovo()}
              disabled={formularioAberto}
              data-testid="button-new-procedimento"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo procedimento
            </Button>
          )}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="concave-3d flex items-center gap-3 p-3">
            <span className="screen-3d grid h-10 w-10 shrink-0 place-items-center text-primary">
              <Stethoscope className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Procedimentos</p>
              <p className="text-xl font-extrabold tabular-nums text-primary" data-testid="text-total-procedimentos">{procedimentosQuery.data ? procedimentos.length : "—"}</p>
            </div>
          </div>
          <div className="concave-3d flex items-center gap-3 p-3">
            <span className="screen-3d grid h-10 w-10 shrink-0 place-items-center text-emerald-700">
              <Check className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Ativos</p>
              <p className="text-xl font-extrabold tabular-nums text-primary" data-testid="text-active-procedimentos">{procedimentosQuery.data ? procedimentos.filter((item) => item.ativo).length : "—"}</p>
            </div>
          </div>
          <div className="concave-3d flex items-center gap-3 p-3">
            <span className="screen-3d grid h-10 w-10 shrink-0 place-items-center text-amber-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Clínica da sessão</p>
              <p className="truncate text-sm font-bold text-primary" title={procedimentosQuery.data?.empresaNome}>{procedimentosQuery.data?.empresaNome ?? "—"}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="bevel-3d flex items-start gap-3 p-4" role="note" data-testid="notice-procedimentos-integracao">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-primary">Cadastro ainda não integrado</p>
          <p className="mt-1 text-sm text-foreground/80">
            Procedimentos ainda não estão conectados aos protocolos nem às agendas. Este cadastro não cria protocolos, reservas ou agendamentos.
          </p>
        </div>
      </div>

      {procedimentosQuery.isSuccess && !servidorAtualizado && (
        <div className="panel-3d-sub p-4 text-sm text-amber-800" role="alert" data-testid="aviso-servidor-desatualizado">
          A atualização segura do serviço ainda está pendente. Os cadastros continuam visíveis, mas não podem ser alterados até o serviço estar atualizado.
        </div>
      )}

      {aviso && (
        <div className="panel-3d-sub flex items-start gap-3 p-3 text-sm" role="status" data-testid="status-procedimentos">
          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>{aviso}</span>
          <button
            type="button"
            aria-label="Fechar aviso"
            className="ml-auto rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setAviso(null)}
            data-testid="button-dismiss-notice"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {carregandoPermissoes ? (
        <section className="panel-3d p-5" aria-label="Verificando permissões">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-4 h-12 w-full" />
        </section>
      ) : null}

      {!carregandoPermissoes && me && !isCeo && (
        <div className="concave-3d flex items-start gap-3 p-4" role="note" data-testid="notice-read-only">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-foreground/80">
            Você pode consultar os procedimentos. Criar, editar e alterar o status é permitido somente ao proprietário da plataforma.
          </p>
        </div>
      )}

      {formularioAberto && isCeo && (
        <section className="panel-3d p-4 sm:p-6" aria-labelledby="form-procedimento-titulo">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {editandoId == null ? "Novo cadastro" : "Edição completa"}
              </div>
              <h2 id="form-procedimento-titulo" className="mt-3 text-xl font-extrabold text-primary">
                {editandoId == null ? "Cadastrar procedimento" : "Editar procedimento"}
              </h2>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="btn-3d-soft h-10 w-10 shrink-0"
              aria-label="Fechar formulário"
              onClick={fecharFormulario}
              disabled={salvando}
              data-testid="button-close-procedimento-form"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <form onSubmit={salvar} className="space-y-4">
            <div className="panel-3d-sub space-y-3 p-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Identificação</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="procedimento-nome" className="text-xs font-bold text-foreground">
                    Nome <span className="text-red-700" aria-hidden="true">*</span>
                  </label>
                  <Input
                    id="procedimento-nome"
                    className="field-engraved min-h-11"
                    maxLength={200}
                    required
                    value={formulario.nome}
                    onChange={(event) => alterarCampo("nome", event.target.value)}
                    placeholder="Nome do procedimento"
                    data-testid="input-procedimento-nome"
                  />
                  {vinculosHabilitados && formulario.produtoIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formulario.fontesCampos.nome ? "Vinculado ao nome do produto." : "Nome personalizado."}{" "}
                      {!formulario.fontesCampos.nome && <button type="button" className="underline" onClick={() => vincularCampo("nome")}>Usar nome do produto</button>}
                    </p>
                  )}
                </div>

                <label className="block space-y-1.5 text-xs font-bold">
                  <span>Dose prescrita, quando houver</span>
                  <Input className="field-engraved min-h-11" value={formulario.dose}
                    onChange={(event) => alterarCampo("dose", event.target.value)}
                    placeholder="Informe apenas a dose" data-testid="input-procedimento-dose" />
                  <span className="block text-xs text-muted-foreground">Não informe volume ou concentração. Revise antes de salvar.</span>
                </label>
                {vinculosHabilitados && formulario.produtoIds.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {formulario.fontesCampos.dose ? "Dose vinculada ao produto; alterações exigem nova conferência." : "Dose personalizada."}{" "}
                    {!formulario.fontesCampos.dose && <button type="button" className="underline" onClick={() => vincularCampo("dose")}>Usar dose do produto</button>}
                  </p>
                )}
                {formulario.produtoIds.length > 0 && (
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox checked={formulario.doseRevisada} onCheckedChange={(checked) => alterarCampo("doseRevisada", checked === true)} />
                    {formulario.dose
                      ? produtoComposto ? "Conferi a dose prescrita e a ordem de cada componente." : "Conferi que esta é a dose prescrita."
                      : "Confirmei que a dose está ausente ou será definida depois."}
                  </label>
                )}
              </div>
            </div>

            <div className="panel-3d-sub space-y-3 p-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Detalhes</h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label htmlFor="procedimento-duracao" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                    <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                    Duração em minutos {formulario.ativo && <span className="text-red-700" aria-hidden="true">*</span>}
                  </label>
                  <Input
                    id="procedimento-duracao"
                    className="field-engraved min-h-11 max-w-xs"
                    type="text"
                    inputMode="decimal"
                    value={formulario.duracaoMinutos}
                    onChange={(event) => alterarCampo("duracaoMinutos", event.target.value)}
                    placeholder="Informe a duração, por exemplo 2,5"
                    data-testid="input-procedimento-duracao"
                  />
                  <p className="text-xs text-muted-foreground">Obrigatória para procedimento ativo; aceita minutos fracionários com segundos inteiros.</p>
                  {vinculosHabilitados && formulario.produtoIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formulario.fontesCampos.duracaoMinutos ? "Duração vinculada ao produto." : "Duração personalizada."}{" "}
                      {!formulario.fontesCampos.duracaoMinutos && <button type="button" className="underline" onClick={() => vincularCampo("duracaoMinutos")}>Usar duração do produto</button>}
                    </p>
                  )}
                  {formulario.produtoIds.length > 0 && !formulario.duracaoMinutos && (() => {
                    const produto = substancias.find((item) => item.id === formulario.produtoIds[0]);
                    return produto && (typeof produto.durationMinutes !== "number" || !duracaoValidaMinutos(produto.durationMinutes))
                      ? <p className="text-xs font-semibold text-amber-800" data-testid="aviso-duracao-produto">O produto não tem duração válida informada. Informe a duração manualmente.</p>
                      : null;
                  })()}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="procedimento-descricao" className="text-xs font-bold text-foreground">
                    Descrição <span className="font-normal text-muted-foreground">(opcional)</span>
                  </label>
                  <Textarea
                    id="procedimento-descricao"
                    className="field-engraved min-h-24 resize-y"
                    value={formulario.descricao}
                    onChange={(event) => alterarCampo("descricao", event.target.value)}
                    placeholder="Informações complementares, se necessário"
                    data-testid="input-procedimento-descricao"
                  />
                </div>
              </div>
            </div>

            <div className="panel-3d-sub space-y-3 p-4">
              <div className="flex items-start gap-3">
                <Syringe className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">Substâncias do catálogo</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vínculos usam os registros existentes. Consulta não exige substância.
                    O primeiro produto pode sugerir nome e duração; revise os campos.
                  </p>
                  {!vinculosHabilitados && <p className="mt-1 text-xs font-semibold text-amber-800" role="note">
                    A atualização automática dos campos após alterações no produto ainda não está disponível.
                  </p>}
                </div>
              </div>
              {substanciasQuery.isLoading ? (
                <div className="space-y-2" aria-label="Carregando catálogo de substâncias">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : substanciasQuery.error ? (
                <div className="concave-3d flex items-start gap-2 p-3 text-sm text-red-800" role="alert" data-testid="error-substancias">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-bold">Não foi possível carregar o catálogo.</p>
                    <p>{mensagemErro(substanciasQuery.error)}</p>
                    <button type="button" className="mt-2 underline underline-offset-2" onClick={() => void substanciasQuery.refetch()} data-testid="button-retry-substancias">
                      Tentar novamente
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      className="field-engraved min-h-11 pl-9"
                      value={termoSubstancia}
                      onChange={(event) => setTermoSubstancia(event.target.value)}
                      placeholder="Buscar substância, dose ou identificador"
                      aria-label="Buscar substâncias"
                      data-testid="input-search-substancias"
                    />
                  </div>
                  <div className="concave-3d max-h-64 space-y-2 overflow-y-auto p-3" role="group" aria-label="Selecionar substâncias">
                    {substanciasFiltradas.length ? substanciasFiltradas.map((substance) => {
                      const marcado = formulario.produtoIds.includes(substance.id);
                      return (
                        <div
                          key={substance.id}
                          className="bevel-3d min-h-11 px-3 py-2"
                          data-testid={`row-substancia-${substance.id}`}
                        >
                          <label className="flex cursor-pointer items-center gap-3">
                            <Checkbox
                              checked={marcado}
                              onCheckedChange={(checked) => alternarProduto(substance, checked === true)}
                              aria-label={`Vincular ${nomeSubstancia(substance)}`}
                              data-testid={`checkbox-substancia-${substance.id}`}
                            />
                            <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">{nomeSugeridoProduto(substance.name) || substance.name}</span>
                            {marcado && <Check className="h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />}
                          </label>
                          <details className="mt-1 pl-7 text-xs">
                            <summary className="cursor-pointer text-primary underline">Detalhes da apresentação</summary>
                            <p>Identificador {substance.id} · Cadastro: {substance.name}</p>
                            <p>Dose ou apresentação cadastrada: {substance.defaultDose || "—"}</p>
                            {(substance.components?.length ?? 0) > 1 && substance.components?.map((componente) => (
                              <p key={componente.id}>{componente.componentName}: {componente.doseValue ?? "—"} {componente.doseUnit ?? ""}</p>
                            ))}
                          </details>
                        </div>
                      );
                    }) : (
                      <p className="py-4 text-center text-sm text-muted-foreground" data-testid="empty-substancias">
                        {substancias.length ? "Nenhuma substância corresponde à busca." : "Não há substâncias no catálogo para vincular."}
                      </p>
                    )}
                    {substanciasVinculadasAusentes.map((id) => (
                      <div key={id} className="concave-3d flex items-center gap-2 px-3 py-2 text-xs text-amber-800" data-testid={`warning-substancia-ausente-${id}`}>
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        Vínculo preservado para o identificador {id}; registro não disponível no catálogo carregado.
                      </div>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-primary" data-testid="text-quantidade-substancias">
                    {quantidadeSubstancias(formulario.produtoIds.length)}
                  </p>
                </>
              )}
            </div>

            <ProfissionaisNecessarios grupos={formulario.profissionaisNecessarios}
              onChange={(grupos) => alterarCampo("profissionaisNecessarios", grupos)}
              identidade={`${me?.id ?? "sem-sessao"}:${procedimentosQuery.data?.empresaId ?? "sem-clinica"}`}
              enabled={formularioAberto && servidorAtualizado} />

            <div className="concave-3d flex items-start gap-3 p-3">
              <Checkbox
                id="procedimento-ativo"
                checked={formulario.ativo}
                onCheckedChange={(checked) => alterarCampo("ativo", checked === true)}
                aria-label="Manter procedimento ativo"
                data-testid="checkbox-procedimento-ativo"
              />
              <div className="min-w-0">
                <label htmlFor="procedimento-ativo" className="cursor-pointer text-sm font-bold text-foreground">Procedimento ativo</label>
                <p className="mt-0.5 text-xs text-muted-foreground">Inativar preserva o cadastro e todos os vínculos.</p>
              </div>
            </div>

            {erroFormulario && (
              <div className="concave-3d flex items-start gap-2 p-3 text-sm text-red-800" role="alert" data-testid="error-procedimento-form">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{erroFormulario}</span>
              </div>
            )}
            <div className="flex flex-col-reverse gap-3 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="btn-3d-soft min-h-11" onClick={fecharFormulario} disabled={salvando} data-testid="button-cancel-procedimento">
                Cancelar
              </Button>
              <Button type="submit" className="btn-3d min-h-11 gap-2" disabled={salvando} data-testid="button-save-procedimento">
                {salvando ? <RotateCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                {salvando ? "Salvando…" : editandoId == null ? "Salvar procedimento" : "Salvar alterações"}
              </Button>
            </div>
          </form>
        </section>
      )}

      {!formularioAberto && isCeo && me && procedimentosQuery.isSuccess && (
        <CatalogoProdutos
          produtos={substancias}
          carregando={substanciasQuery.isLoading}
          erro={!!substanciasQuery.error}
          tentarNovamente={() => void substanciasQuery.refetch()}
          onEscolher={iniciarNovo}
        />
      )}

      <section className="panel-3d p-4 sm:p-5" aria-labelledby="lista-procedimentos-titulo">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
              <Users className="h-4 w-4" aria-hidden="true" />
              Catálogo da clínica
            </div>
            <h2 id="lista-procedimentos-titulo" className="mt-3 text-xl font-extrabold text-primary">Procedimentos cadastrados</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto] lg:w-auto lg:min-w-[620px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                className="field-engraved min-h-11 pl-9"
                placeholder="Buscar procedimentos"
                aria-label="Buscar procedimentos por nome ou descrição"
                data-testid="input-search-procedimentos"
              />
            </div>
            <select
              value={filtroStatus}
              onChange={(event) => setFiltroStatus(event.target.value as FiltroStatus)}
              className="field-engraved min-h-11 rounded-md border border-input px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Filtrar por status"
              data-testid="select-filter-status"
            >
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
              <option value="todos">Todos os status</option>
            </select>
          </div>
        </div>

        {procedimentosQuery.isFetching && !procedimentosQuery.isLoading && (
          <p className="mt-4 flex items-center gap-2 text-xs font-bold text-muted-foreground" role="status" data-testid="status-atualizando">
            <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Atualizando procedimentos…
          </p>
        )}

        {carregandoPermissoes || procedimentosQuery.isLoading ? (
          <div className="mt-5 space-y-4" aria-label="Carregando procedimentos">
            {[0, 1, 2].map((index) => (
              <div className="panel-3d-sub space-y-3 p-4" key={index}>
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-1/3" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              </div>
            ))}
          </div>
        ) : !me ? (
          <div className="panel-3d-sub mt-5 p-6" role="alert">
            <p>Não foi possível verificar a identidade profissional. Nenhum cadastro foi carregado.</p>
            <Button type="button" className="btn-3d-soft mt-3" onClick={verificarPermissoes}>Tentar novamente</Button>
          </div>
        ) : erroLista ? (
          <div className="panel-3d-sub mt-5 flex flex-col items-center gap-3 p-8 text-center" role="alert" data-testid="error-list-procedimentos">
            <span className="concave-3d grid h-12 w-12 place-items-center text-red-700">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-bold text-primary">Não foi possível carregar os procedimentos</h3>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">{mensagemErro(erroLista)}</p>
            </div>
            <Button type="button" className="btn-3d-soft min-h-10 gap-2" onClick={() => void procedimentosQuery.refetch()} data-testid="button-retry-procedimentos">
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Tentar novamente
            </Button>
          </div>
        ) : procedimentos.length === 0 ? (
          <div className="panel-3d-sub mt-5 flex flex-col items-center px-5 py-12 text-center" data-testid="empty-procedimentos">
            <span className="concave-3d grid h-16 w-16 place-items-center text-primary/70">
              <Stethoscope className="h-7 w-7" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-lg font-extrabold text-primary">Nenhum procedimento cadastrado</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Os procedimentos desta clínica aparecem aqui depois de cadastrados. Nenhum registro de exemplo foi criado.
            </p>
            {isCeo && (
              <Button type="button" className="btn-3d mt-5 min-h-11 gap-2" onClick={() => iniciarNovo()} disabled={formularioAberto} data-testid="button-empty-new-procedimento">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Cadastrar procedimento
              </Button>
            )}
          </div>
        ) : semResultados ? (
          <div className="panel-3d-sub mt-5 flex flex-col items-center px-5 py-10 text-center" data-testid="empty-filtered-procedimentos">
            <Search className="h-7 w-7 text-muted-foreground/60" aria-hidden="true" />
            <h3 className="mt-3 font-bold text-primary">Nenhum resultado para estes filtros</h3>
            <p className="mt-1 text-sm text-muted-foreground">Tente outra busca ou status.</p>
            <Button type="button" variant="outline" className="btn-3d-soft mt-4 min-h-10" onClick={() => { setBusca(""); setFiltroStatus("todos"); }} data-testid="button-clear-filters">
              Limpar filtros
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {filtrados.map((procedimento) => {
              const editing = formularioAberto && editandoId === procedimento.id;
              const linkedSubstances = substancias.filter((item) => procedimento.produtoIds.includes(item.id));
              return (
                <article
                  key={procedimento.id}
                  className={`panel-3d-sub overflow-hidden border-l-4 ${procedimento.ativo ? "border-l-emerald-600" : "border-l-amber-500"}`}
                  data-testid={`card-procedimento-${procedimento.id}`}
                >
                  <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2.5">
                    <span className={`paxter-led ${procedimento.ativo ? "paxter-led-green" : "paxter-led-amber paxter-led-off"}`} aria-hidden="true" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{procedimento.ativo ? "Ativo" : "Inativo"}</span>
                    <span className="ml-auto concave-3d px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                      ID {procedimento.id}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-lg font-extrabold text-primary" data-testid={`text-procedimento-nome-${procedimento.id}`}>
                          {procedimento.nome}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">{procedimento.dose ? `Dose: ${procedimento.dose}` : "Dose: —"}</p>
                        {procedimento.dosePendenteRevisao && <p role="alert" className="mt-1 text-xs font-bold text-amber-800">
                          A dose do produto mudou ou está indisponível; confira antes de usar.
                        </p>}
                        {!!procedimento.camposOrigemIndisponivel?.length && <p role="alert" className="mt-1 text-xs font-bold text-amber-800">
                          Campo do produto indisponível: {procedimento.camposOrigemIndisponivel.join(", ")}.
                        </p>}
                      </div>
                      <span className="screen-3d hidden shrink-0 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-primary sm:inline-flex">
                        Procedimento
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                      <div className="concave-3d min-w-0 p-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Equipe</p>
                        <p className="mt-1 truncate text-xs font-bold text-foreground">
                          {procedimento.profissionaisNecessarios?.length ? `${procedimento.profissionaisNecessarios.length} necessidade(s)` : "Equipe a definir"}
                        </p>
                      </div>
                      <div className="concave-3d min-w-0 p-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Duração</p>
                        <p className="mt-1 text-xs font-bold text-foreground">{procedimento.duracaoMinutos == null ? "—" : `${procedimento.duracaoMinutos.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} min`}</p>
                      </div>
                      <div className="concave-3d min-w-0 p-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Substâncias</p>
                        <p className="mt-1 truncate text-xs font-bold text-foreground">{quantidadeSubstancias(procedimento.produtoIds.length)}</p>
                      </div>
                      <div className="concave-3d min-w-0 p-2.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Descrição</p>
                        <p className="mt-1 truncate text-xs font-bold text-foreground" title={procedimento.descricao ?? undefined}>{procedimento.descricao || "—"}</p>
                      </div>
                    </div>

                    {procedimento.produtoIds.length > 0 && (
                      <details className="mt-3">
                        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 concave-3d px-3 py-2 text-xs font-bold text-primary">
                          <Syringe className="h-4 w-4" aria-hidden="true" />
                          Ver vínculos de substâncias
                          <ChevronDown className="ml-auto h-4 w-4" aria-hidden="true" />
                        </summary>
                        <ul className="mt-3 space-y-2">
                          {procedimento.produtoIds.map((id) => {
                            const substance = linkedSubstances.find((item) => item.id === id);
                            return (
                              <li key={id} className="bevel-3d px-3 py-2 text-xs font-semibold text-foreground" data-testid={`linked-substance-${procedimento.id}-${id}`}>
                                {substance ? nomeSubstancia(substance) : `Substância indisponível no catálogo · ID ${id}`}
                              </li>
                            );
                          })}
                        </ul>
                      </details>
                    )}

                    <div className="mt-4 flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:justify-end">
                      {isCeo && (
                        <>
                          <Button type="button" variant="outline" className="btn-3d-soft min-h-10 gap-2" onClick={() => editing ? fecharFormulario() : iniciarEdicao(procedimento)} disabled={formularioAberto && !editing} aria-expanded={editing} data-testid={`button-edit-procedimento-${procedimento.id}`}>
                            {editing ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
                            {editing ? "Fechar edição" : "Editar"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="btn-3d-soft min-h-10"
                            onClick={() => void alternarAtivo(procedimento)}
                            disabled={formularioAberto || atualizarProcedimento.isPending}
                            data-testid={`${procedimento.ativo ? "button-inactivate" : "button-reactivate"}-procedimento-${procedimento.id}`}
                          >
                            {procedimento.ativo ? "Inativar" : "Reativar"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
