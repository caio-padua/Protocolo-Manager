// Mapa papel -> destino (Tarefa 3 do go-live, 27/07/2026).
//
// O `role` dos profissionais e TEXTO LIVRE ("Recepcionista", "executor",
// "Gerente Administrativo"...) e por isso NUNCA serve de chave de decisao.
// A identidade estavel e outra:
//   - isPrimaryDoctor = o CEO (dono, acesso total)
//   - category        = papel fixo da matriz de governanca
//     ("medico" | "enfermagem" | "recepcao" | "administrativo" | "financeiro")
//
// O site publico (padaxor.lovable.app) NAO decide nada: ele recebe `destino`
// pronto na resposta do login e apenas redireciona. Mudar um destino = mudar
// AQUI, um lugar so, sem tocar no site.

const DESTINO_CEO = "/";

const DESTINO_POR_CATEGORIA: Record<string, string> = {
  medico: "/cockpit",
  enfermagem: "/agenda",
  recepcao: "/agenda",
  administrativo: "/",
  financeiro: "/payments",
};

// Categoria desconhecida ou "outro": cai no Dashboard, e a matriz de
// governanca (usePermissoes no front) decide o que a pessoa ve.
const DESTINO_PADRAO = "/";

export function destinoPorPerfil(perfil: {
  isPrimaryDoctor: boolean | null;
  category: string | null;
}): string {
  if (perfil.isPrimaryDoctor) return DESTINO_CEO;
  const categoria = (perfil.category ?? "").trim().toLowerCase();
  return DESTINO_POR_CATEGORIA[categoria] ?? DESTINO_PADRAO;
}
