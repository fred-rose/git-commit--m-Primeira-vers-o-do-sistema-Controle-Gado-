# Migração financeira e exportação Excel

Fonte analisada em 09/09/2026: `C:\Users\patai\Downloads\Controle do Gado V2.xlsx`.

SHA-256 do arquivo original: `8c01e44f940ba305b9fcabfcd1110a19639d454d32bdc51ce8cf3d0249759e5c`.

O arquivo original foi somente lido. A extração é reproduzível por `scripts/migrate-finances.js`; os registros resultantes estão em `js/data/financial-seed.js`. A auditoria por aba, linha, saldos e registros pendentes está em [financial-migration-audit.json](financial-migration-audit.json).

## Abas utilizadas

| Aba (nome exato no arquivo) | Linhas importadas | Registros | Entradas | Despesas | Saldo calculado |
| --- | --- | ---: | ---: | ---: | ---: |
| Movimentação Financeira - Varia | 2–12 | 11 | R$ 154.386,88 | R$ 99.854,99 | R$ 54.531,89 |
| Movimentação Financeira - Apênd | 2–34 | 33 | R$ 22.183,14 | R$ 18.229,22 | R$ 3.953,92 |
| **Total** | | **44** | **R$ 176.570,02** | **R$ 118.084,21** | **R$ 58.485,81** |

Ambas usam os cabeçalhos `Data`, `Descrição`, `Operação`, `Valor ` e `Valor Total` na primeira linha. As fórmulas de `Valor Total` confirmam que essa coluna representa o saldo acumulado, e não o valor de uma nova operação. Os 44 saldos intermediários calculados em centavos conferem com os saldos originais arredondados.

Foram ignoradas duas linhas de cabeçalho e 1.954 linhas sem lançamento: 988 em Varia e 966 em Apênd, incluindo fórmulas que retornam texto vazio. Nenhum lançamento duplicado foi identificado entre essas duas abas.

## Campos e interpretações

| Campo original | Uso no sistema |
| --- | --- |
| Data | Data civil em `AAAA-MM-DD`, exibida como `DD/MM/AAAA`. A data original também é preservada. |
| Descrição | Texto original preservado, inclusive grafias, espaços e expressões particulares. |
| Operação = Entrada | Receita financeira, tipo `Entrada`. |
| Operação = Saída | Despesa financeira, tipo `Despesa`. Não é uma saída de animais. |
| Valor | Valor total em centavos inteiros, sem multiplicação por quantidade de animais. Valor original também preservado. |
| Valor Total | Saldo histórico da aba, guardado exclusivamente para conferência. Não soma às entradas ou despesas. |
| Proprietário / propriedade / observação | Colunas inexistentes nessas duas abas: ficam vazias. Nomes citados na descrição não foram usados para presumir propriedade do lançamento. |
| Categoria | Não existe nas abas: sugestão conservadora a partir da descrição, sem mudar seu texto original. |
| Origem | `migration`, com arquivo, hash, aba, linha e campos originais. |
| createdAt | Momento de preparação da migração; não substitui a data do lançamento. |

Normalizações específicas:

- **Comissão Danilo**, Varia, linha 11: `848.6568` foi convertido para **84.866 centavos (R$ 848,66)**. O valor original com quatro casas decimais fica em `provenance.originalAmount`, nos detalhes do lançamento e no Excel. A diferença é R$ 0,0032; não foi criada uma compensação fictícia.
- Artefatos de ponto flutuante nos saldos originais, como `-0.960000000006403`, foram preservados na referência original. A conferência compara o saldo arredondado a centavos.
- **Saldo anterior**, Apênd, linha 2: a própria planilha o classifica como uma entrada de **R$ 2.262,14**. Foi mantido uma única vez, na categoria **Saldo inicial**. Não é tratado como venda ou receita operacional de gado.
- **barras roscavel 100 arruela e porca**, Apênd, linha 34: a data **09/08/2026** foi preservada, embora a linha apareça depois de um registro de setembro. Na interface, os registros são ordenados por data; o saldo histórico continua associado à linha original.
- Exemplos de categorias sugeridas: vendas → Venda de gado; compras → Compra de gado; fretes → Transporte; sal/proteinado → Alimentação; vacina/pour on/brucelose → Medicamentos; diesel/Petro → Combustível; Wi-Fi → Comunicação; luz → Energia elétrica; dias de trabalho → Mão de obra; arame/barras → Manutenção. Descrições sem evidência suficiente, como “4 Mancos” e “Nota Danilo”, ficam em Outros. Entradas sem venda explícita ficam em Outras receitas.

