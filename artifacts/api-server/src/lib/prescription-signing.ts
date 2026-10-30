import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib";
import { ClinicalIdentityError } from "./clinical-emitter";
import type { resolveClinicalEmitter } from "./clinical-emitter";
import { getCertBufferSync, getCertPasswordsSync, type CertMeta } from "./cert-source";
import { getJsonSetting, getSecret } from "./secure-settings";
import { ObjectStorageService } from "./objectStorage";

export type PrescriptionIdentity = Awaited<ReturnType<typeof resolveClinicalEmitter>>;
export interface PrescriptionSigner {
  identity: PrescriptionIdentity;
  buffer: Buffer;
  password: string;
  meta: { assinante: string; cpf: string; ac: string; serial: string; validTo: string };
}
export type ClinicalPdfKind = "Receituario" | "Solicitacao de exames";
const validated = new WeakSet<PrescriptionSigner>();
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

// No names, client-supplied CPF or global "primary doctor" flags authorize a signature.
export function validatePrescriptionCertificate(
  buffer: Buffer, password: string, identity: PrescriptionIdentity, now = new Date(),
): PrescriptionSigner {
  if (!identity.canPrescribe || !/^\d{11}$/.test(digits(identity.professional.cpf))) {
    throw new ClinicalIdentityError(422, "Informe CPF e CRM/UF do médico antes de assinar.");
  }
  const meta = inspectPrescriptionCertificate(buffer, password, identity.professional.cpf, now);
  const signer = { identity, buffer, password, meta };
  validated.add(signer);
  return signer;
}

export function inspectPrescriptionCertificate(buffer: Buffer, password: string, ownerCpf: string | null, now = new Date()) {
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
    if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
      throw new ClinicalIdentityError(422, "Certificado fora do período de validade.");
    }
    return {
      assinante: cn.split(":")[0], cpf, ac: String(cert.issuer.getField("CN")?.value ?? ""),
      serial: cert.serialNumber.toUpperCase(), validTo: cert.validity.notAfter.toISOString(),
    };
  } catch (err) {
    if (err instanceof ClinicalIdentityError) throw err;
    throw new ClinicalIdentityError(422, "Certificado inválido, senha incorreta ou chave privada incompatível.");
  }
}

export async function resolvePrescriptionSigner(identity: PrescriptionIdentity): Promise<PrescriptionSigner> {
  const prefix = `certificate.professional.${identity.professional.id}`;
  try {
    const meta = await getJsonSetting<CertMeta>(`${prefix}.meta`);
    if (meta) {
      if (!meta.objectPath.startsWith("certs/pfx/")) throw new Error("invalid path");
      const password = await getSecret(`${prefix}.password`);
      if (!password) throw new ClinicalIdentityError(422, "Senha do certificado do médico ausente.");
      return validatePrescriptionCertificate(
        await new ObjectStorageService().readPrivateObject(meta.objectPath), password, identity,
      );
    }
    // Migration compatibility: the global certificate may ONLY sign for its actual owner.
    const buffer = getCertBufferSync();
    let last: unknown;
    for (const password of getCertPasswordsSync()) {
      try { return validatePrescriptionCertificate(buffer, password, identity); } catch (err) { last = err; }
    }
    throw last;
  } catch (err) {
    if (err instanceof ClinicalIdentityError) throw err;
    throw new ClinicalIdentityError(422, "Certificado do médico indisponível. Configure-o em Certificados.");
  }
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
  doc.setSubject(`${kind};medico=${professional.id};cliente=${client.id};clinica=${clinic.id};empresa=${clinic.empresaId}`);
  doc.setAuthor(professional.name);
  pdflibAddPlaceholder({ pdfDoc: doc, reason: kind, contactInfo: "",
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
