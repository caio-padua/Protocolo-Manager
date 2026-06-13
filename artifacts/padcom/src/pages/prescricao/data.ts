// Página de Prescrição de Fórmulas — dados e parser (PADCOM)
// Catálogo + parser adaptados para TypeScript e identidade Padcon Conect.
import {
  Pill, Activity, Leaf, Sparkles, Zap, Brain, Flame, Wind, Bone, Heart,
  Shield, Dumbbell, Droplet, Eye, Moon, FlaskConical, Coffee,
  type LucideIcon,
} from "lucide-react";

export type Tomada = { doses: number; via: string; periodo: string; hora: string; raw?: string };
export type FormulaSeed = { id: string; cat: string; name: string; body: string };
export type Category = { id: string; label: string; icon: LucideIcon; color?: string };
export type Protocolo = { id: string; nome: string; formulaIds: string[] };
export type SelectedFormula = { id: string; cat: string; name: string; ativos: string; tomadas: Tomada[] };
export type ParsedAtivo = { empty: true } | { nome: string; dose: string } | { raw: string };

export const HEADER_BOILERPLATE = `À Farmácia de Manipulação e ao Paciente:

- O Paciente está ciente de que deverá ser consultado ao término das formulações descritas, e as mesmas deverão ser manipuladas de acordo com a posologia de cada prescrição e limitada a duração do tratamento descrito abaixo.
- As Formulações descritas abaixo são personalizadas e foram elaboradas exclusivamente para o presente tratamento, com base na avaliação clínica e exames do paciente e de acordo com as suas necessidades e objetivos.
- Sua reprodução total ou parcial, sem nova avaliação médica e prescrição atualizada, não está autorizada, nos termos da Resolução CFM nº 1.974/2011 e RDC nº 67/2007 da ANVISA.
- O uso sem acompanhamento do médico prescritor ou por terceiros não é recomendado, e exime este profissional de responsabilidades.`;

export const SEPARATOR = '\n________________________________________________________________\n\n';

// ===== EDITE AQUI A LISTA DEFINITIVA DE PERÍODOS =====
export const PERIODOS: string[] = [
  'Em Jejum',
  'Ao Acordar',
  'Antes do Café da Manhã',
  'Durante o Café da Manhã',
  'Após o Café da Manhã',
  '2h Antes do Almoço',
  '30 min Antes do Almoço',
  '10 min Antes do Almoço',
  'Antes do Almoço',
  'Durante o Almoço',
  'Após o Almoço',
  'À Tarde',
  '2h Antes do Jantar',
  '30 min Antes do Jantar',
  '10 min Antes do Jantar',
  'Antes do Jantar',
  'Durante o Jantar',
  'Após o Jantar',
  '1 hora Antes de Dormir',
  'Antes de Dormir',
  'Antes do Treino',
  '20 min antes do treino',
];
export const VIAS: string[] = ['VO', 'SL', 'Tópico', 'Uso externo'];

export const CATEGORIES: Category[] = [
  { id: 'gastrico', label: 'Gástrico / Digestivo', icon: Pill, color: 'from-amber-500 to-orange-600' },
  { id: 'tireoide', label: 'Tireoide / Metabolismo', icon: Activity, color: 'from-emerald-500 to-teal-600' },
  { id: 'hepato', label: 'Hepato / Detox', icon: Leaf, color: 'from-lime-500 to-green-600' },
  { id: 'vitaminas', label: 'Vitaminas / Minerais', icon: Sparkles, color: 'from-yellow-500 to-amber-600' },
  { id: 'adaptogenos', label: 'Adaptógenos / Energia', icon: Zap, color: 'from-orange-500 to-red-600' },
  { id: 'adhd', label: 'ADHD / Cognitivo', icon: Brain, color: 'from-violet-500 to-purple-600' },
  { id: 'emagrecimento', label: 'Emagrecimento', icon: Flame, color: 'from-rose-500 to-pink-600' },
  { id: 'transito', label: 'Trânsito Intestinal', icon: Wind, color: 'from-stone-500 to-stone-700' },
  { id: 'calmante', label: 'Calmante Diurno', icon: Leaf, color: 'from-teal-500 to-cyan-600' },
  { id: 'cortisol', label: 'Cortisol / Adrenal', icon: Activity, color: 'from-amber-600 to-orange-700' },
  { id: 'articulacao', label: 'Articulações / Osteo', icon: Bone, color: 'from-slate-500 to-slate-700' },
  { id: 'circulacao', label: 'Circulação / Vaso', icon: Heart, color: 'from-red-500 to-rose-600' },
  { id: 'antiaromatase', label: 'Anti-aromatase', icon: Shield, color: 'from-indigo-500 to-blue-700' },
  { id: 'hormonal-f', label: 'Hormonal Feminino', icon: Sparkles, color: 'from-pink-500 to-fuchsia-600' },
  { id: 'anabolizante', label: 'Anabolizantes', icon: Dumbbell, color: 'from-blue-600 to-indigo-700' },
  { id: 'libido', label: 'Antidepressivo / Libido', icon: Heart, color: 'from-fuchsia-500 to-pink-600' },
  { id: 'pretreino', label: 'Pré-treino', icon: Dumbbell, color: 'from-orange-600 to-red-700' },
  { id: 'prostata', label: 'Próstata', icon: Shield, color: 'from-blue-500 to-cyan-700' },
  { id: 'magnesio', label: 'Magnésio', icon: Droplet, color: 'from-cyan-500 to-blue-600' },
  { id: 'cabelo', label: 'Cabelo / Capilar', icon: Sparkles, color: 'from-purple-500 to-violet-600' },
  { id: 'pele', label: 'Pele / Antiparasitário', icon: Shield, color: 'from-yellow-600 to-orange-700' },
  { id: 'antiox', label: 'Antioxidantes', icon: Eye, color: 'from-emerald-600 to-teal-700' },
  { id: 'sono', label: 'Indutores de Sono', icon: Moon, color: 'from-indigo-600 to-purple-800' },
  { id: 'menopausa', label: 'Menopausa / TRH', icon: Sparkles, color: 'from-rose-400 to-pink-500' },
  { id: 'hidratacao', label: 'Hidratação', icon: Droplet, color: 'from-sky-500 to-blue-600' },
  { id: 'probioticos', label: 'Probióticos / Microbioma', icon: FlaskConical, color: 'from-green-500 to-emerald-700' },
  { id: 'comerciais', label: 'Suplementos Comerciais', icon: Coffee, color: 'from-stone-600 to-amber-800' },
];

