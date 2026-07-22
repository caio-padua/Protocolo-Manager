import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import forge from "node-forge";
import { getSecret, setSecret, getJsonSetting, setJsonSetting } from "./secure-settings.js";
import { ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";

// ===========================================================================
// FONTE DO CERTIFICADO A1 (.pfx) — configuravel pela tela "Certificados".
//   Prioridade: cofre/object storage (configurado pelo CEO) -> arquivo local
//   (certs/assinatura.pfx, compatibilidade). O .pfx vive num prefixo PRIVADO
//   (certs/pfx/) que nunca e servido por HTTP. A senha vive no cofre cifrado
//   (certificate.password). Nada disso derruba a geracao de PDF: se nada
//   estiver configurado, so a ASSINATURA falha (com mensagem clara).
// ===========================================================================

const FILE_CERT_PATH =
  process.env.CERT_PATH || path.resolve(import.meta.dirname, "../certs/assinatura.pfx");

export interface CertMeta {
  objectPath: string; // relativo ao diretorio privado, ex.: "certs/pfx/<uuid>.pfx"
  fileName: string;
  cpf: string | null;
  updatedAt: string;
}

let cachedBuffer: Buffer | null = null;
let cachedVaultPassword: string | null = null;

// Recarrega o cache do certificado a partir do storage/cofre (best-effort).
// Chamado no boot e apos cada upload. Falha aqui nunca derruba o servidor.
export async function refreshCertCache(): Promise<void> {
  try {
    cachedVaultPassword = await getSecret("certificate.password");
  } catch {
    cachedVaultPassword = null;
  }
  try {
    const meta = await getJsonSetting<CertMeta>("certificate.meta");
    if (meta?.objectPath) {
      const svc = new ObjectStorageService();
      cachedBuffer = await svc.readPrivateObject(meta.objectPath);
      return;
    }
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e) },
      "cert-source: falha ao carregar certificado do storage; usando arquivo local se existir",
    );
  }
  cachedBuffer = null;
}

// Buffer do .pfx para uso sincrono pelo pdf-signer. Cache -> arquivo local.
export function getCertBufferSync(): Buffer {
  if (cachedBuffer) return cachedBuffer;
  if (fs.existsSync(FILE_CERT_PATH)) return fs.readFileSync(FILE_CERT_PATH);
  throw new Error(
    "Certificado digital A1 nao configurado. Suba o arquivo .pfx em Configuracoes > Certificados.",
  );
}

// Senhas candidatas (cofre + env). embedPadesSignature tenta cada uma.
export function getCertPasswordsSync(): string[] {
  const list: string[] = [];
  if (cachedVaultPassword) list.push(cachedVaultPassword);
  if (process.env.CERT_PASSWORD && !list.includes(process.env.CERT_PASSWORD)) {
    list.push(process.env.CERT_PASSWORD);
  }
  if (list.length === 0) {
    throw new Error(
      "Senha do certificado nao configurada. Informe-a em Configuracoes > Certificados.",
    );
  }
  return list;
}

// Valida que o .pfx abre com a senha informada e extrai o CPF do titular (CN).
// Retorna { ok:false } se a senha estiver errada ou o arquivo for invalido.
export function validatePfx(
  buffer: Buffer,
  password: string,
): { ok: boolean; cpf: string | null } {
  try {
    const pfxBinary = forge.util.binary.raw.encode(new Uint8Array(buffer));
    const pfxAsn1 = forge.asn1.fromDer(pfxBinary);
    const p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, password);
    const certBags = p12.getBags({ bagType: forge.oids.certBag });
    const certBag = certBags[forge.oids.certBag];
    let cpf: string | null = null;
    if (certBag && certBag.length && certBag[0].cert) {
      const cn = certBag[0].cert.subject.getField("CN");
      if (cn?.value) {
        const m = String(cn.value).match(/(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})/);
        if (m) cpf = m[1];
      }
    }
    return { ok: true, cpf };
  } catch {
    return { ok: false, cpf: null };
  }
}

// Salva um novo certificado (arquivo + senha) e atualiza o cache na hora.
export async function saveCertificate(
  buffer: Buffer,
  fileName: string,
  password: string,
  cpf: string | null,
  updatedBy?: string,
): Promise<CertMeta> {
  const svc = new ObjectStorageService();
  const objectPath = `certs/pfx/${randomUUID()}.pfx`;
  await svc.savePrivateObject(objectPath, buffer, "application/x-pkcs12");
  await setSecret("certificate.password", password, updatedBy);
  const meta: CertMeta = {
    objectPath,
    fileName,
    cpf,
    updatedAt: new Date().toISOString(),
  };
  await setJsonSetting("certificate.meta", meta);
  cachedBuffer = buffer;
  cachedVaultPassword = password;
  return meta;
}

