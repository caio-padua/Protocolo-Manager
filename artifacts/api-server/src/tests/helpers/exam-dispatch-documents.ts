// Synthetic documents only: distinct IDs/tokens let the restart test prove
// that the first Telegram batch cannot contain the entire requested set.
export function syntheticDispatchDocuments(count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: 91 + index, clientId: 101, tipo: "OUTROS",
    token: (91 + index).toString(16).padStart(48, "0"),
    fileName: `Exame sintetico ${index + 1}.pdf`, examCount: 1,
    pdfData: Buffer.from("NOT A REAL PDF").toString("base64"),
  }));
}
