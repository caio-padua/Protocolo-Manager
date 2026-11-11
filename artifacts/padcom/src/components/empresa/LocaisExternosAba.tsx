import { useRef, useState } from "react";
import { ArrowLeft, Loader2, MapPin, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { textoDoLocal, useAtivarLocalExterno, useExcluirLocalExterno, useLocaisExternos, useSalvarLocalExterno, type LocalExterno } from "@/lib/locais-externos-api";
import {
  SECOES, TODOS_CAMPOS, corpoDoFormulario, faltaPreencher, mascarar, valoresDoLocal, valoresVazios,
  type Bloco, type Campo, type Valores,
} from "@/lib/locais-externos-campos";

/** Quando o CEP fecha 8 dígitos, preenche rua/bairro/cidade/UF do mesmo bloco (comercial ou fiscal). Tudo continua editável. */
const DESTINO_CEP: Record<string, readonly [string, string, string, string]> = {
  cep: ["logradouro", "bairro", "cidade", "uf"],
  cepFiscal: ["enderecoFiscal", "bairroFiscal", "cidadeFiscal", "estadoFiscal"],
};

function CampoEditavel({ campo, valor, onChange }: { campo: Campo; valor: string | boolean; onChange: (v: string | boolean) => void }) {
  const texto = String(valor ?? "");
  const rotulo = <label className="lbl" htmlFor={`le-${campo.key}`}>{campo.label}</label>;
  const dica = campo.dica ? <p className="text-[9px] text-muted-foreground/60">{campo.dica}</p> : null;
  const mono = campo.mono ? "font-mono" : "";

  if (campo.tipo === "bool") {
    return (
      <div className="flex items-center gap-3 pb-2">
        <Switch id={`le-${campo.key}`} checked={valor === true} onCheckedChange={onChange} />
        <label className="lbl !mt-0" htmlFor={`le-${campo.key}`}>{campo.label}</label>
      </div>
    );
  }
  if (campo.tipo === "select") {
    return (
      <div className="space-y-1.5">
        {rotulo}
        <div className="concave-3d p-1">
          <Select value={texto} onValueChange={(v) => { if (v) onChange(v); }}>
            <SelectTrigger id={`le-${campo.key}`} className="border-none bg-transparent shadow-none focus:ring-0 text-[11px]">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {campo.opcoes!.map(([v, r]) => <SelectItem key={v} value={v}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }
  if (campo.tipo === "textarea") {
    return (
      <div className="space-y-1.5">
        {rotulo}
        <Textarea id={`le-${campo.key}`} className="field-engraved min-h-[60px] resize-none" placeholder={campo.placeholder}
          value={texto} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      {rotulo}
      <Input
        id={`le-${campo.key}`}
        className={`field-engraved ${mono} ${campo.tipo === "uf" ? "text-center font-bold" : ""}`}
        type={campo.tipo === "date" ? "date" : campo.tipo === "email" ? "email" : campo.tipo === "int" ? "number" : "text"}
        inputMode={["cnpj", "cpf", "cep", "cnae", "int"].includes(campo.tipo) ? "numeric" : undefined}
        placeholder={campo.placeholder}
        value={texto}
        onChange={(e) => onChange(mascarar(campo.tipo, e.target.value))}
      />
      {dica}
    </div>
  );
}

function BlocoCampos({ bloco, valores, alterar }: { bloco: Bloco; valores: Valores; alterar: (k: string, v: string | boolean) => void }) {
  const grade = bloco.layout === "dois" ? "grid grid-cols-1 md:grid-cols-2 gap-4" : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4";
  const span = bloco.layout === "dois" ? "md:col-span-2" : "sm:col-span-2 xl:col-span-2";
  return (
    <div className="space-y-3">
      {bloco.titulo && (
        <div className="flex items-center gap-3 py-1">
          <div className="h-px bg-primary/20 flex-1" />
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 shrink-0">{bloco.titulo}</span>
          <div className="h-px bg-primary/20 flex-1" />
        </div>
      )}
      <div className={grade}>
        {bloco.campos.map((c) => (
          <div key={c.key} className={`${c.colunas === 2 ? span : ""} ${c.tipo === "bool" ? "flex flex-col justify-end" : ""}`.trim() || undefined}>
            <CampoEditavel campo={c} valor={valores[c.key]} onChange={(v) => alterar(c.key, v)} />
          </div>
        ))}
      </div>
    </div>
  );
}

type Edicao = { id?: number; valores: Valores };

/**
 * Aba "Locais Externos" do cadastro da empresa. Cada local tem os mesmos campos da empresa, é só cadastro interno
 * (CNPJ próprio, sem ligação com nada) e a agenda EXTERNA copia o endereço dele. O miolo tem altura fixa:
 * trocar de seção rola por dentro e nunca muda a altura da janela.
 */
export function LocaisExternosAba({ empresaId }: { empresaId: number }) {
  const { data, isLoading, isError, error, refetch } = useLocaisExternos(empresaId, true);
  const salvar = useSalvarLocalExterno(empresaId);
  const ativar = useAtivarLocalExterno(empresaId);
  const excluir = useExcluirLocalExterno(empresaId);
  const { toast } = useToast();
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aExcluir, setAExcluir] = useState<LocalExterno | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [secao, setSecao] = useState(SECOES[0].id);
  const seqCep = useRef<Record<string, number>>({});
  const podeGerir = data?.podeGerir === true;
  const podeExcluir = data?.podeExcluir === true;

  function abrir(l?: LocalExterno) {
    setEdicao(l ? { id: l.id, valores: valoresDoLocal({ ...l, dados: l.dados ?? {} }) } : { valores: valoresVazios() });
    setSecao(SECOES[0].id);
  }

  async function buscarCep(chave: string, cepMascarado: string) {
    const digitos = cepMascarado.replace(/\D/g, "");
    if (digitos.length !== 8) return;
    const minha = (seqCep.current[chave] = (seqCep.current[chave] ?? 0) + 1);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`);
      const d = await r.json();
      if (minha !== seqCep.current[chave] || d.erro || !d.logradouro) return;
      const [rua, bairro, cidade, uf] = DESTINO_CEP[chave];
      setEdicao((atual) => atual && { ...atual, valores: { ...atual.valores, [rua]: d.logradouro ?? "", [bairro]: d.bairro ?? "", [cidade]: d.localidade ?? "", [uf]: d.uf ?? "" } });
    } catch { /* sem rede: os campos seguem editáveis à mão */ }
  }

  function alterar(chave: string, valor: string | boolean) {
    setEdicao((atual) => atual && { ...atual, valores: { ...atual.valores, [chave]: valor } });
    if (chave in DESTINO_CEP && typeof valor === "string") void buscarCep(chave, valor);
  }

  function gravar() {
    if (!edicao) return;
    const falta = faltaPreencher(edicao.valores);
    if (falta) {
      const primeira = TODOS_CAMPOS.find((c) => c.obrigatorio && !String(edicao.valores[c.key] ?? "").trim());
      const alvo = SECOES.find((s) => s.blocos.some((b) => b.campos.some((c) => c.key === primeira?.key)));
      if (alvo) setSecao(alvo.id);
      toast({ title: falta, variant: "destructive" });
      return;
    }
    salvar.mutate({ id: edicao.id, corpo: corpoDoFormulario(edicao.valores) }, {
      onSuccess: () => { toast({ title: edicao.id ? "Local externo atualizado." : "Local externo cadastrado." }); setEdicao(null); },
      onError: (e) => toast({ title: e.message, variant: "destructive" }),
    });
  }

  function alternarAtivo(l: LocalExterno, ativo: boolean) {
    ativar.mutate({ id: l.id, ativo }, {
      onSuccess: () => toast({ title: ativo ? `"${l.nome}" está ativo.` : `"${l.nome}" foi desativado.`, description: ativo ? undefined : "Some da escolha da agenda. Os dados ficam guardados e você pode reativar." }),
      onError: (e) => toast({ title: e.message, variant: "destructive" }),
    });
  }

  function fecharExclusao() { setAExcluir(null); setConfirmacao(""); }

  function confirmarExclusao() {
    if (!aExcluir) return;
    excluir.mutate({ id: aExcluir.id, confirmacao }, {
      onSuccess: () => { toast({ title: `"${aExcluir.nome}" foi excluído.` }); fecharExclusao(); },
      onError: (e) => toast({ title: e.message, variant: "destructive" }),
    });
  }

  // Enter dentro de um campo não pode enviar o formulário da EMPRESA que contém esta aba.
  const bloquearEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
  };

  if (edicao) {
    const atual = SECOES.find((s) => s.id === secao) ?? SECOES[0];
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3" onKeyDown={bloquearEnter} data-testid="locais-externos-edicao">
        <div role="tablist" aria-label="Seções do local externo" className="panel-3d-sub flex shrink-0 flex-wrap items-center gap-2 p-2">
          <button type="button" className="btn-3d-soft inline-flex items-center px-3 py-2 text-[9px] font-black uppercase tracking-wider sm:text-[10px]"
            onClick={() => setEdicao(null)} disabled={salvar.isPending} data-testid="local-externo-voltar">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Lista
          </button>
          {SECOES.map((s) => (
            <button key={s.id} type="button" role="tab" aria-selected={secao === s.id} aria-pressed={secao === s.id}
              data-testid={`local-externo-aba-${s.id}`}
              onClick={() => setSecao(s.id)}
              className="bevel-3d empresa-aba whitespace-normal px-3 py-2 text-[9px] font-black uppercase tracking-wider sm:text-[10px]">
              {s.rotulo}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-1" data-testid="locais-externos-miolo">
          {atual.blocos.map((b, i) => <BlocoCampos key={`${atual.id}-${i}`} bloco={b} valores={edicao.valores} alterar={alterar} />)}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 pt-3">
          <p className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {edicao.id ? `Editando — ${String(edicao.valores.nome) || "local externo"}` : "Novo local externo"}
          </p>
          <Button type="button" className="btn-3d-soft" onClick={() => setEdicao(null)} disabled={salvar.isPending}>CANCELAR</Button>
          <Button type="button" className="btn-3d px-6" onClick={gravar} disabled={salvar.isPending} data-testid="local-externo-salvar">
            {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            SALVAR LOCAL EXTERNO
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="locais-externos-lista">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-primary">
          <MapPin className="h-4 w-4" /> Locais externos · {data?.locais.length ?? 0}
        </span>
        <Button type="button" className="btn-3d" disabled={!podeGerir} onClick={() => abrir()}>
          <Plus className="mr-1 h-4 w-4" /> NOVO LOCAL EXTERNO
        </Button>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        Consultórios em outro endereço, com os mesmos campos desta empresa. É cadastro interno, sem ligação com outros sistemas.
        Na agenda, ao escolher "Externo (outro endereço)", o endereço do local entra sozinho.
      </p>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain pr-1">
        {isLoading && <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
        {isError && (
          <div role="alert" className="paxter-alert paxter-alert-amber px-3 py-2 text-sm">
            {(error as Error).message}{" "}
            <button type="button" className="btn-3d-soft px-2 py-1" onClick={() => void refetch()}>Tentar novamente</button>
          </div>
        )}
        {data && !podeGerir && (
          <p className="paxter-alert paxter-alert-amber px-3 py-2 text-xs font-semibold">Seu acesso só consulta esta lista.</p>
        )}
        {data && data.locais.length === 0 && <p className="concave-3d p-4 text-sm text-muted-foreground">Nenhum local externo cadastrado.</p>}
        {data?.locais.map((l) => (
          <div key={l.id} className={`bevel-3d flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 ${l.active ? "" : "opacity-70"}`} data-testid={`local-externo-${l.id}`}>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide">
                <span className={`paxter-led ${l.active ? "paxter-led-breathe paxter-led-green" : "paxter-led-amber"}`} aria-hidden />
                {l.nome}
                {!l.active && <span className="rounded-[3px] bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black tracking-widest text-amber-700">DESATIVADO</span>}
              </p>
              <p className="font-mono text-[11px] font-semibold text-muted-foreground">{l.dados?.cnpj ? String(l.dados.cnpj) : "CNPJ não informado"}</p>
              <p className="text-xs font-semibold">{textoDoLocal(l)}</p>
            </div>
            {podeGerir && (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider" htmlFor={`ativo-${l.id}`}>
                  {l.active ? "Ativo" : "Inativo"}
                  <Switch id={`ativo-${l.id}`} checked={l.active} disabled={ativar.isPending}
                    aria-label={`${l.active ? "Desativar" : "Ativar"} ${l.nome}`} data-testid={`local-externo-ativo-${l.id}`}
                    onCheckedChange={(v) => alternarAtivo(l, v)} />
                </label>
                <Button type="button" className="btn-3d-soft" aria-label={`Editar ${l.nome}`} onClick={() => abrir(l)}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
                {podeExcluir && (
                  <Button type="button" className="btn-3d-soft text-destructive" disabled={l.active}
                    title={l.active ? "Desative o local antes de excluir." : "Excluir (pede a confirmação do CEO)"}
                    aria-label={`Excluir ${l.nome}`} data-testid={`local-externo-excluir-${l.id}`}
                    onClick={() => { setAExcluir(l); setConfirmacao(""); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!aExcluir} onOpenChange={(o) => { if (!o) fecharExclusao(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[13px] font-black uppercase tracking-widest text-destructive">EXCLUIR LOCAL EXTERNO</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="concave-3d p-3 text-sm">
              <p className="mb-2 text-muted-foreground">Confirmação do CEO. O local some das telas. Para confirmar, digite o nome exato:</p>
              <p className="font-black text-foreground">{aExcluir?.nome}</p>
            </div>
            <Input className="field-engraved" placeholder="Digite o nome exato do local" value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)} data-testid="local-externo-confirmacao" />
            <DialogFooter>
              <Button type="button" className="btn-3d-soft" onClick={fecharExclusao}>CANCELAR</Button>
              <Button type="button" variant="destructive" className="btn-3d" data-testid="local-externo-confirmar-exclusao"
                disabled={confirmacao !== aExcluir?.nome || excluir.isPending} onClick={confirmarExclusao}>
                {excluir.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                EXCLUIR
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
