import { SignIn, SignUp, useAuth } from "@clerk/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import {
  clearCollabSession,
  getCollabToken,
  setCollabSession,
  type CollabProfessional,
} from "@/lib/collab-auth";
import { clerkBasePath, clerkPublishableKey } from "@/lib/clerk-app";

function safeReturnTo(): string {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.startsWith("/login")
  ) {
    return value;
  }
  return "/";
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate min-h-[100dvh] overflow-hidden bg-[#f3ecdd] px-4 py-8 text-[#16284a]">
      <div className="leva-fabric pointer-events-none" aria-hidden="true" />
      <div className="relative z-10 flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center">
        <div className="mb-7 flex flex-col items-center gap-3 select-none">
          <PaxterSymbolGlass size={52} tone="dark" sharp />
          <div className="text-center">
            <p className="text-[24px] font-bold tracking-[0.18em] text-[#16284a] uppercase leading-none">
              PAXTER
            </p>
            <p className="text-[10px] tracking-[0.22em] text-[#916f32] uppercase mt-1">
              Clinical Intelligence System
            </p>
          </div>
        </div>
        <div className="w-full max-w-[440px]">{children}</div>
        <p className="mt-6 text-center text-[10px] text-[#16284a]/55">
          O acesso clínico continua protegido pelo cadastro do profissional.
        </p>
      </div>
    </main>
  );
}

export function ClerkSignInPage() {
  if (!clerkPublishableKey) {
    return (
      <AuthFrame>
        <section className="panel-3d-sub p-5 text-center">
          <h1 className="text-base font-semibold text-foreground">Google indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Este ambiente ainda não tem o acesso Google configurado. Use o formulário de usuário e senha.
          </p>
          <Button asChild className="btn-3d-soft mt-4">
            <a href={`${clerkBasePath}/login`}>Voltar ao acesso do sistema</a>
          </Button>
        </section>
      </AuthFrame>
    );
  }
  const params = new URLSearchParams(window.location.search);
  const returnTo = safeReturnTo();
  const intent = params.get("intent") === "link" ? "link" : "login";
  const returnPath =
    intent === "link" ? "/login/google-link-return" : "/login/google-return";
  const callbackUrl =
    `${clerkBasePath}${returnPath}?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <AuthFrame>
      <p className="mb-3 text-center text-xs text-[#16284a]/70">
        Use a opção Google abaixo. Seu usuário e senha continuam no acesso principal.
      </p>
      <SignIn
        routing="path"
        path={`${clerkBasePath}/sign-in`}
        signUpUrl={`${clerkBasePath}/sign-up`}
        forceRedirectUrl={callbackUrl}
        fallbackRedirectUrl={callbackUrl}
      />
    </AuthFrame>
  );
}

export function ClerkSignUpPage() {
  if (!clerkPublishableKey) {
    return (
      <AuthFrame>
        <section className="panel-3d-sub p-5 text-center">
          <h1 className="text-base font-semibold text-foreground">Acesso Google indisponível</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Entre pelo formulário principal com usuário e senha.
          </p>
        </section>
      </AuthFrame>
    );
  }
  const callbackUrl =
    `${clerkBasePath}/login?google=unlinked`;
  return (
    <AuthFrame>
      <SignUp
        routing="path"
        path={`${clerkBasePath}/sign-up`}
        signInUrl={`${clerkBasePath}/sign-in`}
        forceRedirectUrl={callbackUrl}
        fallbackRedirectUrl={callbackUrl}
      />
    </AuthFrame>
  );
}

function ReturnState({
  title,
  detail,
  error,
}: {
  title: string;
  detail: string;
  error?: string | null;
}) {
  return (
    <AuthFrame>
      <section className="panel-3d-sub p-5 text-center space-y-3">
        {error ? (
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-md bg-red-500/10 text-red-300">
            <ArrowLeft className="h-5 w-5" />
          </div>
        ) : (
          <LoaderCircle className="mx-auto h-7 w-7 animate-spin text-[#d5b66a]" />
        )}
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{error ?? detail}</p>
        {error ? (
          <Button asChild className="btn-3d-soft mt-2">
            <a href={`${clerkBasePath}/login`}>Voltar ao acesso do sistema</a>
          </Button>
        ) : null}
      </section>
    </AuthFrame>
  );
}

function GoogleLoginReturnFlow() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const processed = useRef(false);
  const returnTo = safeReturnTo();

  useEffect(() => {
    if (!isLoaded || processed.current) return;
    if (!isSignedIn) {
      setError("A entrada pelo Google não foi concluída. Entre com usuário e senha.");
      return;
    }
    processed.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/collaborator/google/session", {
          method: "POST",
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (data?.code === "google_account_unavailable") {
            clearCollabSession();
            navigate(
              `/login?google=unlinked&returnTo=${encodeURIComponent(returnTo)}`,
              { replace: true },
            );
            return;
          }
          throw new Error(data?.error ?? "Não foi possível validar o acesso Google.");
        }
        if (!data?.token || !data?.professional) {
          throw new Error("O servidor não confirmou a identidade do profissional.");
        }
        setCollabSession(data.token, data.professional as CollabProfessional);
        navigate(returnTo === "/" ? data.destino || "/" : returnTo, { replace: true });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Falha ao validar o acesso.");
      }
    })();
  }, [isLoaded, isSignedIn, navigate, returnTo]);

  return (
    <ReturnState
      title="Validando sua identidade"
      detail="O sistema está conferindo o vínculo entre sua conta Google e o cadastro profissional."
      error={error}
    />
  );
}

export function GoogleLoginReturnPage() {
  return clerkPublishableKey ? (
    <GoogleLoginReturnFlow />
  ) : (
    <ReturnState
      title="Google indisponível"
      detail="Este ambiente ainda não tem o acesso Google configurado."
      error="Entre com usuário e senha."
    />
  );
}

function GoogleLinkReturnFlow() {
  const { isLoaded, isSignedIn } = useAuth();
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const processed = useRef(false);
  const returnTo = safeReturnTo();

  useEffect(() => {
    if (!isLoaded || processed.current) return;
    if (!isSignedIn) {
      setError("A entrada pelo Google não foi concluída. Tente novamente.");
      return;
    }
    const token = getCollabToken();
    if (!token) {
      setError("Sua sessão do sistema expirou. Entre novamente antes de vincular o Google.");
      return;
    }
    processed.current = true;

    void (async () => {
      try {
        const response = await fetch("/api/collaborator/google/link", {
          method: "POST",
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.error ?? "Não foi possível vincular esta conta Google.");
        }
        if (!data?.token || !data?.professional) {
          throw new Error("O servidor não confirmou o vínculo.");
        }
        setCollabSession(data.token, data.professional as CollabProfessional);
        navigate(returnTo, { replace: true });
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Falha ao vincular o Google.");
      }
    })();
  }, [isLoaded, isSignedIn, navigate, returnTo]);

  return (
    <ReturnState
      title="Vinculando a conta Google"
      detail="O sistema está confirmando sua sessão atual e a conta Google escolhida."
      error={error}
    />
  );
}

export function GoogleLinkReturnPage() {
  return clerkPublishableKey ? (
    <GoogleLinkReturnFlow />
  ) : (
    <ReturnState
      title="Google indisponível"
      detail="Este ambiente ainda não tem o acesso Google configurado."
      error="Entre novamente com usuário e senha."
    />
  );
}