const FORMULAS_BASE: FormulaSeed[] = [
  { id: 'hcl-10', cat: 'gastrico', name: 'Ácido Clorídrico 10%', body: `Ácido Clorídrico 10%   -    60ml  -  2 frascos de 30 ml
Pingar 5 gotas em um copo com 10ml de água (1 dedo) e tomar 30 min Antes do Almoço
Pingar 5 gotas em um copo com 10ml de água (1 dedo) e tomar 30 min Antes do Jantar` },
  { id: 'enzimas-digestivas', cat: 'gastrico', name: 'Blend Enzimas Digestivas + Bile + Berberina', body: `Lactase 9000 FCC - Digestão eficiente da lactose
DPP-IV (Dipeptidil Peptidase-IV) 200 mg - Degradação de glúten e peptídeos inflamatórios
Bile bovina purificada - 300 mg - Reposição de sais biliares, auxilia digestão de gordura
Lipase 5000 FIP - Digestão de gorduras sem vesícula
Amilase 15000 DU - Digestão de carboidratos (especialmente glúten)
Protease 20000 HUT - Melhora quebra de proteínas alimentares
Betaína HCl - 250 mg - Aumenta acidez gástrica, potencializa digestão
Gengibre extrato seco padronizado - 100 mg - Pró-digestivo, melhora esvaziamento gástrico
Berberina cloridrato 100 mg - Melhora disbiose e contribui para regulação intestinal
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – 15 min - Antes Almoço
1 dose VO – 15 min - Antes Jantar` },
  { id: 'lugol-5', cat: 'tireoide', name: 'Solução de Lugol 5%', body: `Solução de Lugol 5%
1 Frasco de 30 ml
Pingar 5 gotas em um copo com 10ml de água (1 dedo) e tomar 30 min Antes do Café Manhã` },
  { id: 't3-10mcg', cat: 'tireoide', name: 'T3 10mcg', body: `T3 10mcg
1 dose VO – Em Jejum
1 dose VO - Após Almoço - Sugestão À tarde - 14h` },
  { id: 't4-30mcg', cat: 'tireoide', name: 'T4 30mcg', body: `T4 30mcg
1 dose VO – Em Jejum  ( Não se alimentar por 15 minutos )` },
  { id: 'blend-tireoide-cafe', cat: 'tireoide', name: 'Blend Tireoide + Minerais (Café Manhã)', body: `Zinco Bisglicinato 30mg
Selênio Bisglicinato 300mcg
Boro Bisglicinato 1,5mg
Anastrozol 0,5mg
Cobre quelado 0,5mg
Cromo Picolinato 250mcg
Manganês quelado 5mg
Molibdênio quelado 0,5mg
Vanádio quelado 0,5mg
Coleus Forskohlii 100mg
Fucus Vesiculosus 25mg
Kelp Iodine 200mcg
Tirosina 200mg
1 dose VO – "Durante" o Café da Manhã` },
  { id: 'ki-gotas', cat: 'tireoide', name: 'Solução KI 150mcg/gota', body: `Solução de iodeto de potássio (KI) 150 mcg/gota
Solução em glicerina vegetal/água purificada/conservantes compatíveis
Frasco conta-gotas 20 mL (≈600 gotas)
Diluir 2 gotas em 50ml de água e tomar Antes do Café Manhã` },
  { id: 'ki-selenio-caps', cat: 'tireoide', name: 'Iodeto K + Selenometionina (Cápsula)', body: `Iodeto de potássio (KI) 150 mcg
Selenometionina 100 mcg
Cápsula Vegetal - Excipiente q.s.
1 dose VO – "Durante" o Café Manhã` },
  { id: 'mio-inositol-500', cat: 'tireoide', name: 'Mio-inositol 500mg', body: `Mio-inositol qsp 500 mg
1 dose VO – "Durante" o Jantar` },
  { id: 'silimarina-leve', cat: 'hepato', name: 'Silimarina Blend (Leve)', body: `Silimarina 100mg
L-Metionina 50mg
L-Cisteina 25mg (Anidra)
Cynara Scolymus 125mg (Extrato Seco)
Peumus Boldus 50mg (Extrato Seco)
Baccharis trimera 50mg
Inositol 75mg
2 doses VO – Antes Almoço
2 doses VO - Antes do Jantar` },
  { id: 'silimarina-forte', cat: 'hepato', name: 'Silimarina Blend (Forte)', body: `Silimarina 200mg
DL-Metionina 100mg
L-Cisteína 50mg (Anidra)
Cynara Scolymus 150mg (Extrato Seco)
Peumus Boldus 150mg (Extrato Seco)
Baccharis Trimera 100mg
Inositol 100mg
1 dose VO – Antes Almoço e 1 dose VO - Antes do Jantar` },
  { id: 'tmg', cat: 'hepato', name: 'Trimetilglicina 500mg (Betaína)', body: `Trimetilglicina 500mg ( Betaína Anidra )
1 dose - Antes de Jantar` },
  { id: 'ferro-multi-jantar', cat: 'vitaminas', name: 'Ferro + Multivitamínico Completo (Jantar)', body: `Ferro Bisglicinato 50mg
Vitamina C (Ester-C® ou Lipossomal) 50 mg
Vitamina A (Retinol Palmitato) 1.000 UI
Vitamina B1 (Tiamina) 50 mg
Vitamina B2 (Riboflavina-5-fosfato) 10 mg
Vitamina B3 (Hexanicotinato de Inositol – NO FLUSH) 25mg
Vitamina B6 Inativa (Piridoxina) 25 mg
Vitamina B6 Ativa (Piridoxal-5-fosfato P-5-P) 25mg
Vitamina B9 Inativa (Ácido Fólico) 1mg
Vitamina B9 Ativa (Metilfolato) 15mg
Vitamina B12 Ativa (Metilcobalamina) 1.500mcg
Vitamina E (Tocoferol Acetato) 100ui
Vitamina K2 (MK-7) 250mcg
Inulina qsp 500mg
Famotidina 2,5mg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
**Observação.: Evitar ingerir junto às refeições, de café, chá preto ou laticínios
1 dose VO – "Durante" o Jantar` },
  { id: 'vit-lipossoluveis', cat: 'vitaminas', name: 'Vitaminas Lipossolúveis (A, D3, E, K2)', body: `Vitamina D3 10.000ui (Colecalciferol)
Vitamina A 10.000ui (Acetato de Retinol)
Vitamina E 200ui (Tocoferol Acetato)
Vitamina K2 300mcg (MK-7)
Cápsulas Oleosas
1 dose VO - Durante Café Manhã` },
  { id: 'complexo-b-noturno', cat: 'vitaminas', name: 'Complexo B Ativo (Noturno)', body: `Vitamina B3 100mg (Hexanicotinato de Inositol – NO FLUSH)
Vitamina B6 200mg
Vitamina B9 1mg (Ácido Fólico)
Vitamina B9 20mg (Metilfolato)
Vitamina B12 2.000mcg (Metilcobalamina)
1 dose VO – 1 hora Antes de Dormir` },
  { id: 'panax-duo', cat: 'adaptogenos', name: 'Panax DUO (Ginseng Asiático)', body: `Panax ginseng (asiático) extrato padronizado 5–7% ginsenosídeos 150 mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – Antes do Café da Manhã
1 dose VO – À Tarde – Sugestão: 14h` },
  { id: 'panax-noto', cat: 'adaptogenos', name: 'Panax Notoginseng', body: `Panax notoginseng extrato padronizado ≥10% notoginsenosídeos 120 mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – Antes do Café da Manhã
1 dose VO – À Tarde – Sugestão: 14h` },
  { id: 'ashwa-multi', cat: 'adaptogenos', name: 'Ashwagandha + Adaptógenos (Multi)', body: `Ashwagandha KSM-66 350mg
L-Theanina 100mg
Passiflora 150mg
Maca 200mg
Mucuna 200mg
Rhodiola Rosea 300mg
1 dose VO – No Café da Manhã
1 dose VO – Após Almoço - Sugestão: 16h` },
  { id: 'ashwa-schisandra-rhodiola', cat: 'adaptogenos', name: 'Ashwagandha + Schisandra + Rhodiola', body: `Ashwagandha (KSM-66® ~5% withanolides) 200mg
Schisandra chinensis (≥2% schisandrinas) extrato padronizado 200 mg
Rhodiola rosea extrato padronizado (≥3% rosavinas, ≥1% salidrosídeo) 300 mg
1 dose VO – Antes do Café da Manhã
1 dose VO - À tarde - 15h` },
  { id: 'lisdexan-15', cat: 'adhd', name: 'Lisdexanfetamina 15mg', body: `Dimesilato de Lisdexanfetamina 15mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – Antes do Café da Manhã
1 dose VO – À Tarde – Sugestão: 14h` },
  { id: 'nootropico-bacopin', cat: 'adhd', name: 'Bacopin + Teacrine + Ginkgo + Vimpocetina', body: `Bacopin (20% bacosídeos) 250mg
Teacrine 100mg
Gingko Biloba 120mg
Vimpocetina 10mg
1 dose VO – Antes do Café Manhã
1 dose VO – À Tarde – Sugestão: 14h` },
  { id: 'foco-fosfatidilserina', cat: 'adhd', name: 'Fosfatidilserina + Colina + Tirosina (Foco)', body: `Fosfatidilserina 100mg
Colina 100mg
Taurina 100mg
Tirosina 250mg
Ácido fólico 500mcg
1 dose VO – Antes do Café da Manhã` },
  { id: 'sibutramina-5', cat: 'emagrecimento', name: 'Sibutramina 5mg', body: `Sibutramina 5mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – À Tarde – Sugestão: 14h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h` },
  { id: 'bup-topi', cat: 'emagrecimento', name: 'Bupropiona 180mg + Topiramato 20mg', body: `Bupropiona 180mg
Topiramato 20mg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – 2h Antes do Almoço - Sugestão: 10h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h` },
  { id: 'naltrexone-blend', cat: 'emagrecimento', name: 'Naltrexone + Bromoprida + Famotidina', body: `Naltrexone 15mg
Bromoprida 1,5mg
Famotidina 5mg
Zinco quelado 15mg
Selenio quelado 200mcg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – 2h Antes do Almoço - Sugestão: 10h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h` },
  { id: 'dapa-blend', cat: 'emagrecimento', name: 'Cromo + Dapaglifozina + Cafeína + Berberina', body: `Picolinato Cromo 500mcg
Dapaglifozina 2,5mg
Cafeina Anidra 200mg
Green Coffee 200mg
Berberina 300mg
1 dose VO - 10 min Antes do Almoço` },
  { id: 'orlistat-blend', cat: 'emagrecimento', name: 'Cromo + Capsaicina + Orlistat + Faseolamina', body: `Picolinato Cromo 500mcg
Pimenta Caiena (Capsaicina) 5mg
Cascara Sagrada 200mg
Aloina 50mg
Orlistat 80mg
Faseolamina 300mg
1 dose VO - 30 min Antes do Almoço
1 dose VO - 30 min Antes do Jantar` },
  { id: 'cascara-senne', cat: 'transito', name: 'Cáscara Sagrada + Senne + Aloína', body: `Cascara Sagrada 250mg
Senne 100mg
Aloina 100mg
1 dose VO - 10 min Antes do Jantar` },
  { id: 'calmante-passiflora', cat: 'calmante', name: 'Passiflora + Rhodiola + Erva-cidreira', body: `Passiflora 150mg
Rhodiola 100mg
Funcho (Foeniculum vulgare) extrato 50mg
Melissa officinalis (erva-cidreira) extrato 5:1 25mg
Camomila (Matricaria recutita) extrato 4:1 100mg
Espinheira-santa (Maytenus ilicifolia) extrato 100mg
1 dose VO – 2h Antes do Almoço - Sugestão: 10h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h` },
  { id: 'cortisol-iso', cat: 'cortisol', name: 'Cortisol Isomolecular 10mg', body: `Cortisol Isomolecular 10mg
1 dose VO - Ao Acordar
1 dose VO – À tarde - Sugestão: 17h` },
  { id: 'uc2-articular', cat: 'articulacao', name: 'UC-II + Hialurônico + Boswellia (Articular)', body: `UC-II (Colágeno tipo II não desnaturado) 20mg
Ácido Hialurônico 50mg
MSM (Metilsulfonilmetano) 250mg
Boswellia serrata extrato padronizado (65% AKBA) 150mg
Curcumina fitossomada (Meriva®) 100mg
Vitamina K2-MK7 50mcg
Silício orgânico (Exsynutriment®) 25mg
1 dose VO – No Café da Manhã
1 dose VO – Antes do Jantar` },
  { id: 'ferro-articular', cat: 'articulacao', name: 'Ferro Bisglicinato + Cofatores', body: `Ferro bisglicinato 15 mg
Vitamina C (ácido ascórbico) 150mg
Ácido fólico (metilfolato) 250 mcg
Lactobacillus plantarum 0,5 bilhão UFC (Liofilizado)
Polifenóis de romã (Punica granatum, extrato seco padronizado) 50mg
Quercetina 50mg
1 dose VO – No Café da Manhã
1 dose VO – Antes do Jantar` },
  { id: 'neuropatia-blend', cat: 'articulacao', name: 'Neuropatia Periférica (Benfotiamina + ALA + ALC)', body: `Vitamina B1 (Benfotiamina) 300 mg
Vitamina B6 (Piridoxal-5-fosfato) 50 mg
Vitamina B9 Ácido fólico - Forma Ativa (5-MTHF) 400 mcg
Vitamina B12 (metilcobalamina) 1000 mcg
Ácido Alfa-Lipóico 300 mg
Acetil-L-Carnitina 500 mg
N-Acetilcisteína 300 mg
Coenzima Q10 (ubiquinona ou ubiquinol) 100 mg
Magnésio treonato 100 mg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
1 dose VO – 15 min - Antes Café Manhã
1 dose VO – 15 min - Antes Jantar` },
  { id: 'diuretico-natural', cat: 'circulacao', name: 'Furosemida + Diuréticos Naturais', body: `Furosemida 10mg
Potássio (KCl) 30mg
Magnésio Taurato 150mg
Dente-de-leão (Taraxacum officinale) extrato seco 300mg
Cavalinha (Equisetum arvense) extrato seco 250mg
Urtica dioica extrato seco 200mg
Hibiscus sabdariffa extrato seco 200mg
Chá-verde (Camellia sinensis – EGCG 60%) 150mg
Coenzima Q10 75mg
1 dose VO – Pela Manhã – Sugestão: 10h
1 dose VO – À Tarde – Sugestão: 14h` },
  { id: 'diosmina-blend', cat: 'circulacao', name: 'Diosmina + Hesperidina + Centella', body: `Diosmina micronizada 600 mg
Hesperidina micronizada 150 mg
Rutina 100 mg
Ginkgo biloba (24% flavonoides, 6% lactonas) 180 mg
Vitis vinifera (OPCs ≥ 95%) 200 mg
Centella asiatica extrato seco (asiaticosídeos ≥ 40%) 200 mg
Nattokinase fibrinolítica ativa 200 mg
Pycnogenol® (extrato de Pinus pinaster) 100 mg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
1 dose VO – Pela Manhã – Sugestão: 10h
1 dose VO – À Tarde – Sugestão: 14h` },
  { id: 'arginina-citrulina', cat: 'circulacao', name: 'Arginina + Citrulina + Beterraba', body: `L-Arginina 250mg
L-Citrulina 250mg
Extrato seco de Beterraba padronizado (2% nitratos) 250mg
Ginkgo Biloba extrato padronizado (24% ginkgoflavonóides) 80mg
Cava Q10 25mg
1 dose VO - Pela Manhã
1 dose VO - À tarde - 15h` },
  { id: 'dim-ecdi', cat: 'antiaromatase', name: 'BioSil + DIM + Ecdisterona + Quercetina', body: `BioSil® (ácido ortossilícico estabilizado com colina) 10mg
DIM (Diindolilmetano) 100 mg
Cyanotis Vaga Extrato (Ecdisterona 90%) 75 mg
Quercetina 200mg
Gamma Oryzanol 100 mg
1 dose VO - De manhã e 1 dose VO - À Noite` },
  { id: 'raloxifeno-60', cat: 'hormonal-f', name: 'Raloxifeno 60mg (90 dias)', body: `Raloxifeno 60 mg
1 dose VO - Antes Café Manhã
Observação: Por 90 dias` },
  { id: 'tamoxifeno-15', cat: 'hormonal-f', name: 'Tamoxifeno 15mg (30 dias)', body: `Tamoxifeno 15mg
1 dose VO - Antes Café Manhã
1 dose VO - Antes Jantar
Observação:
Usar Por 30 dias - Usar junto com Raloxifeno apenas nos primeiros 30 dias
Depois seguir apenas com Raloxifeno` },
  { id: 'cabergolina-blend', cat: 'hormonal-f', name: 'Cabergolina + Dutasterida + Tadalafila + Vardenafila', body: `Cabergolina 0,25mg
Dutasterida 0,5 mg
Tadalafila 20mg
Vardenafila 2,5mg
1 dose VO – Pela Manhã - Apenas na: Segunda - Quarta - Sexta` },
  { id: 'oxandrolona-nadh', cat: 'anabolizante', name: 'Oxandrolona 2,5mg + NADH (Sublingual)', body: `Oxandrolona 2,5mg
NADH 2,5mg
Comprimido Sublingual
1 dose SL - De manhã e 1 dose SL - À tarde e 1 dose SL - À Noite` },
  { id: 'oximetolona-5', cat: 'anabolizante', name: 'Oximetolona 5mg', body: `Oximetolona 5mg
1 dose VO - De manhã` },
  { id: 'mesterolona-blend', cat: 'anabolizante', name: 'Mesterolona + Fenum + Long Jack + Epimedium', body: `Mesterolona 15mg
Fenum Graecum e.s. 50mg
Long Jack 150mg
Epimedium Icarin 25mg
Gama oryzanol 12,5mg
Cava q10 50mg
Tadalafil 10mg
NADH 5mg
1 dose VO – Antes do Café da Manhã` },
  { id: 'long-jack-natural', cat: 'anabolizante', name: 'Fenum + Long Jack + Epimedium (Natural)', body: `Fenum Graecum e.s. 100mg
Long Jack 200mg
Epimedium Icarin 300mg
Gama oryzanol 100mg
Tadalafil 10mg
1 dose VO – Antes do Café da Manhã` },
  { id: 'paroxetina-icariin', cat: 'libido', name: 'Paroxetina + Icariin + Hypericum + Withania', body: `Paroxetina 10mg
Icariin (Epimedium padronizado) 200 mg
Hypericum Perforatum 150mg
Withania Somnifera 250mg
2 doses VO - Durante Café Manhã e 2 doses - Antes do Jantar` },
  { id: 'tadalafil-nadh', cat: 'libido', name: 'Tadalafila 10mg + NADH 5mg', body: `Tadalafila 10mg
NADH 5mg
1 dose VO – Antes do Café da Manhã` },
  { id: 'sache-pretreino', cat: 'pretreino', name: 'Sachê Pré-treino (Beta-Alanina + Citrulina)', body: `Beta Alanina 6g
L-Citrulina Malato 6g
Cafeína Anidra 350mg
L-Tirosina 2g
Taurina 2g
Colina Bitartrato 500mg
Aroma Agradável Natural (Baunilha/Camomila/Tangerina/Limão) qsp
Edulcorante natural: Estévia + Eritritol (1:1) qsp
Sem lactose, sem glúten, sem açúcar. Não contém corantes artificiais
Dissolver 1 Sachê em 200ml de água e ingerir 20 min antes do treino` },
  { id: 'sache-hmb', cat: 'pretreino', name: 'Sachê HMB + Creatina + Ecdisterona', body: `Beta-hidroxi-beta-metilbutirato (HMB) 1g
Creatina monohidratada micronizada 2g
L-citrullina malato 1.5g
Ecdisterona (90%) 150 mg
Leucina 1.500 mg
Vitamina D3 5.000 UI
Magnésio quelado (bisglicinato) 150 mg
Potássio citrato 100 mg
Aroma Agradável Natural (Baunilha/Camomila/Tangerina/Limão) qsp
Edulcorante natural: Estévia + Eritritol (1:1) qsp
Sem lactose, sem glúten, sem açúcar. Não contém corantes artificiais
Dissolver 1 Sachê em 200ml de água e ingerir 20 min antes do treino` },
  { id: 'cafeina-green', cat: 'pretreino', name: 'Cafeína + Green Coffee + Cynara', body: `Cafeína Anidra 200mg
Green Coffee 150mg
Cynara scolymus 50mg
Zingiber officinale qsp 500mg
1 dose VO – Antes do Café Manhã
1 dose VO - 30 min antes do treino` },
  { id: 'beterraba-tirosina', cat: 'pretreino', name: 'Beterraba + Tirosina + Gengibre', body: `Extrato de Beterraba (padronizado em nitratos) 350 mg
L-Tirosina 350mg
Gengibre Extrato Seco 100mg
1 dose VO – Antes do Café da Manhã
1 dose VO - À tarde - 15h` },
  { id: 'prostata-blend', cat: 'prostata', name: 'Saw Palmetto + Tamsulosina + Finasterida', body: `Saw Palmetto 200mg
Tansulosina 0,25
Finasteride 0,5mg
1 dose VO - Antes do Jantar ou Antes de dormir` },
  { id: 'magnesio-duo', cat: 'magnesio', name: 'Magnésio Dimalato + Treonato', body: `Magnésio Dimalato 200mg
Magnésio Treonato qsp 500mg
1 dose VO - Durante Café Manhã e 1 dose VO - Antes de Dormir` },
  { id: 'cabelo-nutricolin', cat: 'cabelo', name: 'Nutricolin + Queratina + Biotina', body: `Nutricolin® 100mg
Queratina 50mg
Cisteína 50mg
Cistina 25mg
Vitamina H (Biotina) 10mg
Vitamina B1 75 mg ( Tiamina )
Vitamina B2 12,5 mg ( Riboflavina )
Vitamina B5 100 mg ( Pantotenato Cálcio )
Actrisave 100mg
PQQ 10mg
1 dose VO – Antes do Jantar ( Cápsulas de Gelatina Rosa )` },
  { id: 'minoxidil-oral', cat: 'cabelo', name: 'Minoxidil Oral 1,5mg (LDOM)', body: `Minoxidil oral baixa dose (LDOM) 1,5mg
1 dose VO - Antes de Dormir` },
  { id: 'dutasterida-oral', cat: 'cabelo', name: 'Dutasterida 0,5mg Oral (Seg-Qua-Sex)', body: `Dutasterida 0,5 mg
1 dose VO - Antes de Dormir - Apenas: Segunda - Quarta - Sexta` },
  { id: 'fina-topica-a', cat: 'cabelo', name: 'Finasterida Tópica HPCH (Fórmula A)', body: `Finasterida 0,25% (1 mg/mL)
Minoxidil 5%
Veículo HPCH (hidroxipropil-quitosana) Solução filmógena q.s.p. 60 mL
Aplicar 0,5 (10 gotas) mL à noite, somente na linha anterior do couro cabeludo (hairline) todos os dias.` },
  { id: 'duta-topica-b', cat: 'cabelo', name: 'Dutasterida Tópica Lipossomal (Fórmula B)', body: `Dutasterida 0,02% (0,2 mg/mL)
Veículo lipossomal/hidroalcoólico leve q.s.p. 30 mL
Aplicar 0,5 mL na hairline, seg/qua/sex à noite (dias alternados em relação à A).` },
  { id: 'blend-c', cat: 'cabelo', name: 'Blend Único Fina + Duta (Fórmula C)', body: `Finasterida 0,05% (0,5 mg/mL)
Dutasterida 0,01% (0,1 mg/mL)
Veículo HPCH + lipossomas q.s.p. 60 mL
Aplicar 0,4–0,5 mL na hairline à noite, 5–6×/semana` },
  { id: 'locao-capilar', cat: 'cabelo', name: 'Loção Capilar Arginina + Beterraba', body: `Arginina 2%
Extrato glicólico de Beterraba (rico em nitratos) 5%
Cafeína 1%
Nicotinato de metila 0,1%
Centella asiática extrato padronizado 2%
Veículo hidroalcoólico q.s.
Aplicar 1 mL (20 gotas) no couro cabeludo 1 - 2 vezes /dia
Massageando por 2 - 3 minutos` },
  { id: 'iverm-tinidazol', cat: 'pele', name: 'Ivermectina + Tinidazol (4 Ciclos)', body: `Invermectina 12mg
Tinidazol 250mg
1ª semana - 1º Ciclo - Segunda - Terça - Quarta
1 dose VO - Durante o Café Manhã
1 dose VO - Durante o Jantar
2ª semana - 2º Ciclo - Segunda - Terça - Quarta
1 dose VO - Durante o Café Manhã
1 dose VO - Durante o Jantar
3ª semana - 3º Ciclo - Segunda - Terça - Quarta
1 dose VO - Durante o Café Manhã
1 dose VO - Durante o Jantar
4ª semana - 4º Ciclo - Segunda - Terça - Quarta
1 dose VO - Durante o Café Manhã
1 dose VO - Durante o Jantar` },
  { id: 'locao-sarna', cat: 'pele', name: 'Loção Tópica Antiparasitária', body: `Tiabendazol 2%
Benzoato Benzila 15%
Invermectina 1%
Enxofre 1%
Lidocaína 1%
Mentol 0,5%
Prometazina 1%
Loção Cremosa 200ml
Aplicar de Manhã - Na área afetada e em volta da área afetada
Aplicar à Noite - Na área afetada e em volta da área afetada` },
  { id: 'ala-300', cat: 'antiox', name: 'Ácido Alfa Lipóico 300mg', body: `Ácido Alfa Lipóico 300mg
Cápsulas Gastrorresistentes
1 dose VO – Antes do Café Manhã
1 dose VO – Antes Jantar` },
  { id: 'curcuma-piperina', cat: 'antiox', name: 'Cúrcuma + Piperina', body: `Piperina 5mg
Curcuma Longa 300mg
1 dose - Antes do Almoço
1 dose - Antes de Jantar` },
  { id: 'solucao-sl-psico', cat: 'sono', name: 'Solução SL Psicotrópicos (Alprazolam+Trazodona+Zolpidem)', body: `Alprazolam 2mg
Trazodona 25mg
Zolpidem 10mg
Sorbitol Sublingual qsp 0,5ml para garantir um SONO SEM INTERRUPÇÃO !
Produzir em frascos para 30 dias – Se duração tratamento > 30 dias produzir mais frascos
Pingar de 2 à 10 gotas - SL ( Embaixo da língua ) – 1h antes de dormir` },
  { id: 'sono-natural', cat: 'sono', name: 'Triptofano + GABA + Apigenina + Melatonina', body: `L-triptofano 150mg
L-Theanina 200mg
Magnésio Bisglicinato 200mg
Passiflora 200mg
GABA 150mg
Apigenina (matricária/camomila) 35mg
Magnolia officinalis extrato (honokiol/magnolol) 100 mg
Piridoxal-5-Fosfato 25mg
Fosfatidilserina 125mg
Melatonina DUO 1,5mg
1 dose VO – 1 hora Antes de Dormir` },
  { id: 'sache-noturno', cat: 'sono', name: 'Sachê Noturno Pró-Sono (Glicina + Mg)', body: `Glicina 2g
Taurina 1g
L-Glutamina 3g
Mio-Inositol 2g
Magnésio (elementar) 220 mg proveniente de blend
Aroma Agradável Natural (Limão) qsp
Edulcorante natural: Estévia + Eritritol (1:1) qsp
Sem lactose, sem glúten, sem açúcar. Não contém corantes artificiais
Dissolver 1 Sachê em 200ml de água e ingerir 1h antes de dormir
Observação: Farmácia: ajustar os sais para atingir ~220 mg Mg elementar.` },
  { id: 'vasomotor-caps', cat: 'menopausa', name: 'Cápsula Balanço Vasomotor', body: `Cimicifuga racemosa (extrato padronizado) 40mg
Magnólia (extrato) 200mg
L-Teanina 200mg
Safranal (açafrão - extrato padronizado) 30mg
Vitamina E (d-alfa tocoferol) 200UI
1 dose VO – Antes Café Manhã
1 dose VO – Antes Jantar` },
  { id: 'trifolium-menopausa', cat: 'menopausa', name: 'Trifolium + Cimicifuga + Ashwagandha', body: `Trifolium pratense (Trevo-vermelho – 40 mg isoflavonas) 150mg
Cimicifuga racemosa (extrato padronizado) 40mg
Withania somnifera (Ashwagandha KSM-66®) 150mg
Magnolia officinalis (extrato) 200 mg
Passiflora incarnata (extrato) 150 mg
Gamma-oryzanol 100mg
Salvia officinalis (extrato) 100mg
Pycnogenol® (Pinus pinaster) 25mg
1 dose VO – Antes Café Manhã
1 dose VO – Antes Jantar` },
  { id: 'gel-prog-estri-estra', cat: 'menopausa', name: 'Gel Progesterona + Estriol + Estradiol', body: `Progesterona Bioidentica Micronizada 15mg
Estriol - Estradiol Micronizada 2mg-0,5mg/ml
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Aplicar na Face Interna do antebraço ou coxas À NOITE` },
  { id: 'gel-prog-pura', cat: 'menopausa', name: 'Gel Progesterona Pura (15º-30º dia)', body: `Progesterona Bioidentica Micronizada 20mg
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Do 15º ao 30º dia do Mês - Aplicar na Face Interna do antebraço ou coxas À NOITE` },
  { id: 'gel-estri-estra', cat: 'menopausa', name: 'Gel Estriol + Estradiol (1º-14º dia)', body: `Estriol - Estradiol Micronizada 4mg-1mg/ml
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Do 1º ao 14º dia do Mês - Aplicar na Face Interna do antebraço ou coxas À NOITE` },
  { id: 'gel-testo', cat: 'menopausa', name: 'Gel Testosterona Bioidêntica', body: `Testosterona Bioidentica Micronizada 5mg
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Aplicar na Face Interna do antebraço ou coxas DE MANHÃ` },
  { id: 'mineral-balance', cat: 'hidratacao', name: 'Mineral Balance Shield (Sal Himalaia)', body: `OBSERVAÇÃO em relação à HIDRATAÇÃO!
Solução "MINERAL BALANCE SHIELD"
Como preparar?
- Para cada 1 Litro de Água acrescente:
- 1 Colher de Café (rasa) de: * Sal Rosa do Himalaia
- 1 Colher de Café (rasa) de: * Bicarbonato de Sódio
Como Ingerir?
- Tomar 1 Litro da Solução MINERAL BALANCE de Água: Ao Longo da Manhã
- Tomar 1 Litro da Solução MINERAL BALANCE de Água: À Tarde e no Final da Tarde` },
  { id: 'prob-fase1', cat: 'probioticos', name: 'FASE 1 - Assentamento (Meses 1-2)', body: `FASE 1 - ASSENTAMENTO ROBUSTO (MESES 1 E 2)
Lactiplanti Bacillus plantarum 299v 10 bilhões de UFC por cápsula
Lacticasei Bacillus rhamnosus GG 10 bilhões de UFC por cápsula
Limos Lactobacillus reuteri DSM 17938 5 bilhões de UFC por cápsula
Bifidobacterium lactis HN019 10 bilhões de UFC por cápsula
Bifidobacterium longum BB536 5 bilhões de UFC por cápsula
Bacillus coagulans IS2 2 bilhões de UFC por cápsula
SACCHAROMYCES BOULARDII 250mg ( Fórmula Separada )
PREBIÓTICO: PHGG 6 g + GOS 3 g por sachê
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de dormir` },
  { id: 'prob-fase2', cat: 'probioticos', name: 'FASE 2 - Reconstrução (Meses 3-4)', body: `FASE 2 - RECONSTRUÇÃO E DIVERSIDADE (MESES 3 E 4)
Lacticasei Bacillus paracasei 8700:2 10 bilhões de UFC por cápsula
Lactobacillus gasseri 5 bilhões de UFC por cápsula
Bifidobacterium breve M-16V ou BR03 10 bilhões de UFC por cápsula
Bifidobacterium bifidum 5 bilhões de UFC por cápsula
Lactiplanti Bacillus plantarum 299v 5 bilhões de UFC por cápsula
Bacillus coagulans IS2 2 bilhões de UFC por cápsula
SACCHAROMYCES BOULARDII 250mg ( Fórmula Separada )
PREBIÓTICO: GOS 5 g + Inulina 2 g por sachê
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de dormir` },
  { id: 'prob-fase3', cat: 'probioticos', name: 'FASE 3 - Manutenção (Meses 5-6)', body: `FASE 3 - CONSOLIDAÇÃO E MANUTENÇÃO (MESES 5 E 6)
Lactiplanti Bacillus plantarum 299v 10 bilhões de UFC por cápsula
Lacticasei Bacillus rhamnosus GG 5 bilhões de UFC por cápsula
Lacticasei Bacillus paracasei 8700:2 5 bilhões de UFC por cápsula
Bifidobacterium longum BB536 10 bilhões de UFC por cápsula
Bifidobacterium lactis HN019 5 bilhões de UFC por cápsula
SACCHAROMYCES BOULARDII 250mg ( Fórmula Separada )
PREBIÓTICO: Amido resistente RS2 5 g + Arabinogalactana 2 g + PHGG 3 g
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de dormir` },
  { id: 'comerciais', cat: 'comerciais', name: 'Creatina + Ghee + MCT (Lojas)', body: `SUPLEMENTOS PARA ADQUIRIR EM LOJAS DA INTERNET
A) CREATINA MARCA VITAFOR - Creafort Creatina Creapure - 300g
Dissolver 2 Scoops (6g) em 100ml (1/2 Copo) de Água, e Ingerir pela Manhã
B) Manteiga Ghee Clarificada Lotus 500g - Sem Lactose e Sem Sal
C) MCT - Triglicerídeos de Cadeia Média (TCM) - Com AGE 250ml` },
  { id: 'bulletproof', cat: 'comerciais', name: 'Bulletproof Coffee (Preparo)', body: `BULLETPROOF COFFEE
Ingredientes:
- 250 a 300 ml de café preto forte
- 1 a 2 colheres de sopa de manteiga ghee (clarificada)
- 1 a 2 colheres de chá de óleo MCT ou óleo de coco
Modo de Preparo:
- Coe o café bem quente
- Bata com a manteiga ghee e o óleo até ficar cremoso e espumoso
- Sirva imediatamente.` },
];

