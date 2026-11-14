import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Client } from "@workspace/api-client-react";
import {
  Camera, ChevronDown, Image,
  MessageCircle, Stethoscope, UserRound,
} from "lucide-react";
import { AVALIACOES, TIPOS_AVALIACAO } from "@workspace/avaliacoes-corporais";
import type { TipoAvaliacao } from "@workspace/avaliacoes-corporais";
import { AvaliacaoModal } from "./avaliacoes/AvaliacaoModal";
import { ICONES_AVALIACAO } from "./avaliacoes/icones";
import { dataBr, useMedicoes } from "./avaliacoes/api";
import { BASE } from "@/pages/comunicacao/_shared";
import { tituloProprio } from "@/lib/utils";
import { NomeClienteResponsivo } from "./NomeClienteResponsivo";
import { formatarNascimento, idadeCompleta } from "./idadeCliente";

type Pulso = {
  data: string;
  periodo: string;
  pressaoSistolica: number | null;
  pressaoDiastolica: number | null;
  energia: number | null;
};

function formatarCpf(cpf?: string | null) {
  if (!cpf) return "—";
  const digitos = cpf.replace(/\D/g, "");
  return digitos.length === 11
    ? digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : cpf;
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "";
  return (partes.length === 1
    ? partes[0].slice(0, 2)
    : `${partes[0][0]}${partes[partes.length - 1][0]}`).toUpperCase();
}

function ResumoRegistrado({ clientId }: { clientId: number }) {
  const { data, isLoading, isError, refetch } = useQuery<Pulso[]>({
    queryKey: ["pulso-diario", clientId],
    queryFn: async ({ signal }) => {
      const resposta = await fetch(`${BASE}/api/pulso-diario/${clientId}?dias=14`, { signal });
      if (!resposta.ok) throw new Error("Falha ao carregar o acompanhamento.");
      return resposta.json();
    },
    retry: false,
  });
  if (isLoading) return <p role="status">Carregando o acompanhamento…</p>;
  if (isError) return (
    <div role="alert">
      <p>Não foi possível consultar o acompanhamento.</p>
      <button type="button" className="cc-inline-action" onClick={() => void refetch()}>Tentar novamente</button>
    </div>
  );
  const ultimo = [...(data ?? [])].sort((a, b) =>
    b.data.localeCompare(a.data) ||
    (["manha", "tarde", "noite"].indexOf(b.periodo) - ["manha", "tarde", "noite"].indexOf(a.periodo)),
  )[0];
  if (!ultimo) return <p>Nenhum registro de acompanhamento encontrado.</p>;
  const pressao = ultimo.pressaoSistolica != null || ultimo.pressaoDiastolica != null
    ? `${ultimo.pressaoSistolica ?? "—"}/${ultimo.pressaoDiastolica ?? "—"}`
    : "Não informada";
  return (
    <div className="cc-summary-data">
      <div><span>Último registro</span><strong>{formatarNascimento(ultimo.data) ?? ultimo.data}</strong></div>
      <div><span>Período</span><strong>{({ manha: "Manhã", tarde: "Tarde", noite: "Noite" } as Record<string, string>)[ultimo.periodo] ?? ultimo.periodo}</strong></div>
      <div><span>Pressão registrada</span><strong>{pressao}</strong></div>
      <div><span>Energia registrada</span><strong>{ultimo.energia == null ? "Não informada" : `${ultimo.energia}/10`}</strong></div>
    </div>
  );
}

interface ClientIdentityProps {
  client: Client;
  onMensagens: () => void;
}

const PLANO_NOME: Record<string, string> = { bronze: "Bronze", prata: "Prata", ouro: "Ouro", platina: "Platina" };

