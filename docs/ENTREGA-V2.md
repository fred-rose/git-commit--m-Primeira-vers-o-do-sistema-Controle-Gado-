# Controle Gado V2 — entrega e ponto de retomada

Atualizado em 10/09/2026. Referência: ultraprompt de 112 itens anexado pelo usuário. O pedido desta retomada foi conferir o trabalho existente e continuar sem recomeçar.

## Estado encontrado e ponto atual

A V2 já estava amplamente implementada em arquivos ainda não commitados. Foram preservadas essas alterações. Nenhum dado do navegador pessoal foi aberto, apagado ou migrado, nenhum commit anterior foi reescrito e nenhum projeto Supabase remoto foi alterado.

Antes das correções desta retomada: 53 testes Node, 52 aprovados e 1 pulado por falta da planilha original. As três migrations existentes passaram em PostgreSQL local e a suíte cloud passou com endpoints HTTP simulados. O README ainda descrevia a V1.2.

**Ponto de retomada:** código e testes locais concluídos dentro das condições disponíveis; ativação e aceite em Supabase real dependem de projeto, chaves públicas e configuração Auth. `js/config.js` permanece com campos vazios. Não recriar Auth, fazendas, outbox, telas ou migrations 001–003 na próxima sessão. Começar pela seção de configurações externas abaixo.

## Fases do ultraprompt

| Fases | Implementação presente | Evidência / limite |
| --- | --- | --- |
| 1 — Auditoria | `AUDITORIA-V2.md`, arquitetura legada conservada | Código, Git e testes conferidos |
| 2–3 — Modelo, migrations, RLS | PostgreSQL, isolamento por membro, RPC e Storage privado | Executado localmente; aplicar no projeto real |
| 4 — Auth | Google PKCE, email/senha, criação e confirmação de conta | HTTP simulado; Google externo pendente |
| 5–6 — Farms e contexto | Fazendas, vínculo owner, seleção por conta, ALL/SINGLE | Node, navegador e SQL |
| 7–8 — Módulos e dashboards | Projeção compatível, farmId, totais individuais/consolidados | Navegador legado/cloud e XLSX |
| 9 — Evolução | Estoque inicial + movimentos + mudanças de modo, períodos e comparações | Node e navegador; histórico desconhecido explicitado |
| 10–11 — Capacidade/alertas | Regras mensais gerais/por pasto, warning e excesso permitido | 79 + 3 = 82 no navegador e SQL |
| 12 — Quick | +/−, motivo, foto, origem e confirmação de capacidade | Node e navegador |
| 13–15 — Offline/sync/fotos | IndexedDB por usuário, foto antes do RPC, retries e revisão | Node, navegador e idempotência no SQL |
| 16 — Super Admin | Visão geral, usuários, fazendas, atividade e consulta de terceiros | RLS/SQL; conta real pendente |
| 17 — Migração local | Prévia, cópia, IDs estáveis, totais e fingerprint | 169 animais, 44 lançamentos, endereços e foto no SQL |
| 18 — Assistente | DTO por contexto, capacidade, pendências e evolução, sem escrita | Node e navegador offline |
| 19 — Backup/XLSX | JSON com fotos, restauração separada, Excel individual/consolidado | Node e downloads no navegador |
| 20 — Testes/mobile/PWA | Suítes preservadas, service worker e manifest | Edge emulado e recarga offline; campo real pendente |

## Correções realizadas nesta retomada

