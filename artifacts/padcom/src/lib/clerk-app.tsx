import { ClerkProvider, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { ptBR } from "@clerk/localizations";
import { useLocation } from "wouter";
import { createContext, useContext, type ReactNode } from "react";

export const clerkBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const fallbackPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
export const clerkPublishableKey = fallbackPublishableKey
  ? publishableKeyFromHost(window.location.hostname, fallbackPublishableKey)
  : "";
export const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

interface ClerkActions {
  available: boolean;
  signOut: () => Promise<void>;
}

const ClerkActionsContext = createContext<ClerkActions>({
  available: false,
  signOut: async () => {
    throw new Error("O acesso Google não está configurado neste ambiente.");
  },
});

export function useClerkActions(): ClerkActions {
  return useContext(ClerkActionsContext);
}

function ClerkActionsBridge({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  return (
    <ClerkActionsContext.Provider value={{ available: true, signOut }}>
      {children}
    </ClerkActionsContext.Provider>
  );
}

function stripBase(path: string): string {
  return clerkBasePath && path.startsWith(clerkBasePath)
    ? path.slice(clerkBasePath.length) || "/"
    : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: clerkBasePath || "/",
    logoImageUrl: `${window.location.origin}${clerkBasePath}/brand/paxter-symbol.png`,
  },
  variables: {
    colorPrimary: "#c2a05a",
    colorForeground: "#16284a",
    colorMutedForeground: "#59677f",
    colorDanger: "#b42318",
    colorBackground: "#f3ecdd",
    colorInput: "#fffdf8",
    colorInputForeground: "#16284a",
    colorNeutral: "#77849a",
    fontFamily: "Inter, sans-serif",
    borderRadius: "6px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "panel-3d-sub rounded-[6px] w-[440px] max-w-full overflow-hidden border border-[#c2a05a]/40",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#16284a]",
    headerSubtitle: "text-[#16284a]/70",
    socialButtonsBlockButton:
      "btn-3d-soft !bg-[#fffdf8] !border-[#16284a]/20 !text-[#16284a] hover:!bg-white",
    socialButtonsBlockButtonText: "!text-[#16284a]",
    formFieldLabel: "text-[#16284a]/85",
    formFieldInput:
      "!bg-[#fffdf8] !text-[#16284a] !border-[#16284a]/25 placeholder:text-[#59677f]",
    formButtonPrimary: "btn-3d-gold",
    dividerLine: "bg-[#16284a]/15",
    dividerText: "text-[#16284a]/55",
    footerActionText: "text-[#16284a]/65",
    footerActionLink: "text-[#916f32] hover:text-[#16284a]",
    alertText: "text-red-700",
  },
};

const paxterPortuguese = {
  ...ptBR,
  signIn: {
    ...ptBR.signIn!,
    start: {
      ...ptBR.signIn!.start!,
      title: "Acessar o PAXTER",
      subtitle: "Use sua conta Google vinculada ao cadastro profissional.",
      subtitleCombined: "Entre para continuar no PAXTER.",
    },
  },
};

export function ClerkAppProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  if (!clerkPublishableKey) {
    return (
      <ClerkActionsContext.Provider
        value={{
          available: false,
          signOut: async () => {
            throw new Error("O acesso Google não está configurado neste ambiente.");
          },
        }}
      >
        {children}
      </ClerkActionsContext.Provider>
    );
  }
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      proxyUrl={clerkProxyUrl}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to))}
      appearance={clerkAppearance}
      localization={paxterPortuguese}
    >
      <ClerkActionsBridge>{children}</ClerkActionsBridge>
    </ClerkProvider>
  );
}

export { clerkAppearance };
