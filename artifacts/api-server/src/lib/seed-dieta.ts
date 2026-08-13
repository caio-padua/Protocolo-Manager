import {
  db,
  dietaProtocolosTable,
  dietaCatalogoAlimentosTable,
  dietaReceitasTable,
  dietaReceitaIngredientesTable,
  dietaReceitaProtocolosTable,
} from "@workspace/db";
import { and, eq, isNull, inArray } from "drizzle-orm";

// ============================================================================
// SEED — Tipos de Dieta, Catalogo ampliado e Receitas (Task 234).
//
// Idempotente e seguro para rodar em TODO boot (nunca so uma vez):
//   - Protocolos (tipos de dieta) e alimentos novos entram por `codigo` unico
//     com onConflictDoNothing — reboot nao duplica.
//   - Preco/unidade dos alimentos JA existentes (ALM001..027, semeados antes
//     desta tarefa) so e preenchido quando ainda esta NULL — nunca sobrescreve
//     edicao feita pela tela (Regra de Ouro: nao destruir trabalho do CEO).
//   - Receitas entram por `codigo` unico; se o codigo ja existe, a receita
//     INTEIRA (ingredientes + tipos) e pulada — nao gera linhas duplicadas
//     a cada restart.
//
// NOTA DE MODELAGEM (preco x unidade de compra): `unidadeCompraEquivalenteG`
// e sempre "quantos gramas do alimento, NA MESMA BASE do catalogo (cru ou
// cozido — o que ja estiver la), equivalem a 1 unidade de compra". Isso
// absorve tanto conversao de embalagem (1 duzia de ovos ~600 g) quanto
// rendimento de coccao (1 kg de arroz CRU rende ~2.700 g de arroz cozido,
// que e a base do catalogo). Preco e sempre o preco de mercado da unidade de
// compra REAL (o que se compra no mercado), nao do produto cozido.
// Precos pesquisados manualmente como PONTO DE PARTIDA (mercado brasileiro,
// medias de 2026) — editaveis a qualquer momento pela tela.
// ============================================================================

type SeedLog = (msg: string) => void;
const noopLog: SeedLog = () => {};

// ---------------------------------------------------------------------------
// 1) TIPOS DE DIETA (dieta_protocolos)
// ---------------------------------------------------------------------------
const PROTOCOLOS = [
  {
    codigo: "low_carb",
    nome: "Low Carb",
    estiloAlimentar: "low_carb",
    objetivo: "Emagrecimento e controle glicêmico",
    descricao:
      "Reduz o consumo de carboidratos refinados e açúcares, priorizando proteínas, gorduras boas e vegetais. Indicada para quem busca emagrecimento e melhora do controle glicêmico sem eliminar completamente os carboidratos da alimentação.",
  },
  {
    codigo: "cetogenica",
    nome: "Cetogênica",
    estiloAlimentar: "cetogenica",
    objetivo: "Cetose nutricional para emagrecimento acelerado",
    descricao:
      "Dieta rica em gorduras (até 75% das calorias), moderada em proteínas e muito baixa em carboidratos (geralmente abaixo de 50 g/dia), levando o corpo a usar gordura como fonte primária de energia (cetose).",
  },
  {
    codigo: "mediterranea",
    nome: "Mediterrânea",
    estiloAlimentar: "mediterranea",
    objetivo: "Longevidade e saúde cardiovascular",
    descricao:
      "Inspirada na alimentação tradicional dos países banhados pelo Mediterrâneo: azeite de oliva, peixes, grãos integrais, leguminosas, vegetais e frutas, com consumo moderado de laticínios e baixo consumo de carne vermelha.",
  },
  {
    codigo: "carnivora",
    nome: "Carnívora",
    estiloAlimentar: "carnivora",
    objetivo: "Eliminação de vegetais para investigação de sensibilidades e emagrecimento agressivo",
    descricao:
      "Baseada exclusivamente em produtos de origem animal — carnes, peixes, ovos e laticínios gordurosos. Elimina vegetais, frutas, grãos e leguminosas da alimentação.",
  },
  {
    codigo: "hiperproteica",
    nome: "Hiperproteica",
    estiloAlimentar: "hiperproteica",
    objetivo: "Ganho e manutenção de massa magra",
    descricao:
      "Aumenta a proporção de proteínas na dieta (geralmente acima de 2 g por kg de peso corporal), priorizando carnes magras, claras de ovo, laticínios magros e suplementação — indicada para hipertrofia ou preservação muscular durante o emagrecimento.",
  },
] as const;

