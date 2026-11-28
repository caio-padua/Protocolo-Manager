# Locais de atendimento por empresa, com modalidade

## Objetivo
Mostrar os locais separados por EMPRESA e subdivididos por Estado > Cidade > Região, com selo visual
que diz de relance como o local atende: SEDE, OUTRO ENDEREÇO, ONLINE ou A DEFINIR.

## Regras do CEO (07/11/2026)
- Agenda "LOCAL" = atende no endereço da própria empresa.
- Agenda "REMOTO" = online OU outro endereço físico. Não se presume: fica A DEFINIR até o CEO informar.
- Nada é apagado (Regra de Ouro): só ADD COLUMN.

## Dados (ADD COLUMN em locations)
- modalidade text NULL ('presencial' | 'online'; NULL = a definir) com CHECK.
- mesmo_endereco_empresa boolean NOT NULL DEFAULT false.
- Migração: scripts/migrations/20261107_locais_modalidade.sql (incluída em scripts/migrations.sql).

## Regras de API
- GET /locations devolve empresaId, empresaNome, modalidade, mesmoEnderecoEmpresa, enderecoEmpresa.
- Sede: o endereço exibido é sempre o ATUAL da empresa (sobreposição na leitura) e é gravado nas colunas ao salvar (outros consumidores leem as colunas).
- mesmoEnderecoEmpresa=true exige modalidade presencial (422 caso contrário).
- Passar para online desliga o sinalizador e preserva o endereço antigo.

## Falhas previstas
| Falha | Defesa |
| Empresa muda de endereço e a sede fica velha | leitura sobrepõe pelo endereço da empresa |
| "Sao Paulo" x "São Paulo" viram 2 cidades | agrupamento compara sem acento |
| Presumir REMOTO como online | modalidade NULL = selo A DEFINIR |
| Empresa sem endereço lido | 422, nada é gravado |
| Endereço da empresa editado depois | colunas do local só atualizam ao salvar o local (limite conhecido) |

## Telas
- clinicas.tsx + locais/ (LocaisPorEmpresa, LocalCard, locais-modo).
