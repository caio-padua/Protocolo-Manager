import { Router, type IRouter } from "express";
import { moduleGuard } from "../middleware/moduleGuard";
import { isTelegramConfigured } from "../lib/telegram";
import { isWhatsappConfigured } from "../lib/whatsapp";
import { isGupshupConfigured } from "../lib/gupshup";
import { isGmailConnected } from "../lib/google-gmail";
import { isDriveConnected } from "../lib/google-drive";
import {
  getJsonSetting,
  setSetting,
  setSecret,
  getSecret,
  getSecretStatus,
  type SecretStatus,
} from "../lib/secure-settings";
import { requireCollaborator } from "./collaborator.js";

// Console de Comunicacao — status REAL de cada canal (so booleanos; nunca
// expoe valor de token/secret). Leitura livre (sem escrita, sem dado sensivel).
const router: IRouter = Router();
router.use(moduleGuard("comunicacao"));

router.get("/comunicacao/status", async (req, res) => {
  const status = {
    telegram: false,
    // true quando PADAXOR_TELEGRAM_CHAT_ID está configurado (env/secret).
    // Independente do bot token — sem chatId o CEO nunca recebe mensagens.
    telegramChatIdConfigurado: (process.env.PADAXOR_TELEGRAM_CHAT_ID ?? "").trim().length > 0,
    whatsapp: false,
    gmail: false,
    drive: false,
    onedrive: false, // ainda nao existe integracao — sempre falso (honesto)
  };

  try {
    status.telegram = await isTelegramConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "status telegram falhou");
  }

  try {
    status.whatsapp = await isWhatsappConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "status whatsapp falhou");
  }

  try {
    status.gmail = await isGmailConnected();
  } catch (err) {
    req.log?.debug?.({ err }, "status gmail falhou");
  }

  try {
    status.drive = await isDriveConnected();
  } catch (err) {
    req.log?.debug?.({ err }, "status drive falhou");
  }

  res.json({ status });
});

// ===========================================================================
// PLATAFORMA GATEWAY DE COMUNICACAO — Twilio e Gupshup.
//
// Cada plataforma tem CAMPOS de credencial salvos no COFRE cifrado (twilio.*,
// gupshup.*) e dois indicadores honestos:
//  - configured: as credenciais existem (cofre ou env)? (real, so leitura)
//  - enabled: o operador escolheu usar esta plataforma? (app_settings
//    gateway.<provider>.enabled)
//
// A luz da tela reflete `configured` (nunca verde sem credencial). O toggle
// reflete `enabled`. Nenhum valor de token e exposto — so a mascara (••••1234).
// ===========================================================================
type GatewayProvider = "twilio" | "gupshup";

// Campo da tela -> chave no cofre + rotulo amigavel + nome do env (compat com
// o aviso "faltam credenciais" da tela).
interface GatewayFieldDef {
  field: string;
  vaultKey: string;
  label: string;
  envName: string;
  secret: boolean; // true = mascara/password; false = texto visivel (ex.: numero)
}

const GATEWAY_FIELDS: Record<GatewayProvider, GatewayFieldDef[]> = {
  twilio: [
    { field: "accountSid", vaultKey: "twilio.accountSid", label: "Identificador da conta (Account SID)", envName: "TWILIO_ACCOUNT_SID", secret: true },
    { field: "authToken", vaultKey: "twilio.authToken", label: "Senha de acesso (Auth Token)", envName: "TWILIO_AUTH_TOKEN", secret: true },
    { field: "whatsappFrom", vaultKey: "twilio.whatsappFrom", label: "Número remetente do WhatsApp", envName: "TWILIO_WHATSAPP_FROM", secret: false },
  ],
  gupshup: [
    { field: "apiKey", vaultKey: "gupshup.apiKey", label: "Chave de API (API Key)", envName: "GUPSHUP_API_KEY", secret: true },
    { field: "appName", vaultKey: "gupshup.appName", label: "Nome do aplicativo (App Name)", envName: "GUPSHUP_APP_NAME", secret: false },
    // A API do Gupshup exige `source` (numero WhatsApp Business, DDI sem "+") em
    // todo envio — fiacao ja deixada pronta mesmo sem credencial (pesquisa CEO).
    { field: "sourceNumber", vaultKey: "gupshup.sourceNumber", label: "Número de origem (WhatsApp Business)", envName: "GUPSHUP_SOURCE_NUMBER", secret: false },
  ],
};

