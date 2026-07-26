/**
 * basicAuth — Porta de entrada do sistema (Onda 1 do Master Loop).
 *
 * Escrito pelo Dr. Claude para o Dr. Replit Manager usar direto. Pronto para
 * ligar; ver instrucoes de montagem no fim deste arquivo.
 *
 * POR QUE ISTO EXISTE
 * Hoje 0 de 87 arquivos de rota verificam quem esta chamando, e o
 * tenantContext devolve isPlatformOwner=true para toda requisicao. Com um
 * dominio publico, qualquer pessoa le o prontuario. Este middleware fecha isso
 * para a fase de operador unico.
 *
 * O QUE ELE NAO E
 * Nao e o sistema de autenticacao multi-tenant. E uma tranca para UM operador.
 * Quando entrarem clinicas licenciadas, isto e substituido por sessao/JWT com
 * empresa_id real — e o tenantContext para de ser fixo.
 *
 * A LISTA DE EXCECAO E A PARTE PERIGOSA
 * Bloquear tudo derruba o portal do paciente e os webhooks externos. Paciente
 * nao tem a senha do administrador, e Asaas/Twilio/ZapSign nao mandam cabecalho
 * Basic. As rotas isentas abaixo NAO ficam desprotegidas: cada uma ja tem trava
 * propria — token HMAC no portal (verifyPortalToken) e assinatura do provedor
 * nos webhooks. Antes de mexer nesta lista, leia os comentarios do
 * routes/index.ts, que ja documenta quais rotas vivem antes do portao.
 */

import type { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { logger } from "../lib/logger";

/**
 * Prefixos que NAO exigem a senha do operador.
 * Comparados contra o caminho da requisicao, com ou sem o prefixo /api.
 */
const ROTAS_ISENTAS = [
  // ── Saude: a Railway chama sem credencial para saber se o servico subiu ──
  "/healthz",
  "/health",
  "/brt",

  // ── Portal do paciente: protegido por token HMAC proprio (portal-token.ts).
  //    O paciente nao tem, e nao pode ter, a senha do administrador. ──
  "/area-paciente",
  "/client-portal",
  "/client-photo",
  "/client-registration",
  "/anamnese-portal",
  "/anamnese-v2",
  "/scheduling",
  "/ical",

  // ── Colaborador: tem o proprio portao (collaboratorGuard) com token HMAC ──
  "/collaborator",

  // ── Webhooks externos: o provedor nao manda Basic Auth. Autenticidade vem
  //    da assinatura de cada um (X-Twilio-Signature, header secreto do
  //    ZapSign, token do Asaas). Ver routes/index.ts, que ja os registra
  //    antes do portao de colaborador pelo mesmo motivo. ──
  "/asaas",
  "/webhooks",
  "/whatsapp-webhook",
  "/whatsapp-inbound",
  "/whatsapp-status",
  "/telegram",
  "/agentes-trello",
  "/brand",
] as const;

/** Remove o prefixo /api para a comparacao funcionar montado em app.use() ou no router. */
function caminhoNormalizado(req: Request): string {
  const bruto = (req.path || req.url || "").split("?")[0] ?? "";
  return bruto.startsWith("/api/") ? bruto.slice(4) : bruto;
}

export function isRotaIsenta(req: Request): boolean {
  const caminho = caminhoNormalizado(req);
  return ROTAS_ISENTAS.some(
    (prefixo) => caminho === prefixo || caminho.startsWith(`${prefixo}/`),
  );
}

/**
 * Comparacao em tempo constante. Comparar com === vazaria o tamanho e o ponto
 * de divergencia da senha pelo tempo de resposta.
 */
function comparaSegura(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido, "utf8");
  const b = Buffer.from(esperado, "utf8");
  if (a.length !== b.length) {
    // Compara mesmo assim contra um buffer do proprio tamanho, para nao
    // devolver a resposta mais rapido quando o tamanho difere.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Le as credenciais do ambiente uma unica vez, no boot.
 * Fail-closed: sem as duas variaveis, o processo nao sobe. E melhor nao subir
 * do que subir destrancado.
 */
function carregaCredenciais(): { usuario: string; senha: string } {
  const usuario = process.env["ADMIN_USERNAME"];
  const senha = process.env["ADMIN_PASSWORD"];

  if (!usuario || !senha) {
    throw new Error(
      "ADMIN_USERNAME e ADMIN_PASSWORD sao obrigatorias. Sem elas o sistema " +
        "subiria com a porta destrancada e o prontuario exposto. Gere a senha " +
        "com: openssl rand -base64 24",
    );
  }

  if (senha.length < 16) {
    throw new Error(
      "ADMIN_PASSWORD tem menos de 16 caracteres. Gere uma forte com: " +
        "openssl rand -base64 24",
    );
  }

  return { usuario, senha };
}

const credenciais = carregaCredenciais();

export function basicAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isRotaIsenta(req)) {
    next();
    return;
  }

  const cabecalho = req.headers.authorization;

  if (!cabecalho?.startsWith("Basic ")) {
    negar(res);
    return;
  }

  let usuarioRecebido: string;
  let senhaRecebida: string;

  try {
    const decodificado = Buffer.from(cabecalho.slice(6), "base64").toString("utf8");
    const separador = decodificado.indexOf(":");
    if (separador < 0) {
      negar(res);
      return;
    }
    usuarioRecebido = decodificado.slice(0, separador);
    senhaRecebida = decodificado.slice(separador + 1);
  } catch {
    negar(res);
    return;
  }

  // As duas comparacoes sempre rodam — sem curto-circuito — para nao revelar
  // pelo tempo se foi o usuario ou a senha que errou.
  const usuarioOk = comparaSegura(usuarioRecebido, credenciais.usuario);
  const senhaOk = comparaSegura(senhaRecebida, credenciais.senha);

  if (!usuarioOk || !senhaOk) {
    // NUNCA logar a senha, nem o cabecalho, nem o usuario tentado.
    logger.warn({ path: caminhoNormalizado(req) }, "basicAuth: credencial invalida");
    negar(res);
    return;
  }

  next();
}

