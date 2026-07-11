# Spec — Cockpit da Consulta: cabeçalho em relevo, layout compacto e Acompanhamento Diário (Pulso Diário)

Data: 15/07/2026 · Autor: Dr. Replit Paxter · Loop: Paxter (Especificar → Construir → Revisar)
Pedido do CEO Dr. Caio (por voz). O CEO autorizou "limitação zero, não me pergunte nada, me surpreenda" — por isso NÃO houve entrevista; o alvo abaixo é a interpretação fiel do pedido.

## Objetivo (uma frase)
Reformar o cabeçalho e o layout do Cockpit da Consulta (/cockpit-cliente) para ficar compacto, elegante e em relevo 3D (campos "recuados"/inset bevel), corrigir a data de nascimento para o padrão brasileiro, e acrescentar uma faixa de ACOMPANHAMENTO DIÁRIO (Pulso Diário) com os dados que o cliente reporta pela mensageria (energia, disposição, pressão arterial e glicemia por manhã/tarde/noite), tudo data-bound (persistido no banco), demonstrado num cliente de teste "Rogério Juarez".

## Requisitos exatos (numerados)

### A. Correção de data (bug real)
A1. A data de nascimento no crachá aparece hoje como ISO cru ("1971-08-18T00:00:...", ano na frente) porque o parser monta uma string inválida a partir de um timestamp completo. Corrigir para SEMPRE exibir no padrão brasileiro dia/mês/ano (ex.: 18/08/1971).
A2. Auditar TODAS as datas visíveis do cockpit (crachá + evolução) e garantir dia/mês/ano; nenhuma data pode vazar em formato ano-primeiro.
A3. O cálculo de idade deve continuar correto após a correção do parser.

### B. Cabeçalho (crachá) em relevo 3D — "inset bevel"
B1. Cada campo do cadastro (Nascimento, Tipo Sanguíneo, Endereço, Como conheceu, etc.) fica dentro de uma "caixa recuada" (classe `concave-3d`, o well/poço do sistema de design Paxter), com rótulo dourado em cima e valor navy embaixo.
B2. Cada bloco clínico (Patologias, Suspeitas, Alergias, Medicações, Hábitos) também em caixa recuada.
B3. Manter a regra de grade fixa (Padrão 12/13): campo sem dado nunca some, mostra "—".
B4. Manter honestidade (Art. 47): nada inventado no render; ausência = "—". Cor de status clínico continua vindo do dado real (redFlag da anamnese).

### C. Layout compacto (revisão geral)
C1. Reduzir a margem lateral do conteúdo (hoje `px-7` = 28px de cada lado) para no máximo ~12–16px, aproximando os blocos das bordas e liberando área útil para o cockpit.
C2. Encolher a zona de IDENTIDADE (hoje 340px + foto 76px) para ocupar menos espaço horizontal, sem perder legibilidade do nome.
C3. Encolher a área de seleção do nome na faixa de topo (o CEO reclamou que "a seleção do nome ocupa espaço grande"): faixa de topo enxuta.
C4. As "aletas" (abas) devem melhorar visualmente: relevo 3D (aba ativa saliente/bevel dourado, inativas discretas), sem parecer chapadas.

### D. Acompanhamento Diário (Pulso Diário) — NOVO
D1. Nova tabela `pulso_diario` (banco), NATIVA (sem tag de origem), com uma leitura por (cliente, data, período). Campos: energia (0–10), disposição (0–10), sono (0–10), pressão sistólica, pressão diastólica, glicemia (mg/dL), humor (texto curto), observação, origem (ex.: "whatsapp"), período (manha|tarde|noite), data (YYYY-MM-DD).
D2. Endpoints (Express, montados como os demais; padrão de fetch cru já usado pelos painéis-irmãos do cockpit — decisão deliberada, sem passar por OpenAPI/Orval): 
   - `GET /api/pulso-diario/:clientId?dias=N` (default 14) — leituras recentes ordenadas.
   - `POST /api/pulso-diario/:clientId` — upsert de uma leitura (uso: semear demo hoje e, no futuro, o webhook de resposta da mensageria). Validação zod; upsert por (cliente,data,período).