async function isGatewayEnabled(provider: GatewayProvider): Promise<boolean> {
  const v = await getJsonSetting<boolean>(`gateway.${provider}.enabled`);
  return v === true;
}

// Monta os campos com status mascarado + a lista de chaves faltando (env names,
// para o aviso amigavel da tela continuar funcionando).
async function buildFields(provider: GatewayProvider): Promise<{
  fields: Array<GatewayFieldDef & { status: SecretStatus }>;
  missingKeys: string[];
}> {
  const defs = GATEWAY_FIELDS[provider];
  const statuses = await Promise.all(defs.map((d) => getSecretStatus(d.vaultKey)));
  const fields = defs.map((d, i) => ({ ...d, status: statuses[i] }));
  const missingKeys = fields.filter((f) => !f.status.isSet).map((f) => f.envName);
  return { fields, missingKeys };
}

router.get("/comunicacao/gateways", requireCollaborator, async (req, res) => {
  let twilioConfigured = false;
  let gupshupConfigured = false;
  try {
    twilioConfigured = await isWhatsappConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "gateway twilio configured falhou");
  }
  try {
    gupshupConfigured = await isGupshupConfigured();
  } catch (err) {
    req.log?.debug?.({ err }, "gateway gupshup configured falhou");
  }

  const [twilioEnabled, gupshupEnabled, twilioFields, gupshupFields] = await Promise.all([
    isGatewayEnabled("twilio").catch(() => false),
    isGatewayEnabled("gupshup").catch(() => false),
    buildFields("twilio"),
    buildFields("gupshup"),
  ]);

  res.json({
    gateways: [
      {
        provider: "twilio",
        label: "Twilio",
        configured: twilioConfigured,
        enabled: twilioEnabled,
        missingKeys: twilioFields.missingKeys,
        fields: twilioFields.fields.map((f) => ({
          field: f.field,
          label: f.label,
          secret: f.secret,
          isSet: f.status.isSet,
          masked: f.status.masked,
          source: f.status.source,
        })),
      },
      {
        provider: "gupshup",
        label: "Gupshup",
        configured: gupshupConfigured,
        enabled: gupshupEnabled,
        missingKeys: gupshupFields.missingKeys,
        fields: gupshupFields.fields.map((f) => ({
          field: f.field,
          label: f.label,
          secret: f.secret,
          isSet: f.status.isSet,
          masked: f.status.masked,
          source: f.status.source,
        })),
      },
    ],
  });
});

// Liga/desliga o gateway (preferencia do operador). Escrita protegida.
router.post("/comunicacao/gateways/:provider", requireCollaborator, async (req, res) => {
  const provider = req.params.provider;
  if (provider !== "twilio" && provider !== "gupshup") {
    return res.status(400).json({ error: "Gateway desconhecido" });
  }
  const enabled = req.body?.enabled;
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "Campo 'enabled' deve ser booleano" });
  }
  await setSetting(`gateway.${provider}.enabled`, JSON.stringify(enabled));
  res.json({ provider, enabled });
});