1. **Fila durante sincronização:** o gestor processa operações criadas enquanto um lote era enviado. Considera a primeira pendência de cada fazenda para não repetir automaticamente fazendas bloqueadas por conflito. Regressões testam novo registro durante envio e independência entre fazendas.
2. **Financeiro após troca de modo:** a RPC `complete_movement_value` preenche o valor sem regravar quantidade, data ou pasto histórico. Usa a mesma trava por fazenda, recibos idempotentes, autorização de membro e unicidade financeira. Valor diferente já preenchido por outro dispositivo exige conferência. Alertas abre um formulário simples de valor.
3. **Leitura consistente:** `farm_snapshot` e `admin_overview` passam a STABLE para compartilhar a visão do banco do início da chamada. Fundamentação: [snapshots e volatilidade no PostgreSQL](https://www.postgresql.org/docs/current/xfunc-volatility.html).
4. **Evolução:** período inválido na URL exibe validação sem tentar acessar formulário inexistente. Regressão no navegador.
5. **Pastos:** renomear pelo repositório preserva descrição e endereço carregados, inclusive da migração.
6. **Troca de conta:** eventos Auth invalidam o repositório anterior, fecham diálogos, limpam a tela e reinicializam o contexto. Teste de navegador troca para uma conta sem fazendas e verifica que os dados anteriores desaparecem.
7. **Documentação:** README atualizado e registro de retomada criado. Corrigidos caracteres corrompidos na descrição do pacote. SDK e cache PWA recompilados.

## Arquitetura adotada

HTML/CSS, JavaScript ESM e navegação hash continuam. `app.js` escolhe o repositório local sem configuração; com Supabase configurado, aguarda autenticação e usa `cloudRepository`. As páginas recebem DTO compatível com o domínio. Não houve migração para React nem novo gerenciador de estado.

Online, PostgreSQL é a fonte dos dados. `herd_stock` é uma projeção materializada do inventário inicial e histórico, reconstruída transacionalmente; o cliente não escreve diretamente nela. Totais, saldo, capacidade e evolução são derivados. Para preservar a apresentação legada, o cliente deriva o financeiro automático das movimentações; o banco conserva a linha financeira correspondente sob transação.

Offline, IndexedDB guarda sessão, bootstrap, cache limitado, outbox e blobs. A interface identifica a projeção provisória. Ao reconectar, o servidor verifica novamente autorização e estoque. A transação impede atualização parcial de estoque, financeiro e vínculo da foto. LocalStorage continua apenas para preferência de fazenda e banco legado preservado.

## Tabelas, índices e constraints

| Tabelas | Papel |
| --- | --- |
| `profiles` | Nome, email, avatar e função de sistema |
| `farms`, `farm_members` | Fazendas, modo, capacidade e vínculo owner |
| `owners`, `pastures` | Proprietários do gado e locais por fazenda |
| `opening_stock`, `herd_stock` | Inventário inicial e posição reconstruída |
| `movements`, `mode_changes` | Movimentações e mudanças de modo |
| `finances` | Lançamentos manuais, migrados e automáticos |
| `capacity_rules`, `alerts` | Limites mensais e pendências |
| `photos` | Metadados e referências a objetos privados |
| `mutation_receipts`, `imports` | Recibos idempotentes e cargas reconhecidas |

Índices explícitos: `farm_members_user`, índices por farm_id nas tabelas de negócio, `movements_farm_date`, `mode_changes_farm_date`, `finances_farm_date`, `photos_farm_date` e `alerts_farm_status`. Chaves primárias e constraints únicas também criam índices.

Constraints: FKs compostas `(farm_id, referência)` impedem vínculos cruzados; categorias/tipos permitidos; quantidades inteiras até 2.147.483.647; valores em centavos positivos dentro do inteiro seguro JavaScript; regra mensal única por local; lote único inclusive com proprietário/pasto nulos; financeiro automático único por movimentação; mutação única por fazenda nas movimentações; recibo por fazenda/usuário/mutação. Datas, estoque histórico e pastos ativos são revalidados nos RPCs.

RLS está ativa nas tabelas da aplicação. Membros consultam suas fazendas; administradores podem consultar terceiros. Toda escrita de negócio passa pelos RPCs e exige vínculo de membro, inclusive para administradores. O usuário só pode atualizar nome/avatar no próprio profile, nunca system_role. Funções auxiliares têm search_path explícito e privilégios limitados, evitando policies recursivas. Referência: [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

Storage: bucket privado `farm-photos`, 1 MB por imagem reduzida, JPG/PNG/WebP, caminhos `farm_id/user_id/arquivo`. Policies permitem leitura autorizada e inserção no próprio caminho; uploads são imutáveis. URLs de visualização são assinadas por uma hora. Reenvio compara o conteúdo quando o objeto já existe.

## Migrations e functions/RPC

| Arquivo em `supabase/migrations/` | Conteúdo |
| --- | --- |
| `202609100001_schema.sql` | Tabelas, índices, constraints, profiles, helpers e RLS |
| `202609100002_operations.sql` | Criação de fazenda, comando transacional, estoque e alertas |
| `202609100003_storage_import_queries.sql` | Storage, fotos, importação, snapshot e administração |
| `202609100004_financial_completion.sql` | Leituras STABLE e preenchimento financeiro independente da mudança de modo |

RPCs públicas: `create_farm`, `farm_command`, `farm_snapshot`, `admin_overview`, `complete_movement_value`. Auxiliares `private.delta`, `private.rebuild_stock`, `private.refresh_alerts`, `private.save_photo` e `private.import_farm` não são liberadas para execução pelo cliente.

## Arquivos criados e modificados

Já criados antes desta retomada e mantidos na entrega:

- Diretórios `js/auth/`, `js/supabase/`, `js/repositories/`, `js/offline/`, `js/capacity/`, `js/services/`, `js/migration/`.
- Telas `administracao.js`, `alertas.js`, `cloudSettings.js`, `evolucao.js`; componentes `cloudForms.js`, `cloudMovementForm.js`, `cloudShell.js`.
- `.env.example`, `js/config.js`, SDK local Supabase, `css/cloud.css`, manifest, service worker e ícones PNG.
- Scripts configure/build/test-sql; migrations 001–003; SQL de aceite; testes cloud/PWA e fixtures legadas.

Arquivos existentes adaptados pelo conjunto V2: `index.html`, `style.css`, `js/app.js`, domínio, schema de backup, seed, router, XLSX, formulários, modal, sidebar, contexto/motor local do assistente, servidor, pacote/lockfile, `.gitignore` e testes legados. `git status --short` fornece a lista exata não commitada.

Criados nesta retomada: migration 004, `supabase/tests/financial_completion.sql` e este documento. Modificados nesta retomada: README, descrição do pacote, Auth, repositório cloud, gestor de sincronização, Evolução, ação Informar valor em `app.js`, testes Node/cloud e executor dos SQLs. O build regenerou `js/vendor/supabase.js` e `sw.js`.

## Testes executados em 10/09/2026

| Comando | Resultado |
| --- | --- |
| `npm.cmd test` | 55 testes: **54 aprovados, 0 falhas, 1 pulado** |
| `npm.cmd run test:sql` | Migrations 001–004 e três grupos de cenários aprovados em PostgreSQL local |
| `npm.cmd run test:browser` | Fluxos legados, persistência, conflitos entre abas e responsividade aprovados |
| `npm.cmd run test:browser:finance` | Financeiro real, XLSX, impressão, migração e responsividade aprovados |
| `npm.cmd run test:browser:data` | Backup, restauração, assistente offline e responsividade aprovados |
| `npm.cmd run test:cloud` | Login, troca de conta, ALL/SINGLE, modos, capacidade, quick, IndexedDB, foto/reconexão, financeiro e backup aprovados com HTTP simulado |
| `npm.cmd run build` | 58 módulos validados; cache `controle-gado-shell-bedb6e2aaa0cdf21` |
| `npm.cmd run test:pwa` | Recarga e navegação sem rede; cache somente de arquivos públicos |
| `git diff --check` | Sem erros de whitespace |

SQL cobre RLS, autoelevação bloqueada, Storage por fazenda, modos, capacidade, estoque insuficiente, atomicidade, financeiro, idempotência, administração somente leitura e migração de 169 animais/44 lançamentos/endereços/foto sem duplicação. A regressão adicional confirma valor após consolidação, histórico preservado, conflito de valor e rejeição de conta alheia.

Os testes usam schemas Auth/Storage simulados em PostgreSQL local. Isso executa SQL e policies, mas não o serviço hospedado ou Google OAuth. Testes de navegador usam Edge e perfis isolados, de 320 a 1440 px, sem erros JavaScript reportados. A comparação opcional com a planilha original foi pulada porque o arquivo não está disponível; definir MIGRATION_WORKBOOK para executá-la.

O primeiro build foi bloqueado pelo sandbox ao resolver dependências; a execução autorizada fora do sandbox passou. Os dados reais do usuário não foram usados como alvo de testes.

## Configurações externas e próximos passos

1. Seguir [Configurar Supabase no README](../README.md#configurar-supabase): aplicar migrations, preencher URL/chave pública, executar configure e build.
2. Configurar Google OAuth e confirmação de email. Registrar URLs de retorno exatas. [Guia oficial Google/Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google).
3. Criar duas contas de teste reais. Conferir via API e interface que uma não consulta/altera fazendas da outra; validar uploads e downloads privados e rejeição de requisições sem autenticação.
4. Para a conta administrativa escolhida pelo responsável, definir `profiles.system_role = 'super_admin'` em sessão SQL administrativa confiável. O frontend não fornece promoção. Testar consulta de terceiros e bloqueio de escrita.
5. Publicar somente arquivos públicos por HTTPS. Validar câmera, instalação, recarga offline, perda de rede durante upload/RPC, reconexão em celular físico e dois dispositivos simultâneos.
6. Exportar cópia local real, conferir inventário/financeiro e migrar pela interface para fazenda vazia. Comparar origem/destino e repetir a mesma carga para conferir idempotência. Manter o JSON original.

## Limites conhecidos

- Sem configuração externa, a aplicação abre localmente. Não afirmar que produção, Google OAuth, email ou Storage remoto já foram validados.
- Snapshot limitado a 100 fazendas e 20 mil registros por coleção/recorte; não há paginação para bases maiores. Cache de até cinco contextos, sem gravar snapshots acima de 8 MB.
- Sincronização exige aplicativo aberto. Operações gerais precisam de internet; prioridade offline é quick +/− e fotos. Não há garantia de background sync com app fechado.
- Restauração automática de backup com outbox pendente é bloqueada para evitar duplicação. O arquivo preserva pendências/fotos para recuperação manual; sincronizar na origem e exportar novamente é o fluxo normal.
- Exclusão de foto remove o vínculo na aplicação; limpeza automática de objetos órfãos do Storage não foi implementada. Upload que precede falha de domínio também pode deixar objeto privado órfão.
- Histórico anterior à troca de modo é protegido contra edição de movimentação. Corrigir contagem com ajuste atual; completar valor usa a nova RPC.
- Financeiro local mantém regras legadas; compra/venda sem valor e pendências pertencem à V2 configurada.
- Datas de movimentos usam calendário de São Paulo no servidor. Outros fusos, Safari, Firefox e aparelhos físicos precisam de validação de campo.
- Membros estão preparados somente como owner, sem interface de convites. Não foram adicionados módulos não solicitados, brinco/RFID ou IA remota.
