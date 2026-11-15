# Grupo VIP e Conexão Milionária (15/11/2026)

## Regras
1. Nome visível: "Grupo VIP" (antes "Clube VIP"/"Club VIP"). Independe de Prata, Ouro, Platinum e Diamond.
2. Adesão voluntária: a clínica convida (registro), só o próprio cliente aceita, recusa ou sai, no portal. Nada é enviado ao cliente pelo sistema.
3. Bolão nasce como rascunho. Só aberto aparece para membros ativos da mesma clínica. Abrir exige "dezenas por jogo".
4. Entrar no bolão é ato do cliente e não gera cobrança nem aposta. Limite de cotas é atômico (trava da campanha).
5. Jogos: quem escolhe segue a regra do bolão (clínica ou participante). Quantidade exata = cotas x jogos por cota; dezenas distintas, dentro do universo. Travam quando há comprovante ativo.
6. "Efetivado" só existe com comprovante oficial ativo. Sem ele: "escolhido, sem comprovante oficial".
7. Natureza do comprovante (nominativo x cota oficial individual) é classificada pelo gestor; nunca presumida.
8. Cobrança Asaas: apenas VINCULA cobrança já existente no livro `asaas_cobranca_financeiro` da mesma clínica (linha sem empresa é recusada) e LÊ o estado. Não cria cobrança, não chama o Asaas.

## Contrato da automação CAIXA (PENDENTE, não implementada)
- `GET /api/boloes/gestao/automacao` responde sempre `estado: "pendente"`, `registraJogos: false`, `coletaComprovantes: false`.
- Pré-requisitos para implementar: acesso formalmente autorizado pela CAIXA/lotérica, ambiente isolado (worker próprio), credenciais no cofre, entrada de comprovantes somente via fluxo existente de recebimento e conferência humana.
- Prova de conceito isolada: `tools/lottery-engine-poc` (127.0.0.1, sem CAIXA, sem credenciais).

## Evidências (dados sintéticos, banco descartável)
- `artifacts/api-server/src/tests/grupo-vip-banco-isolado.test.ts`: 13 testes.
- E2E: `e2e/grupo-vip-conexao-milionaria.spec.ts` (8), `e2e/area-cliente-categoria-club-vip.spec.ts` (20), `e2e/menu-clube-vip-conexao-milionaria.spec.ts` (8).
- Capturas: `generated-artifacts/grupo-vip-*.png` (não versionadas).