// ---------------------------------------------------------------------------
// 2) BACKFILL de preco/unidade nos alimentos JA existentes (ALM001..027).
//    So aplica quando preco_medio ainda estiver NULL (guarda contra
//    sobrescrever edicao feita pela tela).
// ---------------------------------------------------------------------------
interface PrecoInfo {
  precoMedio: number;
  unidadeCompra: string;
  unidadeCompraEquivalenteG: number;
  categoriaCompra: string;
}

const PRECO_BACKFILL: Record<string, PrecoInfo> = {
  ALM001: { precoMedio: 19.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  ALM002: { precoMedio: 36.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  ALM003: { precoMedio: 9.90, unidadeCompra: "dz", unidadeCompraEquivalenteG: 600, categoriaCompra: "laticinios" },
  ALM004: { precoMedio: 26.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  ALM005: { precoMedio: 59.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  ALM006: { precoMedio: 149.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 900, categoriaCompra: "mercearia" },
  ALM007: { precoMedio: 6.49, unidadeCompra: "kg", unidadeCompraEquivalenteG: 2700, categoriaCompra: "mercearia" },
  ALM008: { precoMedio: 8.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 2500, categoriaCompra: "mercearia" },
  ALM009: { precoMedio: 5.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM010: { precoMedio: 9.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "mercearia" },
  ALM011: { precoMedio: 12.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 500, categoriaCompra: "mercearia" },
  ALM012: { precoMedio: 8.49, unidadeCompra: "kg", unidadeCompraEquivalenteG: 2300, categoriaCompra: "mercearia" },
  ALM013: { precoMedio: 11.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 2200, categoriaCompra: "mercearia" },
  ALM014: { precoMedio: 39.90, unidadeCompra: "l", unidadeCompraEquivalenteG: 920, categoriaCompra: "mercearia" },
  ALM015: { precoMedio: 18.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 500, categoriaCompra: "mercearia" },
  ALM016: { precoMedio: 9.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM017: { precoMedio: 14.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 100, categoriaCompra: "mercearia" },
  ALM018: { precoMedio: 9.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM019: { precoMedio: 3.50, unidadeCompra: "un", unidadeCompraEquivalenteG: 300, categoriaCompra: "hortifruti" },
  ALM020: { precoMedio: 7.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM021: { precoMedio: 5.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM022: { precoMedio: 6.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM023: { precoMedio: 8.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM024: { precoMedio: 5.50, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  ALM025: { precoMedio: 3.90, unidadeCompra: "un", unidadeCompraEquivalenteG: 170, categoriaCompra: "laticinios" },
  ALM026: { precoMedio: 12.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 200, categoriaCompra: "laticinios" },
  ALM027: { precoMedio: 6.50, unidadeCompra: "l", unidadeCompraEquivalenteG: 1000, categoriaCompra: "laticinios" },
};

// ---------------------------------------------------------------------------
// 3) ALIMENTOS NOVOS — ampliam o catalogo para cobrir as 5 dietas.
// ---------------------------------------------------------------------------
interface NovoAlimento {
  codigo: string;
  nome: string;
  grupo: string;
  subgrupo: string;
  porcaoPadraoG: number;
  kcal100g: number;
  proteinaG100g: number;
  carboidratoG100g: number;
  gorduraG100g: number;
  precoMedio: number;
  unidadeCompra: string;
  unidadeCompraEquivalenteG: number;
  categoriaCompra: string;
}

const ALIMENTOS_NOVOS: NovoAlimento[] = [
  // ---- Açougue: carnes (carnívora, cetogênica, hiperproteica) ----
  { codigo: "ALM028", nome: "Picanha grelhada", grupo: "Proteina", subgrupo: "Carne vermelha", porcaoPadraoG: 150, kcal100g: 289, proteinaG100g: 26, carboidratoG100g: 0, gorduraG100g: 20, precoMedio: 69.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM029", nome: "Alcatra grelhada", grupo: "Proteina", subgrupo: "Carne vermelha", porcaoPadraoG: 150, kcal100g: 163, proteinaG100g: 30, carboidratoG100g: 0, gorduraG100g: 4.3, precoMedio: 42.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM030", nome: "Costela bovina assada", grupo: "Proteina", subgrupo: "Carne vermelha", porcaoPadraoG: 150, kcal100g: 350, proteinaG100g: 24, carboidratoG100g: 0, gorduraG100g: 28, precoMedio: 34.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM031", nome: "Fígado bovino grelhado", grupo: "Proteina", subgrupo: "Miudo", porcaoPadraoG: 120, kcal100g: 175, proteinaG100g: 26, carboidratoG100g: 4, gorduraG100g: 5, precoMedio: 24.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM032", nome: "Bacon frito", grupo: "Proteina", subgrupo: "Carne suina", porcaoPadraoG: 30, kcal100g: 541, proteinaG100g: 37, carboidratoG100g: 1.4, gorduraG100g: 42, precoMedio: 22.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 250, categoriaCompra: "acougue" },
  { codigo: "ALM033", nome: "Lombo suíno assado", grupo: "Proteina", subgrupo: "Carne suina", porcaoPadraoG: 120, kcal100g: 210, proteinaG100g: 27, carboidratoG100g: 0, gorduraG100g: 11, precoMedio: 24.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM034", nome: "Peito de peru grelhado", grupo: "Proteina", subgrupo: "Ave", porcaoPadraoG: 120, kcal100g: 135, proteinaG100g: 30, carboidratoG100g: 0, gorduraG100g: 1.7, precoMedio: 28.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM035", nome: "Carne de sol dessalgada", grupo: "Proteina", subgrupo: "Carne vermelha", porcaoPadraoG: 120, kcal100g: 250, proteinaG100g: 32, carboidratoG100g: 0, gorduraG100g: 13, precoMedio: 44.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM036", nome: "Cordeiro (pernil assado)", grupo: "Proteina", subgrupo: "Carne vermelha", porcaoPadraoG: 150, kcal100g: 294, proteinaG100g: 25, carboidratoG100g: 0, gorduraG100g: 21, precoMedio: 59.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM037", nome: "Linguiça toscana grelhada", grupo: "Proteina", subgrupo: "Carne suina", porcaoPadraoG: 80, kcal100g: 300, proteinaG100g: 15, carboidratoG100g: 2, gorduraG100g: 26, precoMedio: 22.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  // ---- Peixes e frutos do mar (mediterrânea, cetogênica, carnívora) ----
  { codigo: "ALM038", nome: "Bacalhau dessalgado cozido", grupo: "Proteina", subgrupo: "Peixe", porcaoPadraoG: 150, kcal100g: 105, proteinaG100g: 23, carboidratoG100g: 0, gorduraG100g: 0.9, precoMedio: 79.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM039", nome: "Sardinha grelhada", grupo: "Proteina", subgrupo: "Peixe", porcaoPadraoG: 120, kcal100g: 208, proteinaG100g: 24.6, carboidratoG100g: 0, gorduraG100g: 11.5, precoMedio: 24.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  { codigo: "ALM040", nome: "Atum em lata (óleo, drenado)", grupo: "Proteina", subgrupo: "Peixe", porcaoPadraoG: 60, kcal100g: 189, proteinaG100g: 29, carboidratoG100g: 0, gorduraG100g: 8, precoMedio: 8.90, unidadeCompra: "un", unidadeCompraEquivalenteG: 120, categoriaCompra: "mercearia" },
  { codigo: "ALM041", nome: "Camarão cozido", grupo: "Proteina", subgrupo: "Fruto do mar", porcaoPadraoG: 120, kcal100g: 99, proteinaG100g: 24, carboidratoG100g: 0.2, gorduraG100g: 0.3, precoMedio: 69.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "acougue" },
  // ---- Laticínios e gorduras (cetogênica, carnívora, mediterrânea) ----
  { codigo: "ALM042", nome: "Manteiga", grupo: "Gordura", subgrupo: "Laticinio", porcaoPadraoG: 10, kcal100g: 717, proteinaG100g: 0.9, carboidratoG100g: 0.1, gorduraG100g: 81, precoMedio: 9.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 200, categoriaCompra: "laticinios" },
  { codigo: "ALM043", nome: "Creme de leite fresco", grupo: "Gordura", subgrupo: "Laticinio", porcaoPadraoG: 30, kcal100g: 292, proteinaG100g: 2.2, carboidratoG100g: 3, gorduraG100g: 30, precoMedio: 5.50, unidadeCompra: "un", unidadeCompraEquivalenteG: 200, categoriaCompra: "laticinios" },
  { codigo: "ALM044", nome: "Queijo mussarela", grupo: "Laticinio", subgrupo: "Queijo", porcaoPadraoG: 30, kcal100g: 280, proteinaG100g: 22, carboidratoG100g: 2.2, gorduraG100g: 20, precoMedio: 39.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "laticinios" },
  { codigo: "ALM045", nome: "Queijo parmesão ralado", grupo: "Laticinio", subgrupo: "Queijo", porcaoPadraoG: 15, kcal100g: 431, proteinaG100g: 38, carboidratoG100g: 3.2, gorduraG100g: 29, precoMedio: 12.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 100, categoriaCompra: "laticinios" },
  { codigo: "ALM046", nome: "Clara de ovo (pasteurizada)", grupo: "Proteina", subgrupo: "Ovo", porcaoPadraoG: 100, kcal100g: 52, proteinaG100g: 11, carboidratoG100g: 0.7, gorduraG100g: 0.2, precoMedio: 16.90, unidadeCompra: "l", unidadeCompraEquivalenteG: 1050, categoriaCompra: "laticinios" },
  { codigo: "ALM047", nome: "Iogurte grego natural integral", grupo: "Laticinio", subgrupo: "Iogurte", porcaoPadraoG: 150, kcal100g: 97, proteinaG100g: 9, carboidratoG100g: 4, gorduraG100g: 5, precoMedio: 6.90, unidadeCompra: "un", unidadeCompraEquivalenteG: 150, categoriaCompra: "laticinios" },
  { codigo: "ALM048", nome: "Queijo feta", grupo: "Laticinio", subgrupo: "Queijo", porcaoPadraoG: 30, kcal100g: 264, proteinaG100g: 14, carboidratoG100g: 4, gorduraG100g: 21, precoMedio: 24.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 200, categoriaCompra: "laticinios" },
  // ---- Mercearia: óleos, grãos, leguminosas, oleaginosas, sementes ----
  { codigo: "ALM049", nome: "Óleo de coco", grupo: "Gordura", subgrupo: "Oleo", porcaoPadraoG: 10, kcal100g: 862, proteinaG100g: 0, carboidratoG100g: 0, gorduraG100g: 100, precoMedio: 29.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 500, categoriaCompra: "mercearia" },
  { codigo: "ALM050", nome: "Azeitona preta", grupo: "Gordura", subgrupo: "Fruto", porcaoPadraoG: 15, kcal100g: 115, proteinaG100g: 0.8, carboidratoG100g: 6, gorduraG100g: 11, precoMedio: 9.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 200, categoriaCompra: "mercearia" },
  { codigo: "ALM051", nome: "Castanha de macadâmia", grupo: "Gordura", subgrupo: "Oleaginosa", porcaoPadraoG: 20, kcal100g: 718, proteinaG100g: 7.9, carboidratoG100g: 5.2, gorduraG100g: 76, precoMedio: 24.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 100, categoriaCompra: "mercearia" },
  { codigo: "ALM052", nome: "Amêndoas", grupo: "Gordura", subgrupo: "Oleaginosa", porcaoPadraoG: 20, kcal100g: 579, proteinaG100g: 21, carboidratoG100g: 22, gorduraG100g: 50, precoMedio: 19.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 200, categoriaCompra: "mercearia" },
  { codigo: "ALM053", nome: "Nozes", grupo: "Gordura", subgrupo: "Oleaginosa", porcaoPadraoG: 20, kcal100g: 654, proteinaG100g: 15, carboidratoG100g: 14, gorduraG100g: 65, precoMedio: 22.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 200, categoriaCompra: "mercearia" },
  { codigo: "ALM054", nome: "Grão de bico cozido", grupo: "Carboidrato", subgrupo: "Leguminosa", porcaoPadraoG: 100, kcal100g: 164, proteinaG100g: 8.9, carboidratoG100g: 27, gorduraG100g: 2.6, precoMedio: 12.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 2500, categoriaCompra: "mercearia" },
  { codigo: "ALM055", nome: "Lentilha cozida", grupo: "Carboidrato", subgrupo: "Leguminosa", porcaoPadraoG: 100, kcal100g: 116, proteinaG100g: 9, carboidratoG100g: 20, gorduraG100g: 0.4, precoMedio: 9.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 2300, categoriaCompra: "mercearia" },
  { codigo: "ALM056", nome: "Quinoa cozida", grupo: "Carboidrato", subgrupo: "Cereal", porcaoPadraoG: 100, kcal100g: 120, proteinaG100g: 4.4, carboidratoG100g: 21, gorduraG100g: 1.9, precoMedio: 34.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 2800, categoriaCompra: "mercearia" },
  { codigo: "ALM057", nome: "Chia (semente)", grupo: "Gordura", subgrupo: "Semente", porcaoPadraoG: 15, kcal100g: 486, proteinaG100g: 17, carboidratoG100g: 42, gorduraG100g: 31, precoMedio: 14.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 250, categoriaCompra: "mercearia" },
  { codigo: "ALM058", nome: "Linhaça (semente)", grupo: "Gordura", subgrupo: "Semente", porcaoPadraoG: 15, kcal100g: 534, proteinaG100g: 18, carboidratoG100g: 29, gorduraG100g: 42, precoMedio: 9.90, unidadeCompra: "pacote", unidadeCompraEquivalenteG: 250, categoriaCompra: "mercearia" },
  // ---- Hortifruti adicional (mediterrânea, low carb, cetogênica) ----
  { codigo: "ALM059", nome: "Espinafre cru", grupo: "Vegetal", subgrupo: "Folhoso", porcaoPadraoG: 40, kcal100g: 23, proteinaG100g: 2.9, carboidratoG100g: 3.6, gorduraG100g: 0.4, precoMedio: 4.90, unidadeCompra: "maco", unidadeCompraEquivalenteG: 150, categoriaCompra: "hortifruti" },
  { codigo: "ALM060", nome: "Couve-flor cozida", grupo: "Vegetal", subgrupo: "Legume", porcaoPadraoG: 80, kcal100g: 25, proteinaG100g: 1.9, carboidratoG100g: 5, gorduraG100g: 0.3, precoMedio: 6.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  { codigo: "ALM061", nome: "Abobrinha refogada", grupo: "Vegetal", subgrupo: "Legume", porcaoPadraoG: 80, kcal100g: 20, proteinaG100g: 1.2, carboidratoG100g: 3.1, gorduraG100g: 0.4, precoMedio: 5.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  { codigo: "ALM062", nome: "Pepino", grupo: "Vegetal", subgrupo: "Fruto", porcaoPadraoG: 60, kcal100g: 15, proteinaG100g: 0.7, carboidratoG100g: 3.6, gorduraG100g: 0.1, precoMedio: 5.50, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  { codigo: "ALM063", nome: "Pimentão vermelho", grupo: "Vegetal", subgrupo: "Fruto", porcaoPadraoG: 50, kcal100g: 31, proteinaG100g: 1, carboidratoG100g: 6, gorduraG100g: 0.3, precoMedio: 12.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  { codigo: "ALM064", nome: "Cebola crua", grupo: "Vegetal", subgrupo: "Bulbo", porcaoPadraoG: 30, kcal100g: 40, proteinaG100g: 1.1, carboidratoG100g: 9.3, gorduraG100g: 0.1, precoMedio: 5.50, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  { codigo: "ALM065", nome: "Alho cru", grupo: "Vegetal", subgrupo: "Bulbo", porcaoPadraoG: 5, kcal100g: 149, proteinaG100g: 6.4, carboidratoG100g: 33, gorduraG100g: 0.5, precoMedio: 24.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  { codigo: "ALM066", nome: "Uva", grupo: "Fruta", subgrupo: "Fruta", porcaoPadraoG: 100, kcal100g: 69, proteinaG100g: 0.7, carboidratoG100g: 18, gorduraG100g: 0.2, precoMedio: 12.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
  { codigo: "ALM067", nome: "Limão", grupo: "Fruta", subgrupo: "Fruta", porcaoPadraoG: 20, kcal100g: 29, proteinaG100g: 1.1, carboidratoG100g: 9.3, gorduraG100g: 0.3, precoMedio: 6.90, unidadeCompra: "kg", unidadeCompraEquivalenteG: 1000, categoriaCompra: "hortifruti" },
];

// ---------------------------------------------------------------------------
// 4) RECEITAS — cada uma serve 1+ tipos de dieta (por codigo de protocolo).
// ---------------------------------------------------------------------------
interface ReceitaIngredienteSeed {
  alimentoCodigo: string;
  quantidadeG: number;
}
interface ReceitaSeed {
  codigo: string;
  nome: string;
  modoPreparo: string;
  porcoes: number;
  tempoPreparoMin: number;
  tipos: string[]; // codigos de dieta_protocolos
  ingredientes: ReceitaIngredienteSeed[];
}

const RECEITAS: ReceitaSeed[] = [
  {
    codigo: "REC001", nome: "Omelete de claras com espinafre", porcoes: 1, tempoPreparoMin: 10,
    tipos: ["hiperproteica", "low_carb"],
    modoPreparo: "Refogue o espinafre e o tomate picado no azeite por 2 minutos em fogo médio. Bata as claras levemente com uma pitada de sal e despeje na frigideira. Cozinhe em fogo baixo até firmar, dobre ao meio e sirva quente.",
    ingredientes: [
      { alimentoCodigo: "ALM046", quantidadeG: 150 },
      { alimentoCodigo: "ALM059", quantidadeG: 40 },
      { alimentoCodigo: "ALM014", quantidadeG: 5 },
      { alimentoCodigo: "ALM020", quantidadeG: 30 },
    ],
  },
  {
    codigo: "REC002", nome: "Omelete cetogênico de queijo e bacon", porcoes: 1, tempoPreparoMin: 12,
    tipos: ["cetogenica", "carnivora"],
    modoPreparo: "Frite o bacon na manteiga até dourar. Bata os ovos e despeje sobre o bacon na frigideira. Adicione o queijo ralado por cima, tampe e cozinhe em fogo baixo até o queijo derreter e os ovos firmarem.",
    ingredientes: [
      { alimentoCodigo: "ALM003", quantidadeG: 100 },
      { alimentoCodigo: "ALM032", quantidadeG: 30 },
      { alimentoCodigo: "ALM044", quantidadeG: 30 },
      { alimentoCodigo: "ALM042", quantidadeG: 10 },
    ],
  },
  {
    codigo: "REC003", nome: "Picanha grelhada com manteiga de ervas", porcoes: 1, tempoPreparoMin: 20,
    tipos: ["carnivora", "cetogenica", "low_carb"],
    modoPreparo: "Tempere a picanha com sal grosso e grelhe em fogo alto até o ponto desejado. Derreta a manteiga com o alho picado e regue a carne antes de servir.",
    ingredientes: [
      { alimentoCodigo: "ALM028", quantidadeG: 200 },
      { alimentoCodigo: "ALM042", quantidadeG: 15 },
      { alimentoCodigo: "ALM065", quantidadeG: 5 },
    ],
  },
  {
    codigo: "REC004", nome: "Salmão grelhado com brócolis ao azeite", porcoes: 1, tempoPreparoMin: 20,
    tipos: ["mediterranea", "cetogenica", "low_carb"],
    modoPreparo: "Tempere o salmão com sal e limão e grelhe dos dois lados até dourar. Refogue o brócolis no azeite com uma pitada de sal. Sirva o salmão sobre o brócolis, regando com o azeite restante.",
    ingredientes: [
      { alimentoCodigo: "ALM005", quantidadeG: 150 },
      { alimentoCodigo: "ALM018", quantidadeG: 100 },
      { alimentoCodigo: "ALM014", quantidadeG: 10 },
      { alimentoCodigo: "ALM067", quantidadeG: 15 },
    ],
  },
  {
    codigo: "REC005", nome: "Salada grega com grão de bico", porcoes: 1, tempoPreparoMin: 15,
    tipos: ["mediterranea"],
    modoPreparo: "Corte o tomate, o pepino e a cebola em cubos. Misture com o grão de bico e as azeitonas. Finalize com o queijo feta esfarelado por cima e regue com azeite.",
    ingredientes: [
      { alimentoCodigo: "ALM054", quantidadeG: 100 },
      { alimentoCodigo: "ALM020", quantidadeG: 60 },
      { alimentoCodigo: "ALM062", quantidadeG: 60 },
      { alimentoCodigo: "ALM064", quantidadeG: 20 },
      { alimentoCodigo: "ALM050", quantidadeG: 15 },
      { alimentoCodigo: "ALM048", quantidadeG: 30 },
      { alimentoCodigo: "ALM014", quantidadeG: 10 },
    ],
  },
  {
    codigo: "REC006", nome: "Frango grelhado com batata doce", porcoes: 1, tempoPreparoMin: 25,
    tipos: ["hiperproteica", "low_carb"],
    modoPreparo: "Tempere o peito de frango com ervas e sal e grelhe até dourar dos dois lados. Cozinhe a batata doce em cubos até ficar macia. Sirva com um fio de azeite.",
    ingredientes: [
      { alimentoCodigo: "ALM001", quantidadeG: 150 },
      { alimentoCodigo: "ALM009", quantidadeG: 150 },
      { alimentoCodigo: "ALM014", quantidadeG: 5 },
    ],
  },
  {
    codigo: "REC007", nome: "Bowl de whey com frutas e castanhas", porcoes: 1, tempoPreparoMin: 5,
    tipos: ["hiperproteica"],
    modoPreparo: "Misture o whey com o iogurte grego até ficar homogêneo. Corte a banana em rodelas e adicione por cima. Finalize com as castanhas picadas.",
    ingredientes: [
      { alimentoCodigo: "ALM006", quantidadeG: 30 },
      { alimentoCodigo: "ALM047", quantidadeG: 150 },
      { alimentoCodigo: "ALM022", quantidadeG: 50 },
      { alimentoCodigo: "ALM017", quantidadeG: 10 },
    ],
  },
  {
    codigo: "REC008", nome: "Tilápia com legumes no vapor", porcoes: 1, tempoPreparoMin: 20,
    tipos: ["low_carb", "hiperproteica", "mediterranea"],
    modoPreparo: "Cozinhe o brócolis e a cenoura no vapor até ficarem macios. Tempere a tilápia com sal e limão e grelhe dos dois lados. Sirva com um fio de azeite.",
    ingredientes: [
      { alimentoCodigo: "ALM004", quantidadeG: 150 },
      { alimentoCodigo: "ALM018", quantidadeG: 80 },
      { alimentoCodigo: "ALM021", quantidadeG: 60 },
      { alimentoCodigo: "ALM014", quantidadeG: 8 },
    ],
  },
  {
    codigo: "REC009", nome: "Costela assada com couve-flor gratinada", porcoes: 1, tempoPreparoMin: 40,
    tipos: ["carnivora", "cetogenica"],
    modoPreparo: "Asse a costela temperada até ficar macia e soltar do osso. Misture a couve-flor com o creme de leite e o parmesão e leve ao forno até gratinar. Sirva os dois juntos.",
    ingredientes: [
      { alimentoCodigo: "ALM030", quantidadeG: 200 },
      { alimentoCodigo: "ALM060", quantidadeG: 150 },
      { alimentoCodigo: "ALM045", quantidadeG: 20 },
      { alimentoCodigo: "ALM043", quantidadeG: 30 },
    ],
  },
  {
    codigo: "REC010", nome: "Sardinha grelhada com salada de folhas", porcoes: 1, tempoPreparoMin: 15,
    tipos: ["mediterranea", "low_carb"],
    modoPreparo: "Grelhe as sardinhas temperadas com limão e sal. Monte uma salada com a alface e o tomate, regue com azeite e sirva ao lado do peixe.",
    ingredientes: [
      { alimentoCodigo: "ALM039", quantidadeG: 150 },
      { alimentoCodigo: "ALM019", quantidadeG: 50 },
      { alimentoCodigo: "ALM020", quantidadeG: 50 },
      { alimentoCodigo: "ALM014", quantidadeG: 10 },
      { alimentoCodigo: "ALM067", quantidadeG: 10 },
    ],
  },
  {
    codigo: "REC011", nome: "Patinho moído com legumes refogados", porcoes: 1, tempoPreparoMin: 20,
    tipos: ["hiperproteica", "low_carb"],
    modoPreparo: "Refogue a cebola e o pimentão picados no azeite até murchar. Adicione a carne moída e cozinhe em fogo médio até dourar, temperando a gosto.",
    ingredientes: [
      { alimentoCodigo: "ALM002", quantidadeG: 150 },
      { alimentoCodigo: "ALM064", quantidadeG: 30 },
      { alimentoCodigo: "ALM063", quantidadeG: 50 },
      { alimentoCodigo: "ALM014", quantidadeG: 8 },
    ],
  },
  {
    codigo: "REC012", nome: "Fígado acebolado", porcoes: 1, tempoPreparoMin: 15,
    tipos: ["carnivora", "hiperproteica"],
    modoPreparo: "Refogue a cebola fatiada na manteiga até caramelizar. Adicione o fígado fatiado e cozinhe rapidamente dos dois lados para não endurecer.",
    ingredientes: [
      { alimentoCodigo: "ALM031", quantidadeG: 150 },
      { alimentoCodigo: "ALM064", quantidadeG: 50 },
      { alimentoCodigo: "ALM042", quantidadeG: 10 },
    ],
  },
  {
    codigo: "REC013", nome: "Camarão na manteiga de alho", porcoes: 1, tempoPreparoMin: 12,
    tipos: ["cetogenica", "carnivora", "low_carb"],
    modoPreparo: "Derreta a manteiga em fogo médio e doure o alho picado. Adicione os camarões e refogue por 3 minutos. Finalize com um fio de limão.",
    ingredientes: [
      { alimentoCodigo: "ALM041", quantidadeG: 150 },
      { alimentoCodigo: "ALM042", quantidadeG: 20 },
      { alimentoCodigo: "ALM065", quantidadeG: 8 },
      { alimentoCodigo: "ALM067", quantidadeG: 10 },
    ],
  },
  {
    codigo: "REC014", nome: "Quinoa com legumes e azeite", porcoes: 1, tempoPreparoMin: 15,
    tipos: ["mediterranea", "low_carb"],
    modoPreparo: "Misture a quinoa cozida com os legumes picados em cubos pequenos. Tempere com azeite, limão e sal a gosto e sirva em temperatura ambiente.",
    ingredientes: [
      { alimentoCodigo: "ALM056", quantidadeG: 100 },
      { alimentoCodigo: "ALM063", quantidadeG: 40 },
      { alimentoCodigo: "ALM062", quantidadeG: 40 },
      { alimentoCodigo: "ALM014", quantidadeG: 10 },
      { alimentoCodigo: "ALM067", quantidadeG: 10 },
    ],
  },
];

// ---------------------------------------------------------------------------
// Execucao
// ---------------------------------------------------------------------------
export async function runSeedDieta(log: SeedLog = noopLog): Promise<{
  protocolosCriados: number;
  alimentosNovosCriados: number;
  precosBackfillAplicados: number;
  receitasCriadas: number;
}> {
  let protocolosCriados = 0;
  for (const p of PROTOCOLOS) {
    const inserted = await db
      .insert(dietaProtocolosTable)
      .values({
        codigo: p.codigo,
        nome: p.nome,
        estiloAlimentar: p.estiloAlimentar,
        objetivo: p.objetivo,
        descricao: p.descricao,
      })
      .onConflictDoNothing({ target: dietaProtocolosTable.codigo })
      .returning({ id: dietaProtocolosTable.id });
    if (inserted.length > 0) protocolosCriados++;
  }

  let precosBackfillAplicados = 0;
  for (const [codigo, info] of Object.entries(PRECO_BACKFILL)) {
    const updated = await db
      .update(dietaCatalogoAlimentosTable)
      .set({
        precoMedio: info.precoMedio,
        unidadeCompra: info.unidadeCompra,
        unidadeCompraEquivalenteG: info.unidadeCompraEquivalenteG,
        categoriaCompra: info.categoriaCompra,
      })
      .where(and(eq(dietaCatalogoAlimentosTable.codigo, codigo), isNull(dietaCatalogoAlimentosTable.precoMedio)))
      .returning({ id: dietaCatalogoAlimentosTable.id });
    if (updated.length > 0) precosBackfillAplicados++;
  }

  let alimentosNovosCriados = 0;
  for (const a of ALIMENTOS_NOVOS) {
    const inserted = await db
      .insert(dietaCatalogoAlimentosTable)
      .values({
        codigo: a.codigo,
        nome: a.nome,
        grupo: a.grupo,
        subgrupo: a.subgrupo,
        porcaoPadraoG: a.porcaoPadraoG,
        kcal100g: a.kcal100g,
        proteinaG100g: a.proteinaG100g,
        carboidratoG100g: a.carboidratoG100g,
        gorduraG100g: a.gorduraG100g,
        precoMedio: a.precoMedio,
        unidadeCompra: a.unidadeCompra,
        unidadeCompraEquivalenteG: a.unidadeCompraEquivalenteG,
        categoriaCompra: a.categoriaCompra,
      })
      .onConflictDoNothing({ target: dietaCatalogoAlimentosTable.codigo })
      .returning({ id: dietaCatalogoAlimentosTable.id });
    if (inserted.length > 0) alimentosNovosCriados++;
  }

  // Mapa codigo -> id do catalogo (necessario para gravar os ingredientes das receitas).
  const catalogoRows = await db
    .select({ id: dietaCatalogoAlimentosTable.id, codigo: dietaCatalogoAlimentosTable.codigo })
    .from(dietaCatalogoAlimentosTable);
  const alimentoIdPorCodigo = new Map(catalogoRows.map((r) => [r.codigo, r.id]));

  const protocoloRows = await db
    .select({ id: dietaProtocolosTable.id, codigo: dietaProtocolosTable.codigo })
    .from(dietaProtocolosTable);
  const protocoloIdPorCodigo = new Map(protocoloRows.map((r) => [r.codigo, r.id]));

  let receitasCriadas = 0;
  for (const r of RECEITAS) {
    const existente = await db
      .select({ id: dietaReceitasTable.id })
      .from(dietaReceitasTable)
      .where(eq(dietaReceitasTable.codigo, r.codigo))
      .limit(1);
    if (existente.length > 0) continue; // receita ja seedada — nao duplica ingredientes/tipos

    const alimentoIds = r.ingredientes.map((i) => alimentoIdPorCodigo.get(i.alimentoCodigo));
    if (alimentoIds.some((id) => id === undefined)) {
      log(`seed-dieta: receita ${r.codigo} referencia alimento inexistente — pulando`);
      continue;
    }
    const protocoloIds = r.tipos.map((t) => protocoloIdPorCodigo.get(t));
    if (protocoloIds.some((id) => id === undefined)) {
      log(`seed-dieta: receita ${r.codigo} referencia tipo de dieta inexistente — pulando`);
      continue;
    }

    await db.transaction(async (tx) => {
      const [receita] = await tx
        .insert(dietaReceitasTable)
        .values({
          codigo: r.codigo,
          nome: r.nome,
          modoPreparo: r.modoPreparo,
          porcoes: r.porcoes,
          tempoPreparoMin: r.tempoPreparoMin,
        })
        .returning({ id: dietaReceitasTable.id });
      if (!receita) throw new Error(`Falha ao inserir receita ${r.codigo}`);

      await tx.insert(dietaReceitaIngredientesTable).values(
        r.ingredientes.map((ing, idx) => ({
          receitaId: receita.id,
          alimentoId: alimentoIdPorCodigo.get(ing.alimentoCodigo)!,
          quantidadeG: ing.quantidadeG,
          ordem: idx + 1,
        })),
      );

      await tx.insert(dietaReceitaProtocolosTable).values(
        r.tipos.map((t) => ({
          receitaId: receita.id,
          protocoloId: protocoloIdPorCodigo.get(t)!,
        })),
      );
    });
    receitasCriadas++;
  }

  return { protocolosCriados, alimentosNovosCriados, precosBackfillAplicados, receitasCriadas };
}
