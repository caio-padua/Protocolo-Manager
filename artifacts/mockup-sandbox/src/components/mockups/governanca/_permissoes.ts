/* ============================================================
   FONTE ÚNICA de permissões (mock compartilhado)
   Governanca.tsx (matriz do CEO) e Laudo.tsx (telas que obedecem)
   leem daqui. Assim a história "CEO libera -> a tela obedece"
   fica coerente entre as telas, com uma só verdade.
   ============================================================ */

export type Papel = { id: string; nome: string; destaque?: boolean };
export const PAPEIS: Papel[] = [
  { id: "med1", nome: "Médico 01" },
  { id: "medV", nome: "Médico Validador", destaque: true },
  { id: "enf1", nome: "Enfermeira 01" },
  { id: "enf2", nome: "Enfermeira 02" },
  { id: "adm", nome: "ADM / Financeiro" },
];

/* papel sob o qual o Laudo é visto neste mockup */
export const PAPEL_VISAO_LAUDO = "medV";
export function nomePapel(id: string): string {
  return PAPEIS.find((p) => p.id === id)?.nome ?? id;
}

export type Item = { id: string; nome: string; soCeo?: boolean };
export type Grupo = { grupo: string; itens: Item[] };
export const GRUPOS: Grupo[] = [
  {
    grupo: "Documentos",
    itens: [
      { id: "atestado", nome: "Atestado" },
      { id: "encaminhamento", nome: "Encaminhamento" },
      { id: "laudo_saude", nome: "Laudo · Estado de Saúde" },
      { id: "laudo_inss", nome: "Laudo · Afastamento INSS" },
      { id: "laudo_insumo", nome: "Laudo · Requisição de Insumo" },
    ],
  },
  {
    grupo: "Clínico",
    itens: [
      { id: "mesa", nome: "Mesa de Validação" },
      { id: "protocolo", nome: "Lançar Protocolo" },
      { id: "ras", nome: "RAS / Aplicação" },
      { id: "anamnese", nome: "Anamnese" },
    ],
  },
  {
    grupo: "Gestão",
    itens: [
      { id: "financeiro", nome: "Financeiro" },
      { id: "estoque", nome: "Estoque" },
      { id: "governanca", nome: "Governança (só CEO)", soCeo: true },
    ],
  },
];

export type MatrizPermissoes = Record<string, Record<string, boolean>>;

/* defaults plausíveis; laudo_insumo fica OFF para o Médico Validador (exemplo do controle do CEO) */
export function permissoesDefault(): MatrizPermissoes {
  const m: MatrizPermissoes = {};
  for (const g of GRUPOS) {
    for (const it of g.itens) {
      m[it.id] = {};
      for (const p of PAPEIS) {
        let on = false;
        if (it.soCeo) on = false;
        else if (["atestado", "encaminhamento", "laudo_saude", "laudo_inss", "mesa", "protocolo", "ras", "anamnese"].includes(it.id))
          on = p.id === "med1" || p.id === "medV" || (["mesa", "ras", "anamnese"].includes(it.id) && p.id.startsWith("enf"));
        else if (it.id === "laudo_insumo") on = p.id === "med1"; // medV OFF (exemplo)
        else if (it.id === "financeiro") on = p.id === "adm";
        else if (it.id === "estoque") on = p.id === "adm" || p.id.startsWith("enf");
        m[it.id][p.id] = on;
      }
    }
  }
  return m;
}

/* helper de leitura: o papel pode usar a ferramenta? */
export function podeUsar(m: MatrizPermissoes, itemId: string, papelId: string): boolean {
  return !!m[itemId]?.[papelId];
}
