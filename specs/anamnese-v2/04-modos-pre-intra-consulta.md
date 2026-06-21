# Anamnese V2 — 04 · Modos: Paciente, Pre-consulta (enfermeira), Intra-consulta (medico)

## 1. Tres modos (campo `mode` na sessao)
| Modo | Quem preenche | Como entra | Diferencas de tela |
|---|---|---|---|
| paciente | o proprio cliente | link enviado (WhatsApp/e-mail) | linguagem acolhedora, sem jargao, video nas dificeis |
| enfermeira | enfermeira COM o paciente | chamada online; enfermeira abre pelo cockpit | mostra dica clinica curta ao lado; pode anotar observacao |
| medico | o medico (paciente ja conhecido) | atalho no cockpit | modo RAPIDO: navegacao por teclado, preenchimento agil |

## 2. Pre-consulta com enfermeira (triagem guiada)
- Fluxo: medico/cockpit gera a sessao (mode=enfermeira) e a enfermeira liga para o paciente.
- A enfermeira ve a MESMA anamnese + um trilho lateral "conduzir" com a explicacao pronta para
  ler em voz alta (reaproveita o texto do HelpModal).
- Campo de observacao da enfermeira por grupo (entra no RAS, nao no score).
- Ao concluir, a sessao ja fica ligada ao cliente e visivel no prontuario.

## 3. Intra-consulta / atalho do medico (paciente que ja conheco no papel)
- No cockpit/ficha do cliente: botao "Refazer anamnese rapido" (atalho do medico).
- Abre mode=medico: o medico clica rapido (paciente conhecido, anamnese ja no papel) e salva.
- Pre-preenchimento opcional por PERFIL (padrao DEMO_PROFILES do padcom-saas) para acelerar e
  para TESTE: perfis fkeceis (basico/avancado/full) que populam respostas plausiveis.

## 4. Distribuicao do link
- Botao "Enviar anamnese" na ficha do cliente: gera link `/anamnese/s/:token` e oferece
  WhatsApp (mensagem pronta) + e-mail (Gmail API ja integrada).
- "Pedir para a enfermeira": cria a sessao mode=enfermeira e notifica (card/task) a enfermeira_01.

## 5. Seguranca por modo
- paciente: identifica por CPF + data de nascimento (igual portal atual), erro generico.
- enfermeira/medico: ja autenticados no sistema (admin); sessao amarrada ao profissional.
- token do link tem TTL; recusa/abandono sao registrados na sessao.

RESUMO EM 1 LINHA: a mesma anamnese serve em tres modos — paciente sozinho por link, enfermeira
conduzindo online, ou medico preenchendo rapido pelo cockpit — com perfis de pre-preenchimento para agilizar e testar.
