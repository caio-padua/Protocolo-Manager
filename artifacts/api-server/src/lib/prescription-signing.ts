import forge from "node-forge";
import { brtNow } from "./brt";
import { PDFDocument } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { ClinicalIdentityError, resolveClinicalEmitter } from "./clinical-emitter";
import { getCertBufferSync, getCertPasswordsSync, runWithDoctorCertificate, type CertMeta } from "./cert-source";
import { getJsonSetting, getSecret } from "./secure-settings";
import { ObjectStorageService } from "./objectStorage";

export type PrescriptionIdentity = Awaited<ReturnType<typeof resolveClinicalEmitter>>;
export interface PrescriptionSigner {
  identity: PrescriptionIdentity;
  buffer: Buffer;
  password: string;
  meta: { assinante: string; cpf: string; ac: string; serial: string; validFrom: string; validTo: string };
}
export type ClinicalPdfKind = "Receituario" | "Solicitacao de exames";
export type PrescriptionCertificateState =
  | "valid"
  | "expired"
  | "not_yet_valid"
  | "missing"
  | "invalid"
  | "owner_mismatch"
  | "unavailable";
export interface PrescriptionCertificateStatus {
  state: PrescriptionCertificateState;
  validFrom: string | null;
  validTo: string | null;
}

class CertificateSourceError extends Error {
  constructor(readonly state: "missing" | "invalid" | "unavailable", message: string) {
    super(message);
    this.name = "CertificateSourceError";
  }
}

export class PrescriptionCertificateExpiredError extends ClinicalIdentityError {
  readonly code = "certificate_expired";
  constructor(validTo: string) {
    super(422, `Certificado vencido em ${validTo}.`);
    this.name = "PrescriptionCertificateExpiredError";
  }
}

const validated = new WeakSet<PrescriptionSigner>();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// No names, client-supplied CPF or global "primary doctor" flags authorize a signature.
export function validatePrescriptionCertificate(
  buffer: Buffer, password: string, identity: PrescriptionIdentity, now = new Date(),
): PrescriptionSigner {
  if (!identity.canPrescribe) {
    throw new ClinicalIdentityError(
      422,
      "O cadastro profissional precisa ter CRM com unidade federativa antes de assinar.",
    );
  }
  if (!/^\d{11}$/.test(digits(identity.professional.cpf))) {
    throw new ClinicalIdentityError(
      422,
      "O cadastro profissional está sem CPF com onze dígitos. Atualize em Meu Acesso > E-mail e CPF para entrar.",
    );
  }
  const meta = inspectPrescriptionCertificate(buffer, password, identity.professional.cpf, now);
  const signer = { identity, buffer, password, meta };
  validated.add(signer);
  return signer;
}

export function inspectPrescriptionCertificate(buffer: Buffer, password: string, ownerCpf: string | null, now = new Date()) {
  const meta = inspectPrescriptionCertificateContents(buffer, password, ownerCpf);
  const nowMs = now.getTime();
  if (nowMs < Date.parse(meta.validFrom)) {
    throw new ClinicalIdentityError(422, "Certificado ainda não está no período de validade.");
  }
  if (nowMs > Date.parse(meta.validTo)) {
    throw new PrescriptionCertificateExpiredError(meta.validTo);
  }
  return meta;
}

function inspectPrescriptionCertificateContents(buffer: Buffer, password: string, ownerCpf: string | null) {
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(buffer.toString("binary")), password);
    const certs = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
    const keys = [
      ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
      ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
    ];
    const key = keys.find(b => b.key)?.key as forge.pki.rsa.PrivateKey | undefined;
    const cert = certs.find(b => {
      const pub = b.cert?.publicKey as forge.pki.rsa.PublicKey | undefined;
      return key && pub?.n?.equals(key.n) && pub.e.equals(key.e);
    })?.cert;
    if (!key || !cert) throw new Error("key mismatch");
    const usage = cert.getExtension("keyUsage") as { digitalSignature?: boolean } | null;
    const constraints = cert.getExtension("basicConstraints") as { cA?: boolean } | null;
    if (key.n.bitLength() < 2048 || constraints?.cA || (usage && !usage.digitalSignature)) {
      throw new Error("certificate not suitable for document signing");
    }
    const cn = String(cert.subject.getField("CN")?.value ?? "");
    const cpf = digits(cn.match(/(?:^|:)\s*(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})\s*$/)?.[1]);
    if (!cpf || cpf !== digits(ownerCpf)) {
      throw new ClinicalIdentityError(422, "O certificado não pertence ao CPF do médico autenticado.");
    }
    return {
      assinante: cn.split(":")[0], cpf, ac: String(cert.issuer.getField("CN")?.value ?? ""),
      serial: cert.serialNumber.toUpperCase(),
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
    };
  } catch (err) {
    if (err instanceof ClinicalIdentityError) throw err;
    throw new ClinicalIdentityError(422, "Certificado inválido, senha incorreta ou chave privada incompatível.");
  }
}

