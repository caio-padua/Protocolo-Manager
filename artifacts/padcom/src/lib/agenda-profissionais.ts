/**
 * Profissionais que podem ser escolhidos numa NOVA agenda: Corpo Clínico ativo da clínica cuja categoria
 * GRAVADA (areaId, número) é a mesma da categoria escolhida. Nunca compara rótulos: o nome exibido da
 * profissão ("Biomédico(a)") difere do nome da categoria ("Biomedicina").
 */
export type ProfissionalDaClinica = { id: number; name: string; active: boolean; areaId: number | null };

export function profissionaisParaNovaAgenda(lista: readonly ProfissionalDaClinica[], categoriaId: number | null): ProfissionalDaClinica[] {
  if (categoriaId == null || !Number.isSafeInteger(categoriaId)) return [];
  const vistos = new Map<number, ProfissionalDaClinica>();
  for (const p of lista) {
    if (p.active !== true || p.areaId !== categoriaId) continue;
    const anterior = vistos.get(p.id);
    if (anterior && (anterior.name !== p.name || anterior.areaId !== p.areaId)) {
      throw new Error(`Cadastro divergente para o profissional ${p.id}.`);
    }
    vistos.set(p.id, p);
  }
  return [...vistos.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