function negar(res: Response): void {
  res
    .status(401)
    .set("WWW-Authenticate", 'Basic realm="Padaxor", charset="UTF-8"')
    .json({ error: "Nao autorizado." });
}

/*
 * ─────────────────────────────────────────────────────────────────────────────
 * COMO LIGAR — em artifacts/api-server/src/app.ts
 *
 *   import { basicAuthMiddleware } from "./middleware/basicAuth";
 *
 *   app.use(cors({ origin: origensPermitidas, credentials: true }));
 *   app.use(helmet());
 *   app.use(limitadorPublico);        // ver securityConfig.ts
 *   app.use(express.json({ limit: "50mb" }));
 *   app.use(express.urlencoded({ extended: true, limit: "50mb" }));
 *   app.use(basicAuthMiddleware);     // <- aqui, DEPOIS do CORS
 *   app.use(tenantContextMiddleware);
 *   app.use("/api", router);
 *
 * DEPOIS do CORS e obrigatorio: a requisicao OPTIONS de preflight do navegador
 * nao carrega credencial. Se o basicAuth vier antes, o preflight leva 401 e o
 * padcom nao consegue falar com a API.
 *
 * TESTE DE PRONTO (Onda 1) — os quatro tem que passar:
 *   curl -si  https://SEU-DOMINIO/api/clients            | head -1   # 401
 *   curl -si -u "$ADMIN_USERNAME:$ADMIN_PASSWORD" \
 *             https://SEU-DOMINIO/api/clients            | head -1   # 200
 *   curl -si  https://SEU-DOMINIO/api/healthz            | head -1   # 200
 *   curl -si  https://SEU-DOMINIO/api/area-paciente/...  | head -1   # nao 401
 * ─────────────────────────────────────────────────────────────────────────────
 */
