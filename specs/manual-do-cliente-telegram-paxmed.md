# Manual do Cliente — falar com a clínica pelo Telegram e descobrir que o PaxMed também é dele

Estado: **SPEC (planejamento). Nada construído.** Pedido do Dr. Caio em 17/11/2026.
Aguarda a escolha de escopo da seção 6 antes de qualquer código.

## 1. Objetivo (uma frase)
Um manual que ensine o cliente a conversar com a clínica pelo Telegram e, ao mesmo tempo, mostre o **PaxMed** como um
sistema que serve a **ele**: não só ao tratamento com a clínica, mas também aos remédios e planos que ele faz com outros
médicos (lembretes, plano à parte), de modo que ele queira usar o PaxMed no dia a dia.

## 2. O que já existe (verificado em 17/11/2026)
| Peça | Situação |
|---|---|
| Página pública `/guia-digital` (793 linhas, `pages/guia-digital/index.tsx`) | Ensina instalar o aplicativo (iPhone, Android, computador), entrar na Área e vincular o Telegram, com áudio e QR. Funciona e é multiclínica (`?tenant=`) |
| Envio do guia pela equipe | `/comunicacao/guia-paciente` + `POST /api/onboarding/enviar-guia` (e-mail, WhatsApp, Telegram) |
| Porta de entrada do bot | `central-telegram/PortaEntrada.tsx` (link e QR do bot para a equipe mostrar) |
| Vínculo do Telegram | senha de ativação de 6 letras recebida pelo WhatsApp; o bot grava o chat do cliente |
| Motor de lembretes por período | `lembretes_prescricao` (5 registros) + job do worker; **só a clínica cria** os lembretes, a partir do protocolo. Hoje o cliente não cadastra nada |
| Área do Cliente (`/area`) | protocolo, sessões, exames, pagamentos, fotos |

Diagnóstico do guia atual:
1. O nome **PaxMed não aparece** em nenhum texto do guia (0 ocorrências). Só o nome da clínica.
2. Usa "Área do Paciente" e "paciente" (10 ocorrências); o vocabulário do Padcon Conect é **cliente**.
3. Não explica o que o cliente pode **pedir/fazer** pelo Telegram, só como vincular.

## 3. O que NÃO existe e não pode ser prometido no manual
| Ideia do Dr. Caio | Situação real |
|---|---|
| Cliente cadastra os remédios dele (de outros médicos) | **Não existe.** Hoje só a clínica cria lembretes |
| A ferramenta lembra o cliente de tomar | Existe o motor de lembretes, mas ele só roda para lembretes criados pela clínica |
| Plano pessoal à parte, separado do tratamento da clínica | **Não existe** |

Regra deste projeto: não vender automação fictícia. O manual só descreve como "disponível" o que funciona.
O recurso pessoal pode aparecer como "em preparação" **somente** se o Dr. Caio aprovar esse rótulo; caso contrário, fica
fora do texto até existir.

## 4. Conteúdo proposto do manual (estrutura)
Tom: frases curtas, linguagem simples, "cliente", nome da clínica como remetente (`empresas.nome`), **PaxMed** como o sistema.

| Parte | Conteúdo |
|---|---|
| 1. O que é o PaxMed | "O PaxMed é o sistema que cuida do seu tratamento. Ele fica com você, não só com a clínica." Marca PaxMed bem visível no topo |
| 2. Instalar no celular | reaproveitar os passos atuais (iPhone, Android, computador) |
| 3. Entrar | CPF e data de nascimento, como já funciona |
| 4. Falar com a clínica pelo Telegram | instalar, achar o bot, enviar a senha de 6 letras, o que escrever, o que esperar de resposta e em quanto tempo, o que NÃO enviar pelo Telegram (urgência clínica = telefone/serviço de emergência) |
| 5. O que o PaxMed faz por você | só funções reais: lembretes das fórmulas da clínica, próximas sessões, exames, documentos, pagamentos, fotos de evolução |
| 6. Seus remédios e planos com outros médicos | **somente quando o recurso existir** (ver seção 3) |
| 7. Privacidade | quem vê seus dados, como revogar, como falar com a clínica |

## 5. Falhas previstas
| Falha | Gravidade | Tratamento |
|---|---|---|
| Prometer lembrete pessoal que não existe | Alta | seção 6 do manual só entra com o recurso pronto, ou rotulada como "em preparação" com aprovação expressa |
| Cliente tratar o Telegram como canal de urgência | Alta | aviso fixo e claro de que urgência não vai pelo Telegram |
| Misturar o remédio de outro médico com o protocolo da clínica | Alta | futuro recurso pessoal em tabela e tela **separadas**, com selo "informado por você" |
| Texto chamar o cliente de "paciente" ou usar o nome do sistema como remetente | Média | revisar todo o guia: cliente, clínica como remetente, PaxMed como sistema |
| Link do guia sem endereço configurado (`VITE_AREA_URL`) | Média | o guia já avisa; conferir antes de enviar |

## 6. Escopo — decisão pendente do Dr. Caio
| Opção | O que entrega |
|---|---|
| A (recomendada) | Refazer o guia atual como **Manual do Cliente**: PaxMed visível, vocabulário "cliente", Telegram completo (vincular e conversar) e só funções reais. O recurso pessoal vira uma etapa seguinte, com spec própria |
| B | Construir primeiro o recurso "Meus lembretes pessoais" e só depois escrever o manual completo |
| C | Manual já com a parte pessoal descrita como "em preparação" |

## 7. Etapa seguinte (se A): "Meu PaxMed pessoal" (spec própria futura)
Rascunho para não perder a ideia, sem construir:
- Cliente cadastra remédio, dose, horários e prescritor (texto livre), com selo **"informado por você"**.
- Reutiliza o motor de lembretes existente com origem "cliente", em registro separado do protocolo da clínica.
- Canal por preferência do cliente (Telegram, WhatsApp ou aviso no aplicativo), com consentimento.
- A clínica **não** aprova nem altera o plano pessoal; só o vê se o cliente autorizar. Nenhum conselho clínico automático
  sobre remédios de outros médicos.
- Perguntas de risco que precisam de decisão do Dr. Caio: aviso de interação medicamentosa (responsabilidade e base de
  dados), vínculo ao prontuário, retenção e quem pode ver.
- LGPD: dado de saúde sensível, finalidade e consentimento próprios.

## 8. Linhas vermelhas
Não publicar; não enviar mensagem real a clientes; não alterar autorizações nem vínculos do Telegram; não apagar o guia
atual (versionar o novo e manter o antigo até aprovação); não inventar recurso.

## 9. Prova prevista (quando houver construção)
SMOKE (página abre, marca PaxMed visível), DADO (nome da clínica vem do cadastro, `?tenant=`), VISUAL (celular e desktop,
tema claro e escuro, áudio), LOG (sem erro no navegador). Dados fictícios, sem envio real.
