import { useState } from "react";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import { decidirInstalacao } from "@/lib/pwa-plataforma";

/**
 * "PAXMED no seu celular": aplicativo instalado pelo navegador (PWA), nao e app de loja.
 * Reaproveita manifest, service worker, icones e o hook usePwaInstall existentes.
 * Sem login nao carrega nada pessoal: o componente nao le dados do cliente.
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
    <section className="panel-3d rounded-[8px] p-4 space-y-3" data-testid="paxmed-no-celular" data-estado={estado.tipo}>
      <h3 className="text-base font-bold">PaxMed no seu celular</h3>
      <p className="text-sm">
        Deixe o atalho do PaxMed{clinicaNome ? ` de ${clinicaNome}` : ""} na tela inicial e abra com um toque.
        É um atalho instalado pelo navegador, não um aplicativo de loja.
      </p>

      {estado.tipo === "instalado" && (
        <p className="text-sm font-semibold" data-testid="pwa-instalado">O PaxMed já está instalado neste aparelho.</p>
      )}
      {estado.tipo === "prompt" && (
        <button type="button" onClick={instalar} data-testid="pwa-instalar"
          className="block w-full rounded-md bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground">
          Instalar o PaxMed neste aparelho
        </button>
      )}
      {estado.tipo === "ios" && (
        <ol className="list-decimal pl-5 space-y-1 text-sm" data-testid="pwa-ios">
          <li>Abra esta página no <b>Safari</b> (outros navegadores do iPhone não instalam).</li>
          <li>Toque em <b>Compartilhar</b> (quadrado com seta para cima).</li>
          <li>Toque em <b>Adicionar à Tela de Início</b> e depois em <b>Adicionar</b>.</li>
        </ol>
      )}
      {estado.tipo === "android-manual" && (
        <p className="text-sm" data-testid="pwa-android-manual">
          Abra esta página no <b>Chrome</b>, toque nos três pontos e escolha <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.
        </p>
      )}
      {estado.tipo === "desktop" && (
        <p className="text-sm" data-testid="pwa-desktop">
          No computador, use o ícone de instalação no fim da barra de endereço (Chrome ou Edge). Se não aparecer, salve esta página nos Favoritos.
          Para instalar no celular, abra este endereço nele.
        </p>
      )}
      {msg && <p className="text-xs" role="status">{msg}</p>}

      <a href={`${guiaHref}#sec-instalar`} target="_blank" rel="noreferrer" data-testid="pwa-guia"
        className="block rounded-md border px-4 py-2 text-center text-xs font-bold">
        Ver o passo a passo no Manual do Cliente
      </a>
    </section>
  );
}
