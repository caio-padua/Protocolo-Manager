import { vitrineAsset } from "@paxcare/assets";
import { useState } from "react";
import { Check, Copy, Share2, Stethoscope } from "lucide-react";
import { Button } from "@paxcare/components/ui/button";
const symbolMark = { url: vitrineAsset("paxcare-symbol-isolated.png") };
const wordmark = { url: vitrineAsset("paxcare-wordmark-isolated.png") };
import { PaxterSymbolGlass } from "@paxcare/components/pax-fx/PaxterSymbolGlass";
import { PaxterRasterGlow } from "@paxcare/components/pax-fx/PaxterRasterGlow";

type ShareState = "idle" | "shared" | "copied" | "error";

async function copyText(text: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy_failed");
}

function wasCancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function BrandArtwork({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return (
    <span className={`brand-artwork ${compact ? "brand-artwork-compact" : ""} ${className}`}>
      <span className="brand-mark">
        <img src={symbolMark.url} alt="" width={520} height={502} />
      </span>
      <span className="brand-type">
        <img className="brand-wordmark" src={wordmark.url} alt="PAXCARE" width={1445} height={280} />
        {!compact && <span className="brand-caption">SUA SAÚDE, COM VOCÊ</span>}
      </span>
    </span>
  );
}

export function Brand({ footer = false }: { footer?: boolean }) {
  return (
    <a href="#inicio" className={`brand ${footer ? "brand-footer" : ""}`} aria-label="PAXCARE — voltar ao início">
      <span className={`paxcare-live-logo ${footer ? "paxcare-live-logo-footer" : "paxcare-live-logo-default"}`}>
        <PaxterSymbolGlass size={footer ? 42 : 38} tone="dark" />
        <span className="paxcare-live-logo-copy">
          <PaxterRasterGlow
            facePng={wordmark.url}
            faceCleanPng={wordmark.url}
            width={footer ? 166 : 150}
            tone="dark"
            cycleDelay={900}
            className={footer ? "paxcare-live-logo-word-footer" : "paxcare-live-logo-word"}
            alt="PAXCARE"
          />
          <span className="paxcare-live-logo-subtitle">SUA SAÚDE, COM VOCÊ</span>
        </span>
      </span>
    </a>
  );
}

export function ShareSiteButton({
  label = "Compartilhar com quem você ama",
  variant = "outline",
}: {
  label?: string;
  variant?: "outline" | "champagne" | "quiet";
}) {
  const [status, setStatus] = useState<ShareState>("idle");

  async function handleShare() {
    const url = window.location.href.split("#")[0] ?? window.location.href;
    const text = "Conheça a experiência PAXCARE: uma nova forma de reunir e viver a sua história de saúde.";
    try {
      if (navigator.share) {
        await navigator.share({ title: "PAXCARE | Sua saúde, com você", text, url });
        setStatus("shared");
      } else {
        await copyText(url);
        setStatus("copied");
      }
    } catch (error) {
      if (wasCancelled(error)) return;
      setStatus("error");
    }
  }

  const feedback = {
    idle: "",
    shared: "O compartilhamento foi aberto no seu dispositivo.",
    copied: "Link copiado. Agora é só enviar para quem você ama.",
    error: "Você pode copiar o endereço desta página na barra do navegador.",
  }[status];

  return (
    <div className="share-control">
      <Button type="button" variant={variant} onClick={handleShare} className="share-trigger">
        {status === "copied" || status === "shared" ? <Check size={16} /> : <Share2 size={16} />}
        {status === "copied" ? "Link copiado" : label}
      </Button>
      <span className="share-feedback" role="status" aria-live="polite">{feedback}</span>
    </div>
  );
}

export function SharePaxmedInviteButton() {
  const [status, setStatus] = useState<ShareState>("idle");

  async function handleInvite() {
    const url = window.location.href.split("#")[0] ?? window.location.href;
    const message = `Olá, doutor(a)! Conheci a experiência PAXCARE e sua conexão com o PAXMED, a plataforma criada para clínicas e médicos. Gostaria de apresentar essa proposta para cuidarmos da minha história de saúde com ainda mais continuidade: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Apresentar o PAXMED ao meu profissional", text: message, url });
        setStatus("shared");
      } else {
        await copyText(message);
        setStatus("copied");
      }
    } catch (error) {
      if (wasCancelled(error)) return;
      setStatus("error");
    }
  }

  const feedback = {
    idle: "Crie uma mensagem para apresentar essa visão ao seu médico ou clínica.",
    shared: "O convite foi aberto para você compartilhar.",
    copied: "Convite copiado. Envie por mensagem ou e-mail ao seu profissional.",
    error: "Não foi possível copiar automaticamente. Tente novamente pelo menu do navegador.",
  }[status];

  return (
    <div className="share-control">
      <Button type="button" variant="champagne" onClick={handleInvite}>
        {status === "copied" || status === "shared" ? <Check size={16} /> : status === "error" ? <Copy size={16} /> : <Stethoscope size={16} />}
        {status === "copied" ? "Convite pronto para enviar" : "Apresentar o PAXMED ao meu médico"}
      </Button>
      <span className="share-feedback" role="status" aria-live="polite">{feedback}</span>
    </div>
  );
}
