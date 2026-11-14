# Bolões e comprovantes — recebimento assistido por robô + Central do gestor

Fonte: ordem do Dr. Caio de 14/11/2026. Complementa `specs/meus-boloes-area-cliente.md` (que continua valendo).
Estado de engenharia: EM CONSTRUÇÃO (sem publicação).

## Princípios (inegociáveis)

1. Nada de documento fictício: o sistema só guarda e entrega arquivo REAL que chegou por canal autorizado.
2. Três estados DISTINTOS por participação, nunca fundidos:
   - Pagamento (informado pela clínica; este sistema NÃO cobra, NÃO usa Asaas): `nao_informado | pendente | confirmado`.
   - Registro da aposta: `pendente_registro | registrada | cancelada`. "registrada" só existe com comprovante ativo.
   - Entrega do comprovante: derivada. `indisponivel | disponivel | baixado` (baixado = último download concluído na auditoria).
3. A IA só LÊ e SUGERE. Quem grava é código determinístico que confere cada campo.
4. Sem integração ou API oficial CAIXA presumida. Sem login, compra ou CAPTCHA automatizado. Canais: pasta dedicada do Drive
   (a clínica controla) e envio manual pelo gestor. Sem canal configurado = pendência honesta, nunca dado inventado.
5. Captação, cobrança de loteria, compra e convites permanecem DESLIGADOS. Pagamentos médicos existentes não são tocados.

## Peças

| Peça | Papel |
|---|---|
| `boloes_recebimentos` (nova) | Quarentena: todo arquivo que chega. Estados: recebido, em_revisao, aprovado, rejeitado, duplicado |
| `boloes_participacoes` (+ colunas) | `pagamento_status`, `pagamento_atualizado_em/por` (aditivo) |
| `boloes_comprovantes` (+ índice) | único (empresa, sha256) entre ativos: o mesmo arquivo não vale para duas participações |
| `lib/boloes-leitura.ts` | Leitura por IA (Gemini, guard ai-central) + conferência e casamento determinísticos |
| `lib/boloes-robo.ts` + job no api-worker | Vigia a pasta do Drive da clínica, ingere, lê, tenta casar; opcional aprovação automática |
| Rotas do gestor `/api/boloes/*` | Fila, aprovar, rejeitar, reassociar, revogar, pagamento, configuração, auditoria |
| Tela `/boloes` (padcom) | Central do gestor, mobile-first |
| `MeusBoloesCliente` (atualizada) | Trilha de 3 estados, selo de integridade, acessibilidade |

## Regras de conferência e casamento

- Campos lidos (todos opcionais, nulos quando ausentes): concurso, data do sorteio, código do recibo, cotas, valor, nome
  impresso, emissor, menciona CAIXA, confiança (0 a 1).
- Candidata = participação da MESMA clínica, não cancelada, sem comprovante ativo, cuja campanha tem o mesmo concurso (e a mesma
  data, se ambas existirem), com as mesmas cotas (se lidas) e nome compatível (se lido).
- Exatamente 1 candidata = sugerida. 0 ou 2+ = fila de revisão com motivo. O robô nunca escolhe entre duas.
- Aprovação automática: DESLIGADA por padrão (chave por clínica, só o gestor liga). Exige: origem robô, confiança >= 0,90,
  menciona CAIXA, concurso + data + código lidos, 1 candidata, sem duplicata. Qualquer dúvida cai na fila.
- Aprovação humana sempre exige confirmação explícita de que é recibo real recebido por canal autorizado.

## Falhas previstas e barreiras

| Gravidade | Falha | Barreira | Teste |
|---|---|---|---|
| Crítica | IA inventa/erra campo e libera recibo ao participante errado | casamento determinístico, 1 candidata, nome divergente exclui, auto desligado por padrão | casamento e aprovação |
| Crítica | Gestor de outra clínica vê/aprova | todas as consultas filtram pela empresa do contexto | isolamento |
| Crítica | Mesmo arquivo em duas participações | índice único por sha256 entre ativos + checagem na quarentena | duplicidade |
| Alta | Perda de arquivo na reassociação | reassociar muda só o vínculo, mantém o arquivo, grava antes/depois | reassociar |
| Alta | Robô reprocessa o mesmo arquivo do Drive | id do arquivo único por clínica | robô |
| Alta | Pasta de uma clínica lida com a configuração de outra | configuração por clínica; sem pasta = não faz nada | robô |
| Média | Falha da IA trava a fila | falha vira "em revisão: leitura falhou"; revisão humana segue funcionando | leitura |
| Média | Cliente vê estado que não existe | estados derivados no servidor | estados |

## Fora desta entrega (pendente)

Amostras reais de recibo para calibrar o prompt; canal oficial da lotérica/CAIXA (não presumido); leitura de Gmail e
WhatsApp (não verificados); aviso ao cliente quando o recibo for liberado (envio exige decisão); antivírus.
