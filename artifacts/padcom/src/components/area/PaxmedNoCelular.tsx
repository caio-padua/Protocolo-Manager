import { useState } from "react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { decidirInstalacao } from "@/lib/pwa-plataforma";
import { Passo } from "./comunicacao-ui";

/**
 * "PAXMED no seu celular": aplicativo instalado pelo navegador (PWA), nao e app de loja.
 * Reaproveita manifest, service worker, icones e o hook usePwaInstall existentes.
 * Sem login nao carrega nada pessoal: o componente nao le dados do cliente.
 * Conteudo do painel "CELULAR" da aba Comunicacao (a moldura vem do painel).
 */
export function PaxmedNoCelular({ clinicaNome, guiaHref }: { clinicaNome?: string | null; guiaHref: string }) {
  const { canInstall, installed, promptInstall, isIOS, isAndroid } = usePwaInstall();
  const [msg, setMsg] = useState<string | null>(null);
  const estado = decidirInstalacao({ installed, canInstall, isIOS, isAndroid });

  async function instalar() {
    const r = await promptInstall();
    if (r === "accepted") setMsg("Pronto. Procure o ícone PaxMed na tela inicial do seu celular.");
    else if (r === "dismissed") setMsg("Instalação cancelada. Você pode instalar quando quiser.");
    else setMsg("Seu navegador não liberou a instalação agora. Use o passo a passo do Manual.");
  }

  return (
    <div className="grid gap-3" data-testid="paxmed-no-celular" data-estado={estado.tipo}>
      <p className="text-sm">
        Atalho do PaxMed{clinicaNome ? ` de ${clinicaNome}` : ""} na tela inicial, aberto com um toque.
        É instalado pelo navegador, não é aplicativo de loja.
      </p>

      {estado.tipo === "instalado" && (
        <p className="text-sm font-semibold" data-testid="pwa-instalado">O PaxMed já está instalado neste aparelho.</p>
      )}
      {estado.tipo === "prompt" && (
        <>
          <ol className="comm-passos">
            <Passo n={1} estado="agora" titulo="Toque no botão abaixo" dica="O navegador vai pedir sua confirmação." />
            <Passo n={2} estado="espera" titulo="Confirme em Instalar" dica="O ícone PaxMed aparece na tela inicial." />
          </ol>
          <button type="button" onClick={instalar} data-testid="pwa-instalar" className="comm-btn comm-btn-primario">
            Instalar o PaxMed neste aparelho
          </button>
        </>
      )}
      {estado.tipo === "ios" && (
        <ol className="comm-passos" data-testid="pwa-ios">
          <Passo n={1} estado="agora" titulo="Abra esta página no Safari" dica="Outros navegadores do iPhone não instalam." />
          <Passo n={2} estado="espera" titulo="Toque em Compartilhar" dica="Quadrado com seta para cima." />
          <Passo n={3} estado="espera" titulo="Adicionar à Tela de Início" dica="Depois toque em Adicionar." />
        </ol>
      )}
      {estado.tipo === "android-manual" && (
        <ol className="comm-passos" data-testid="pwa-android-manual">
          <Passo n={1} estado="agora" titulo="Abra esta página no Chrome" />
          <Passo n={2} estado="espera" titulo="Toque nos três pontos" dica="Canto superior direito." />
          <Passo n={3} estado="espera" titulo="Instalar aplicativo" dica="Ou Adicionar à tela inicial." />
        </ol>
      )}
      {estado.tipo === "desktop" && (
        <ol className="comm-passos" data-testid="pwa-desktop">
          <Passo n={1} estado="agora" titulo="Abra este mesmo endereço no seu celular" dica="No computador, use o ícone de instalar no fim da barra de endereço (Chrome ou Edge)." />
          <Passo n={2} estado="espera" titulo="iPhone: Compartilhar > Adicionar à Tela de Início" />
          <Passo n={3} estado="espera" titulo="Android: três pontos > Instalar aplicativo" />
        </ol>
      )}
      {msg && <p className="text-xs" role="status">{msg}</p>}

      <a href={`${guiaHref}#sec-instalar`} target="_blank" rel="noreferrer" data-testid="pwa-guia"
        className="comm-btn btn-3d-soft">
        Ver o passo a passo no Manual do Cliente
      </a>
    </div>
  );
}
