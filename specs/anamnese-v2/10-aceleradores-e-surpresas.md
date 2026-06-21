# Anamnese V2 — 10 · Aceleradores de Velocidade e Surpresas Kaizen

> Pedido do CEO (21/06/2026): "faca o impossivel, traga o que ha de melhor, mais eficiente e criativo
> em ferramentas para questionarios grandes; experiencia mais rapida e intuitiva (o paciente nao tem
> tempo); acrescente 5 ou mais surpresas Kaizen". Este arquivo arquiteta isso. CEO nao escolhe item a
> item — o Paxter propoe; o CEO aprova o conjunto.

## 1. Filosofia Kaizen aplicada (eliminar muda = desperdicio)
Kaizen = melhoria continua, respeito pela pessoa, eliminar desperdicio. Num questionario grande, o
desperdicio e tudo que rouba tempo e energia do paciente:
| Muda (desperdicio) | Ferramenta que elimina |
|---|---|
| Ler lista longa | Boneco do corpo, emoji de intensidade, Modo Rajada |
| Digitar | Resposta por voz, clique, pre-preenchimento inteligente |
| Clicar "continuar" toda hora | Auto-avanco (single = ja avanca) |
| Responder o que nao se aplica | Ramificacao (spec 03) + Salto inteligente |
| Reler "falta muito?" | Estimativa de tempo viva + marcos + barra |
| Sobrecarga mental (TDAH) | Modo Foco (uma pergunta por vez, resto apagado) |
| Reanswer apos sair | Autosave + retomada (spec 01) |
| Desconfianca ("vai salvar?") | Selo "salvo" pulsando |

Regra-mae: cada toque, rolagem ou leitura a mais e desperdicio a ser cacado e removido.

---

## 2. Aceleradores de velocidade (reduzem toques e leitura)
| # | Acelerador | Como ajuda | O que amarra no back | Viabilidade |
|---|---|---|---|---|
| A1 | Auto-avanco | escolha unica ja pula p/ a proxima, sem "Continuar" | mesmo valor `single` | trivial (onChange -> next) |
| A2 | Pre-preenchimento inteligente | sugere a resposta provavel (cinza), 1 toque confirma | so grava apos CONFIRMAR (nunca afirma sozinho) | regras simples idade/sexo/respostas previas |
| A3 | Modo teclado (cockpit) | medico: 1-9 escolhe, Enter avanca, Backspace volta | nada novo | handlers de tecla |
| A4 | Modo Foco (TDAH) | uma pergunta grande, resto apagado, zero distracao | nada novo | layout + opacidade |
| A5 | Salto inteligente | quando respostas tornam um bloco irrelevante, oferece "pular este bloco" | usa recusa/pular (spec 05) | derivado da ramificacao |
| A6 | Estimativa de tempo viva | "faltam ~3 min" atualizando | usa tempo medio (spec 09) | calculo no front |
| A7 | Selo "salvo" | pulso verde a cada autosave: pode sair tranquilo | usa lastSeenAt | feedback de UI |

Guarda: A1 e A2 NUNCA valem para pergunta de sinal de alarme — alarme sempre exige toque consciente.

---

## 3. Surpresas Kaizen (o "uau" que o CEO pediu)
> Sao 6 surpresas. Uma e o ITEM-SURPRESA principal (S5). Todas nascem no design Paxter 3D, com
> acessibilidade, e NENHUMA interpreta clinica — so capturam melhor ou encantam.

