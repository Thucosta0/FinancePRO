# Guia de Implantação do FinançasPRO no Netlify

Este guia contém instruções passo a passo para implantar o FinançasPRO usando o Netlify, uma plataforma de hospedagem moderna ideal para sites estáticos e aplicações frontend com backend serverless.

## Pré-requisitos

✅ Conta MongoDB Atlas configurada  
✅ Projeto adaptado para funções serverless do Netlify  
✅ Arquivo `netlify.toml` criado  

## Passos para Implantação no Netlify

### 1. Criar uma conta no Netlify

1. Acesse [netlify.com](https://www.netlify.com/) e clique em "Sign up"
2. Cadastre-se usando GitHub, GitLab, Bitbucket ou e-mail
3. É recomendado usar GitHub para facilitar a integração

### 2. Preparar o projeto para o Netlify

Seu projeto já contém:
- `netlify.toml` com a configuração do site
- Diretório `netlify/functions` com as funções serverless
- Funções adaptadas para o Netlify Functions

### 3. Implantar o Projeto no Netlify

#### Opção A: Implantar via GitHub (recomendado)

1. Faça upload do seu projeto para um repositório GitHub
2. No painel do Netlify, clique em "Add new site" > "Import an existing project"
3. Escolha "GitHub" como provedor de Git
4. Autorize o Netlify a acessar seus repositórios
5. Selecione o repositório do FinançasPRO
6. Configure as opções de build:
   - **Branch to deploy**: main (ou a branch principal)
   - **Build command**: npm install (ou deixe vazio se não tiver processo de build)
   - **Publish directory**: ./

#### Opção B: Implantar via arrastar e soltar (implantação manual)

1. Execute `zip -r financespro.zip .` para comprimir seu projeto
2. No painel do Netlify, clique em "Sites" > "Add new site" > "Deploy manually"
3. Arraste o arquivo ZIP para a área indicada
4. Nota: Você precisará repetir esse processo para cada atualização

### 4. Configurar Variáveis de Ambiente

1. No painel do site no Netlify, vá para "Site settings" > "Environment variables"
2. Clique em "Add variables"
3. Adicione as seguintes variáveis:
   - `NODE_ENV`: `production`
   - `MONGODB_URI`: `mongodb+srv://thucosta:Thu3048%23@to-my-life.vnkwk6t.mongodb.net/?retryWrites=true&w=majority&appName=To-my-life`
   - `JWT_SECRET`: (gere uma string aleatória segura)
   - Adicione outras variáveis necessárias para sua aplicação (Uber, etc.)

### 5. Ativar Functions no Netlify

1. No painel do site, vá para "Functions"
2. Verifique se as funções foram detectadas
3. Caso contrário, verifique o caminho em `netlify.toml` e a estrutura de diretórios

### 6. Verificar Implantação

1. Aguarde a conclusão do deploy (geralmente leva menos de 1 minuto)
2. Acesse a URL fornecida pelo Netlify (formato: https://your-site-name.netlify.app)
3. Teste os seguintes endpoints:
   - `/.netlify/functions/api` (rota principal das funções)
   - `/api/test` (redirecionada para a função serverless)
   - `/` (página principal)

## Ajustar URLs de API no Frontend

Para que seu frontend comunique-se corretamente com as funções do Netlify, atualize a URL base da API em `js/profile.js`:

```javascript
// URL base para todas as chamadas de API
const API_URL = window.location.origin + '/api';
```

Isso garantirá que as chamadas de API funcionem tanto em desenvolvimento local quanto em produção.

## Monitoramento e Logs

1. No painel do Netlify, vá para "Functions" para ver todas as invocações
2. Clique em uma função específica para ver detalhes
3. Em cada invocação, você pode ver logs, duração, status, etc.

## Domínio Personalizado (opcional)

1. No painel do site, vá para "Domain settings" > "Custom domains"
2. Clique em "Add custom domain"
3. Siga as instruções para configurar seu domínio personalizado

## Solução de Problemas

Se encontrar problemas:

1. **Função não está disponível**:
   - Verifique o arquivo `netlify.toml`
   - Confirme que a estrutura de diretórios está correta
   - Verifique os logs de implantação

2. **Erro de conexão com MongoDB**:
   - Verifique se a string de conexão está correta nas variáveis de ambiente
   - Confirme que seu IP está na lista de IPs permitidos no MongoDB Atlas
   - Verifique os logs da função para mensagens de erro específicas

3. **Problemas de CORS**:
   - Verifique os cabeçalhos CORS definidos nas funções
   - Tente adicionar seu domínio à lista de origens permitidas

## Limites do Plano Gratuito do Netlify

O plano gratuito do Netlify inclui:
- 100GB de largura de banda por mês
- 300 minutos de tempo de build por mês
- 125.000 invocações de funções por mês
- Tempo máximo de execução de função: 10 segundos

Monitore seu uso no painel do Netlify para evitar surpresas.

---

Com estas instruções, seu aplicativo FinançasPRO estará hospedado no Netlify, aproveitando seu CDN global e funções serverless, sem a necessidade de manter um servidor próprio! 