## Dados que aguardam esclarecimento

A aba **Movimentação Financeira**, de 2021–2022, tem **67 linhas preenchidas** após o cabeçalho e mistura nascimentos, mortes, correções, doações, compras e vendas.

- **15 registros** possuem valor numérico positivo em `Valor`. Há operações com vários animais em que não está explícito se a quantia é total ou unitária; por exemplo, as linhas 54–56 registram quantidades 3, 4 e 2 com valores 1.950, 1.600 e 1.600.
- **4 vendas** (linhas 27–30) têm `Valor` vazio e números em `Observação`: 17.600, 8.000, 13.200 e 2.200. É necessário confirmar se representam pagamentos efetivamente recebidos.
- As outras **48 linhas** não têm valor financeiro positivo confirmado. Incluem eventos sem efeito financeiro, valores ausentes, zero e texto no campo Valor.
- Também é necessário conciliar esse histórico antigo com o “Saldo anterior” que abre o caixa de 2026. Somar os períodos diretamente poderia contabilizar duas vezes valores já incorporados no saldo inicial.

Nenhuma dessas linhas entrou no saldo atual. **Todas as 67 estão preservadas na auditoria**, com número da linha, proprietário, data, descrição, operação, animal, quantidade, valor, observação e referência de foto. Não foram convertidas em movimentações de rebanho: faltam pastos e um inventário inicial confiável para reconstruir o estoque antigo.

A aba **Parâmetros** também foi inspecionada. Contém rateios, cheque, despesas, PIX e valores a receber misturados com parâmetros, totais e cálculos, sem datas nem classificação inequívoca de pagamento. Esses valores foram excluídos da migração para evitar tratar cálculos ou rateios como novas operações. As demais abas contêm contagens, projeções, fotos ou pastos, e não livros de caixa.

## Inicialização e preservação do banco existente

- A chave permanece `controle-gado:v1`, para continuar encontrando os dados anteriores. O documento usa agora `version: 2`, `seedVersion` e `appliedSeeds`.
- **Banco inexistente:** o primeiro acesso insere os 44 lançamentos reais uma vez. O rebanho continua identificado como demonstrativo até o inventário real ser informado.
- **Banco existente:** a estrutura antiga é adaptada em memória, sem inserir os 44 registros e sem regravar o armazenamento ao abrir. A próxima operação salva a estrutura compatível. Nenhum registro é apagado na atualização.
- Para adicionar o histórico a um banco existente, abra **Financeiro → Importar base financeira**. A confirmação informa quantos registros entrarão; uma cópia de segurança é preparada antes da importação.
- A importação adicional usa identificadores de proveniência e uma comparação de data/tipo/valor/descrição para reconhecer registros já cadastrados. A flag da carga impede reaplicação. Registros de mesma data e valor com descrição diferente não são automaticamente considerados duplicados: a coincidência pode representar pagamentos distintos.
- O comando **Iniciar inventário real** remove o estoque demonstrativo e suas movimentações, mas conserva lançamentos financeiros independentes, fotos, proprietários e pastos. Operações financeiras automáticas dessas movimentações são removidas junto com elas, após confirmação e preparação de backup.
- Restauração de backups V1 continua compatível. Falha de quota ou de validação não aplica alterações nem marca a carga como concluída.

