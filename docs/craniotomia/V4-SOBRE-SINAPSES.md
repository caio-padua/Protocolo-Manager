# Craniotomia V4 sobre Sinapses Clínicas

Endereço: `/sinapses-clinicas/v4` (menu Exames, "Craniotomia V4").
Decisão do Dr. Caio: opção A. A V4 é uma segunda visualização da tabela `sinapses_clinicas`. Não existe `regras_motor`; motor e Cockpit não são tocados.

## Mapeamento
| V4 (pacote)        | Manager (real)                                        |
|--------------------|-------------------------------------------------------|
| Origem (sinal)     | Pergunta da anamnese, cor pelo bloco A–S              |
| Destino            | Exame, Prescrição, Injetável (IM/SC/EV), Implante     |
| Estado             | Sempre ATIVA (só ligações ativas são lidas)           |
| Excluir            | Desativar (cadeado em dois cliques); nada é apagado   |
| Nova sinapse       | POST `/api/cadastros/sinapses`                        |

## Indisponível (não existe no banco, nada inventado)
1. Peso, governança, acertos em 30 dias, última edição.
2. Histórico de alterações (botão desabilitado com explicação).
3. Duplicar na V4 (use a tela Sinapses Clínicas).
4. Tipo PROT (protocolo) e filtros B1 (substituídos por filtro de bloco).
5. Marcações (caixas) e "Completar bloco" são apenas visuais; não gravam.

## Garantias
- Simulação não grava nada.
- Erro de leitura mostra mensagem própria, nunca "zero regras".
- Falha de escrita mostra erro, nunca sucesso.