interface CertificateCredential {
  buffer: Buffer;
  password: string;
}

async function loadCertificateCredentials(professionalId: number): Promise<CertificateCredential[]> {
  const professionalPrefix = `certificate.professional.${professionalId}`;
  try {
    const meta = await getJsonSetting<CertMeta>(`${professionalPrefix}.meta`);
    if (meta) {
      if (!meta.objectPath?.startsWith("certs/pfx/")) {
        throw new CertificateSourceError("invalid", "Caminho do certificado inválido.");
      }
      const password = await getSecret(`${professionalPrefix}.password`);
      if (!password) throw new CertificateSourceError("missing", "Senha do certificado ausente.");
      try {
        const buffer = await new ObjectStorageService().readPrivateObject(meta.objectPath);
        return [{ buffer, password }];
      } catch {
        throw new CertificateSourceError("unavailable", "Arquivo do certificado indisponível.");
      }
    }
    // Compatibilidade histórica: o certificado global só pode ser usado
    // quando o CPF do titular corresponder ao médico autenticado.
    let buffer: Buffer;
    let passwords: string[];
    try {
      buffer = getCertBufferSync();
      passwords = getCertPasswordsSync();
    } catch {
      throw new CertificateSourceError("missing", "Certificado do médico não configurado.");
    }
    return passwords.map((password) => ({ buffer, password }));
  } catch (err) {
    if (err instanceof CertificateSourceError) throw err;
    throw new CertificateSourceError("unavailable", "Não foi possível acessar o certificado do médico.");
  }
}

export async function getPrescriptionCertificateStatus(
  professionalId: number,
  ownerCpf: string | null,
  now = new Date(),
): Promise<PrescriptionCertificateStatus> {
  let credentials: CertificateCredential[];
  try {
    credentials = await loadCertificateCredentials(professionalId);
  } catch (err) {
    return {
      state: err instanceof CertificateSourceError ? err.state : "unavailable",
      validFrom: null,
      validTo: null,
    };
  }

  let lastError: unknown;
  for (const credential of credentials) {
    try {
      const meta = inspectPrescriptionCertificateContents(credential.buffer, credential.password, ownerCpf);
      const nowMs = now.getTime();
      return {
        state: nowMs < Date.parse(meta.validFrom)
          ? "not_yet_valid"
          : nowMs > Date.parse(meta.validTo) ? "expired" : "valid",
        validFrom: meta.validFrom,
        validTo: meta.validTo,
      };
    } catch (err) {
      lastError = err;
      if (err instanceof ClinicalIdentityError &&
        err.message.includes("não pertence ao CPF")) {
        return { state: "owner_mismatch", validFrom: null, validTo: null };
      }
    }
  }

  if (lastError instanceof CertificateSourceError) {
    return { state: lastError.state, validFrom: null, validTo: null };
  }
  return { state: "invalid", validFrom: null, validTo: null };
}

export async function requireExpiredPrescriptionCertificate(
  identity: PrescriptionIdentity,
  now: Date = brtNow(),
): Promise<PrescriptionCertificateStatus> {
  if (!identity.canPrescribe) {
    throw new ClinicalIdentityError(422, "O cadastro profissional precisa ter CRM com unidade federativa.");
  }
  if (!/^\d{11}$/.test(digits(identity.professional.cpf))) {
    throw new ClinicalIdentityError(422, "O cadastro profissional precisa ter CPF com onze dígitos.");
  }
  const status = await getPrescriptionCertificateStatus(
    identity.professional.id,
    identity.professional.cpf,
    now,
  );
  if (status.state !== "expired") {
    const messages: Record<PrescriptionCertificateState, string> = {
      valid: "O certificado está vigente; use a emissão assinada.",
      expired: "",
      not_yet_valid: "O certificado ainda não iniciou a validade.",
      missing: "Certificado do médico não configurado.",
      invalid: "Certificado inválido ou senha incorreta.",
      owner_mismatch: "O certificado não pertence ao médico autenticado.",
      unavailable: "Não foi possível validar o certificado do médico.",
    };
    throw new ClinicalIdentityError(422, messages[status.state]);
  }
  return status;
}

