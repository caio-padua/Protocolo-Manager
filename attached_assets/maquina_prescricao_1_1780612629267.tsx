import React, { useState, useMemo, useRef } from 'react';
import { Search, Plus, X, Trash2, Copy, Printer, Send, FileText, User, ChevronDown, ChevronRight, Pill, Activity, Brain, Flame, Moon, Heart, Droplet, Sparkles, Dumbbell, Leaf, Wind, Shield, Bone, Eye, Zap, Coffee, FlaskConical, Stethoscope, CheckCircle2 } from 'lucide-react';

const HEADER_BOILERPLATE = `À Farmácia de Manipulação e ao Paciente:

- O Paciente está ciente de que deverá ser consultado ao término das formulações descritas, e as mesmas deverão ser manipuladas de acordo com a posologia de cada prescrição e limitada a duração do tratamento descrito abaixo.
- As Formulações descritas abaixo são personalizadas e foram elaboradas exclusivamente para o presente tratamento, com base na avaliação clínica e exames do paciente e de acordo com as suas necessidades e objetivos.
- Sua reprodução total ou parcial, sem nova avaliação médica e prescrição atualizada, não está autorizada, nos termos da Resolução CFM nº 1.974/2011 e RDC nº 67/2007 da ANVISA.
- O uso sem acompanhamento do médico prescritor ou por terceiros não é recomendado, e exime este profissional de responsabilidades.`;

