---
name: Assinatura PDF embarcada (PAdES / selo verde Adobe)
description: Como o RAS/protocolo embute assinatura ICP-Brasil validavel pelo Adobe e armadilhas conhecidas.
---

# Assinatura digital embarcada no PDF (selo verde do Adobe)

O gerador de PDF assina com o certificado A1 ICP-Brasil EMBUTINDO a assinatura no
arquivo (padrao PAdES), nao guardando o PKCS#7 por fora como metadado. So a
assinatura embutida faz o Adobe Reader mostrar o "selo verde" de validacao.

Receita que funciona (biblioteca @signpdf v3):
1. `pdflibAddPlaceholder({ pdfDoc, reason, contactInfo, name, location, signatureLength })`
2. `pdfDoc.save({ useObjectStreams: false })` — OBRIGATORIO false, senao o ByteRange nao e localizavel
3. `new SignPdf().sign(Buffer, new P12Signer(pfxBuffer, { passphrase }))`

Armadilhas (cada uma custou tempo):
- **esbuild + export default:** `import signpdf from "@signpdf/signpdf"` quebra em runtime
  no bundle (`import_signpdf.default.sign is not a function`). Solucao: importar a
  CLASSE nomeada `import { SignPdf }` e `new SignPdf()`.
- **"issuer isn't Trusted" no pdfsig/openssl local NAO e defeito.** A raiz ICP-Brasil
  nao esta no armazenamento NSS do container; o Adobe confia (lista AATL), entao fica
  verde no Adobe. Validar integridade por `pdfsig` ("Signature is Valid" + "Total
  document signed") e suficiente no ambiente; a confianca da cadeia so se ve no Adobe.
- **signatureLength** precisa caber a cadeia CMS. 16384 cobre o A1 atual; se aparecer
  erro "placeholder too small", aumentar (32768/65536). Quando pequeno, FALHA na
  geracao (erro), nao gera assinatura invalida silenciosa.
- **Nao pos-processar o PDF depois de assinar.** Qualquer regravacao (recompressao,
  re-save) invalida a assinatura. Upload ao Google Drive deve enviar os bytes assinados
  intactos.

**Divida de seguranca conhecida:** a senha do .pfx esteve hardcoded no fonte
(`CERT_PASSWORDS`). Caminho preferido e a variavel de ambiente `CERT_PASSWORD`
(secret); os literais sao fallback ate o secret ser registrado e os literais removidos.