// Grava as CREDENCIAIS do gateway no cofre cifrado. Campo vazio = nao altera
// (mantem o valor atual). Escrita protegida por colaborador.
router.put("/comunicacao/gateways/:provider/credentials", requireCollaborator, async (req, res) => {
  const provider = req.params.provider;
  if (provider !== "twilio" && provider !== "gupshup") {
    return res.status(400).json({ error: "Gateway desconhecido" });
  }
  const c = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  const actor = c ? `${c.role ?? "?"}:${c.professionalId ?? "?"}` : undefined;
  const defs = GATEWAY_FIELDS[provider as GatewayProvider];
  const body = (req.body ?? {}) as Record<string, unknown>;
  let saved = 0;
  for (const d of defs) {
    const raw = body[d.field];
    if (typeof raw !== "string" || !raw.trim()) continue;
    let value = raw.trim();
    // O numero de origem do Gupshup tem de ser DDI + numero, SO digitos, sem "+"
    // (regra da API). Sanitiza no servidor (autoritativo, nao confia so no front)
    // e recusa tamanho implausivel para nao gravar lixo no cofre.
    if (d.field === "sourceNumber") {
      value = value.replace(/[^0-9]/g, "");
      if (value.length < 10 || value.length > 15) {
        return res.status(400).json({
          error: "Número de origem inválido: use DDI + número, só dígitos (ex.: 5511999998888)",
        });
      }
    }
    await setSecret(d.vaultKey, value, actor);
    saved += 1;
  }
  const { fields, missingKeys } = await buildFields(provider as GatewayProvider);
  res.json({
    provider,
    saved,
    missingKeys,
    fields: fields.map((f) => ({
      field: f.field,
      label: f.label,
      secret: f.secret,
      isSet: f.status.isSet,
      masked: f.status.masked,
      source: f.status.source,
    })),
  });
});

// REVELA o valor REAL das credenciais do gateway (o "olhinho"). O dono logado
// tem direito de ver o proprio segredo — analogo a ver o proprio RG. NUNCA
// trafega por padrao: so sob acao explicita e com a MESMA protecao da gravacao
// (requireCollaborator). Sem login, nada e revelado. Decifra via getSecret
// (cofre tem prioridade; cai no env). Campo nao configurado volta como null.
router.post("/comunicacao/gateways/:provider/reveal", requireCollaborator, async (req, res) => {
  const provider = req.params.provider;
  if (provider !== "twilio" && provider !== "gupshup") {
    return res.status(400).json({ error: "Gateway desconhecido" });
  }
  const defs = GATEWAY_FIELDS[provider as GatewayProvider];
  const entries = await Promise.all(
    defs.map(async (d) => [d.field, await getSecret(d.vaultKey)] as const),
  );
  const values: Record<string, string | null> = {};
  for (const [field, value] of entries) values[field] = value;
  const actor = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  req.log.info(
    {
      event: "gateway_secret_reveal",
      provider,
      actorId: actor?.professionalId ?? null,
      actorRole: actor?.role ?? null,
      fields: defs.map((d) => d.field),
    },
    "Revelacao de credencial de gateway",
  );
  res.json({ provider, values });
});

// ===========================================================================
// CANAIS DIGITAIS SIMETRICOS — tela /comunicacao/digital
//
// LEI DA SIMETRIA (ordem do CEO, 14/08/2026): WhatsApp e Telegram exibem os
// MESMOS slots, na MESMA ordem. Canal que nao usa um slot NAO o esconde:
// devolve `aplicavel:false` com a razao escrita, e a tela desenha o slot em
// formato visual diferente. Esconder deslocaria os vizinhos e obrigaria o CEO
// a reaprender a posicao de tudo a cada canal (Art. 53 do Codigo Paxter).
//
// A simetria nasce AQUI, no servidor. A tela apenas varre o que esta rota
// devolve — por isso nao existe nome de campo nem de bot escrito no codigo do
// front (ordem do CEO: "nao quero nada hard coded").
// ===========================================================================
type CanalId = "whatsapp" | "telegram";

interface SlotDef {
  slot: string;            // chave canonica — IDENTICA nos dois canais
  ordem: number;
  rotulo: string;          // rotulo especifico do canal
  tipo: "texto" | "segredo" | "url";
  aplicavel: boolean;      // false = slot presente, em formato "nao se aplica"
  editavel: boolean;
  vaultKey?: string;       // chave no cofre (quando o valor e gravavel aqui)
  nota?: string;           // por que nao se aplica / de onde vem o valor
  placeholder?: string;
}