const SEPARATOR = '\n________________________________________________________________\n\n';

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
  // ==================== GÁSTRICO / DIGESTIVO ====================
  {
    id: 'hcl-10',
    cat: 'gastrico',
    name: 'Ácido Clorídrico 10%',
    body: `Ácido Clorídrico 10%   -    60ml  -  2 frascos de 30 ml
Pingar 5 gotas em um copo com 10ml de água (1 dedo) e tomar 30 min Antes do Almoço
Pingar 5 gotas em um copo com 10ml de água (1 dedo) e tomar 30 min Antes do Jantar`
  },
  {
    id: 'enzimas-digestivas',
    cat: 'gastrico',
    name: 'Blend Enzimas Digestivas + Bile + Berberina',
    body: `Lactase 9000 FCC - Digestão eficiente da lactose
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
1 dose VO – 15 min - Antes Jantar`
  },

  // ==================== TIREOIDE / METABOLISMO ====================
  {
    id: 'lugol-5',
    cat: 'tireoide',
    name: 'Solução de Lugol 5%',
    body: `Solução de Lugol 5%
1 Frasco de 30 ml
Pingar 5 gotas em um copo com 10ml de água (1 dedo) e tomar 30 min Antes do Café Manhã`
  },
  {
    id: 't3-10mcg',
    cat: 'tireoide',
    name: 'T3 10mcg',
    body: `T3 10mcg
1 dose VO – Em Jejum
1 dose VO - Após Almoço - Sugestão À tarde - 14h`
  },
  {
    id: 't4-30mcg',
    cat: 'tireoide',
    name: 'T4 30mcg',
    body: `T4 30mcg
1 dose VO – Em Jejum  ( Não se alimentar por 15 minutos )`
  },
  {
    id: 'blend-tireoide-cafe',
    cat: 'tireoide',
    name: 'Blend Tireoide + Minerais (Café Manhã)',
    body: `Zinco Bisglicinato 30mg
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
1 dose VO – "Durante" o Café da Manhã`
  },
  {
    id: 'ki-gotas',
    cat: 'tireoide',
    name: 'Solução KI 150mcg/gota',
    body: `Solução de iodeto de potássio (KI) 150 mcg/gota
Solução em glicerina vegetal/água purificada/conservantes compatíveis
Frasco conta-gotas 20 mL (≈600 gotas)
Diluir 2 gotas em 50ml de água e tomar Antes do Café Manhã`
  },
  {
    id: 'ki-selenio-caps',
    cat: 'tireoide',
    name: 'Iodeto K + Selenometionina (Cápsula)',
    body: `Iodeto de potássio (KI) 150 mcg
Selenometionina 100 mcg
Cápsula Vegetal - Excipiente q.s.
1 dose VO – "Durante" o Café Manhã`
  },
  {
    id: 'mio-inositol-500',
    cat: 'tireoide',
    name: 'Mio-inositol 500mg',
    body: `Mio-inositol qsp 500 mg
1 dose VO – "Durante" o Jantar`
  },

  // ==================== HEPATO / DETOX ====================
  {
    id: 'silimarina-leve',
    cat: 'hepato',
    name: 'Silimarina Blend (Leve)',
    body: `Silimarina 100mg
L-Metionina 50mg
L-Cisteina 25mg (Anidra)
Cynara Scolymus 125mg (Extrato Seco)
Peumus Boldus 50mg (Extrato Seco)
Baccharis trimera 50mg
Inositol 75mg
2 doses VO – Antes Almoço
2 doses VO - Antes do Jantar`
  },
  {
    id: 'silimarina-forte',
    cat: 'hepato',
    name: 'Silimarina Blend (Forte)',
    body: `Silimarina 200mg
DL-Metionina 100mg
L-Cisteína 50mg (Anidra)
Cynara Scolymus 150mg (Extrato Seco)
Peumus Boldus 150mg (Extrato Seco)
Baccharis Trimera 100mg
Inositol 100mg
1 dose VO – Antes Almoço e 1 dose VO - Antes do Jantar`
  },
  {
    id: 'tmg',
    cat: 'hepato',
    name: 'Trimetilglicina 500mg (Betaína)',
    body: `Trimetilglicina 500mg ( Betaína Anidra )
1 dose - Antes de Jantar`
  },

  // ==================== VITAMINAS / MINERAIS ====================
  {
    id: 'ferro-multi-jantar',
    cat: 'vitaminas',
    name: 'Ferro + Multivitamínico Completo (Jantar)',
    body: `Ferro Bisglicinato 50mg
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
1 dose VO – "Durante" o Jantar`
  },
  {
    id: 'vit-lipossoluveis',
    cat: 'vitaminas',
    name: 'Vitaminas Lipossolúveis (A, D3, E, K2)',
    body: `Vitamina D3 10.000ui (Colecalciferol)
Vitamina A 10.000ui (Acetato de Retinol)
Vitamina E 200ui (Tocoferol Acetato)
Vitamina K2 300mcg (MK-7)
Cápsulas Oleosas
1 dose VO - Durante Café Manhã`
  },
  {
    id: 'complexo-b-noturno',
    cat: 'vitaminas',
    name: 'Complexo B Ativo (Noturno)',
    body: `Vitamina B3 100mg (Hexanicotinato de Inositol – NO FLUSH)
Vitamina B6 200mg
Vitamina B9 1mg (Ácido Fólico)
Vitamina B9 20mg (Metilfolato)
Vitamina B12 2.000mcg (Metilcobalamina)
1 dose VO – 1 hora Antes de Dormir`
  },

  // ==================== ADAPTÓGENOS ====================
  {
    id: 'panax-duo',
    cat: 'adaptogenos',
    name: 'Panax DUO (Ginseng Asiático)',
    body: `FÓRMULA 1 – BLEND "PANAX DUO" (CÁPSULA)
Panax ginseng (asiático) extrato padronizado 5–7% ginsenosídeos 150 mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – Antes do Café da Manhã
1 dose VO – À Tarde – Sugestão: 14h`
  },
  {
    id: 'panax-noto',
    cat: 'adaptogenos',
    name: 'Panax Notoginseng',
    body: `FÓRMULA 2 – "PANAX NOTOGINSENG" ISOLADO (CÁPSULA)
Panax notoginseng extrato padronizado ≥10% notoginsenosídeos 120 mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – Antes do Café da Manhã
1 dose VO – À Tarde – Sugestão: 14h`
  },
  {
    id: 'ashwa-multi',
    cat: 'adaptogenos',
    name: 'Ashwagandha + Adaptógenos (Multi)',
    body: `Ashwagandha KSM-66 350mg
L-Theanina 100mg
Passiflora 150mg
Maca 200mg
Mucuna 200mg
Rhodiola Rosea 300mg
1 dose VO – No Café da Manhã
1 dose VO – Após Almoço - Sugestão: 16h`
  },
  {
    id: 'ashwa-schisandra-rhodiola',
    cat: 'adaptogenos',
    name: 'Ashwagandha + Schisandra + Rhodiola',
    body: `Ashwagandha (KSM-66® ~5% withanolides) 200mg
Schisandra chinensis (≥2% schisandrinas) extrato padronizado 200 mg
Rhodiola rosea extrato padronizado (≥3% rosavinas, ≥1% salidrosídeo) 300 mg
1 dose VO – Antes do Café da Manhã
1 dose VO - À tarde - 15h`
  },

  // ==================== ADHD / COGNITIVO ====================
  {
    id: 'lisdexan-15',
    cat: 'adhd',
    name: 'Lisdexanfetamina 15mg',
    body: `Dimesilato de Lisdexanfetamina 15mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – Antes do Café da Manhã
1 dose VO – À Tarde – Sugestão: 14h`
  },
  {
    id: 'nootropico-bacopin',
    cat: 'adhd',
    name: 'Bacopin + Teacrine + Ginkgo + Vimpocetina',
    body: `Bacopin (20% bacosídeos) 250mg
Teacrine 100mg
Gingko Biloba 120mg
Vimpocetina 10mg
1 dose VO – Antes do Café Manhã
1 dose VO – À Tarde – Sugestão: 14h`
  },
  {
    id: 'foco-fosfatidilserina',
    cat: 'adhd',
    name: 'Fosfatidilserina + Colina + Tirosina (Foco)',
    body: `Fosfatidilserina 100mg
Colina 100mg
Taurina 100mg
Tirosina 250mg
Ácido fólico 500mcg
1 dose VO – Antes do Café da Manhã`
  },

  // ==================== EMAGRECIMENTO ====================
  {
    id: 'sibutramina-5',
    cat: 'emagrecimento',
    name: 'Sibutramina 5mg',
    body: `Sibutramina 5mg
Cápsulas Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – À Tarde – Sugestão: 14h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h`
  },
  {
    id: 'bup-topi',
    cat: 'emagrecimento',
    name: 'Bupropiona 180mg + Topiramato 20mg',
    body: `Bupropiona 180mg
Topiramato 20mg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – 2h Antes do Almoço - Sugestão: 10h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h`
  },
  {
    id: 'naltrexone-blend',
    cat: 'emagrecimento',
    name: 'Naltrexone + Bromoprida + Famotidina',
    body: `Naltrexone 15mg
Bromoprida 1,5mg
Famotidina 5mg
Zinco quelado 15mg
Selenio quelado 200mcg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
Usar Excipientes como: HPMC, Ethocel e Celulose Microcristalina
1 dose VO – 2h Antes do Almoço - Sugestão: 10h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h`
  },
  {
    id: 'dapa-blend',
    cat: 'emagrecimento',
    name: 'Cromo + Dapaglifozina + Cafeína + Berberina',
    body: `Picolinato Cromo 500mcg
Dapaglifozina 2,5mg
Cafeina Anidra 200mg
Green Coffee 200mg
Berberina 300mg
1 dose VO - 10 min Antes do Almoço`
  },
  {
    id: 'orlistat-blend',
    cat: 'emagrecimento',
    name: 'Cromo + Capsaicina + Orlistat + Faseolamina',
    body: `Picolinato Cromo 500mcg
Pimenta Caiena (Capsaicina) 5mg
Cascara Sagrada 200mg
Aloina 50mg
Orlistat 80mg
Faseolamina 300mg
1 dose VO - 30 min Antes do Almoço
1 dose VO - 30 min Antes do Jantar`
  },

  // ==================== TRÂNSITO ====================
  {
    id: 'cascara-senne',
    cat: 'transito',
    name: 'Cáscara Sagrada + Senne + Aloína',
    body: `Cascara Sagrada 250mg
Senne 100mg
Aloina 100mg
1 dose VO - 10 min Antes do Jantar`
  },

  // ==================== CALMANTE DIURNO ====================
  {
    id: 'calmante-passiflora',
    cat: 'calmante',
    name: 'Passiflora + Rhodiola + Erva-cidreira',
    body: `Passiflora 150mg
Rhodiola 100mg
Funcho (Foeniculum vulgare) extrato 50mg
Melissa officinalis (erva-cidreira) extrato 5:1 25mg
Camomila (Matricaria recutita) extrato 4:1 100mg
Espinheira-santa (Maytenus ilicifolia) extrato 100mg
1 dose VO – 2h Antes do Almoço - Sugestão: 10h
1 dose VO – 2h Antes do Jantar - Sugestão: 18h`
  },

  // ==================== CORTISOL ====================
  {
    id: 'cortisol-iso',
    cat: 'cortisol',
    name: 'Cortisol Isomolecular 10mg',
    body: `Cortisol Isomolecular 10mg
1 dose VO - Ao Acordar
1 dose VO – À tarde - Sugestão: 17h`
  },

  // ==================== ARTICULAÇÃO ====================
  {
    id: 'uc2-articular',
    cat: 'articulacao',
    name: 'UC-II + Hialurônico + Boswellia (Articular)',
    body: `Fórmula 1 – Dores articulares, fortalecimento tendíneo e hidratação intracapsular
UC-II (Colágeno tipo II não desnaturado) 20mg
Ácido Hialurônico 50mg
MSM (Metilsulfonilmetano) 250mg
Boswellia serrata extrato padronizado (65% AKBA) 150mg
Curcumina fitossomada (Meriva®) 100mg
Vitamina K2-MK7 50mcg
Silício orgânico (Exsynutriment®) 25mg
1 dose VO – No Café da Manhã
1 dose VO – Antes do Jantar`
  },
  {
    id: 'ferro-articular',
    cat: 'articulacao',
    name: 'Ferro Bisglicinato + Cofatores',
    body: `Fórmula 2 – Ferro bisglicinato (uso no almoço, com vitamina C e cofatores de absorção)
Ferro bisglicinato 15 mg
Vitamina C (ácido ascórbico) 150mg
Ácido fólico (metilfolato) 250 mcg
Lactobacillus plantarum 0,5 bilhão UFC (Liofilizado)
Polifenóis de romã (Punica granatum, extrato seco padronizado) 50mg
Quercetina 50mg
1 dose VO – No Café da Manhã
1 dose VO – Antes do Jantar`
  },
  {
    id: 'neuropatia-blend',
    cat: 'articulacao',
    name: 'Neuropatia Periférica (Benfotiamina + ALA + ALC)',
    body: `Fórmula 3 – Neuropatia periférica, regeneração nervosa e suporte mitocondrial
Vitamina B1 (Benfotiamina) 300 mg
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
1 dose VO – 15 min - Antes Jantar`
  },

  // ==================== CIRCULAÇÃO ====================
  {
    id: 'diuretico-natural',
    cat: 'circulacao',
    name: 'Furosemida + Diuréticos Naturais',
    body: `Furosemida 10mg
Potássio (KCl) 30mg
Magnésio Taurato 150mg
Dente-de-leão (Taraxacum officinale) extrato seco 300mg
Cavalinha (Equisetum arvense) extrato seco 250mg
Urtica dioica extrato seco 200mg
Hibiscus sabdariffa extrato seco 200mg
Chá-verde (Camellia sinensis – EGCG 60%) 150mg
Coenzima Q10 75mg
1 dose VO – Pela Manhã – Sugestão: 10h
1 dose VO – À Tarde – Sugestão: 14h`
  },
  {
    id: 'diosmina-blend',
    cat: 'circulacao',
    name: 'Diosmina + Hesperidina + Centella',
    body: `Diosmina micronizada 600 mg
Hesperidina micronizada 150 mg
Rutina 100 mg
Ginkgo biloba (24% flavonoides, 6% lactonas) 180 mg
Vitis vinifera (OPCs ≥ 95%) 200 mg
Centella asiatica extrato seco (asiaticosídeos ≥ 40%) 200 mg
Nattokinase fibrinolítica ativa 200 mg
Pycnogenol® (extrato de Pinus pinaster) 100 mg
Cápsulas XR Liberação Entérica + Matriz Liberação Lenta (DRcaps® ou HPMC)
1 dose VO – Pela Manhã – Sugestão: 10h
1 dose VO – À Tarde – Sugestão: 14h`
  },
  {
    id: 'arginina-citrulina',
    cat: 'circulacao',
    name: 'Arginina + Citrulina + Beterraba',
    body: `L-Arginina 250mg
L-Citrulina 250mg
Extrato seco de Beterraba padronizado (2% nitratos) 250mg
Ginkgo Biloba extrato padronizado (24% ginkgoflavonóides) 80mg
Cava Q10 25mg
1 dose VO - Pela Manhã
1 dose VO - À tarde - 15h`
  },

  // ==================== ANTI-AROMATASE ====================
  {
    id: 'dim-ecdi',
    cat: 'antiaromatase',
    name: 'BioSil + DIM + Ecdisterona + Quercetina',
    body: `BioSil® (ácido ortossilícico estabilizado com colina) 10mg
DIM (Diindolilmetano) 100 mg
Cyanotis Vaga Extrato (Ecdisterona 90%) 75 mg
Quercetina 200mg
Gamma Oryzanol 100 mg
1 dose VO - De manhã    e    1 dose VO - À Noite`
  },

  // ==================== HORMONAL FEMININO ====================
  {
    id: 'raloxifeno-60',
    cat: 'hormonal-f',
    name: 'Raloxifeno 60mg (90 dias)',
    body: `Raloxifeno 60 mg
Posologia:
1 dose VO - Antes Café Manhã
Observação: Por 90 dias`
  },
  {
    id: 'tamoxifeno-15',
    cat: 'hormonal-f',
    name: 'Tamoxifeno 15mg (30 dias)',
    body: `Tamoxifeno 15mg
Posologia:
1 dose VO - Antes Café Manhã
1 dose VO - Antes Jantar
Observação:
Usar Por 30 dias - Usar junto com Raloxifeno apenas nos primeiros 30 dias
Depois seguir apenas com Raloxifeno`
  },
  {
    id: 'cabergolina-blend',
    cat: 'hormonal-f',
    name: 'Cabergolina + Dutasterida + Tadalafila + Vardenafila',
    body: `Cabergolina 0,25mg
Dutasterida 0,5 mg
Tadalafila 20mg
Vardenafila 2,5mg
1 dose VO – Pela Manhã - Apenas na: Segunda - Quarta - Sexta`
  },

  // ==================== ANABOLIZANTES ====================
  {
    id: 'oxandrolona-nadh',
    cat: 'anabolizante',
    name: 'Oxandrolona 2,5mg + NADH (Sublingual)',
    body: `Oxandrolona 2,5mg
NADH 2,5mg
Comprimido Sublingual
1 dose SL - De manhã    e    1 dose SL - À tarde    e    1 dose SL - À Noite`
  },
  {
    id: 'oximetolona-5',
    cat: 'anabolizante',
    name: 'Oximetolona 5mg',
    body: `Oximetolona 5mg
1 dose VO - De manhã`
  },
  {
    id: 'mesterolona-blend',
    cat: 'anabolizante',
    name: 'Mesterolona + Fenum + Long Jack + Epimedium',
    body: `Mesterolona 15mg
Fenum Graecum e.s. 50mg
Long Jack 150mg
Epimedium Icarin 25mg
Gama oryzanol 12,5mg
Cava q10 50mg
Tadalafil 10mg
NADH 5mg
1 dose VO – Antes do Café da Manhã`
  },
  {
    id: 'long-jack-natural',
    cat: 'anabolizante',
    name: 'Fenum + Long Jack + Epimedium (Natural)',
    body: `Fenum Graecum e.s. 100mg
Long Jack 200mg
Epimedium Icarin 300mg
Gama oryzanol 100mg
Tadalafil 10mg
1 dose VO – Antes do Café da Manhã`
  },

  // ==================== LIBIDO / ANTIDEPRESSIVO ====================
  {
    id: 'paroxetina-icariin',
    cat: 'libido',
    name: 'Paroxetina + Icariin + Hypericum + Withania',
    body: `Paroxetina 10mg
Icariin (Epimedium padronizado) 200 mg
Hypericum Perforatum 150mg
Withania Somnifera 250mg
2 Doses VO - Durante Café Manhã e 2 doses - Antes do Jantar`
  },
  {
    id: 'tadalafil-nadh',
    cat: 'libido',
    name: 'Tadalafila 10mg + NADH 5mg',
    body: `Tadalafila 10mg
NADH 5mg
1 dose VO – Antes do Café da Manhã`
  },

  // ==================== PRÉ-TREINO ====================
  {
    id: 'sache-pretreino',
    cat: 'pretreino',
    name: 'Sachê Pré-treino (Beta-Alanina + Citrulina)',
    body: `Beta Alanina 6g
L-Citrulina Malato 6g
Cafeína Anidra 350mg
L-Tirosina 2g
Taurina 2g
Colina Bitartrato 500mg
Aroma Agradável Natural (Baunilha/Camomila/Tangerina/Limão) qsp
Edulcorante natural: Estévia + Eritritol (1:1) qsp
Sem lactose, sem glúten, sem açúcar. Não contém corantes artificiais
Dissolver 1 Sachê em 200ml de água e ingerir 20 min antes do treino`
  },
  {
    id: 'sache-hmb',
    cat: 'pretreino',
    name: 'Sachê HMB + Creatina + Ecdisterona',
    body: `Beta-hidroxi-beta-metilbutirato (HMB) 1g
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
Dissolver 1 Sachê em 200ml de água e ingerir 20 min antes do treino`
  },
  {
    id: 'cafeina-green',
    cat: 'pretreino',
    name: 'Cafeína + Green Coffee + Cynara',
    body: `Cafeína Anidra 200mg
Green Coffee 150mg
Cynara scolymus 50mg
Zingiber officinale qsp 500mg
1 dose VO – Antes do Café Manhã
1 dose VO - 30 min antes do treino`
  },
  {
    id: 'beterraba-tirosina',
    cat: 'pretreino',
    name: 'Beterraba + Tirosina + Gengibre',
    body: `Extrato de Beterraba (padronizado em nitratos) 350 mg
L-Tirosina 350mg
Gengibre Extrato Seco 100mg
1 dose VO – Antes do Café da Manhã
1 dose VO - À tarde - 15h`
  },

  // ==================== PRÓSTATA ====================
  {
    id: 'prostata-blend',
    cat: 'prostata',
    name: 'Saw Palmetto + Tamsulosina + Finasterida',
    body: `Saw Palmetto 200mg
Tansulosina 0,25
Finasteride 0,5mg
1 dose VO - Antes do Jantar ou Antes de dormir`
  },

  // ==================== MAGNÉSIO ====================
  {
    id: 'magnesio-duo',
    cat: 'magnesio',
    name: 'Magnésio Dimalato + Treonato',
    body: `Magnésio Dimalato 200mg
Magnésio Treonato qsp 500mg
1 Doses VO - Durante Café Manhã e 1 dose VO - Antes de Dormir`
  },

  // ==================== CABELO ====================
  {
    id: 'cabelo-nutricolin',
    cat: 'cabelo',
    name: 'Nutricolin + Queratina + Biotina',
    body: `Nutricolin® 100mg
Queratina 50mg
Cisteína 50mg
Cistina 25mg
Vitamina H (Biotina) 10mg
Vitamina B1 75 mg ( Tiamina )
Vitamina B2 12,5 mg ( Riboflavina )
Vitamina B5 100 mg ( Pantotenato Cálcio )
Actrisave 100mg
PQQ 10mg
1 dose VO – Antes do Jantar ( Cápsulas de Gelatina Rosa )`
  },
  {
    id: 'minoxidil-oral',
    cat: 'cabelo',
    name: 'Minoxidil Oral 1,5mg (LDOM)',
    body: `Minoxidil oral baixa dose (LDOM) 1,5mg
Posologia:
1 dose VO - Antes de Dormir`
  },
  {
    id: 'dutasterida-oral',
    cat: 'cabelo',
    name: 'Dutasterida 0,5mg Oral (Seg-Qua-Sex)',
    body: `Dutasterida 0,5 mg
Posologia:
1 dose VO - Antes de Dormir - Apenas: Segunda - Quarta - Sexta`
  },
  {
    id: 'fina-topica-a',
    cat: 'cabelo',
    name: 'Finasterida Tópica HPCH (Fórmula A)',
    body: `FÓRMULA A — Finasterida tópica "HPCH" (uso diário)
Finasterida 0,25% (1 mg/mL)
Minoxidil 5%
Veículo HPCH (hidroxipropil-quitosana) Solução filmógena q.s.p. 60 mL
Aplicar 0,5 (10 gotas) mL à noite, somente na linha anterior do couro cabeludo (hairline) todos os dias.`
  },
  {
    id: 'duta-topica-b',
    cat: 'cabelo',
    name: 'Dutasterida Tópica Lipossomal (Fórmula B)',
    body: `FÓRMULA B — Dutasterida tópica lipossomal (3×/semana)
Dutasterida 0,02% (0,2 mg/mL)
Veículo lipossomal/hidroalcoólico leve q.s.p. 30 mL
Aplicar 0,5 mL na hairline, seg/qua/sex à noite (dias alternados em relação à A).`
  },
  {
    id: 'blend-c',
    cat: 'cabelo',
    name: 'Blend Único Fina + Duta (Fórmula C)',
    body: `PRESCRIÇÃO — BLEND ÚNICO FÓRMULA C
Finasterida 0,05% (0,5 mg/mL)
Dutasterida 0,01% (0,1 mg/mL)
Veículo HPCH + lipossomas q.s.p. 60 mL
Aplicar 0,4–0,5 mL na hairline à noite, 5–6×/semana`
  },
  {
    id: 'locao-capilar',
    cat: 'cabelo',
    name: 'Loção Capilar Arginina + Beterraba',
    body: `Loção capilar 60 mL – Circulação e Nutrição local
Arginina 2%
Extrato glicólico de Beterraba (rico em nitratos) 5%
Cafeína 1%
Nicotinato de metila 0,1%
Centella asiática extrato padronizado 2%
Veículo hidroalcoólico q.s.
Posologia:
Aplicar 1 mL (20 gotas) no couro cabeludo 1 - 2 vezes /dia
Massageando por 2 - 3 minutos`
  },

  // ==================== PELE / ANTIPARASITÁRIO ====================
  {
    id: 'iverm-tinidazol',
    cat: 'pele',
    name: 'Ivermectina + Tinidazol (4 Ciclos)',
    body: `Invermectina 12mg
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
1 dose VO - Durante o Jantar`
  },
  {
    id: 'locao-sarna',
    cat: 'pele',
    name: 'Loção Tópica Antiparasitária',
    body: `Tiabendazol 2%
Benzoato Benzila 15%
Invermectina 1%
Enxofre 1%
Lidocaína 1%
Mentol 0,5%
Prometazina 1%
Loção Cremosa 200ml
Aplicar de Manhã - Na área afetada e em volta da área afetada
Aplicar à Noite - Na área afetada e em volta da área afetada`
  },

  // ==================== ANTIOXIDANTES ====================
  {
    id: 'ala-300',
    cat: 'antiox',
    name: 'Ácido Alfa Lipóico 300mg',
    body: `Ácido Alfa Lipóico 300mg
Cápsulas Gastrorresistentes
1 dose VO – Antes do Café Manhã
1 dose VO – Antes Jantar`
  },
  {
    id: 'curcuma-piperina',
    cat: 'antiox',
    name: 'Cúrcuma + Piperina',
    body: `Piperina 5mg
Curcuma Longa 300mg
1 dose - Antes do Almoço
1 dose - Antes de Jantar`
  },

  // ==================== SONO ====================
  {
    id: 'solucao-sl-psico',
    cat: 'sono',
    name: 'Solução SL Psicotrópicos (Alprazolam+Trazodona+Zolpidem)',
    body: `Solução com Psicotrópicos ( Restauração do Sono Imediata )
Alprazolam 2mg
Trazodona 25mg     A) Usar conforme: ORIENTAÇÃO MÉDICA !
Zolpidem 10mg       B) Gotejar somente a: QUANTIDADE NECESSÁRIA
Produzir em frascos para 30 dias – Se duração tratamento > 30 dias produzir mais frascos para 30 dias
Sorbitol Sublingual qsp 0,5ml para garantir um SONO SEM INTERRUPÇÃO !
Pingar de 2 à 10 gotas - SL ( Embaixo da língua ) – 1h antes de dormir`
  },
  {
    id: 'sono-natural',
    cat: 'sono',
    name: 'Triptofano + GABA + Apigenina + Melatonina',
    body: `L-triptofano 150mg
L-Theanina 200mg
Magnésio Bisglicinato 200mg
Passiflora 200mg
GABA 150mg
Apigenina (matricária/camomila) 35mg
Magnolia officinalis extrato (honokiol/magnolol) 100 mg
Piridoxal-5-Fosfato 25mg
Fosfatidilserina 125mg
Melatonina DUO 1,5mg
1 dose VO – 1 hora Antes de Dormir`
  },
  {
    id: 'sache-noturno',
    cat: 'sono',
    name: 'Sachê Noturno Pró-Sono (Glicina + Mg)',
    body: `SACHÊ NOTURNO - BLEND NOTURNO - PRÓ SONO
Glicina 2g
Taurina 1g
L-Glutamina 3g
Mio-Inositol 2g
Magnésio (elementar) 220 mg proveniente de blend
Magnésio bisglicinato (≈60% do Mg elementar)
Magnésio taurato (≈25% do Mg elementar)
Magnésio L-treonato (≈15% do Mg elementar)
Aroma Agradável Natural (Limão) qsp
Edulcorante natural: Estévia + Eritritol (1:1) qsp
Sem lactose, sem glúten, sem açúcar. Não contém corantes artificiais
Dissolver 1 Sachê em 200ml de água e ingerir 1h antes de dormir
Observação: Farmácia: ajustar os sais para atingir ~220 mg Mg elementar.`
  },

  // ==================== MENOPAUSA / TRH ====================
  {
    id: 'vasomotor-caps',
    cat: 'menopausa',
    name: 'Cápsula Balanço Vasomotor',
    body: `Cápsula Balanço Vasomotor
Cimicifuga racemosa (extrato padronizado) 40mg
Magnólia (extrato) 200mg
L-Teanina 200mg
Safranal (açafrão - extrato padronizado) 30mg
Vitamina E (d-alfa tocoferol) 200UI
1 dose VO – Antes Café Manhã
1 dose VO – Antes Jantar`
  },
  {
    id: 'trifolium-menopausa',
    cat: 'menopausa',
    name: 'Trifolium + Cimicifuga + Ashwagandha',
    body: `Trifolium pratense (Trevo-vermelho – 40 mg isoflavonas) 150mg
Cimicifuga racemosa (extrato padronizado) 40mg
Withania somnifera (Ashwagandha KSM-66®) 150mg
Magnolia officinalis (extrato) 200 mg
Passiflora incarnata (extrato) 150 mg
Gamma-oryzanol 100mg
Salvia officinalis (extrato) 100mg
Pycnogenol® (Pinus pinaster) 25mg
1 dose VO – Antes Café Manhã
1 dose VO – Antes Jantar`
  },
  {
    id: 'gel-prog-estri-estra',
    cat: 'menopausa',
    name: 'Gel Progesterona + Estriol + Estradiol',
    body: `Progesterona Bioidentica Micronizada 15mg
Estriol - Estradiol Micronizada 2mg-0,5mg/ml
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Aplicar na Face Interna do antebraço ou coxas À NOITE`
  },
  {
    id: 'gel-prog-pura',
    cat: 'menopausa',
    name: 'Gel Progesterona Pura (15º-30º dia)',
    body: `Progesterona Bioidentica Micronizada 20mg
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Do 15º ao 30º dia do Mês - Aplicar na Face Interna do antebraço ou coxas À NOITE`
  },
  {
    id: 'gel-estri-estra',
    cat: 'menopausa',
    name: 'Gel Estriol + Estradiol (1º-14º dia)',
    body: `Estriol - Estradiol Micronizada 4mg-1mg/ml
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Do 1º ao 14º dia do Mês - Aplicar na Face Interna do antebraço ou coxas À NOITE`
  },
  {
    id: 'gel-testo',
    cat: 'menopausa',
    name: 'Gel Testosterona Bioidêntica',
    body: `Testosterona Bioidentica Micronizada 5mg
HRT Base 30g
Aplicar 1 Pump ( 1ml ) – Aplicar na Face Interna do antebraço ou coxas DE MANHÃ`
  },

  // ==================== HIDRATAÇÃO ====================
  {
    id: 'mineral-balance',
    cat: 'hidratacao',
    name: 'Mineral Balance Shield (Sal Himalaia)',
    body: `OBSERVAÇÃO em relação à HIDRATAÇÃO!

Solução "MINERAL BALANCE SHIELD"

Como preparar?
- Para cada 1 Litro de Água acrescente:
- 1 Colher de Café (rasa) de: * Sal Rosa do Himalaia
- 1 Colher de Café (rasa) de: * Bicarbonato de Sódio

Como Ingerir?
- Tomar 1 Litro da Solução MINERAL BALANCE de Água: Ao Longo da Manhã
- Tomar 1 Litro da Solução MINERAL BALANCE de Água: À Tarde e no Final da Tarde`
  },

  // ==================== PROBIÓTICOS ====================
  {
    id: 'prob-fase1',
    cat: 'probioticos',
    name: 'FASE 1 - Assentamento (Meses 1-2)',
    body: `FASE 1 - ASSENTAMENTO ROBUSTO (MESES 1 E 2)

PROBIÓTICO Fase 1(A) - CÁPSULAS LIOFILIZADAS GASTRO-RESISTENTES
Lactiplanti Bacillus plantarum 299v 10 bilhões de UFC por cápsula
Lacticasei Bacillus rhamnosus GG 10 bilhões de UFC por cápsula
Limos Lactobacillus reuteri DSM 17938 5 bilhões de UFC por cápsula
Bifidobacterium lactis HN019 10 bilhões de UFC por cápsula
Bifidobacterium longum BB536 5 bilhões de UFC por cápsula
Bacillus coagulans IS2 2 bilhões de UFC por cápsula
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de dormir

PROBIÓTICO Fase 1(B) - CÁPSULAS LIOFILIZADAS GASTRO-RESISTENTES
SACCHAROMYCES BOULARDII 250mg ( Fórmula Separada )
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de dormir

PREBIÓTICO Fase 1(C) - SACHÊ MONODOSE
PHGG guar parcialmente hidrolisada 6 g por sachê
GOS galacto-oligossacarídeos 3 g por sachê
Dissolver 1 sachê em 250ml de água e ingerir a noite ( Pode ocorrer intolerância intestinal nos primeiros 7 dias)`
  },
  {
    id: 'prob-fase2',
    cat: 'probioticos',
    name: 'FASE 2 - Reconstrução (Meses 3-4)',
    body: `FASE 2 - RECONSTRUÇÃO E DIVERSIDADE (MESES 3 E 4)

PROBIÓTICO Fase 2(A) - CÁPSULAS LIOFILIZADAS GASTRO-RESISTENTES
Lacticasei Bacillus paracasei 8700:2 10 bilhões de UFC por cápsula
Lactobacillus gasseri 5 bilhões de UFC por cápsula
Bifidobacterium breve M-16V ou BR03 10 bilhões de UFC por cápsula
Bifidobacterium bifidum 5 bilhões de UFC por cápsula
Lactiplanti Bacillus plantarum 299v 5 bilhões de UFC por cápsula
Bacillus coagulans IS2 2 bilhões de UFC por cápsula
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de dormir

PROBIOTICO Fase 2(B) - CÁPSULAS LIOFILIZADAS GASTRO-RESISTENTES
SACCHAROMYCES BOULARDII 250mg ( Fórmula Separada )
1 dose VO – Antes de dormir

PREBIÓTICO Fase 2(C) - SACHÊ MONODOSE
GOS galacto-oligossacarídeos 5 g por sachê
Inulina 2 g por sachê
Dissolver 1 sachê em 250ml de água e ingerir a noite`
  },
  {
    id: 'prob-fase3',
    cat: 'probioticos',
    name: 'FASE 3 - Manutenção (Meses 5-6)',
    body: `FASE 3 - CONSOLIDAÇÃO E MANUTENÇÃO (MESES 5 E 6)

PROBIÓTICO Fase 3(A) - CÁPSULAS LIOFILIZADAS GASTRO-RESISTENTES
Lactiplanti Bacillus plantarum 299v 10 bilhões de UFC por cápsula
Lacticasei Bacillus rhamnosus GG 5 bilhões de UFC por cápsula
Lacticasei Bacillus paracasei 8700:2 5 bilhões de UFC por cápsula
Bifidobacterium longum BB536 10 bilhões de UFC por cápsula
Bifidobacterium lactis HN019 5 bilhões de UFC por cápsula
1 dose VO – Antes do Café da Manhã
1 dose VO – Antes de dormir

PROBIÓTICO Fase 3(B) - CÁPSULAS LIOFILIZADAS GASTRO-RESISTENTES
SACCHAROMYCES BOULARDII 250mg ( Fórmula Separada )
1 dose VO – Antes de dormir

PREBIÓTICO Fase 3(C) - SACHÊ MONODOSE
Amido resistente RS2 5 g por sachê
Arabinogalactana 2 g por sachê
PHGG 3 g por sachê
Dissolver 1 sachê em 250ml de água e ingerir a noite`
  },

  // ==================== COMERCIAIS ====================
  {
    id: 'comerciais',
    cat: 'comerciais',
    name: 'Creatina + Ghee + MCT (Lojas)',
    body: `SUPLEMENTOS PARA ADQUIRIR EM LOJAS DA INTERNET

A) CREATINA MARCA VITAFOR - Creafort Creatina Creapure - 300g
Dissolver 2 Scoops (6g) em 100ml (1/2 Copo) de Água, e Ingerir pela Manhã

B) Manteiga Ghee Clarificada Lotus 500g - Sem Lactose e Sem Sal
- Utilizar para cozinhar os alimentos e/ou para Preparar o Café a Prova de Balas

C) MCT - Triglicerídeos de Cadeia Média (TCM) - Com AGE 250ml
- Para Preparar o Café a Prova de Balas`
  },
  {
    id: 'bulletproof',
    cat: 'comerciais',
    name: 'Bulletproof Coffee (Preparo)',
    body: `BULLETPROOF COFFEE

O café à prova de balas (Bulletproof Coffee) é uma bebida energética e saciante, popular em dietas e jejum intermitente. Feita pela mistura de café forte com manteiga sem sal e óleo MCT (ou óleo de coco).

Ingredientes:
- 250 a 300 ml de café preto forte
- 1 a 2 colheres de sopa de manteiga ghee (clarificada)
- 1 a 2 colheres de chá (ou sopa) de óleo MCT ou óleo de coco

Modo de Preparo:
- Prepare o café: Coe o café de forma tradicional, garantindo que ele esteja bem quente
- Misture: Com um Mini Mexer dissolva a manteiga ghee e o óleo de coco (ou óleo MCT) até que a mistura fique cremosa, espumosa e com aparência de latte
- Sirva: Beba imediatamente para aproveitar a textura e o calor.`
  },
];

