# Controle Gado — V2

Controle de rebanho por quantidade em HTML, CSS e JavaScript modular, preservando a aplicação existente. A V2 implementa Supabase Auth, PostgreSQL com RLS, múltiplas fazendas, movimentações offline em IndexedDB e fotos privadas no Storage.

**Estado em 10/09/2026:** código e testes locais disponíveis; Supabase real ainda não configurado. Os campos de `js/config.js` estão vazios. Sem configuração, o sistema continua abrindo a versão local, preservando seus dados, sem login ou sincronização entre aparelhos.

Para retomar sem repetir trabalho, leia [ENTREGA-V2.md](docs/ENTREGA-V2.md): fases do ultraprompt, arquivos, correções, testes e pendências. A análise inicial está em [AUDITORIA-V2.md](docs/AUDITORIA-V2.md).

## Executar

Requer Node.js 20 ou superior. No PowerShell, use `npm.cmd` se a política bloquear `npm.ps1`.

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Abra **http://127.0.0.1:4173**. Não abra o HTML por duplo clique; módulos precisam de HTTP. Os módulos de navegador já estão em `js/vendor/`; para apenas visualizar a versão local existente, também é possível executar `node scripts/server.js` sem reinstalar dependências.

## Configurar Supabase

1. Crie ou selecione um projeto Supabase com PostgreSQL 15 ou superior.
2. Aplique em ordem os quatro arquivos de `supabase/migrations/`, pelo SQL Editor ou pelo seu fluxo de migrations. Se as três primeiras já estiverem aplicadas, execute apenas `202609100004_financial_completion.sql`. Não reaplique migrations já executadas.
3. Copie `.env.example` para `.env` e preencha `SUPABASE_URL` e `SUPABASE_ANON_KEY` com a URL do projeto e sua chave **publishable ou anon**. O configurador rejeita `service_role` e `sb_secret_`.
4. Gere a configuração pública e atualize o aplicativo:

```powershell
npm.cmd run configure
npm.cmd run build
npm.cmd start
```

`js/config.js` é público: contém apenas URL e chave pública. A autorização é feita no banco. `.env` não é versionado nem servido pelo servidor local. Não coloque segredos administrativos nos arquivos publicados.

No Supabase Auth, configure Site URL e Redirect URLs com o endereço exato da aplicação, por exemplo `http://127.0.0.1:4173/` e o domínio HTTPS de produção. O frontend usa `location.origin + location.pathname`, sem hash, como retorno. Habilite email/senha se quiser esse fluxo; se houver confirmação de email, confirme a conta antes de entrar.

Para Google, crie um cliente OAuth Web no Google Cloud. Configure a origem da aplicação e o callback apresentado pelo Supabase como URI de redirecionamento, normalmente `https://<project-ref>.supabase.co/auth/v1/callback`. Ative Google no Supabase e informe Client ID e Client Secret na configuração do provedor. O segredo Google não vai ao frontend. Consulte o [guia oficial Google/Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google). O código usa PKCE; o provedor real ainda não foi testado.

## Primeiro acesso e dados existentes

Com Supabase configurado, cada pessoa entra na própria conta. Uma conta nova começa sem fazendas e sem inventário. Crie a primeira propriedade e escolha **Fazenda inteira** ou **Por pastos**; cada fazenda tem seu modo.

Se houver dados locais no mesmo navegador e endereço, selecione uma fazenda vazia e use **Configurações → Ver dados locais para migração**. A aplicação mostra totais, prepara uma cópia, envia fotos e importa registros em uma transação. Reenvios do mesmo conjunto são reconhecidos. O banco local não é apagado.

Para dados de outro navegador/endereço, exporte o JSON na origem e use **Importar backup**. A restauração cria fazendas separadas. Backups com operações ainda pendentes precisam ser sincronizados na origem antes da restauração automática.

O seed local representa a contagem de 28/05/2026: **108 vacas, 3 bois, 2 novilhas, 36 bezerras e 20 bezerros = 169 animais**. Localização e proprietário permanecem não informados; não há distribuição inventada. Os 44 lançamentos financeiros e endereços dos pastos foram preservados. Veja a [auditoria financeira](docs/MIGRACAO-FINANCEIRA.md). Esse seed não é inserido automaticamente nas novas fazendas Supabase.

