// Estado das credenciais para telas e auditoria — NUNCA o valor. Mostra:
// configurado, origem, ambiente, validade (verificada no provedor), data da
// verificacao e situacao da rotacao. Reaproveita o cofre cifrado existente
// (secure-settings); so grava metadados NAO sensiveis em app_settings.
import crypto from "crypto";
import { getSecret, getSecretStatus, getSetting, setSetting } from "./secure-settings.js";

export type SituacaoRotacao = "nao_aplicavel" | "pendente" | "rotacionada_verificada" | "rotacionada_nao_verificada";

export interface EstadoCredencial {
  chave: string;
  rotulo: string;
  configurada: boolean;
  origem: "cofre" | "env" | null;
  ambiente: string;
  atualizadaEm: string | null;
  validade: "valida" | "invalida" | "nao_verificada" | "erro_de_rede" | "nao_configurada";
  verificadaEm: string | null;
  rotacao: SituacaoRotacao;
  rotacaoDetalhe: string | null;
}

const impressao = (v: string) => crypto.createHash("sha256").update(v).digest("hex").slice(0, 16);
const K_EXPOSTA = "cofre.estado.telegram_bot.impressao_exposta";
const K_VERIF = (c: string) => `cofre.estado.${c}.verificacao`;

// Registra que o valor ATUAL foi exposto e precisa ser trocado. Guarda so uma
// impressao irreversivel (nunca o valor). Idempotente: nao sobrescreve.
export async function registrarExposicaoTelegram(motivo: string): Promise<boolean> {
  if (await getSetting(K_EXPOSTA)) return false;
  const tok = await getSecret("telegram.botToken");
  if (!tok) return false;
  await setSetting(K_EXPOSTA, JSON.stringify({ impressao: impressao(tok), motivo, registradaEm: new Date().toISOString() }));
  return true;
}

async function verificarTelegram(): Promise<"valida" | "invalida" | "erro_de_rede" | "nao_configurada"> {
  const tok = await getSecret("telegram.botToken");
  if (!tok) return "nao_configurada";
  try {
    const r = await fetch(`https://api.telegram.org/bot${tok}/getMe`, { signal: AbortSignal.timeout(10000) });
    return r.ok ? "valida" : "invalida";
  } catch {
    return "erro_de_rede";
  }
}

// Ambiente do Asaas deduzido SOMENTE da URL configurada (sandbox x producao).
export async function ambienteAsaas(): Promise<"sandbox" | "producao"> {
  const base = ((await getSetting("asaas.baseUrl")) || process.env.ASAAS_BASE_URL || "https://api.asaas.com/v3").toLowerCase();
  return base.includes("sandbox") ? "sandbox" : "producao";
}

export async function verificarEGravar(chave: string): Promise<EstadoCredencial> {
  let validade: EstadoCredencial["validade"] = "nao_verificada";
  if (chave === "telegram.botToken") validade = await verificarTelegram();
  if (validade !== "nao_verificada") {
    await setSetting(K_VERIF(chave), JSON.stringify({ em: new Date().toISOString(), resultado: validade }));
  }
  return estadoCredencial(chave);
}

const ROTULOS: Record<string, string> = {
  "telegram.botToken": "Token do bot do Telegram",
  "telegram.webhookSecret": "Segredo do webhook do Telegram",
  "asaas.apiKey": "Chave do Asaas",
  "asaas.webhookToken": "Token do webhook do Asaas",
  "zapsign.token": "Credencial de assinatura externa",
};

export async function estadoCredencial(chave: string): Promise<EstadoCredencial> {
  const st = await getSecretStatus(chave);
  let verificadaEm: string | null = null;
  let validade: EstadoCredencial["validade"] = st.isSet ? "nao_verificada" : "nao_configurada";
  const raw = await getSetting(K_VERIF(chave));
  if (raw && st.isSet) {
    try {
      const v = JSON.parse(raw) as { em: string; resultado: EstadoCredencial["validade"] };
      verificadaEm = v.em;
      validade = v.resultado;
    } catch { /* metadado corrompido: trata como nao verificada */ }
  }
  let rotacao: SituacaoRotacao = "nao_aplicavel";
  let rotacaoDetalhe: string | null = null;
  if (chave === "telegram.botToken") {
    const exp = await getSetting(K_EXPOSTA);
    if (exp) {
      const atual = await getSecret(chave);
      const e = JSON.parse(exp) as { impressao: string; registradaEm: string };
      if (atual && impressao(atual) === e.impressao) {
        rotacao = "pendente";
        rotacaoDetalhe = `Valor exposto em ${e.registradaEm}; troca no BotFather ainda NAO feita pelo titular.`;
      } else if (atual) {
        rotacao = validade === "valida" ? "rotacionada_verificada" : "rotacionada_nao_verificada";
        rotacaoDetalhe = rotacao === "rotacionada_verificada"
          ? "Novo valor diferente do exposto e aceito pelo Telegram."
          : "Valor diferente do exposto, mas ainda nao verificado no Telegram: use Verificar agora.";
      }
    }
  }
  const ambiente = chave.startsWith("asaas.") ? await ambienteAsaas() : "producao";
  return {
    chave, rotulo: ROTULOS[chave] ?? chave, configurada: st.isSet, origem: st.source === "vault" ? "cofre" : st.source,
    ambiente, atualizadaEm: st.updatedAt, validade, verificadaEm, rotacao, rotacaoDetalhe,
  };
}

export const CHAVES_ACOMPANHADAS = Object.keys(ROTULOS);
export async function estadoTodas(): Promise<EstadoCredencial[]> {
  return Promise.all(CHAVES_ACOMPANHADAS.map(estadoCredencial));
}
