/**
 * PADRÃO ÚNICO DO GRÁFICO DE LINHA COM FAIXAS (Pulso Diário é a referência).
 * Usado por GraficoZonas (Pulso, antropometria) e EvolucaoExamesPanel (exames, cockpit e Área do Cliente).
 * Regra escrita em .agents/skills/skill-layout-paxter/references/grafico-linha-faixas.md
 * Mudou aqui, muda em todos os gráficos. Proibido escrever espessura, opacidade ou tamanho de marcador solto na tela.
 */
export const GRAFICO = {
  linhaPrincipal: 1.25,        // espessura da linha de dados (a "finazinha" do Pulso)
  linhaFantasma: 1,            // extensão tracejada das pontas
  faixaPreenchimento: 0.18,    // fillOpacity de cada faixa colorida
  faixaContorno: 0.25,         // strokeOpacity de cada faixa
  alturaPx: 240,
  larguraPorPonto: 56,
  fantasmaLado: 8,             // quadradinho tracejado nas pontas
  ativoLado: 10,               // quadradinho vazado PRETO do ponto ativo
  ativoContorno: 1.5,
  ativoCor: "#000",
} as const;