const CANAL_SLOTS: Record<CanalId, SlotDef[]> = {
  whatsapp: [
    {
      slot: "identidade", ordem: 1, tipo: "texto", aplicavel: true, editavel: true,
      rotulo: "Número remetente (o paciente vê este)",
      vaultKey: "twilio.whatsappFrom",
      placeholder: "+14155238886",
      nota: "Número Twilio que assina cada mensagem enviada.",
    },
    {
      slot: "nomeExibicao", ordem: 2, tipo: "texto", aplicavel: false, editavel: false,
      rotulo: "Nome de exibição do canal",
      nota: "O WhatsApp via Twilio não tem nome editável: o paciente vê o número acima. Nome de perfil só se altera na conta WhatsApp Business, fora deste sistema.",
    },
    {
      slot: "credencialPrimaria", ordem: 3, tipo: "segredo", aplicavel: true, editavel: true,
      rotulo: "Identificador da conta (Account SID)",
      vaultKey: "twilio.accountSid",
      placeholder: "AC…",
    },
    {
      slot: "credencialSecundaria", ordem: 4, tipo: "segredo", aplicavel: true, editavel: true,
      rotulo: "Senha de acesso (Auth Token)",
      vaultKey: "twilio.authToken",
    },
    {
      slot: "destinoCeo", ordem: 5, tipo: "texto", aplicavel: true, editavel: true,
      rotulo: "Número do CEO para receber alertas",
      vaultKey: "twilio.ceoWhatsapp",
      placeholder: "+5531999998888",
      nota: "Para onde o sistema avisa o CEO por WhatsApp (ex.: assinatura concluída).",
    },
    {
      slot: "webhookUrl", ordem: 6, tipo: "url", aplicavel: true, editavel: false,
      rotulo: "URL de entrada (o Twilio chama esta)",
      nota: "Cole esta URL no painel do Twilio, campo “When a message comes in”. É derivada do domínio do servidor — nunca digitada à mão.",
    },
    {
      slot: "webhookSaude", ordem: 7, tipo: "texto", aplicavel: false, editavel: false,
      rotulo: "Saúde do webhook",
      nota: "O Twilio não informa a saúde do webhook por API pública. O estado real fica no painel do Twilio, em Monitor › Logs › Errors.",
    },
  ],
  telegram: [
    {
      slot: "identidade", ordem: 1, tipo: "texto", aplicavel: true, editavel: false,
      rotulo: "Usuário do bot (o paciente vê este)",
      nota: "Lido ao vivo do Telegram. O @usuário só se altera no BotFather, fora deste sistema.",
    },
    {
      slot: "nomeExibicao", ordem: 2, tipo: "texto", aplicavel: true, editavel: true,
      rotulo: "Nome de exibição do canal",
      placeholder: "Padua Clínica",
      nota: "Salvar aqui renomeia o bot dentro do Telegram na hora.",
    },
    {
      slot: "credencialPrimaria", ordem: 3, tipo: "segredo", aplicavel: true, editavel: true,
      rotulo: "Token do bot",
      vaultKey: "telegram.botToken",
      placeholder: "123456:ABC…",
    },
    {
      slot: "credencialSecundaria", ordem: 4, tipo: "segredo", aplicavel: true, editavel: true,
      rotulo: "Segredo do webhook",
      vaultKey: "telegram.webhookSecret",
      nota: "Senha que o Telegram devolve a cada chamada — prova que o recado veio mesmo do Telegram.",
    },
    {
      slot: "destinoCeo", ordem: 5, tipo: "texto", aplicavel: true, editavel: true,
      rotulo: "Chat ID do CEO para receber alertas",
      vaultKey: "telegram.ceoChatId",
      placeholder: "123456789",
      nota: "Para onde o sistema avisa o CEO pelo Telegram. Sem isto, nenhum alerta chega.",
    },
    {
      slot: "webhookUrl", ordem: 6, tipo: "url", aplicavel: true, editavel: false,
      rotulo: "URL registrada no Telegram",
      nota: "Consultada ao vivo no Telegram (getWebhookInfo) — é o endereço que ele realmente está chamando.",
    },
    {
      slot: "webhookSaude", ordem: 7, tipo: "texto", aplicavel: true, editavel: false,
      rotulo: "Saúde do webhook",
      nota: "Verificada ao vivo no Telegram.",
    },
  ],
};