## Financeiro e movimentações

Os registros independentes armazenam data, tipo, categoria, descrição, valor em centavos, proprietário opcional, propriedade, notas, origem e data de criação. Categorias próprias são aceitas em lançamentos manuais.

Compras e vendas mantêm uma única regra em `getFinances()`: cada movimentação com valor positivo projeta exatamente um registro financeiro com `movementId`, origem `cattle_sale` ou `cattle_purchase` e proprietário correspondente. A projeção é usada pela Dashboard, Financeiro, relatórios e Excel. Editar a movimentação atualiza esse registro; excluí-la remove o registro automático. Não existe uma segunda cópia persistida que possa ficar desatualizada. Os 44 registros da planilha são independentes e não debitam ou creditam animais.

Manuais podem ser criados, editados e excluídos. Migrados têm consulta dos dados originais; automáticos oferecem acesso à movimentação. A tabela exibe proprietário, origem e indicação do vínculo. Os filtros cobrem período, tipo, categoria, proprietário (incluindo Não informado), origem, aba de origem e pesquisa em descrição/notas/propriedade.

## Exportação XLSX

Foi utilizada uma cópia local de **SheetJS CE 0.20.3**, licenciada sob Apache 2.0, carregada somente ao exportar. Arquivos e licença ficam em `js/vendor/`. O uso local segue a [documentação oficial de distribuição do SheetJS](https://docs.sheetjs.com/docs/getting-started/installation/standalone/); a aplicação não consulta CDN durante o uso.

SHA-256 de `js/vendor/xlsx.js`: `1a0fb062ee9781b13f6687371b202aaefc53b6ce55b530c027e01f9c087b77db`.

| Tela | Exportação |
| --- | --- |
| Rebanho | Aba Rebanho, respeitando os filtros aplicados |
| Movimentações | Aba Movimentações, respeitando os filtros aplicados |
| Pastos | Aba Pastos, com quantidades, percentual, categorias, proprietários e situação |
| Financeiro | Aba Financeiro, respeitando todos os filtros aplicados |
| Relatórios | Excel do recorte atual e botão **Relatório geral (Excel)** |

O relatório geral gera um único `.xlsx` com **Resumo, Rebanho, Movimentações, Pastos e Financeiro**, sempre com todos os dados atuais, sem os filtros da tela. O Resumo contém totais por categoria/proprietário/pasto, entradas/despesas/saldo, contagem de lançamentos de compra/venda e contagem de operações/animais de compra/venda/nascimento/morte. As contagens financeiras e as movimentações do rebanho são identificadas separadamente para não inventar animais a partir da migração financeira.

Datas são células numéricas com formato `dd/mm/yyyy`; valores são numéricos com formato monetário em reais; percentuais têm formato próprio. Há títulos, cabeçalhos legíveis, larguras de coluna, autofiltro e uma linha por registro. Textos são células de texto, inclusive quando começam com `=`, evitando fórmulas originadas de conteúdo do usuário. IDs internos não são exportados. No Financeiro, aba e linha de origem e os valores originais são incluídos para conferência.

## Reprodução e testes

```powershell
node scripts/migrate-finances.js 'C:\Users\patai\Downloads\Controle do Gado V2.xlsx'
$env:MIGRATION_WORKBOOK = 'C:\Users\patai\Downloads\Controle do Gado V2.xlsx'
npm.cmd test
```

A extração verifica nomes de abas, cabeçalhos, datas, valores e operações. Se a estrutura mudar ou um lançamento não for válido, a geração para com erro em vez de preencher lacunas. Não é um importador genérico de planilhas arbitrárias.

Foram executados 30 testes de domínio, migração e XLSX, incluindo a comparação registro a registro com o arquivo original. Os testes de navegador em Edge verificam downloads reais, leitura dos arquivos gerados, filtros, carga inicial, preservação de bancos V1, importação adicional sem duplicação, edição/exclusão manual, impressão e responsividade de 320 a 1440 px.
