import { useLayoutEffect } from "react";

// Uma escrita já enviada não é cancelada com segurança apenas por desmontar a tela.
// Mantém a operação e o resultado no mesmo contexto enquanto ela está pendente.
export function useProtocoloNavigationGuard(active: boolean, notify: () => void) {
  useLayoutEffect(() => {
    if (!active) return;
    const lockedUrl = window.location.href;
    const lockedState = window.history.state;
    const originalPush = window.history.pushState;
    const originalReplace = window.history.replaceState;
    const marker = `protocolo-${Date.now()}-${Math.random()}`;
    const sentinelState = { ...(lockedState && typeof lockedState === "object" ? lockedState : {}), __protocoloPendente: marker };

    const blocked = (url?: string | URL | null) =>
      url != null && new URL(url, window.location.href).href !== lockedUrl;

    const guardedPush: History["pushState"] = function (data, unused, url) {
      if (blocked(url)) { notify(); return; }
      originalPush.call(window.history, data, unused, url);
    };
    const guardedReplace: History["replaceState"] = function (data, unused, url) {
      if (blocked(url)) { notify(); return; }
      originalReplace.call(window.history, data, unused, url);
    };
    window.history.pushState = guardedPush;
    window.history.replaceState = guardedReplace;

    const onPopState = (event: PopStateEvent) => {
      event.stopImmediatePropagation();
      originalPush.call(window.history, sentinelState, "", lockedUrl);
      notify();
    };
    const onLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || !blocked(link.href)) return;
      event.preventDefault();
      event.stopPropagation();
      notify();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", onPopState, true);
    document.addEventListener("click", onLink, true);
    window.addEventListener("beforeunload", onBeforeUnload);
    // A entrada com a mesma URL impede que o primeiro "voltar" exponha outra
    // rota ao roteador antes de o evento de histórico ser recebido.
    originalPush.call(window.history, sentinelState, "", lockedUrl);
    return () => {
      window.removeEventListener("popstate", onPopState, true);
      document.removeEventListener("click", onLink, true);
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (window.history.pushState === guardedPush) window.history.pushState = originalPush;
      if (window.history.replaceState === guardedReplace) window.history.replaceState = originalReplace;
      if (window.location.href === lockedUrl && window.history.state?.__protocoloPendente === marker) {
        window.history.back();
      }
    };
  }, [active, notify]);
}
