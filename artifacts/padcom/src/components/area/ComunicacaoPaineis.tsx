import { useState } from "react";
import { BookOpen, MessageCircle, Send, Smartphone } from "lucide-react";
import { PaxmedNoCelular } from "./PaxmedNoCelular";
import { BotaoCopiar, Etiqueta, Ladrilhos, Passo, type Ladrilho } from "./comunicacao-ui";

export interface DadosComunicacao { vinculado: boolean; botUsername: string; botLink: string; clinicaSlug?: string | null }

/**
 * Aba COMUNICACAO: 4 ladrilhos iguais (Telegram, Celular, WhatsApp, Manual) e UM painel de detalhe
 * com passos de mesma altura. Telegram abre selecionado: e o canal principal.
 * Nenhuma mensagem e enviada daqui; so se gera o link individual (acao ja existente).
 */
export function ComunicacaoPaineis(p: {
  data: DadosComunicacao; link: string | null; gerando: boolean; erroLink: string; onGerar: () => void; guiaHref: string;
}) {
  const { data, link, gerando, erroLink, onGerar, guiaHref } = p;
  const [ativo, setAtivo] = useState("telegram");

  const ladrilhos: Ladrilho[] = [
    { key: "telegram", n: 1, icone: <Send className="h-6 w-6" />, nome: "Telegram",
      etiqueta: data.vinculado ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta cor="ambar">Ativar</Etiqueta> },
    { key: "celular", n: 2, icone: <Smartphone className="h-6 w-6" />, nome: "Celular", etiqueta: <Etiqueta cor="cinza">Atalho</Etiqueta> },
    { key: "whatsapp", n: 3, icone: <MessageCircle className="h-6 w-6" />, nome: "WhatsApp", etiqueta: <Etiqueta cor="ambar">Em breve</Etiqueta> },
    { key: "manual", n: 4, icone: <BookOpen className="h-6 w-6" />, nome: "Manual", etiqueta: <Etiqueta cor="cinza">Ajuda</Etiqueta> },
  ];

  return (
    <div className="space-y-4 comm-raiz">
      <h2 className="text-lg font-bold">Receba seus avisos no Telegram</h2>
      <p className="text-sm">Toque em um quadro para ver o passo a passo. Comece pelo número 1.</p>

      <Ladrilhos itens={ladrilhos} ativo={ativo} onPick={setAtivo} />

      <section className="panel-3d comm-detalhe" data-testid={`comm-painel-${ativo}`} aria-live="polite">
        {ativo === "telegram" && (
          <>
            <div className="comm-detalhe-topo">
              <span className="comm-detalhe-titulo">Telegram</span>
              {data.vinculado ? <Etiqueta cor="verde">Ativo</Etiqueta> : <Etiqueta cor="ambar">Falta ativar</Etiqueta>}
            </div>
            {data.vinculado ? (
              <p className="text-sm">Seu Telegram já está ativo. Você receberá os avisos da clínica por lá.</p>
            ) : (
              <>
                <ol className="comm-passos">
                  <Passo n={1} estado={link ? "feito" : "agora"} titulo="Gerar meu link" dica="Ele é só seu." />
                  <Passo n={2} estado={link ? "agora" : "espera"} titulo="Abrir o Telegram e ativar" dica="Ou copie o link e cole no Telegram." />
                  <Passo n={3} estado="espera" titulo="No Telegram, toque em Iniciar" dica="Em inglês: Start." />
                </ol>
                {!link ? (
                  <button type="button" onClick={onGerar} disabled={gerando} data-testid="comm-gerar" className="comm-btn comm-btn-primario">
                    {gerando ? "Gerando..." : "Gerar meu link para o Telegram"}
                  </button>
                ) : (
                  <div className="comm-caixa-copia">
                    <a href={link} target="_blank" rel="noreferrer" className="comm-btn comm-btn-primario">Abrir o Telegram e ativar</a>
                    <BotaoCopiar texto={link} rotulo="Copiar meu link" testId="comm-copiar-link" />
                  </div>
                )}
                {erroLink && <p className="text-xs text-destructive">{erroLink}</p>}
                <p className="text-xs text-muted-foreground" data-testid="comunicacao-link-regra">
                  O link é só seu, vale uma única vez e por 7 dias. Gerar outro cancela o anterior. O robô nunca inicia a conversa: você precisa tocar em Iniciar.
                </p>
              </>
            )}
            <div className="comm-caixa-copia">
              <div className="comm-codigo concave-3d" data-testid="comm-bot">@{data.botUsername}</div>
              <BotaoCopiar texto={`@${data.botUsername}`} rotulo="Copiar nome do robô" testId="comm-copiar-bot" />
            </div>
          </>
        )}

        {ativo === "celular" && (
          <>
            <div className="comm-detalhe-topo">
              <span className="comm-detalhe-titulo">PaxMed no seu celular</span>
              <Etiqueta cor="cinza">Atalho</Etiqueta>
            </div>
            <PaxmedNoCelular guiaHref={guiaHref} />
          </>
        )}

        {ativo === "whatsapp" && (
          <>
            <div className="comm-detalhe-topo">
              <span className="comm-detalhe-titulo">WhatsApp</span>
              <Etiqueta cor="ambar">Em preparação</Etiqueta>
            </div>
            <p className="text-sm" data-testid="comunicacao-whatsapp-preparacao">
              <b>Em preparação.</b> Ainda não está ativo. Por enquanto, os avisos chegam pelo Telegram.
            </p>
            <button type="button" onClick={() => setAtivo("telegram")} className="comm-btn btn-3d-soft">Voltar ao Telegram</button>
          </>
        )}

        {ativo === "manual" && (
          <>
            <div className="comm-detalhe-topo">
              <span className="comm-detalhe-titulo">Manual e ajuda</span>
              <Etiqueta cor="cinza">Ajuda</Etiqueta>
            </div>
            <ol className="comm-passos">
              <Passo n={1} estado="agora" titulo="Abra o Manual do Cliente" dica="Passo a passo com figuras." />
              <Passo n={2} estado="espera" titulo="Esqueceu a senha?" dica="Na tela de entrada, toque em Entrar com data de nascimento e use CPF e data de nascimento." />
              <Passo n={3} estado="espera" titulo="Ainda não é cliente?" dica={`Abra @${data.botUsername} no Telegram e escreva sua dúvida. Não precisa de senha.`} />
            </ol>
          </>
        )}
      </section>

      <p className="rounded-md border p-3 text-xs" data-testid="comunicacao-aviso-urgencia">
        O Telegram não é canal de emergência nem de consulta imediata. Em urgência, ligue 192 (SAMU) ou procure o pronto atendimento.
      </p>
      <a href={guiaHref} target="_blank" rel="noreferrer" data-testid="comunicacao-abrir-manual" className="comm-btn btn-3d-soft">
        Abrir o Manual do Cliente PaxMed
      </a>
    </div>
  );
}