// Metadados chave do certificado ativo para exibição em documentos.
// Lê o PFX de forma síncrona (best-effort) — retorna null se falhar.
export interface CertDocMeta {
  assinante: string;       // nome limpo do titular (sem o CPF após ":")
  cpf: string | null;      // CPF formatado 000.000.000-00
  ac: string;              // nome da autoridade certificadora
  serial: string;          // número de série em maiúsculas
  validTo: string;         // ISO date string da expiração
}

export function readCertMetaSync(): CertDocMeta | null {
  try {
    const buffer = getCertBufferSync();
    const passwords = getCertPasswordsSync();
    const pfxBinary = forge.util.binary.raw.encode(new Uint8Array(buffer));
    const pfxAsn1 = forge.asn1.fromDer(pfxBinary);
    let p12: forge.pkcs12.Pkcs12Pfx | null = null;
    for (const pw of passwords) {
      try { p12 = forge.pkcs12.pkcs12FromAsn1(pfxAsn1, pw); break; } catch { /* continua */ }
    }
    if (!p12) return null;
    const certBags = p12.getBags({ bagType: forge.oids.certBag });
    const bag = certBags[forge.oids.certBag];
    if (!bag?.length || !bag[0].cert) return null;
    const cert = bag[0].cert;
    const cn = cert.subject.getField("CN");
    const cnVal = cn?.value ? String(cn.value) : "";
    // CN do ICP-Brasil PF: "NOME COMPLETO:11111111111" — split no ":"
    const assinante = cnVal.includes(":") ? cnVal.split(":")[0].trim() : cnVal.trim();
    let cpf: string | null = null;
    const m = cnVal.match(/(\d{11})$/);
    if (m) {
      const d = m[1];
      cpf = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    const acCn = cert.issuer.getField("CN");
    const ac = acCn?.value ? String(acCn.value) : "ICP-Brasil";
    return {
      assinante,
      cpf,
      ac,
      serial: cert.serialNumber.toUpperCase(),
      validTo: cert.validity.notAfter.toISOString(),
    };
  } catch { return null; }
}

// Formata CPF no padrao Brasil (000.000.000-00). Se nao tiver 11 digitos,
// devolve o valor original (nao inventa mascara em algo que nao e CPF).
function formatCpf(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return raw;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

// Status seguro para a tela (sem expor o arquivo nem a senha).
export async function getCertificateStatus(): Promise<{
  isSet: boolean;
  hasPassword: boolean;
  fileName: string | null;
  cpf: string | null;
  updatedAt: string | null;
}> {
  const meta = await getJsonSetting<CertMeta>("certificate.meta");
  const vaultPw = await getSecret("certificate.password");
  const hasPassword = Boolean(vaultPw || process.env.CERT_PASSWORD);
  if (meta?.objectPath) {
    return {
      isSet: true,
      hasPassword,
      fileName: meta.fileName,
      cpf: formatCpf(meta.cpf),
      updatedAt: meta.updatedAt,
    };
  }
  // Fallback: arquivo local existente conta como "configurado".
  const fileExists = fs.existsSync(FILE_CERT_PATH);
  let localCpf: string | null = null;
  if (fileExists) {
    // Le o CPF do titular de dentro do .pfx local, tentando cada senha
    // candidata (cofre + env). So leitura: nunca derruba a tela se falhar.
    try {
      const buffer = fs.readFileSync(FILE_CERT_PATH);
      const passwords = [vaultPw, process.env.CERT_PASSWORD].filter(
        (p): p is string => Boolean(p),
      );
      for (const pw of passwords) {
        const check = validatePfx(buffer, pw);
        if (check.ok && check.cpf) {
          localCpf = check.cpf;
          break;
        }
      }
    } catch (e) {
      logger.error(
        { err: e instanceof Error ? e.message : String(e) },
        "cert-source: falha ao extrair CPF do certificado local",
      );
    }
  }
  return {
    isSet: fileExists,
    hasPassword,
    fileName: fileExists ? path.basename(FILE_CERT_PATH) : null,
    cpf: formatCpf(localCpf),
    updatedAt: null,
  };
}
