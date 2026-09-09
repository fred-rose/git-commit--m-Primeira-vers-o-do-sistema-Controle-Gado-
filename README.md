# Controle Gado — V1.2

Aplicação de controle de rebanho por quantidade, em HTML, CSS e JavaScript puro. Sem framework ou backend. A exportação Excel usa uma cópia local de SheetJS; não há instalação de dependências para abrir o sistema. A identidade verde, os cards e a estrutura visual da base foram preservados.

A V1.1 acrescenta **exportação XLSX real**, relatório geral com cinco abas e **44 lançamentos financeiros reais** extraídos de `Controle do Gado V2.xlsx`. Veja a [auditoria da migração](docs/MIGRACAO-FINANCEIRA.md) para valores, campos, interpretações e dados ainda pendentes de esclarecimento.

A V1.2 acrescenta **Configurações → Gerenciamento de Dados**, backup JSON identificado e versionado, restauração com prévia, limpeza mediante `LIMPAR` e **Assistente da Fazenda local e somente de consulta**. A [documentação da entrega V1.2](docs/ENTREGA-V1.2.md) descreve os arquivos alterados, formato, limites e testes.

**Quem já utilizava a V1:** os dados existentes são preservados. Para adicionar o histórico financeiro da planilha, abra **Financeiro → Importar base financeira**. Essa carga não é aplicada automaticamente sobre bancos já existentes.

## Abrir o sistema

Requer Node.js 20 ou superior para o servidor de desenvolvimento.

```powershell
node scripts/server.js
```

Abra **http://127.0.0.1:4173**. Mantenha o terminal do servidor aberto. Não abra `index.html` por duplo clique: os módulos JavaScript precisam de HTTP. Também é possível hospedar os arquivos da aplicação em qualquer hospedagem estática com HTTPS, sem etapa de build.

Para acessar pelo celular na mesma rede Wi-Fi:

```powershell
$env:HOST = '0.0.0.0'
node scripts/server.js
```

Use no celular `http://IP-DO-COMPUTADOR:4173`, com o servidor em execução. A conectividade depende da rede e da permissão de entrada no firewall. O servidor fornecido é para desenvolvimento e uso em rede local; para publicação, use hospedagem estática HTTPS.

**Cada navegador e endereço têm dados próprios.** Celular e computador não sincronizam. `localhost`, `127.0.0.1`, IP da rede, outra porta e outro navegador são armazenamentos distintos. Fechar o servidor não apaga os registros; limpar os dados do site pode apagá-los.

## Primeiro uso

O rebanho inicia com dados **demonstrativos**, distribuídos entre os cinco proprietários e os cinco pastos do prompt:

| Categoria | Quantidade |
| --- | ---: |
| Vacas | 108 |
| Bois | 3 |
| Novilhas | 2 |
| Bezerras | 36 |
| Bezerros | 20 |

A soma é **169**, corrigindo a divergência com o total fixo de 172 da base visual. Nenhum total é armazenado separadamente. A distribuição por proprietário e pasto é ilustrativa. Em bancos novos, o financeiro inicia com os 44 lançamentos reais das abas de caixa de 2026; o histórico de movimentações de animais começa vazio.

Para uso real:

1. Na Dashboard, escolha **Iniciar inventário real**. Os lançamentos financeiros independentes serão preservados.
2. Confira a data inicial do controle e confirme. O sistema solicita o download de uma cópia dos dados atuais antes da mudança; confira se o navegador concluiu o download.
3. Cadastre/ajuste os pastos necessários.
4. Registre uma **Entrada** para cada combinação de categoria, proprietário e pasto do inventário conferido.
5. Passe a registrar compras, vendas, nascimentos, mortes, entradas, saídas e transferências.

O estoque demonstrativo usa como data inicial o primeiro acesso. Ao iniciar o inventário real, é possível escolher uma data anterior para lançar o estoque conferido e seu histórico real.

## Funcionalidades