export default function PrescriptionEngine() {
  const [patient, setPatient] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    email: '',
    dataNascimento: '',
  });
  const [duracao, setDuracao] = useState('30');
  const [cid, setCid] = useState('');
  const [selectedFormulas, setSelectedFormulas] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('compose'); // 'compose' | 'preview'
  const [copied, setCopied] = useState(false);
  const previewRef = useRef(null);

  const filteredFormulas = useMemo(() => {
    return FORMULAS.filter(f => {
      const matchCat = activeCategory === 'all' || f.cat === activeCategory;
      const matchSearch = !search || 
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.body.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [activeCategory, search]);

  const addFormula = (formula) => {
    if (selectedFormulas.find(s => s.id === formula.id)) return;
    setSelectedFormulas([...selectedFormulas, { ...formula, customBody: formula.body }]);
  };

  const removeFormula = (id) => {
    setSelectedFormulas(selectedFormulas.filter(s => s.id !== id));
  };

  const moveFormula = (idx, dir) => {
    const newArr = [...selectedFormulas];
    const target = idx + dir;
    if (target < 0 || target >= newArr.length) return;
    [newArr[idx], newArr[target]] = [newArr[target], newArr[idx]];
    setSelectedFormulas(newArr);
  };

  const updateFormulaBody = (id, body) => {
    setSelectedFormulas(selectedFormulas.map(s => s.id === id ? { ...s, customBody: body } : s));
  };

  const buildFullText = () => {
    const today = new Date().toLocaleDateString('pt-BR');
    const idade = patient.dataNascimento 
      ? Math.floor((new Date() - new Date(patient.dataNascimento)) / 31557600000)
      : '';
    
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
    
    selectedFormulas.forEach(f => {
      txt += SEPARATOR + f.customBody;
    });
    
    return txt;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildFullText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    setView('preview');
    setTimeout(() => window.print(), 200);
  };

  const handleClear = () => {
    if (confirm('Limpar receita inteira?')) {
      setSelectedFormulas([]);
    }
  };

  const categoryStats = useMemo(() => {
    const stats = { all: FORMULAS.length };
    FORMULAS.forEach(f => {
      stats[f.cat] = (stats[f.cat] || 0) + 1;
    });
    return stats;
  }, []);

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap" />
      
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
        }
        .print-only { display: none; }
        .formula-text { font-family: 'Courier New', monospace; font-size: 13px; line-height: 1.5; }
        .scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      {/* HEADER */}
      <header className="no-print bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white shadow-lg">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 backdrop-blur p-2 rounded-lg">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-2xl font-semibold tracking-tight">
                Instituto Pádua
              </h1>
              <p className="text-blue-200 text-xs">Motor de Prescrição • RAS KAIZEN v7</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-blue-200 text-sm">Dr. Caio Henrique Pádua</span>
            <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center font-bold">
              CP
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto p-4">
        {/* PATIENT FORM */}
        <div className="no-print bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-blue-700" />
            <h2 className="font-semibold text-slate-800" style={{ fontFamily: "'Fraunces', serif" }}>
              Dados do Paciente
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <input
              type="text"
              placeholder="Nome completo"
              value={patient.nome}
              onChange={(e) => setPatient({...patient, nome: e.target.value})}
              className="col-span-2 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <input
              type="text"
              placeholder="CPF"
              value={patient.cpf}
              onChange={(e) => setPatient({...patient, cpf: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <input
              type="text"
              placeholder="Telefone"
              value={patient.telefone}
              onChange={(e) => setPatient({...patient, telefone: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <input
              type="email"
              placeholder="E-mail"
              value={patient.email}
              onChange={(e) => setPatient({...patient, email: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
            <input
              type="date"
              placeholder="Nascimento"
              value={patient.dataNascimento}
              onChange={(e) => setPatient({...patient, dataNascimento: e.target.value})}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-600 whitespace-nowrap">Duração:</label>
              <input
                type="number"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value)}
                className="w-20 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <span className="text-xs text-slate-600">dias</span>
            </div>
            <input
              type="text"
              placeholder="CID (ex: N484 + E291 + F90)"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              className="col-span-3 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="no-print grid grid-cols-12 gap-4">
          
          {/* LEFT: CATEGORIES */}
          <aside className="col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 p-3">
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar fórmula..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <div className="max-h-[600px] overflow-y-auto scrollbar-thin space-y-1">
              <button
                onClick={() => setActiveCategory('all')}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition ${
                  activeCategory === 'all' 
                    ? 'bg-blue-600 text-white font-semibold' 
                    : 'hover:bg-slate-100 text-slate-700'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Todas
                </span>
                <span className={`text-xs ${activeCategory === 'all' ? 'text-blue-200' : 'text-slate-400'}`}>
                  {categoryStats.all}
                </span>
              </button>
              {CATEGORIES.map(cat => {
                const Icon = cat.icon;
                const count = categoryStats[cat.id] || 0;
                if (count === 0) return null;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setActiveCategory(cat.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition ${
                      activeCategory === cat.id 
                        ? `bg-gradient-to-r ${cat.color} text-white font-semibold shadow` 
                        : 'hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{cat.label}</span>
                    </span>
                    <span className={`text-xs shrink-0 ml-1 ${activeCategory === cat.id ? 'text-white/80' : 'text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* MIDDLE: FORMULA LIST */}
          <section className="col-span-5 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800" style={{ fontFamily: "'Fraunces', serif" }}>
                Catálogo de Fórmulas
              </h2>
              <span className="text-xs text-slate-500">{filteredFormulas.length} disponíveis</span>
            </div>
            <div className="space-y-2 max-h-[700px] overflow-y-auto scrollbar-thin pr-1">
              {filteredFormulas.map(f => {
                const cat = CATEGORIES.find(c => c.id === f.cat);
                const isSelected = !!selectedFormulas.find(s => s.id === f.id);
                return (
                  <div
                    key={f.id}
                    className={`border rounded-lg p-3 transition ${
                      isSelected 
                        ? 'border-emerald-500 bg-emerald-50' 
                        : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {cat && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r ${cat.color} text-white font-medium`}>
                              {cat.label}
                            </span>
                          )}
                        </div>
                        <h3 className="font-semibold text-slate-800 text-sm">{f.name}</h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 font-mono">
                          {f.body.split('\n').slice(0, 2).join(' • ')}
                        </p>
                      </div>
                      <button
                        onClick={() => isSelected ? removeFormula(f.id) : addFormula(f)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                          isSelected
                            ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isSelected ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Adicionada</>
                        ) : (
                          <><Plus className="w-3.5 h-3.5" /> Adicionar</>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
              {filteredFormulas.length === 0 && (
                <div className="text-center py-12 text-slate-400 text-sm">
                  Nenhuma fórmula encontrada
                </div>
              )}
            </div>
          </section>

          {/* RIGHT: SELECTED FORMULAS */}
          <section className="col-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-slate-800" style={{ fontFamily: "'Fraunces', serif" }}>
                Receita ({selectedFormulas.length})
              </h2>
              {selectedFormulas.length > 0 && (
                <button
                  onClick={handleClear}
                  className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>
            
            {selectedFormulas.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-center text-slate-400 py-12">
                <div>
                  <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p className="text-sm">Receita vazia</p>
                  <p className="text-xs mt-1">Clique em "Adicionar" no catálogo</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[550px] overflow-y-auto scrollbar-thin mb-3">
                {selectedFormulas.map((f, idx) => {
                  const cat = CATEGORIES.find(c => c.id === f.cat);
                  return (
                    <details key={f.id} className="border border-slate-200 rounded-lg">
                      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between hover:bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs font-bold text-slate-500">#{idx + 1}</span>
                          {cat && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded bg-gradient-to-r ${cat.color} text-white`}>
                              {cat.label.split(' ')[0]}
                            </span>
                          )}
                          <span className="text-xs font-medium text-slate-700 truncate">{f.name}</span>
                        </div>
                        <div className="flex gap-1 ml-2 shrink-0">
                          <button
                            onClick={(e) => { e.preventDefault(); moveFormula(idx, -1); }}
                            disabled={idx === 0}
                            className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            title="Mover para cima"
                          >↑</button>
                          <button
                            onClick={(e) => { e.preventDefault(); moveFormula(idx, 1); }}
                            disabled={idx === selectedFormulas.length - 1}
                            className="px-1 text-slate-400 hover:text-slate-700 disabled:opacity-30"
                            title="Mover para baixo"
                          >↓</button>
                          <button
                            onClick={(e) => { e.preventDefault(); removeFormula(f.id); }}
                            className="px-1 text-red-500 hover:text-red-700"
                            title="Remover"
                          ><X className="w-3.5 h-3.5" /></button>
                        </div>
                      </summary>
                      <textarea
                        value={f.customBody}
                        onChange={(e) => updateFormulaBody(f.id, e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border-t border-slate-200 resize-y focus:outline-none focus:bg-yellow-50"
                        rows={Math.min(f.customBody.split('\n').length + 1, 12)}
                      />
                    </details>
                  );
                })}
              </div>
            )}

            {/* ACTIONS */}
            <div className="border-t border-slate-200 pt-3 space-y-2 mt-auto">
              <button
                onClick={handleCopy}
                disabled={selectedFormulas.length === 0}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition"
              >
                {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar texto'}
              </button>
              <button
                onClick={handlePrint}
                disabled={selectedFormulas.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition shadow"
              >
                <Printer className="w-4 h-4" /> Imprimir / Salvar PDF
              </button>
              <button
                onClick={() => alert('⚙️ Envio por email/Drive requer backend.\n\nVou te entregar o roadmap no Replit.')}
                disabled={selectedFormulas.length === 0}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition shadow"
              >
                <Send className="w-4 h-4" /> Enviar ao paciente (backend)
              </button>
            </div>
          </section>
        </div>

        {/* PREVIEW MODE */}
        {view === 'preview' && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 no-print">
            <div className="bg-white max-w-3xl w-full max-h-[90vh] overflow-y-auto rounded-xl">
              <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white">
                <h3 className="font-semibold">Pré-visualização</h3>
                <button onClick={() => setView('compose')} className="text-slate-500 hover:text-slate-800">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <pre className="p-6 font-mono text-xs whitespace-pre-wrap">{buildFullText()}</pre>
            </div>
          </div>
        )}

        {/* PRINT VERSION */}
        <div className="print-only" ref={previewRef}>
          <div style={{ padding: '40px', fontFamily: 'Times New Roman, serif', fontSize: '11pt' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '2px solid #1e3a8a', paddingBottom: '10px' }}>
              <h1 style={{ fontSize: '18pt', margin: '0', color: '#1e3a8a' }}>INSTITUTO PÁDUA</h1>
              <p style={{ margin: '4px 0', fontSize: '10pt' }}>Dr. Caio Henrique Pádua</p>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Courier New, monospace', fontSize: '10pt' }}>
              {buildFullText()}
            </pre>
            <div style={{ marginTop: '60px', textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', width: '300px', margin: '0 auto', paddingTop: '4px' }}>
                Dr. Caio Henrique Pádua — CRM
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