// Encurta o miolo de uma URL para o estado "olho fechado". A URL nao e segredo,
// mas o CEO pediu o mesmo olho dos demais campos — o slot fica identico aos
// vizinhos e o valor inteiro so aparece sob clique.
function mascararUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    const host = u.hostname;
    const hostCurto = host.length > 12 ? `${host.slice(0, 6)}…${host.slice(-4)}` : host;
    return `${u.protocol}//${hostCurto}${u.pathname}`;
  } catch {
    return url.length > 24 ? `${url.slice(0, 12)}…${url.slice(-8)}` : url;
  }
}

// URL que o Twilio deve chamar. Deriva do MESMO domínio que o validador de
// assinatura do webhook de entrada usa (whatsapp-inbound), senao a tela
// mostraria um endereco e o servidor recusaria outro.
function urlEntradaWhatsapp(hostDoPedido?: string): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim() || hostDoPedido;
  if (!domain) return "";
  return `https://${domain}/api/whatsapp/inbound`;
}

interface SlotResolvido {
  slot: string;
  ordem: number;
  rotulo: string;
  tipo: string;
  aplicavel: boolean;
  editavel: boolean;
  isSet: boolean;
  masked: string | null;
  source: string | null;
  valorPublico: string | null;
  nota: string | null;
}