- **Dashboard:** totais por categoria, pasto e proprietário, entradas, despesas, saldo e últimos registros.
- **Rebanho:** saldos por categoria/proprietário/pasto, pesquisa sem distinção de acentos e acesso ao histórico associado.
- **Movimentações:** criação, edição, exclusão confirmada, pesquisa e filtros por período, tipo, categoria, proprietário e pasto. O filtro por pasto inclui origem e destino de transferências.
- **Pastos:** cadastro, edição, ocupação, participação no rebanho, categorias, proprietários e histórico. Exclusão bloqueada enquanto houver animais. Pastos vazios excluídos permanecem identificados no histórico.
- **Financeiro:** receitas de vendas, despesas de compras, lançamentos manuais editáveis e histórico migrado com proveniência. Filtros por período, tipo, categoria, proprietário, origem, aba da planilha e pesquisa. Manuais aceitam propriedade, notas e categoria própria.
- **Fotos:** upload, ampliação, edição, exclusão, data, título, descrição e vínculos opcionais. Aceita JPG, PNG e WebP até 15 MB; reduz a imagem para até 1280 px e aproximadamente 450 KB antes de armazenar.
- **Relatórios:** estoque atual, movimentações por período/proprietário/pasto, financeiro, compras/vendas e nascimentos/mortes. Impressão, XLSX e CSV do recorte selecionado. O relatório geral XLSX contém Resumo, Rebanho, Movimentações, Pastos e Financeiro, sem filtros. O resumo de estoque é a posição atual, não um inventário histórico.
- **Cópia de segurança:** exportação e restauração JSON, incluindo fotos; validação integral antes de substituir os dados.
- **Configurações:** contagem dos registros, exportação de backup, importação com prévia e confirmação, limpeza local mediante a palavra `LIMPAR`. Backups completos anteriores continuam compatíveis; outros dados do navegador são preservados.
- **Assistente da Fazenda:** botão de gado no canto inferior direito de todas as telas. Responde quantidades atuais por categoria, proprietário e pasto, saldo e entradas/despesas do mês atual; explica vendas, compras, mortes e transferências. Somente consulta, sem API, com até 20 mensagens em memória. Limpar conversa não altera a fazenda.

## Regras de consistência

- `openingStock` representa o estoque inicial. O histórico de movimentações altera sua projeção em memória. Nenhuma tela mantém contadores próprios persistidos.
- Quantidades são inteiros positivos. A disponibilidade é conferida para a categoria, o proprietário e o pasto específicos.
- O histórico é processado por **data** e, no mesmo dia, por **ordem de cadastro**. A edição conserva essa ordem.
- Uma criação, edição ou exclusão recalcula todo o histórico. Qualquer saldo negativo, inclusive posterior ao registro alterado, bloqueia a operação inteira.
- Transferências debitam a origem e creditam o destino, sem alterar o total ou o proprietário. Origem e destino não podem ser iguais.
- Nascimentos são registrados como bezerras ou bezerros.
- Datas inválidas, futuras ou anteriores ao início do controle são bloqueadas nas movimentações.
- Valores monetários usam **centavos inteiros**. Aceitam, por exemplo, `40000,00`, `40.000,00` e `40000.00`. O valor é sempre o total da operação.
- Venda exige valor positivo e gera receita. Compra com valor positivo gera despesa; sem valor, registra apenas a entrada dos animais. Os demais tipos não geram financeiro automático.
- Lançamentos automáticos são derivados das movimentações, evitando duplicação. Sua correção ocorre pela movimentação de origem.
- A gravação usa um documento JSON com versão de esquema. A validação ocorre antes de persistir; falha de quota não modifica o estado exibido. Dados inválidos já salvos são preservados para recuperação.
- Alterações de outra aba geram aviso e bloqueiam uma gravação baseada em dados desatualizados. Para operação diária, prefira uma única aba de edição.

## Organização dos arquivos

```text
index.html                 Estrutura da aplicação e diálogo acessível
style.css                  Entrada dos estilos
assets/favicon.svg         Ícone local, sem CDN
css/variables.css          Paleta e fundamentos da base
css/components.css         Componentes visuais preservados
css/pages.css              Telas, formulários e estados
css/assistant.css          Configurações e painel do assistente
css/responsive.css         Celular, tablet e impressão
js/app.js                  Inicialização, eventos e ações
js/router.js               Navegação por hash e filtros na URL
js/constants.js            Categorias e tipos compartilhados
js/seed.js                 Inventário demonstrativo
js/data/financial-seed.js   Lançamentos reais extraídos da planilha
js/finance.js              Origem, categorias e compatibilidade/migração
js/excel.js                Exportação XLSX a partir do estado atual
js/vendor/                 SheetJS local e licença
js/domain.js               Validações e projeções de estoque/financeiro
js/storage.js              Único acesso ao localStorage; operações de dados
js/storage/                Schema, backup controlado e migrações sequenciais
js/ai/                     Contexto resumido, motor local e provider remoto futuro
js/queries.js              Filtros compartilhados
js/utils.js                Formatação, valores, CSV e download
js/components/             Formulários, diálogo, notificações, ícones e menu
js/pages/                  Os oito módulos
scripts/server.js          Servidor estático local sem dependências
scripts/migrate-finances.js Extração reproduzível da planilha original
docs/                      Auditoria e documentação da migração
tests/domain.test.js       Testes automatizados das regras de negócio
tests/finance-migration.test.js  Seed, compatibilidade e conciliação
tests/excel.test.js        Validação dos arquivos XLSX
tests/browser.mjs          Fluxos e responsividade no navegador
tests/browser-finance.mjs  Financeiro real, downloads e compatibilidade
tests/backup-assistant.test.js  Validação, restauração, limpeza e assistente
tests/browser-data.mjs     Backup e assistente offline em desktop e celular
```

