import React, { useState, useMemo } from 'react';
import { Search, Plus, X, Trash2, Copy, Printer, FileText, User, Stethoscope, CheckCircle2, ArrowUp, ArrowDown, Layers, Clock, Save, FolderPlus, Pill, Activity, Brain, Flame, Moon, Heart, Droplet, Sparkles, Dumbbell, Leaf, Wind, Shield, Bone, Eye, Zap, Coffee, FlaskConical } from 'lucide-react';

const HEADER_BOILERPLATE = `À Farmácia de Manipulação e ao Paciente:

- O Paciente está ciente de que deverá ser consultado ao término das formulações descritas, e as mesmas deverão ser manipuladas de acordo com a posologia de cada prescrição e limitada a duração do tratamento descrito abaixo.
- As Formulações descritas abaixo são personalizadas e foram elaboradas exclusivamente para o presente tratamento, com base na avaliação clínica e exames do paciente e de acordo com as suas necessidades e objetivos.
- Sua reprodução total ou parcial, sem nova avaliação médica e prescrição atualizada, não está autorizada, nos termos da Resolução CFM nº 1.974/2011 e RDC nº 67/2007 da ANVISA.
- O uso sem acompanhamento do médico prescritor ou por terceiros não é recomendado, e exime este profissional de responsabilidades.`;

const SEPARATOR = '\n________________________________________________________________\n\n';

