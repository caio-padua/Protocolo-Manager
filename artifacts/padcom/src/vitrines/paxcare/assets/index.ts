/**
 * Arquivos de imagem da vitrine PAXCARE. Vieram do projeto de origem (mesmos nomes e tamanhos em bytes do manifesto
 * `.asset.json` do kit; impressões digitais em public/vitrines/paxcare/paxcare.sha256.txt).
 */
export const vitrineAsset = (nome: string): string => `${import.meta.env.BASE_URL}vitrines/paxcare/${nome}`;