async function montarCanal(
  canal: CanalId,
  hostDoPedido: string | undefined,
): Promise<{
  canal: CanalId;
  label: string;
  provedor: string;
  ativo: boolean;
  statusLabelOn: string;
  statusLabelOff: string;
  avisos: string[];
  slots: SlotResolvido[];
}> {
  const defs = CANAL_SLOTS[canal];
  const avisos: string[] = [];

  // --- dados vivos, cada um isolado: falha de um nao derruba o cartao -------
  let botUsername: string | null = null;
  let botNome: string | null = null;
  let webhookUrl = "";
  let webhookSaude: string | null = null;
  let webhookOk = false;
  let ativo = false;

  if (canal === "telegram") {
    try {
      const { getTelegramBotInfo } = await import("../lib/telegram.js");
      const info = await getTelegramBotInfo();
      if (!info.mock) {
        botUsername = info.username ? `@${info.username}` : null;
        botNome = info.firstName ?? null;
      }
    } catch {
      avisos.push("Não foi possível ler a identidade do bot no Telegram agora.");
    }
    try {
      const { checkWebhookHealth } = await import("../lib/telegram-webhook-guard.js");
      const h = await checkWebhookHealth();
      webhookUrl = h.url ?? "";
      webhookOk = Boolean(h.healthy && !h.mock);
      webhookSaude = h.mock
        ? "Token ausente — não há como verificar"
        : h.healthy
          ? `Ativo · ${h.pendingUpdateCount ?? 0} mensagem(ns) na fila`
          : h.fetchError
            ? `Falha de rede: ${h.fetchError}`
            : "Não registrado — os recados dos pacientes podem não estar chegando";
      if (h.lastErrorMessage) avisos.push(`Último erro do Telegram: ${h.lastErrorMessage}`);
    } catch {
      webhookSaude = "Não foi possível verificar";
    }
    try {
      ativo = await isTelegramConfigured();
    } catch { /* fica falso */ }
  } else {
    webhookUrl = urlEntradaWhatsapp(hostDoPedido);
    try {
      ativo = await isWhatsappConfigured();
    } catch { /* fica falso */ }
  }

  // --- resolve cada slot ----------------------------------------------------
  const slots: SlotResolvido[] = [];
  for (const d of defs) {
    let isSet = false;
    let masked: string | null = null;
    let source: string | null = null;
    let valorPublico: string | null = null;

    if (d.vaultKey) {
      const st = await getSecretStatus(d.vaultKey);
      isSet = st.isSet;
      masked = st.masked;
      source = st.source;
    }

    if (canal === "telegram" && d.slot === "identidade") {
      valorPublico = botUsername;
      isSet = Boolean(botUsername);
      source = botUsername ? "telegram" : null;
    }
    if (canal === "telegram" && d.slot === "nomeExibicao") {
      valorPublico = botNome;
      isSet = Boolean(botNome);
      source = botNome ? "telegram" : null;
    }
    if (d.slot === "webhookUrl" && d.aplicavel) {
      isSet = Boolean(webhookUrl);
      masked = webhookUrl ? mascararUrl(webhookUrl) : null;
      source = canal === "telegram" ? "telegram" : "derivada";
    }
    if (d.slot === "webhookSaude" && d.aplicavel) {
      valorPublico = webhookSaude;
      isSet = webhookOk;
      source = "telegram";
    }

    slots.push({
      slot: d.slot,
      ordem: d.ordem,
      rotulo: d.rotulo,
      tipo: d.tipo,
      aplicavel: d.aplicavel,
      editavel: d.editavel,
      isSet,
      masked,
      source,
      valorPublico,
      nota: d.nota ?? null,
      ...(d.placeholder ? { placeholder: d.placeholder } : {}),
    } as SlotResolvido);
  }

  const faltando = slots.filter((s) => s.aplicavel && s.editavel && !s.isSet).length;
  if (faltando > 0) {
    avisos.push(`${faltando} campo(s) ainda vazio(s) neste canal.`);
  }

  return {
    canal,
    label: canal === "whatsapp" ? "WhatsApp" : "Telegram",
    provedor: canal === "whatsapp" ? "Twilio" : "Telegram Bot API",
    ativo,
    statusLabelOn: canal === "whatsapp" ? "Conectado" : "Bot ativo",
    statusLabelOff: canal === "whatsapp" ? "Não configurado" : "Indisponível",
    avisos,
    slots: slots.sort((a, b) => a.ordem - b.ordem),
  };
}

router.get("/comunicacao/canais", requireCollaborator, async (req, res) => {
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim();
  const [whatsapp, telegram] = await Promise.all([
    montarCanal("whatsapp", host),
    montarCanal("telegram", host),
  ]);
  res.json({ canais: [whatsapp, telegram] });
});