A camada de domínio não depende do DOM nem de `localStorage`. O repositório recebe um adaptador de persistência, facilitando testes. Uma futura integração remota deverá implementar persistência assíncrona e transações no servidor, mantendo as regras e consultas reutilizáveis. Não há dados individuais por brinco nesta V1.

## Verificação

```powershell
node --test tests/*.test.js
```

São 38 testes de domínio, migração, XLSX, backup e assistente. Para executar também a comparação com o arquivo original, defina `MIGRATION_WORKBOOK` com seu caminho antes do comando; sem esse arquivo, somente essa comparação é pulada. Há cobertura dos cenários A–D, edição/exclusão, saldo retroativo, quota, conflito entre abas, backup, corrupção, filtros, precisão monetária, contexto limitado, chat somente de consulta e leitura dos XLSX gerados.

Para os testes opcionais de navegador, com o servidor já iniciado, disponibilize o pacote de desenvolvimento `playwright` e o Microsoft Edge:

```powershell
npm.cmd install --no-save playwright@1.55.0
npm.cmd run test:browser
npm.cmd run test:browser:finance
npm.cmd run test:browser:data
```

É possível informar um módulo Playwright já instalado em `PLAYWRIGHT_MODULE` (caminho para `index.mjs`). `BROWSER_CHANNEL` seleciona outro canal Chromium e `TEST_URL` altera o endereço testado. Os testes usam contextos isolados e não acessam o perfil pessoal do navegador. Capturas, PDF, CSV e backup de teste ficam em `tests/artifacts/`, ignorado pelo Git.

Verificação realizada: 38 testes aprovados, incluindo comparação com a planilha original; três suítes de navegador aprovadas, sem erros de console. Fluxos de cadastro, edição, exclusão, filtros, fotos, backup e recuperação; oito telas em 1440, 1024, 768, 390 e 320 px; menu recolhível e formulário de uma coluna no celular; exportação CSV, XLSX e PDF de impressão; preservação de bancos V1 e importação financeira adicional. O assistente foi testado sem rede após carregar a página, sem gravar dados nem fazer requisições.

## Limitações e próximo passo

- Sem login, sincronização, permissões por usuário, armazenamento remoto ou backup automático.
- O armazenamento do navegador é limitado e as fotos o consomem rapidamente. Exporte cópias regularmente e guarde-as fora do navegador.
- Sem instalação PWA/cache offline. O sistema dispensa CDNs, mas precisa que os arquivos estejam acessíveis para abrir ou recarregar a página.
- O assistente local usa regras simples. Responde estoque atual e financeiro geral ou do mês atual; recortes financeiros específicos e análises históricas devem usar as telas e seus filtros. O provider remoto está desativado e não existe endpoint ou chave de API.
- Proprietários e categorias de animais são os cinco previstos no prompt; não há tela de cadastro de proprietários, controle por brinco, evolução de categoria ou contas a pagar/receber. Categorias financeiras próprias são permitidas.
- O histórico financeiro de 2021–2022 aguarda esclarecimento de valores e conciliação com o saldo inicial de 2026; permanece preservado na auditoria e não integra o saldo atual.
- A persistência local e o recálculo integral são adequados para uma V1 de pequeno porte, sem concorrência de múltiplos usuários.
- Responsividade validada em emulação Chromium; aparelhos físicos, Safari e Firefox ainda precisam de validação em campo.

O próximo passo é conferir o inventário real e validar os fluxos com a pessoa que vai operar o sistema. Tecnicamente, priorize uma PWA com cache versionado dos arquivos para reabrir o aplicativo sem rede no campo. Sincronização entre aparelhos e IA remota ficam para uma etapa posterior com backend apropriado.
