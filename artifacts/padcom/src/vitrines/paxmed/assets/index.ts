/**
 * Imagens da vitrine PAXMED. Binários reais recuperados do projeto de origem publicado (mesmos nomes e tamanhos em bytes
 * do manifesto .asset.json do commit bef65e1f); impressões digitais em public/vitrines/paxmed/paxmed.sha256.txt.
 */
export const vitrineAsset = (nome: string): string => `${import.meta.env.BASE_URL}vitrines/paxmed/${nome}`;
