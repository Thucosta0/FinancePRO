# FinancePRO - Arquivos SQL para Supabase

Este diretório contém os arquivos SQL para criação das tabelas, funções e triggers do sistema FinancePRO no Supabase.

## Estrutura dos Arquivos

Os arquivos estão organizados da seguinte forma:

1. `financepro_consolidado.sql` - Contém as definições de todas as tabelas do sistema
2. `financepro_triggers.sql` - Contém os triggers e funções básicas do sistema
3. `financepro_funcoes.sql` - Contém as funções para notificações, alertas e estatísticas
4. `financepro_relatorios.sql` - Contém as funções para geração de relatórios

## Ordem de Execução

Para garantir o funcionamento correto, execute os arquivos na seguinte ordem:

1. Primeiro: `financepro_consolidado.sql` (cria todas as tabelas)
2. Segundo: `financepro_triggers.sql` (cria os triggers para as tabelas)
3. Terceiro: `financepro_funcoes.sql` (cria as funções básicas)
4. Quarto: `financepro_relatorios.sql` (cria as funções de relatórios)

## Tabelas Criadas

O sistema cria as seguintes tabelas:

- `profiles` - Perfis de usuários
- `transacoes` - Transações financeiras (receitas e despesas)
- `categorias` - Categorias personalizadas
- `metas` - Metas financeiras
- `notificacoes` - Sistema de notificações
- `lembretes` - Lembretes de contas a pagar/receber
- `auditoria` - Logs de auditoria do sistema

## Funções Principais

Algumas das principais funções disponíveis:

- `relatorio_gastos_por_categoria` - Relatório de gastos por categoria
- `relatorio_receitas_por_categoria` - Relatório de receitas por categoria
- `relatorio_fluxo_mensal` - Fluxo de caixa mensal
- `relatorio_evolucao_patrimonial` - Evolução patrimonial
- `estatisticas_gastos` - Estatísticas de gastos
- `indice_saude_financeira` - Índice de saúde financeira
- `detectar_atividades_suspeitas` - Detecção de atividades suspeitas
- `gerar_notificacoes_lembretes` - Gera notificações a partir de lembretes
- `gerar_notificacoes_saude_financeira` - Gera notificações sobre saúde financeira

## Execução no Supabase

Para executar no Supabase:

1. Acesse o projeto no dashboard do Supabase
2. Vá para "SQL Editor"
3. Crie uma nova consulta e copie o conteúdo de cada arquivo na ordem indicada
4. Execute cada script separadamente

## Observações Importantes

- As políticas de segurança (RLS) já estão configuradas para cada tabela
- Os triggers são configurados automaticamente para criar perfis, categorias padrão, etc.
- O sistema está preparado para funcionar com o sistema de autenticação do Supabase

## Solução de Problemas

### Erro: Política já existe

Se você encontrar erros como:
```
ERROR: 42710: policy "transactions_user_policy" for table "transacoes" already exists
```

Este erro ocorre quando você tenta criar uma política que já existe no banco de dados. Os scripts foram atualizados para remover políticas existentes antes de criá-las novamente, mas se ainda enfrentar problemas, você pode:

1. Executar manualmente o comando para remover a política antes de criar:
   ```sql
   DROP POLICY IF EXISTS transactions_user_policy ON transacoes;
   ```

2. Ou pule o script que está causando o erro, se as políticas já estiverem configuradas corretamente.

### Erro: Trigger já existe

Se encontrar erros relacionados a triggers já existentes, você pode remover manualmente os triggers antes de executar os scripts:

```sql
DROP TRIGGER IF EXISTS on_transacao_changed ON transacoes;
DROP TRIGGER IF EXISTS on_profile_created ON profiles;
DROP TRIGGER IF EXISTS audit_profiles_trigger ON profiles;
```

### Erro: Função já existe

Como estamos usando `CREATE OR REPLACE FUNCTION` para todas as funções, não deveria haver problemas com funções duplicadas. Se mesmo assim ocorrerem erros, remova manualmente a função antes:

```sql
DROP FUNCTION IF EXISTS nome_da_funcao;
```

### Reinicialização do Banco de Dados

Se necessário reiniciar tudo do zero, você pode executar os seguintes comandos (cuidado, isso excluirá todos os dados):

```sql
DROP TABLE IF EXISTS auditoria CASCADE;
DROP TABLE IF EXISTS lembretes CASCADE;
DROP TABLE IF EXISTS notificacoes CASCADE;
DROP TABLE IF EXISTS metas CASCADE;
DROP TABLE IF EXISTS categorias CASCADE;
DROP TABLE IF EXISTS transacoes CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
``` 