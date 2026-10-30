// Shared by the parent test and isolated subprocess; never contains real data.
export function syntheticDispatchDocuments(multipart = false) {
  return Array.from({ length: multipart ? 12 : 1 }, (_, index) => ({
    id: 91 + index, clientId: 101, tipo: "OUTROS",
    token: multipart ? String(index).padStart(48, "0") : "a".repeat(48),
    fileName: multipart ? `${"Exame & sintetico ".repeat(10)}${index}.pdf` : "Exame sintetico.pdf",
    examCount: 1,
    pdfData: Buffer.from("NOT A REAL PDF").toString("base64"),
  }));
}