## Funcionalidades

- Seletor de uma ou todas as fazendas, dashboards individual e consolidado, totais derivados.
- Rebanho por quantidade, movimentos, estoque cronológico e financeiro automático de compras/vendas.
- Modo fazenda inteira sem pastos obrigatórios; modo por pastos com transferência e arquivamento de pastos vazios. Consolidação pede confirmação e preserva histórico.
- Evolução por período, categoria, fazenda/pasto, receitas, despesas, saldo e capacidade mensal.
- Capacidade opcional, aviso preventivo e confirmação de excesso, sem bloquear o inventário real.
- Central de alertas, financeiro pendente e quick +/−, sempre com movimentação, motivo e origem.
- Fotos reduzidas, câmera opcional e Storage privado.
- Administração para super_admin: usuários, fazendas e atividade; fazendas alheias somente para consulta.
- JSON individual/consolidado com fotos, XLSX com identificação de fazenda, CSV, impressão e assistente local.

O assistente recebe um resumo do contexto e responde consultas de estoque, financeiro, capacidade, pendências e crescimento. Continua sem API de IA nem capacidade de escrita.

## Uso no campo

Abra a fazenda com internet antes de sair. Sem rede, use +/− para quantidade, motivo, descrição e foto. Os registros ficam pendentes e a projeção local é provisória.

Na reconexão, a fila envia a foto, confirma a movimentação via RPC e só então remove o blob local. `client_mutation_id` impede reaplicar uma operação cuja resposta se perdeu. Falhas de rede têm até cinco tentativas com espera crescente. Conflitos ficam em Alertas, com **Tentar novamente** e **Revisar**, e bloqueiam o avanço das operações seguintes daquela fazenda.

O cache guarda até cinco contextos por conta, de até 8 MB cada. O service worker armazena arquivos públicos do aplicativo, sem cachear Auth, REST ou Storage. Sessão, cache estruturado, fila e blobs usam IndexedDB. Na V2, localStorage fica com a preferência de fazenda e o banco legado preservado.

PWA, câmera e offline completo exigem HTTPS ou localhost. IP HTTP na rede local permite visualização, mas não valida produção. A sincronização ocorre com o app aberto; não há envio garantido com o app fechado. Sair conserva a fila vinculada à conta original para retomar após login.

## Testes

```powershell
npm.cmd test
npm.cmd run test:sql
```

Com o servidor em outro terminal:

```powershell
npm.cmd run test:browser
npm.cmd run test:browser:finance
npm.cmd run test:browser:data
npm.cmd run test:pwa
```

Com servidor de teste temporário iniciado e encerrado automaticamente:

```powershell
npm.cmd run test:feedback
npm.cmd run test:auth
npm.cmd run test:cloud
npm.cmd run test:browser:local
```

O último comando executa as quatro suítes locais (telas, financeiro, dados e PWA). Esses comandos usam configuração isolada e não editam as credenciais do projeto. Detalhes da implementação e da revisão em [FEEDBACK-VISUAL.md](docs/FEEDBACK-VISUAL.md).

Playwright usa Microsoft Edge em perfis isolados. `BROWSER_CHANNEL` e `TEST_URL` mudam navegador/endereço; artefatos ficam em `tests/artifacts/`. SQL usa PostgreSQL local e banco exclusivo de teste com schemas Auth/Storage simulados; ajuste `PG_BIN` e `TEST_PG_PORT` se necessário. No Windows, o padrão é `C:/Program Files/PostgreSQL/18/bin`.

Em 10/09/2026: **54 testes Node aprovados, 1 pulado, 0 falhas**; SQL, cinco suítes de navegador e build aprovados. A comparação opcional com a planilha requer `MIGRATION_WORKBOOK`. OAuth, Storage HTTP e RLS no projeto Supabase real ainda precisam de configuração e aceite. Consulte [ENTREGA-V2.md](docs/ENTREGA-V2.md).