export async function resolvePrescriptionSigner(identity: PrescriptionIdentity): Promise<PrescriptionSigner> {
  const credentials = await loadCertificateCredentials(identity.professional.id);
  let lastError: unknown;
  for (const credential of credentials) {
    try {
      return validatePrescriptionCertificate(credential.buffer, credential.password, identity);
    } catch (err) {
      lastError = err;
      if (err instanceof ClinicalIdentityError && err.message.includes("não pertence ao CPF")) {
        throw err;
      }
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new ClinicalIdentityError(422, "Certificado do médico indisponível. Configure-o em Certificados.");
}

export function assertPrescriptionSigner(signer?: PrescriptionSigner): asserts signer is PrescriptionSigner {
  if (!signer || !validated.has(signer)) {
    throw new ClinicalIdentityError(422, "Assinatura exige médico, paciente e clínica autorizados.");
  }
}

export async function signPrescriptionPdf(doc: PDFDocument, signer?: PrescriptionSigner): Promise<Uint8Array> {
  return signClinicalPdf(doc, signer, "Receituario");
}

export async function signClinicalPdf(
  doc: PDFDocument, signer: PrescriptionSigner | undefined, kind: ClinicalPdfKind,
): Promise<Uint8Array> {
  assertPrescriptionSigner(signer);
  // A certificate can expire between rendering the document and embedding its signature.
  inspectPrescriptionCertificate(signer.buffer, signer.password, signer.identity.professional.cpf);
  const { professional, client, clinic } = signer.identity;
  const reason = kind === "Receituario" ? "Receituário médico" : "Solicitação de exames";
  doc.setSubject(`${kind};medico=${professional.id};cliente=${client.id};clinica=${clinic.id};empresa=${clinic.empresaId}`);
  doc.setAuthor(professional.name);
  pdflibAddPlaceholder({ pdfDoc: doc, reason, contactInfo: "",
    name: signer.meta.assinante, location: clinic.name, signatureLength: 16384 });
  return new Uint8Array(await new SignPdf().sign(
    Buffer.from(await doc.save({ useObjectStreams: false })),
    new P12Signer(signer.buffer, { passphrase: signer.password }),
  ));
}

export async function signExistingPrescriptionPdf(bytes: Uint8Array, signer: PrescriptionSigner): Promise<Uint8Array> {
  return signExistingClinicalPdf(bytes, signer, "Receituario");
}

export async function signExistingClinicalPdf(
  bytes: Uint8Array, signer: PrescriptionSigner, kind: ClinicalPdfKind,
): Promise<Uint8Array> {
  return signClinicalPdf(await PDFDocument.load(bytes), signer, kind);
}

// Executa a geracao de um documento com o certificado do medico autenticado.
// Sem medico valido, vinculo com a clinica/paciente ou certificado vigente, lanca
// ClinicalIdentityError: NUNCA recorre ao certificado global de outra pessoa.
export async function resolveProtocolDoctor(
  req: import("express").Request,
  clientId: unknown,
  expectedProfessionalId: number | null,
): Promise<PrescriptionIdentity> {
  const identity = await resolveClinicalEmitter(req, clientId);
  if (!Number.isSafeInteger(expectedProfessionalId) ||
      expectedProfessionalId !== identity.professional.id) {
    throw new ClinicalIdentityError(
      403,
      "A emissão exige o médico responsável registrado no protocolo.",
    );
  }
  return identity;
}

export async function withLoggedDoctorCertificate<T>(
  req: import("express").Request,
  clientId: unknown,
  fn: () => Promise<T>,
  options?: { expectedProfessionalId: number | null },
): Promise<T> {
  const identity = options
    ? await resolveProtocolDoctor(req, clientId, options.expectedProfessionalId)
    : await resolveClinicalEmitter(req, clientId);
  const signer = await resolvePrescriptionSigner(identity);
  return runWithDoctorCertificate({ buffer: signer.buffer, password: signer.password }, fn);
}