// ===== PROTOCOLOS (conjuntos de fórmulas) — EDITE / ADICIONE AQUI =====
export const PROTOCOLOS_SEED: Protocolo[] = [
  { id: 'p-tireoide', nome: 'Eixo Tireoide Completo', formulaIds: ['lugol-5', 't3-10mcg', 't4-30mcg', 'blend-tireoide-cafe'] },
  { id: 'p-detox', nome: 'Detox Hepático', formulaIds: ['silimarina-forte', 'tmg', 'ala-300'] },
  { id: 'p-emagrec-antiox', nome: 'Emagrecimento + Antiox', formulaIds: ['dapa-blend', 'naltrexone-blend', 'curcuma-piperina', 'ala-300'] },
  { id: 'p-sono', nome: 'Sono & Calmante', formulaIds: ['sono-natural', 'calmante-passiflora'] },
  { id: 'p-microbioma', nome: 'Microbioma 6 meses', formulaIds: ['prob-fase1', 'prob-fase2', 'prob-fase3'] },
];

// ===== FÓRMULAS FICTÍCIAS (BLEND DEMO) — usam todos os campos possíveis =====
const FORMULAS_FICTICIAS: FormulaSeed[] = [
  { id: 'demo-termo-lipo', cat: 'emagrecimento', name: 'Termo-Lipo Blend (Demo)', body: `Cafeína Anidra 200mg
Sinefrina (Citrus aurantium 30%) 20mg
EGCG (Chá-verde padronizado 60%) 250mg
L-Carnitina Tartarato 500mg
Picolinato de Cromo 300mcg
Capsaicina (Pimenta Caiena) 5mg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
Observação: Evitar uso após as 16h pelo efeito estimulante
1 dose VO – 30 min Antes do Almoço – Sugestão: 11h
1 dose VO – À Tarde – Sugestão: 15h` },
  { id: 'demo-saciedade', cat: 'emagrecimento', name: 'Saciedade Metabólica (Demo)', body: `5-HTP (Griffonia simplicifolia) 100mg
Picolinato de Cromo 250mcg
Fibra de Glucomanan (Konjac) 500mg
Berberina cloridrato 300mg
Gymnema sylvestre extrato (25% ácido gimnêmico) 200mg
Cápsulas Vegetais DRcaps®
Observação: Ingerir com 1 copo cheio de água
2 doses VO – 30 min Antes do Almoço
2 doses VO – 30 min Antes do Jantar` },
  { id: 'demo-glp-natural', cat: 'emagrecimento', name: 'GLP Natural Blend (Demo)', body: `Berberina cloridrato 500mg
Canela (Cinnamomum cassia) extrato seco 200mg
Gymnema sylvestre 150mg
Ácido Alfa-Lipóico 200mg
Inositol 250mg
Cápsulas Gastrorresistentes
1 dose VO – 10 min Antes do Almoço
1 dose VO – 10 min Antes do Jantar` },
  { id: 'demo-antiox-master', cat: 'antiox', name: 'Antiox Master Blend (Demo)', body: `Glutationa Reduzida (Setria®) 250mg
Vitamina C (Ácido Ascórbico Lipossomal) 500mg
Resveratrol (Polygonum cuspidatum 98%) 150mg
N-Acetilcisteína (NAC) 300mg
Selênio Bisglicinato 100mcg
Astaxantina 4mg
Cápsulas Oleosas + Liberação Entérica
Observação: Tomar longe de café e laticínios
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes do Jantar` },
  { id: 'demo-mitocondria', cat: 'antiox', name: 'Mitocôndria & Energia (Demo)', body: `Coenzima Q10 (Ubiquinol) 100mg
PQQ (Pirroloquinolina quinona) 20mg
Ácido Alfa-Lipóico 300mg
Acetil-L-Carnitina 500mg
Magnésio Treonato 200mg
Cápsulas XR Liberação Lenta
1 dose VO – Durante o Café da Manhã
1 dose VO – À Tarde – Sugestão: 15h` },
  { id: 'demo-longevidade-nad', cat: 'antiox', name: 'Longevidade NAD+ (Demo)', body: `NMN (Nicotinamida Mononucleotídeo) 250mg
Espermidina (Germe de trigo) 5mg
Quercetina 250mg
Trans-Resveratrol 150mg
Fisetina 100mg
Cápsulas DRcaps® Gastrorresistentes
Observação: Protocolo de longevidade — uso contínuo
1 dose SL – Ao Acordar
1 dose VO – Antes do Jantar` },
  { id: 'demo-multi-premium', cat: 'vitaminas', name: 'Multivitamínico Premium A-Z (Demo)', body: `Vitamina A (Retinol Palmitato) 2.000 UI
Vitamina D3 (Colecalciferol) 4.000 UI
Vitamina E (Tocoferol Acetato) 200 UI
Vitamina K2 (MK-7) 150mcg
Vitamina C (Ester-C®) 250mg
Complexo B Ativo (B1, B2, B6 P-5-P, B9 Metilfolato, B12 Metilcobalamina) 50mg
Zinco Bisglicinato 15mg
Selênio Bisglicinato 100mcg
Magnésio Bisglicinato 100mg
Iodo (Kelp) 150mcg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta
Observação: Evitar ingerir junto a café ou chá preto
1 dose VO – Durante o Café da Manhã` },
  { id: 'demo-imuno-d', cat: 'vitaminas', name: 'Imuno D Shield (Demo)', body: `Vitamina D3 (Colecalciferol) 10.000 UI
Vitamina K2 (MK-7) 200mcg
Zinco Bisglicinato 30mg
Vitamina C Lipossomal 500mg
Quercetina 250mg
Cápsulas Oleosas
1 dose VO – Durante o Café da Manhã` },
  { id: 'demo-hormonal-fem', cat: 'hormonal-f', name: 'Equilíbrio Hormonal Feminino (Demo)', body: `DIM (Diindolilmetano) 150mg
Vitex agnus-castus (extrato padronizado) 200mg
Magnésio Bisglicinato 200mg
Vitamina B6 (P-5-P) 50mg
Ômega-3 concentrado (EPA/DHA) 500mg
Cápsulas Vegetais
Observação: Iniciar no 1º dia do ciclo menstrual
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de Dormir` },
  { id: 'demo-hormonal-masc', cat: 'anabolizante', name: 'Reposição Masculina Natural (Demo)', body: `Tongkat Ali (Eurycoma longifolia 200:1) 300mg
Zinco Bisglicinato 30mg
Boro Quelado 6mg
Vitamina D3 5.000 UI
Ashwagandha KSM-66® 300mg
Magnésio Treonato 150mg
Cápsulas DRcaps®
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes do Treino` },
  { id: 'demo-gel-trh', cat: 'menopausa', name: 'Gel TRH Bioidêntico (Demo)', body: `Estradiol Bioidêntico Micronizado 1mg/ml
Progesterona Bioidêntica Micronizada 20mg/ml
Testosterona Bioidêntica Micronizada 2mg/ml
HRT Base Transdérmica 30g
Aplicar 1 Pump (1ml) na face interna do antebraço À Noite
1 dose Tópico – Antes de Dormir` },
  { id: 'demo-performance', cat: 'anabolizante', name: 'Vitalidade & Performance (Demo)', body: `Creatina Monohidratada Creapure® 3g
Beta-Alanina 2g
Taurina 1g
L-Citrulina Malato 2g
Coenzima Q10 100mg
Magnésio Quelado 150mg
Sachê Solúvel — Aroma natural de limão
Dissolver 1 Sachê em 200ml de água e ingerir 20 min antes do treino
1 dose VO – Antes do Treino` },
];