D3. Faixa visual no cabeçalho do cockpit mostrando o Pulso Diário do cliente: métricas nas linhas (Energia, Disposição, Sono, Pressão, Glicemia) × colunas manhã/tarde/noite do dia mais recente, em caixas recuadas (inset bevel), com uma indicação de tendência simples e cores de status honestas (ex.: glicemia alta = âmbar/vermelho; pressão alta = âmbar/vermelho) SEM inventar diagnóstico.
D4. Estado vazio honesto: cliente sem registros mostra "Sem registros do cliente ainda" (não inventar valores).
D5. Deixar explícito (comentário no código + nota nesta spec) que a CAPTURA inbound (receber a resposta do cliente pelo WhatsApp e gravar) é fase futura; agora o motor GRAVA (POST) e LÊ (GET), e o demo é semeado por POST.

### E. Cliente de demonstração "Rogério Juarez"
E1. Criar (ou reutilizar se já existir) um cliente de teste chamado "Rogério Juarez", `is_teste = true`, com cadastro completo e coerente (idade, endereço, contato).
E2. Preencher a fichaClinica com dados clínicos fictícios porém COERENTES e data-bound (patologias, suspeitas, alergias, medicações contínuas, hábitos, tipo sanguíneo, sexo) — para o crachá mostrar tudo preenchido.
E3. Semear leituras de Pulso Diário dos últimos ~14 dias (manhã/tarde/noite) coerentes com o quadro (ex.: hipertenso com pressão às vezes elevada, glicemia limítrofe), para a faixa de acompanhamento aparecer rica.
E4. SEGURANÇA CLÍNICA: NÃO gravar dados clínicos fictícios em prontuário de paciente REAL. Só no cliente de teste. (Motivo: sistema clínico de verdade; Art. 47/zelo.)

### F. Persistência / operação real (bug relatado)
F1. Testar de ponta a ponta agindo como o médico: selecionar "Rogério Juarez", navegar entre abas, sair da tela e voltar, recarregar a página — a seleção e os dados do cabeçalho e do pulso devem PERMANECER (já há persistência por localStorage + URL; validar que funciona e corrigir se houver falha real).
F2. Confirmar por screenshot que cabeçalho, campos recuados, data BR, aletas em relevo e faixa de Pulso Diário aparecem corretos.

## Casos extremos a tratar
- birthDate como timestamp completo (com T e Z) e como "YYYY-MM-DD" — ambos devem render dd/mm/aaaa.
- Cliente sem fichaClinica / sem pulso → "—" e estado vazio, sem quebrar.
- Período do dia ausente (ex.: cliente só reportou de manhã) → célula "—".
- Upsert de pulso repetido no mesmo (cliente,data,período) → atualiza, não duplica.
- listClients deve continuar retornando o cliente de teste (para poder selecioná-lo).

## Definição de PRONTO
- Data de nascimento e todas as datas do cockpit em dd/mm/aaaa (screenshot comprova).
- Campos do cabeçalho e blocos clínicos em caixas recuadas (inset bevel), layout mais compacto (margens estreitas, identidade e seleção enxutas), aletas em relevo.
- Tabela + endpoints de Pulso Diário funcionando (curl comprova GET/POST).
- Faixa de Acompanhamento Diário renderiza data-bound para "Rogério Juarez" (screenshot comprova) e mostra estado vazio honesto para quem não tem dado.
- Cliente de teste "Rogério Juarez" criado e selecionável, com cadastro e pulso semeados.
- Persistência validada (sair/voltar/recarregar mantém seleção e dados).
- architect aprova requisito por requisito, zero pendência.

## Linhas vermelhas
- NÃO gravar dado clínico fictício em paciente real (só no cliente de teste is_teste).
- NÃO tocar no motor de mensageria/agenda/orçamento por estética.
- NÃO truncar a tabela `clients` nem qualquer tabela populada (memória: transmutação IHE).
- NÃO inventar dado no render (Art. 47); ausência = "—"/estado vazio.
- Preservar identificadores técnicos (colunas, tokens, UIDs). Só o visível ao médico muda.