export default function ClientIdentity({ client, onMensagens }: ClientIdentityProps) {
  const [aberto, setAberto] = useState<"resumo" | "imagem" | null>(null);
  const idade = idadeCompleta(client.birthDate);
  // Dado ausente (resposta sem o campo) aparece como traco, nunca como valor inventado
  const classif = client.classificacao ?? "—";
  const planoNome = client.plano ? PLANO_NOME[client.plano] : "—";
  const campos = [
    { label: "CPF", value: formatarCpf(client.cpf) },
    { label: "NASCIMENTO", value: formatarNascimento(client.birthDate) ?? "—" },
    { label: "TELEFONE", value: client.phone || "—" },
    { label: "E-MAIL", value: client.email || "—" },
    { label: "ENDEREÇO", value: client.address || "Não informado", address: true },
  ];
  const medicoes = useMedicoes(client.id);
  const [avaliacaoAberta, setAvaliacaoAberta] = useState<TipoAvaliacao | null>(null);
  const [escuro, setEscuro] = useState(false);
  const abrirAvaliacao = (tipo: TipoAvaliacao) => {
    // O modal fica fora do cockpit (portal): leva o tema escolhido no botao claro/escuro
    setEscuro(Boolean(document.querySelector(".cc-shell.dark")));
    setAvaliacaoAberta(tipo);
  };
  const resumoAvaliacao = (tipo: TipoAvaliacao) => {
    if (medicoes.isLoading) return "Carregando…";
    if (medicoes.isError) return "Erro ao carregar";
    const lista = (medicoes.data ?? []).filter((m) => m.tipo === tipo);
    if (!lista.length) return "Sem medições";
    return `${lista.length} ${lista.length === 1 ? "medição" : "medições"} · ${dataBr(lista[lista.length - 1].data)}`;
  };

  return (
    <section className="cc-identity" aria-label="Identificação do cliente">
      <div className="cc-profile">
        <div className="cc-portrait">
          {client.photoUrl ? (
            <img src={client.photoUrl} alt="" />
          ) : (
            <span aria-hidden="true">{iniciais(client.name) || <UserRound size={26} />}</span>
          )}
        </div>
        <div className="cc-grade-plan" aria-label={`Classificação ${classif}, plano ${planoNome}`}>
          <span title={`Classificação ${classif}`}>{classif}</span>
          <span title={`Plano ${planoNome}`} data-plano={client.plano ?? undefined}>{planoNome}</span>
        </div>
      </div>

      <div className="cc-identity-information">
        <div className="cc-client-code">CÓDIGO CLIENTE: {client.id}</div>
        <NomeClienteResponsivo nome={tituloProprio(client.name)} />
        <div className="cc-age">{idade ?? "Data de nascimento não informada ou inválida"}</div>
        <dl className="cc-client-details">
          {campos.map((campo) => (
            <div key={campo.label} className={campo.address ? "cc-detail cc-detail-address" : "cc-detail"}>
              <dt>{campo.label}</dt>
              <dd title={campo.value}>{campo.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="cc-context">
        <div className="cc-context-grid" role="group" aria-label="Informações do cliente">
          <button type="button" className="cc-context-button" data-active={aberto === "resumo"}
            aria-expanded={aberto === "resumo"} aria-controls="cc-resumo-cliente"
            onClick={() => setAberto((atual) => atual === "resumo" ? null : "resumo")}>
            <Stethoscope size={15} aria-hidden="true" />
            <span><strong>RESUMO</strong><small>Acompanhamento</small></span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          <button type="button" className="cc-context-button" onClick={onMensagens}>
            <MessageCircle size={15} aria-hidden="true" />
            <span><strong>MENSAGENS</strong><small>Abrir Telegram</small></span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          <button type="button" className="cc-context-button" data-active={aberto === "imagem"}
            aria-expanded={aberto === "imagem"} aria-controls="cc-imagem-cliente"
            onClick={() => setAberto((atual) => atual === "imagem" ? null : "imagem")}>
            <Image size={15} aria-hidden="true" />
            <span><strong>IMAGENS</strong><small>Foto do cadastro</small></span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>
          {TIPOS_AVALIACAO.map((tipo) => {
            const Icone = ICONES_AVALIACAO[tipo];
            return (
              <button key={tipo} type="button" className="cc-context-button" onClick={() => abrirAvaliacao(tipo)}
                title={AVALIACOES[tipo].descricao}>
                <Icone size={15} aria-hidden="true" />
                <span><strong>{AVALIACOES[tipo].titulo.toUpperCase()}</strong><small>{resumoAvaliacao(tipo)}</small></span>
              </button>
            );
          })}
        </div>
        {aberto === "resumo" && (
          <div id="cc-resumo-cliente" className="cc-context-content">
            <ResumoRegistrado clientId={client.id} />
          </div>
        )}
        {aberto === "imagem" && (
          <div id="cc-imagem-cliente" className="cc-context-content cc-photo-content">
            {client.photoUrl
              ? <img src={client.photoUrl} alt={`Foto cadastrada de ${client.name}`} />
              : <Camera size={23} aria-hidden="true" />}
            <div>
              <strong>Foto do cadastro</strong>
              <p>{client.photoUrl ? "Imagem de identificação do cliente." : "Nenhuma foto de cadastro informada."}</p>
              <p>A galeria de imagens clínicas ainda não está conectada.</p>
            </div>
          </div>
        )}
      </div>
      <AvaliacaoModal clientId={client.id} clienteNome={tituloProprio(client.name)} tipo={avaliacaoAberta}
        medicoes={medicoes.data ?? []} escuro={escuro} onClose={() => setAvaliacaoAberta(null)} />
    </section>
  );
}