export const FORMULAS: FormulaSeed[] = [...FORMULAS_BASE, ...FORMULAS_FICTICIAS];

// ===================== PARSER =====================
export function splitAtivo(line: string): [string, string] {
  const re = /[\d][\d.,]*\s*(?:bilh[õo]es[^\n]*?UFC[^\n]*|mg\/m[lL]|mcg\/gota|UFC|U\.?I\.?|ui|mg|mcg|g\b|m[lL]\b|l\b|%|FCC|FIP|DU|HUT)/g;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(line)) !== null) last = m;
  if (!last) return [line, ''];
  return [line.slice(0, last.index).replace(/[\s\-–]+$/, '').trim(), line.slice(last.index).trim()];
}

function isPosologia(line: string): boolean {
  return /^\d+\s*doses?\b/i.test(line)
    || (/\b(VO|SL)\b/.test(line) && /dose/i.test(line))
    || /^(Pingar|Aplicar|Dissolver|Diluir|Tomar|Beber|Massageando|Ingerir)/i.test(line);
}

export function parseTomada(line: string): Tomada {
  const raw = line.trim();
  const hasDose = /\d+\s*doses?\b/i.test(raw);
  const via = /\bSL\b/i.test(raw) ? 'SL' : /Aplicar/i.test(raw) ? 'Tópico' : 'VO';
  if (!hasDose) return { doses: 1, via, periodo: '', hora: '', raw };
  const dm = raw.match(/(\d+)\s*doses?/i);
  const doses = dm ? Number(dm[1]) : 1;
  let hora = '';
  const hm = raw.match(/Sugest[ãa]o:?\s*([0-9hH:apm\s]+)/i) || raw.match(/-\s*(\d{1,2}h)\b/);
  if (hm) hora = hm[1].trim();
  const periodo = raw
    .replace(/^\s*\d+\s*doses?\s*/i, '')
    .replace(/\b(VO|SL)\b/ig, '')
    .replace(/[–-]\s*Sugest[ãa]o:?.*$/i, '')
    .replace(/[–-]\s*\d{1,2}h\s*$/i, '')
    .replace(/^["”]?\s*[–-]\s*/, '')
    .replace(/^[\s–-]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { doses, via, periodo, hora, raw };
}

export function parseBody(body: string): { ativos: string; tomadas: Tomada[] } {
  const ativos: string[] = [];
  const tomadas: Tomada[] = [];
  body.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t) { ativos.push(''); return; }
    if (isPosologia(t)) {
      t.split(/\s+e\s+(?=\d+\s*doses?\b)/i).forEach((seg) => tomadas.push(parseTomada(seg)));
    } else {
      ativos.push(line);
    }
  });
  return {
    ativos: ativos.join('\n').replace(/^\n+|\n+$/g, ''),
    tomadas: tomadas.length ? tomadas : [{ doses: 1, via: 'VO', periodo: '', hora: '' }],
  };
}

