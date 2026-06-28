# Onda 2 — Configuração fiscal da NFS-e no Asaas (passo a passo para o CEO)

A tela "Lançador de NFS-e" já está 100% cabeada ao Asaas. A emissão REAL de notas só
funciona depois que a conta Asaas estiver com a parte fiscal configurada. Isso só o dono
da conta (Dr. Caio) consegue fazer no painel do Asaas — não é algo que o sistema faça sozinho.

## Pré-requisitos (o que precisa existir antes)

| Item | O que é | Onde se obtém |
|---|---|---|
| Inscrição Municipal | Cadastro da clínica na prefeitura de São Paulo para emitir NFS-e | Prefeitura de São Paulo (já deve existir para a clínica) |
| Homologação NFS-e | Liberação do webservice de nota da prefeitura para a empresa | Portal da prefeitura de São Paulo (NFS-e) |
| Certificado A1 e-CNPJ | Certificado digital da empresa, arquivo .pfx/.p12 com senha | Autoridade certificadora (ex.: Serasa, Certisign) |
| Emissor Pessoa Jurídica | A nota é emitida pela clínica (PJ). O Asaas NÃO emite NFS-e de pessoa física | A conta Asaas tem de ser PJ (já é) |

## Passo a passo no painel do Asaas

1. Entrar no painel do Asaas com a conta da clínica.
2. No menu lateral, abrir "Notas Fiscais".
3. Abrir "Configurações".
4. Clicar em "Iniciar a configuração".
5. Informar a Inscrição Municipal e os dados fiscais da empresa.
6. Enviar o certificado digital A1 (arquivo .pfx/.p12) e a senha do certificado.
7. Salvar e aguardar a homologação/validação pelo Asaas e pela prefeitura.

## Como saber se já está pronto

- Enquanto NÃO estiver configurado: ao clicar em "Agendar NFS-e" na tela, o sistema mostra o
  erro REAL do Asaas: "Você precisa informar suas informações fiscais antes de emitir notas
  fiscais de serviço". (O sistema nunca finge que emitiu.)
- Depois de configurado: o mesmo botão passa a devolver a nota com status real (Agendada/Autorizada),
  com link de PDF e XML quando o Asaas disponibilizar.

## Dados fiscais já pesquisados (embutidos na tela)

| Campo | Valor | Observação |
|---|---|---|
| ISS (serviço médico, São Paulo) | 2% | Menor faixa do município de São Paulo |
| Código 4.01 | Medicina e biomedicina | Lei Complementar 116/2003 |
| Código 4.03 | Hospitais, clínicas e congêneres | Recomendado para a clínica (default) |
| Código 4.08 | Fisioterapia/fonoaudiologia | Lei Complementar 116/2003 |
| Código 4.06 | Enfermagem | Lei Complementar 116/2003 |

RESUMO EM 1 LINHA: a integração de NFS-e está pronta e testada; falta só o CEO configurar a parte fiscal no painel do Asaas (Inscrição Municipal + certificado A1 + PJ) para a emissão real passar a funcionar.
