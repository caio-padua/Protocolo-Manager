import { ClerkProvider, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
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
    colorForeground: "#ffffff",
    colorMutedForeground: "#b7c0d1",
    colorDanger: "#fca5a5",
    colorBackground: "#16284a",
    colorInput: "#0f1d38",
    colorInputForeground: "#ffffff",
    colorNeutral: "#77849a",
    fontFamily: "Inter, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-[#16284a] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#c2a05a]/30 shadow-2xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-white",
    headerSubtitle: "text-white/70",
    socialButtonsBlockButton:
      "bg-[#0f1d38] border border-white/20 text-white hover:bg-[#1b3158]",
    socialButtonsBlockButtonText: "text-white",
    formFieldLabel: "text-white/85",
    formFieldInput: "bg-[#0f1d38] text-white border-white/20",
    formButtonPrimary: "bg-[#c2a05a] text-[#16284a] hover:bg-[#d4b66b] font-semibold",
    dividerLine: "bg-white/20",
    dividerText: "text-white/55",
    footerActionText: "text-white/65",
    footerActionLink: "text-[#d5b66a] hover:text-white",
    alertText: "text-red-200",
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
    >
      <ClerkActionsBridge>{children}</ClerkActionsBridge>
    </ClerkProvider>
  );
}

export { clerkAppearance };