export function tomadaToText(t: Tomada): string {
  if (t.periodo) {
    return `${t.doses} dose${t.doses > 1 ? 's' : ''} ${t.via || 'VO'} – ${t.periodo}${t.hora ? ` – Sugestão: ${t.hora}` : ''}`;
  }
  return t.raw || `${t.doses} dose${t.doses > 1 ? 's' : ''} ${t.via || 'VO'}`;
}

export function parseAtivosLines(ativosText: string): { parsed: ParsedAtivo[]; max: number } {
  const lines = ativosText.split('\n');
  const parsed: ParsedAtivo[] = lines.map((l) => {
    if (!l.trim()) return { empty: true };
    const [nome, dose] = splitAtivo(l);
    return dose ? { nome, dose } : { raw: l };
  });
  const max = Math.max(
    0,
    ...parsed
      .filter((p): p is { nome: string; dose: string } => 'dose' in p)
      .map((p) => p.nome.length),
  );
  return { parsed, max };
}

export function alignAtivosText(ativosText: string): string {
  const { parsed, max } = parseAtivosLines(ativosText);
  return parsed
    .map((p) => ('empty' in p ? '' : 'dose' in p ? p.nome.padEnd(max + 2) + p.dose : p.raw))
    .join('\n');
}

export function buildFormulaText(f: SelectedFormula): string {
  const ativos = alignAtivosText(f.ativos);
  const pos = f.tomadas.length ? '\n' + f.tomadas.map(tomadaToText).join('\n') : '';
  return ativos + pos;
}