// ===== EDITE AQUI A LISTA DEFINITIVA DE PERÍODOS =====
const PERIODOS = [
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
const VIAS = ['VO', 'SL', 'Tópico', 'Uso externo'];

const CATEGORIES = [
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

const FORMULAS = [
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
const PROTOCOLOS_SEED = [
  { id: 'p-tireoide', nome: 'Eixo Tireoide Completo', formulaIds: ['lugol-5', 't3-10mcg', 't4-30mcg', 'blend-tireoide-cafe'] },
  { id: 'p-detox', nome: 'Detox Hepático', formulaIds: ['silimarina-forte', 'tmg', 'ala-300'] },
  { id: 'p-emagrec-antiox', nome: 'Emagrecimento + Antiox', formulaIds: ['dapa-blend', 'naltrexone-blend', 'curcuma-piperina', 'ala-300'] },
  { id: 'p-sono', nome: 'Sono & Calmante', formulaIds: ['sono-natural', 'calmante-passiflora'] },
  { id: 'p-microbioma', nome: 'Microbioma 6 meses', formulaIds: ['prob-fase1', 'prob-fase2', 'prob-fase3'] },
];

// ===================== PARSER =====================
function splitAtivo(line) {
  const re = /[\d][\d.,]*\s*(?:bilh[õo]es[^\n]*?UFC[^\n]*|mg\/m[lL]|mcg\/gota|UFC|U\.?I\.?|ui|mg|mcg|g\b|m[lL]\b|l\b|%|FCC|FIP|DU|HUT)/g;
  let m, last = null;
  while ((m = re.exec(line)) !== null) last = m;
  if (!last) return [line, ''];
  return [line.slice(0, last.index).replace(/[\s\-–]+$/, '').trim(), line.slice(last.index).trim()];
}

function isPosologia(line) {
  return /^\d+\s*doses?\b/i.test(line)
    || (/\b(VO|SL)\b/.test(line) && /dose/i.test(line))
    || /^(Pingar|Aplicar|Dissolver|Diluir|Tomar|Beber|Massageando|Ingerir)/i.test(line);
}

function parseTomada(line) {
  const raw = line.trim();
  const hasDose = /\d+\s*doses?\b/i.test(raw);
  const via = /\bSL\b/i.test(raw) ? 'SL' : /Aplicar/i.test(raw) ? 'Tópico' : 'VO';
  if (!hasDose) return { doses: 1, via, periodo: '', hora: '', raw };
  const dm = raw.match(/(\d+)\s*doses?/i);
  const doses = dm ? Number(dm[1]) : 1;
  let hora = '';
  const hm = raw.match(/Sugest[ãa]o:?\s*([0-9hH:apm\s]+)/i) || raw.match(/-\s*(\d{1,2}h)\b/);
  if (hm) hora = hm[1].trim();
  let periodo = raw
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

function parseBody(body) {
  const ativos = [];
  const tomadas = [];
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

function tomadaToText(t) {
  if (t.periodo) {
    return `${t.doses} dose${t.doses > 1 ? 's' : ''} ${t.via || 'VO'} – ${t.periodo}${t.hora ? ` – Sugestão: ${t.hora}` : ''}`;
  }
  return t.raw || `${t.doses} dose${t.doses > 1 ? 's' : ''} ${t.via || 'VO'}`;
}

function parseAtivosLines(ativosText) {
  const lines = ativosText.split('\n');
  const parsed = lines.map((l) => {
    if (!l.trim()) return { empty: true };
    const [nome, dose] = splitAtivo(l);
    return dose ? { nome, dose } : { raw: l };
  });
  const max = Math.max(0, ...parsed.filter((p) => p.dose).map((p) => p.nome.length));
  return { parsed, max };
}

function alignAtivosText(ativosText) {
  const { parsed, max } = parseAtivosLines(ativosText);
  return parsed.map((p) => (p.empty ? '' : p.dose ? p.nome.padEnd(max + 2) + p.dose : p.raw)).join('\n');
}

function buildFormulaText(f) {
  const ativos = alignAtivosText(f.ativos);
  const pos = f.tomadas.length ? '\n' + f.tomadas.map(tomadaToText).join('\n') : '';
  return ativos + pos;
}

export default function PrescriptionEngine() {
  const [patient, setPatient] = useState({ nome: '', cpf: '', telefone: '', email: '', dataNascimento: '' });
  const [duracao, setDuracao] = useState('30');
  const [cid, setCid] = useState('');
  const [selected, setSelected] = useState([]); // working copies
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [leftTab, setLeftTab] = useState('cat');
  const [customProtocolos, setCustomProtocolos] = useState([]);
  const [copied, setCopied] = useState(false);

  const allProtocolos = [...PROTOCOLOS_SEED, ...customProtocolos];

  const filtered = useMemo(() => FORMULAS.filter((f) => {
    const mc = activeCategory === 'all' || f.cat === activeCategory;
    const ms = !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.body.toLowerCase().includes(search.toLowerCase());
    return mc && ms;
  }), [activeCategory, search]);

  const addFormula = (f) => {
    setSelected((prev) => {
      if (prev.find((s) => s.id === f.id)) return prev;
      const { ativos, tomadas } = parseBody(f.body);
      return [...prev, { id: f.id, cat: f.cat, name: f.name, ativos, tomadas }];
    });
  };

  const addProtocolo = (p) => p.formulaIds.forEach((id) => { const f = FORMULAS.find((x) => x.id === id); if (f) addFormula(f); });

  const removeFormula = (id) => setSelected((prev) => prev.filter((s) => s.id !== id));
  const moveFormula = (idx, dir) => setSelected((prev) => {
    const a = [...prev]; const t = idx + dir; if (t < 0 || t >= a.length) return prev;
    [a[idx], a[t]] = [a[t], a[idx]]; return a;
  });
  const updateAtivos = (id, val) => setSelected((prev) => prev.map((s) => s.id === id ? { ...s, ativos: val } : s));
  const updateTomada = (id, ti, field, val) => setSelected((prev) => prev.map((s) => {
    if (s.id !== id) return s;
    const tomadas = s.tomadas.map((t, i) => i === ti ? { ...t, [field]: field === 'doses' ? Number(val) : val, raw: undefined } : t);
    return { ...s, tomadas };
  }));
  const addTomada = (id) => setSelected((prev) => prev.map((s) => s.id === id ? { ...s, tomadas: [...s.tomadas, { doses: 1, via: 'VO', periodo: '', hora: '' }] } : s));
  const removeTomada = (id, ti) => setSelected((prev) => prev.map((s) => s.id === id ? { ...s, tomadas: s.tomadas.filter((_, i) => i !== ti) } : s));

  const saveAsProtocolo = () => {
    if (selected.length === 0) return;
    const nome = prompt('Nome do protocolo:');
    if (!nome) return;
    setCustomProtocolos((prev) => [...prev, { id: 'c-' + Date.now(), nome, formulaIds: selected.map((s) => s.id) }]);
  };

  const handleClear = () => { if (confirm('Limpar receita inteira?')) setSelected([]); };

  const idade = patient.dataNascimento ? Math.floor((new Date() - new Date(patient.dataNascimento)) / 31557600000) : '';
  const today = new Date().toLocaleDateString('pt-BR');

  const buildFullText = () => {
    let txt = '';
    if (patient.nome) {
      txt += `PACIENTE: ${patient.nome}\n`;
      if (patient.cpf) txt += `CPF: ${patient.cpf}\n`;
      if (patient.telefone) txt += `Contato: ${patient.telefone}\n`;
      if (patient.email) txt += `E-mail: ${patient.email}\n`;
      if (idade) txt += `Idade: ${idade} anos\n`;
      txt += `Data: ${today}\n\n`;
    }
    txt += HEADER_BOILERPLATE + '\n\n';
    txt += `Duração do Tratamento: ${duracao} dias\n`;
    if (cid) txt += `CID: ${cid}\n`;
    selected.forEach((f) => { txt += SEPARATOR + buildFormulaText(f); });
    return txt;
  };

  const handleCopy = () => { navigator.clipboard.writeText(buildFullText()); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handlePrint = () => window.print();

  const stats = useMemo(() => { const s = { all: FORMULAS.length }; FORMULAS.forEach((f) => { s[f.cat] = (s[f.cat] || 0) + 1; }); return s; }, []);

  const inputCls = 'px-3 py-2.5 border-2 border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white';

  return (
    <div className="min-h-screen bg-slate-100" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" />
      <style>{`
        @media print { .no-print{display:none!important;} .print-only{display:block!important;} body{background:white!important;} }
        .print-only{display:none;}
        .mono{font-family:'JetBrains Mono',monospace;}
        .scrollbar-thin::-webkit-scrollbar{width:8px;}
        .scrollbar-thin::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:4px;}
        .ativo-grid{display:grid;grid-template-columns:max-content 1fr;column-gap:1.25rem;row-gap:0.15rem;}
      `}</style>

      {/* HEADER */}
      <header className="no-print bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white shadow-lg">
        <div className="max-w-[1700px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur p-2 rounded-lg"><Stethoscope className="w-7 h-7" /></div>
            <div>
              <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-2xl font-semibold tracking-tight">Instituto Pádua</h1>
              <p className="text-blue-200 text-xs">Motor de Prescrição • RAS KAIZEN v8 — Tomadas & Protocolos</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-blue-200 text-sm hidden md:block">Dr. Caio Henrique Pádua</span>
            <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center font-bold">CP</div>
          </div>
        </div>
      </header>

      <div className="max-w-[1700px] mx-auto p-4">
        {/* PATIENT */}
        <div className="no-print bg-white rounded-xl shadow-sm border-2 border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-2 mb-4"><User className="w-5 h-5 text-blue-700" /><h2 className="font-semibold text-slate-800" style={{ fontFamily: "'Fraunces', serif" }}>Dados do Paciente</h2></div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input className={`col-span-2 ${inputCls}`} placeholder="Nome completo" value={patient.nome} onChange={(e) => setPatient({ ...patient, nome: e.target.value })} />
            <input className={inputCls} placeholder="CPF" value={patient.cpf} onChange={(e) => setPatient({ ...patient, cpf: e.target.value })} />
            <input className={inputCls} placeholder="Telefone" value={patient.telefone} onChange={(e) => setPatient({ ...patient, telefone: e.target.value })} />
            <input className={inputCls} placeholder="E-mail" value={patient.email} onChange={(e) => setPatient({ ...patient, email: e.target.value })} />
            <input type="date" className={inputCls} value={patient.dataNascimento} onChange={(e) => setPatient({ ...patient, dataNascimento: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Duração:</label>
              <input type="number" className={`w-24 ${inputCls}`} value={duracao} onChange={(e) => setDuracao(e.target.value)} />
              <span className="text-xs text-slate-600">dias</span>
            </div>
            <input className={`col-span-3 ${inputCls}`} placeholder="CID (ex: N484 + E291 + F90)" value={cid} onChange={(e) => setCid(e.target.value)} />
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="no-print grid grid-cols-12 gap-4">
          {/* LEFT */}
          <aside className="col-span-12 lg:col-span-3 bg-white rounded-xl shadow-sm border-2 border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-1 mb-3 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setLeftTab('cat')} className={`py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 ${leftTab === 'cat' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}><FileText className="w-4 h-4" />Categorias</button>
              <button onClick={() => setLeftTab('proto')} className={`py-2 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 ${leftTab === 'proto' ? 'bg-white shadow text-blue-700' : 'text-slate-500'}`}><Layers className="w-4 h-4" />Protocolos</button>
            </div>

            {leftTab === 'cat' ? (
              <>
                <div className="relative mb-3">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className={`w-full pl-9 ${inputCls}`} placeholder="Buscar fórmula..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="max-h-[560px] overflow-y-auto scrollbar-thin space-y-1">
                  <button onClick={() => setActiveCategory('all')} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition ${activeCategory === 'all' ? 'bg-blue-600 text-white font-semibold' : 'hover:bg-slate-100 text-slate-700'}`}>
                    <span className="flex items-center gap-2"><FileText className="w-4 h-4" />Todas</span>
                    <span className={`mono text-xs ${activeCategory === 'all' ? 'text-blue-200' : 'text-slate-400'}`}>{stats.all}</span>
                  </button>
                  {CATEGORIES.map((c) => { const Icon = c.icon; const n = stats[c.id] || 0; if (!n) return null; return (
                    <button key={c.id} onClick={() => setActiveCategory(c.id)} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition ${activeCategory === c.id ? `bg-gradient-to-r ${c.color} text-white font-semibold shadow` : 'hover:bg-slate-100 text-slate-700'}`}>
                      <span className="flex items-center gap-2 truncate"><Icon className="w-4 h-4 shrink-0" /><span className="truncate">{c.label}</span></span>
                      <span className={`mono text-xs shrink-0 ml-1 ${activeCategory === c.id ? 'text-white/80' : 'text-slate-400'}`}>{n}</span>
                    </button>
                  ); })}
                </div>
              </>
            ) : (
              <div className="max-h-[620px] overflow-y-auto scrollbar-thin space-y-2">
                <p className="text-xs text-slate-500 px-1 mb-1">Clique para adicionar o conjunto inteiro à receita.</p>
                {allProtocolos.map((p) => (
                  <div key={p.id} className="border-2 border-slate-200 rounded-lg p-3 hover:border-indigo-400 transition">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5"><Layers className="w-4 h-4 text-indigo-600" />{p.nome}</h3>
                      <button onClick={() => addProtocolo(p)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Adicionar</button>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1.5">{p.formulaIds.map((id) => FORMULAS.find((f) => f.id === id)?.name).filter(Boolean).join(' • ')}</p>
                  </div>
                ))}
              </div>
            )}
          </aside>

          {/* CENTER: CATALOG */}
          <section className="col-span-12 lg:col-span-4 bg-white rounded-xl shadow-sm border-2 border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800" style={{ fontFamily: "'Fraunces', serif" }}>Catálogo de Fórmulas</h2>
              <span className="mono text-xs text-slate-500">{filtered.length} disponíveis</span>
            </div>
            <div className="space-y-2 max-h-[680px] overflow-y-auto scrollbar-thin pr-1">
              {filtered.map((f) => { const cat = CATEGORIES.find((c) => c.id === f.cat); const isSel = !!selected.find((s) => s.id === f.id); return (
                <div key={f.id} className={`border-2 rounded-lg p-3 transition ${isSel ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/40'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {cat && <span className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${cat.color} text-white font-medium`}>{cat.label}</span>}
                      <h3 className="font-semibold text-slate-800 text-sm mt-1">{f.name}</h3>
                      <p className="mono text-[11px] text-slate-500 mt-1 line-clamp-2">{f.body.split('\n').slice(0, 2).join(' • ')}</p>
                    </div>
                    <button onClick={() => isSel ? removeFormula(f.id) : addFormula(f)} className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${isSel ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                      {isSel ? <><CheckCircle2 className="w-4 h-4" />Incluída</> : <><Plus className="w-4 h-4" />Adicionar</>}
                    </button>
                  </div>
                </div>
              ); })}
              {filtered.length === 0 && <div className="text-center py-12 text-slate-400 text-sm">Nenhuma fórmula encontrada</div>}
            </div>
          </section>

          {/* RIGHT: BLOCO 1 — SELEÇÃO / EDIÇÃO */}
          <section className="col-span-12 lg:col-span-5 bg-white rounded-xl shadow-sm border-2 border-blue-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2" style={{ fontFamily: "'Fraunces', serif" }}><span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded mono">BLOCO 1</span>Seleção / Edição ({selected.length})</h2>
              <div className="flex gap-2">
                {selected.length > 0 && <button onClick={saveAsProtocolo} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold"><FolderPlus className="w-4 h-4" />Salvar protocolo</button>}
                {selected.length > 0 && <button onClick={handleClear} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1 font-semibold"><Trash2 className="w-3.5 h-3.5" />Limpar</button>}
              </div>
            </div>

            {selected.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center text-slate-400 py-12">
                <div><FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" /><p className="text-sm">Receita vazia</p><p className="text-xs mt-1">Adicione fórmulas avulsas ou um protocolo</p></div>
              </div>
            ) : (
              <div className="space-y-3 max-h-[640px] overflow-y-auto scrollbar-thin pr-1">
                {selected.map((f, idx) => { const cat = CATEGORIES.find((c) => c.id === f.cat); return (
                  <div key={f.id} className="border-2 border-slate-200 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-slate-50 flex items-center justify-between gap-2 border-b border-slate-200">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className="mono text-xs font-bold text-slate-500">#{idx + 1}</span>
                        {cat && <span className={`text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r ${cat.color} text-white`}>{cat.label.split(' ')[0]}</span>}
                        <span className="text-sm font-semibold text-slate-700 truncate">{f.name}</span>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => moveFormula(idx, -1)} disabled={idx === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                        <button onClick={() => moveFormula(idx, 1)} disabled={idx === selected.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                        <button onClick={() => removeFormula(f.id)} className="p-1 text-red-500 hover:text-red-700"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <div className="p-3 space-y-3">
                      <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Ativos (edite mg / adicione / retire)</label>
                        <textarea value={f.ativos} onChange={(e) => updateAtivos(f.id, e.target.value)} className="mono w-full mt-1 px-3 py-2 text-xs border-2 border-slate-200 rounded-lg resize-y focus:outline-none focus:border-yellow-400 focus:bg-yellow-50" rows={Math.min(f.ativos.split('\n').length + 1, 14)} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Tomadas</label>
                          <button onClick={() => addTomada(f.id)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Tomada</button>
                        </div>
                        <div className="space-y-2">
                          {f.tomadas.map((t, ti) => (
                            <div key={ti} className="grid grid-cols-12 gap-1.5 items-center bg-slate-50 rounded-lg p-2 border border-slate-200">
                              <select value={t.doses} onChange={(e) => updateTomada(f.id, ti, 'doses', e.target.value)} className="mono col-span-2 px-1 py-2 border-2 border-slate-300 rounded text-xs text-center bg-white">
                                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                              <select value={t.via || 'VO'} onChange={(e) => updateTomada(f.id, ti, 'via', e.target.value)} className="col-span-2 px-1 py-2 border-2 border-slate-300 rounded text-xs bg-white">
                                {VIAS.map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <input list="periodos-list" value={t.periodo} onChange={(e) => updateTomada(f.id, ti, 'periodo', e.target.value)} placeholder="Período…" className="col-span-5 px-2 py-2 border-2 border-slate-300 rounded text-xs bg-white" />
                              <input value={t.hora} onChange={(e) => updateTomada(f.id, ti, 'hora', e.target.value)} placeholder="14h" className="mono col-span-2 px-1 py-2 border-2 border-slate-300 rounded text-xs text-center bg-white" />
                              <button onClick={() => removeTomada(f.id, ti)} className="col-span-1 flex justify-center text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ); })}
              </div>
            )}
            <datalist id="periodos-list">{PERIODOS.map((p) => <option key={p} value={p} />)}</datalist>

            <div className="border-t-2 border-slate-200 pt-3 mt-3 grid grid-cols-2 gap-2">
              <button onClick={handleCopy} disabled={!selected.length} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40">{copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}{copied ? 'Copiado!' : 'Copiar texto'}</button>
              <button onClick={handlePrint} disabled={!selected.length} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40 shadow"><Printer className="w-4 h-4" />Imprimir / PDF</button>
            </div>
          </section>
        </div>

        {/* BLOCO 2 — MODELO VISUAL DO PDF */}
        {selected.length > 0 && (
          <div className="no-print mt-4">
            <div className="bg-white rounded-xl shadow-sm border-2 border-indigo-200 p-4">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2 mb-3" style={{ fontFamily: "'Fraunces', serif" }}><span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded mono">BLOCO 2</span>Modelo Visual do PDF</h2>
              <div className="bg-white border-2 border-slate-300 rounded-lg p-6 max-h-[720px] overflow-y-auto scrollbar-thin shadow-inner max-w-3xl mx-auto">
                <PdfModel patient={patient} idade={idade} today={today} duracao={duracao} cid={cid} selected={selected} />
              </div>
            </div>
          </div>
        )}

        {/* PRINT */}
        <div className="print-only">
          <div style={{ padding: '36px', fontFamily: 'Georgia, serif' }}>
            <PdfModel patient={patient} idade={idade} today={today} duracao={duracao} cid={cid} selected={selected} print />
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfModel({ patient, idade, today, duracao, cid, selected, print }) {
  return (
    <div style={{ fontSize: print ? '11pt' : '12px', color: '#0f172a' }}>
      <div style={{ textAlign: 'center', borderBottom: '3px solid #1e3a8a', paddingBottom: '8px', marginBottom: '14px' }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: print ? '20pt' : '20px', fontWeight: 700, color: '#1e3a8a' }}>INSTITUTO PÁDUA</div>
        <div style={{ fontSize: print ? '10pt' : '11px', color: '#475569' }}>Dr. Caio Henrique Pádua — CRM-SP 125475</div>
      </div>
      {patient.nome && (
        <div style={{ fontSize: print ? '10pt' : '11px', marginBottom: '12px', lineHeight: 1.5 }}>
          <strong>PACIENTE:</strong> {patient.nome}{patient.cpf ? ` — CPF: ${patient.cpf}` : ''}{idade ? ` — ${idade} anos` : ''}<br />
          {patient.telefone && <>Contato: {patient.telefone} </>}{patient.email && <>· {patient.email}</>}<br />
          Data: {today} · Duração: {duracao} dias{cid ? ` · CID: ${cid}` : ''}
        </div>
      )}
      <div style={{ fontSize: print ? '8.5pt' : '10px', color: '#475569', lineHeight: 1.45, background: '#f8fafc', padding: '10px', borderLeft: '3px solid #1e3a8a', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>{HEADER_BOILERPLATE}</div>

      {selected.map((f, i) => {
        const { parsed } = parseAtivosLines(f.ativos);
        return (
          <div key={f.id} style={{ marginBottom: '20px', breakInside: 'avoid' }}>
            <div style={{ fontWeight: 700, fontSize: print ? '11pt' : '13px', color: '#1e3a8a', borderBottom: '1px solid #cbd5e1', paddingBottom: '3px', marginBottom: '8px' }}>{i + 1}. {f.name}</div>
            <div className="ativo-grid mono" style={{ fontSize: print ? '9.5pt' : '11px' }}>
              {parsed.map((p, j) => p.empty ? null : p.dose ? (
                <React.Fragment key={j}>
                  <div style={{ color: '#0f172a' }}>{p.nome}</div>
                  <div style={{ color: '#1e3a8a', fontWeight: 700 }}>{p.dose}</div>
                </React.Fragment>
              ) : (
                <div key={j} style={{ gridColumn: '1 / -1', color: '#64748b', fontStyle: 'italic' }}>{p.raw}</div>
              ))}
            </div>
            <div style={{ marginTop: '6px', paddingTop: '5px', borderTop: '1px dashed #e2e8f0' }}>
              {f.tomadas.map((t, k) => (
                <div key={k} className="mono" style={{ fontSize: print ? '9.5pt' : '11px', color: '#047857', fontWeight: 600 }}>▸ {tomadaToText(t)}</div>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: '48px', textAlign: 'center' }}>
        <div style={{ borderTop: '1px solid #000', width: '320px', margin: '0 auto', paddingTop: '4px', fontSize: print ? '10pt' : '11px' }}>Dr. Caio Henrique Pádua — CRM-SP 125475</div>
      </div>
    </div>
  );
}