// Grava os campos preenchidos. Campo vazio = nao altera (mantem o atual).
router.put("/comunicacao/canais/:canal/credenciais", requireCollaborator, async (req, res) => {
  const canal = req.params.canal as CanalId;
  if (canal !== "whatsapp" && canal !== "telegram") {
    return res.status(400).json({ error: "Canal desconhecido" });
  }
  const c = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  const actor = c ? `${c.role ?? "?"}:${c.professionalId ?? "?"}` : undefined;
  const body = (req.body ?? {}) as Record<string, unknown>;

  let salvos = 0;
  const erros: string[] = [];

  for (const d of CANAL_SLOTS[canal]) {
    if (!d.vaultKey || !d.editavel || !d.aplicavel) continue;
    const raw = body[d.slot];
    if (typeof raw !== "string" || !raw.trim()) continue;
    let value = raw.trim();

    // Numero de telefone: guarda so o formato internacional, sem enfeite. O
    // servidor e a autoridade — nao confia na limpeza feita pela tela.
    if (d.slot === "identidade" || d.slot === "destinoCeo") {
      if (canal === "whatsapp") {
        value = value.replace(/^whatsapp:/i, "").replace(/[^\d+]/g, "");
        const digitos = value.replace(/\D/g, "");
        if (digitos.length < 10 || digitos.length > 15) {
          erros.push(`${d.rotulo}: use DDI + número (ex.: +5531999998888)`);
          continue;
        }
        if (!value.startsWith("+")) value = `+${digitos}`;
      } else if (d.slot === "destinoCeo") {
        // Chat ID do Telegram e numerico (grupo pode ser negativo).
        value = value.replace(/[^\d-]/g, "");
        if (!/^-?\d{5,}$/.test(value)) {
          erros.push(`${d.rotulo}: o Chat ID é só números (ex.: 123456789)`);
          continue;
        }
      }
    }

    await setSecret(d.vaultKey, value, actor);
    salvos += 1;
  }

  // Renomear o bot NAO e cofre: e uma ordem enviada ao Telegram na hora.
  if (canal === "telegram" && typeof body["nomeExibicao"] === "string" && body["nomeExibicao"].trim()) {
    try {
      const { setTelegramBotName } = await import("../lib/telegram.js");
      const r = await setTelegramBotName((body["nomeExibicao"] as string).trim());
      if (r.ok) salvos += 1;
      else erros.push(`Nome de exibição: ${r.error ?? "o Telegram recusou"}`);
    } catch (err) {
      erros.push(`Nome de exibição: ${String(err)}`);
    }
  }

  // Espelha no ambiente do processo para os motores que leem process.env
  // direto — senao a tela diria "salvo" e o envio continuaria usando o valor
  // velho ate o proximo restart.
  const { hydrateEnvFromVault } = await import("../lib/secure-settings.js");
  const chaves = CANAL_SLOTS[canal].map((d) => d.vaultKey).filter((k): k is string => Boolean(k));
  await hydrateEnvFromVault(chaves);

  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim();
  const atualizado = await montarCanal(canal, host);
  return res.json({ salvos, erros, ...atualizado });
});

// O OLHINHO. O dono logado tem direito de ver o proprio segredo — mesma
// protecao da gravacao. Nada trafega por padrao: so sob clique explicito.
router.post("/comunicacao/canais/:canal/revelar", requireCollaborator, async (req, res) => {
  const canal = req.params.canal as CanalId;
  if (canal !== "whatsapp" && canal !== "telegram") {
    return res.status(400).json({ error: "Canal desconhecido" });
  }
  const valores: Record<string, string | null> = {};

  for (const d of CANAL_SLOTS[canal]) {
    if (!d.aplicavel) continue;
    if (d.vaultKey) {
      valores[d.slot] = await getSecret(d.vaultKey);
    }
  }

  // URL do webhook: nao mora no cofre, mas tem olho igual aos demais.
  const host = (req.get("x-forwarded-host") ?? req.get("host") ?? "").split(",")[0]?.trim();
  if (canal === "whatsapp") {
    valores["webhookUrl"] = urlEntradaWhatsapp(host) || null;
  } else {
    try {
      const { checkWebhookHealth } = await import("../lib/telegram-webhook-guard.js");
      const h = await checkWebhookHealth();
      valores["webhookUrl"] = h.url || null;
    } catch {
      valores["webhookUrl"] = null;
    }
    try {
      const { getTelegramBotInfo } = await import("../lib/telegram.js");
      const info = await getTelegramBotInfo();
      valores["identidade"] = info.mock ? null : `@${info.username}`;
      valores["nomeExibicao"] = info.mock ? null : (info.firstName ?? null);
    } catch {
      valores["identidade"] = null;
    }
  }

  const actor = (req as { collaborator?: { professionalId?: number; role?: string } }).collaborator;
  req.log.info(
    {
      event: "canal_secret_reveal",
      canal,
      actorId: actor?.professionalId ?? null,
      actorRole: actor?.role ?? null,
      slots: Object.keys(valores),
    },
    "Revelacao de credencial de canal digital",
  );
  return res.json({ canal, valores });
});

export default router;
