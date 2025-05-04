# Guia de Integração com Uber - FinançasPRO

Este guia explica como configurar e utilizar a integração com o Uber no aplicativo FinançasPRO, permitindo importar automaticamente seus gastos com viagens Uber para seu controle financeiro.

## Índice

1. [Visão Geral](#visão-geral)
2. [Pré-requisitos](#pré-requisitos)
3. [Configuração no Uber Developer](#configuração-no-uber-developer)
4. [Configuração no FinançasPRO](#configuração-no-finançaspro)
5. [Utilização da Integração](#utilização-da-integração)
6. [Solução de Problemas](#solução-de-problemas)
7. [Limites e Considerações](#limites-e-considerações)

## Visão Geral

A integração com o Uber permite:

- Importar automaticamente seus gastos com viagens do Uber para o FinançasPRO
- Categorizar corretamente as despesas como "Transporte > Uber"
- Incluir detalhes adicionais como trajeto, distância e duração da viagem
- Manter seu histórico financeiro atualizado sem inserção manual

## Pré-requisitos

- Uma conta no FinançasPRO com acesso de administrador
- Uma conta no [Uber Developer Portal](https://developer.uber.com/)
- Variáveis de ambiente configuradas no servidor onde o FinançasPRO está hospedado

## Configuração no Uber Developer

1. **Criar um aplicativo no Uber Developer Portal**:
   - Acesse [developer.uber.com](https://developer.uber.com/)
   - Faça login e vá para a seção "Meus Aplicativos"
   - Clique em "Criar Novo Aplicativo"
   - Preencha as informações básicas do aplicativo:
     - Nome: "FinançasPRO" (ou outro nome de sua escolha)
     - Descrição: "Integração para importar dados de viagens para o aplicativo FinançasPRO"
     - Site: URL do seu site ou aplicativo

2. **Configurar permissões OAuth**:
   - Na seção "Autenticação", adicione os seguintes escopos:
     - `profile` - Para acessar informações básicas do perfil
     - `history` - Para acessar o histórico de viagens
     - `history_lite` - Para acessar detalhes resumidos das viagens

3. **Configurar URIs de redirecionamento**:
   - Adicione a URI de callback: 
     - Para produção: `https://seu-site.netlify.app/.netlify/functions/uber-integration/callback`
     - Para desenvolvimento local: `http://localhost:3000/.netlify/functions/uber-integration/callback`

4. **Obter credenciais**:
   - Após a aprovação do aplicativo, anote o `Client ID` e o `Client Secret`
   - Você precisará dessas informações para configurar o FinançasPRO

## Configuração no FinançasPRO

1. **Configurar variáveis de ambiente**:
   - No arquivo `.env` ou no painel de variáveis de ambiente do seu provedor de hospedagem, adicione:

   ```
   UBER_CLIENT_ID=seu_client_id_aqui
   UBER_CLIENT_SECRET=seu_client_secret_aqui
   UBER_REDIRECT_URI=https://seu-site.netlify.app/.netlify/functions/uber-integration/callback
   UBER_AUTH_URL=https://login.uber.com/oauth/v2/authorize
   UBER_TOKEN_URL=https://login.uber.com/oauth/v2/token
   UBER_API_BASE_URL=https://api.uber.com/v1.2
   ```

2. **Reinicie ou reimplante** sua aplicação para que as mudanças tenham efeito.

## Utilização da Integração

### Para Usuários Finais

1. **Autorizar acesso ao Uber**:
   - Acesse o FinançasPRO e vá para "Configurações > Integrações"
   - Clique no botão "Conectar ao Uber"
   - Você será redirecionado para a página de login do Uber
   - Autorize o acesso do FinançasPRO aos dados solicitados
   - Após autorização bem-sucedida, você será redirecionado de volta ao FinançasPRO

2. **Sincronizar viagens**:
   - Vá para "Transações > Importar > Uber"
   - Clique em "Sincronizar Agora"
   - O sistema importará suas viagens recentes e as adicionará como transações
   - As transações já importadas anteriormente não serão duplicadas

3. **Gerenciar a integração**:
   - A qualquer momento, você pode desconectar a integração em "Configurações > Integrações"
   - Clique em "Desconectar" ao lado da integração do Uber

### Para Administradores

As rotas da API para integração com o Uber são:

- `GET /api/integrations/uber/auth` - Inicia o fluxo de autorização
- `GET /api/integrations/uber/callback` - Recebe o callback de autorização
- `POST /api/integrations/uber/sync` - Sincroniza as viagens (requer autenticação)
- `DELETE /api/integrations/uber` - Remove a integração (requer autenticação)

## Solução de Problemas

### Problemas comuns e soluções:

1. **Erro de autorização**:
   - Verifique se as URIs de redirecionamento estão configuradas corretamente
   - Certifique-se de que os escopos solicitados estão aprovados no Uber Developer Portal

2. **Falha na sincronização**:
   - Verifique se o token de acesso não expirou
   - Confirme se as credenciais do Uber estão corretas
   - Verifique os logs do servidor para mensagens de erro específicas

3. **Dados não aparecem**:
   - A API do Uber pode demorar a disponibilizar viagens recentes
   - Verifique se há filtros ativos na visualização de transações

## Limites e Considerações

- A API do Uber tem limites de taxa de requisição (600 requisições/hora)
- O histórico disponível pode ser limitado a viagens dos últimos 90 dias
- O processamento de viagens internacionais pode variar dependendo da região
- A integração não importa corridas canceladas ou não concluídas
- São importados apenas dados de viagens, não incluindo Uber Eats ou outros serviços

---

*Este documento foi atualizado pela última vez em agosto de 2023.* 