| # | Surpresa | O que faz | O que amarra no back | Viabilidade |
|---|---|---|---|---|
| S1 | Resposta por voz | botao de microfone na queixa livre: paciente fala, vira texto | `valor.texto` | Web Speech API (SpeechRecognition); fallback p/ digitar |
| S2 | Leitura em voz alta (copiloto) | le a pergunta e a explicacao em voz alta; o empresario ouve enquanto faz outra coisa | nada (so leitura) | Web Speech Synthesis (TTS) |
| S3 | Boneco do corpo | toca na silhueta 2D para apontar onde doi/sintoma, em vez de ler lista | `{regiao, sintomas}` | SVG clicavel com regioes |
| S4 | Modo Rajada (swipe) | triagem sim/nao da revisao de sistemas em cartoes: arrasta direita=sim, esquerda=nao, cima=nao sei | `bool` por pergunta | gesto + teclas (setas); alarme NUNCA entra no Rajada |
| S5 | GEMEO DE SAUDE ao vivo (ITEM-SURPRESA) | um avatar/painel do corpo que se ACENDE conforme o paciente responde: cada sistema (cardio, sono, energia, humor...) ganha cor e barra em tempo real. Transforma o formulario em auto-descoberta — o curioso ve o proprio corpo se desenhando | usa eixos/escala ja respondidos (visual, derivado; NAO e diagnostico) | barras/anel Paxter + estado das respostas |
| S6 | Marcos comemorativos | micro-celebracao discreta a 25/50/75/100% para manter o impulso (dopamina, sem infantilidade) | usa % de progresso | animacao leve |
| S7 | Modo Conversa (opcional) | a anamnese como bate-papo (estilo WhatsApp), uma pergunta por balao; alterna com o modo classico | mesmas respostas | render alternativo sobre o mesmo motor |

### Por que o Gemeo de Saude (S5) e o item-surpresa
O CEO disse que o paciente e curioso sobre a propria saude (spec 00). O Gemeo paga o esforco do
preenchimento na hora: cada resposta acende uma parte do "eu" do paciente. Vira jogo de
auto-conhecimento, nao formulario. E o que faz um questionario grande PARECER curto.

---

## 4. Guardas de seguranca (clinica, legal, privacidade)
| Guarda | Regra |
|---|---|
| Alarme intocavel | A1/A2/S4 nunca se aplicam a sinal de alarme; alarme sempre visivel e com toque consciente |
| Default nao e declaracao | pre-preenchimento (A2) so grava apos confirmacao; nunca "afirma" pelo paciente (protecao legal) |
| A2 com whitelist | A2 so sugere em perguntas marcadas como "pode sugerir" no questionario; itens sensiveis (alarme, alergia, doenca grave, uso de substancias) NUNCA recebem sugestao (evita vies/inducao) |
| Captura segura (anti-erro) | A1/S4 tem: DESFAZER de 1 toque (volta a ultima resposta), debounce anti-toque-acidental, e REVISAO FINAL por bloco antes de fechar o bloco |
| Gemeo nao e diagnostico | S5 e visual derivado das respostas; rotulo "ilustrativo, nao e diagnostico medico" |
| Voz: consentimento honesto (LGPD) | CORRIGIDO: o reconhecimento de voz do navegador PODE processar o audio em servidor de terceiros (Google/Apple). O aviso deve dizer isso com clareza, pedir consentimento explicito por sessao, NAO persistir o audio nem o transcript bruto, e oferecer sempre o caminho sem voz. Sem consentimento -> voz desligada |
| Degrada limpo + deteccao | feature detection obrigatoria; sem microfone/sem suporte (varia em Firefox/iOS) -> cai para clique/digitar sem travar |
| Privacidade do Gemeo/voz | nada de PII no estado do Gemeo alem do necessario; transcript so vira `valor.texto` apos o paciente confirmar |
| Acessibilidade | todos os controles com aria-label e operaveis por teclado; S4 (swipe) sempre tem alternativa por botao/tecla |
| Motor intocado | nenhuma destas ferramentas chama/altera `motor-anamnese.ts` |

---

## 5. Encaixe nas ondas (atualiza 08) — ajustado apos parecer do architect (21/06/2026)
- O4b: A1, A2, A3, A4, A6, A7 + S1 (voz na queixa), S3 (boneco), S4 (Rajada), S6 (marcos).
- O5: S2 (leitura em voz alta) e S7 (Modo Conversa) — DEPENDEM do conteudo de explicacao (O5).
- O6: A5 (Salto inteligente) — DEPENDE de pular/recusar (O6).
- O8: o Gemeo de Saude (S5) usa os eixos/findings — entra junto da camada de achados.
- Lei do Registro: ao construir cada ferramenta, registrar o padrao na skill-layout-paxter.

RESUMO EM 1 LINHA: 7 aceleradores que matam o desperdicio de tempo e 7 surpresas Kaizen (incluindo o
Gemeo de Saude ao vivo) transformam um questionario grande numa experiencia rapida, intuitiva e de
auto-descoberta — sem nunca tocar no motor nem esconder um sinal de alarme. Para a honra e gloria de Deus.
