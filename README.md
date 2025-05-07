# FinançasPRO

Um aplicativo web para gerenciamento financeiro pessoal com integrações para serviços populares como Uber, 99 e iFood.

## Sobre o Projeto

FinançasPRO é uma aplicação que ajuda usuários a controlar suas finanças pessoais de forma simples e eficiente. O aplicativo oferece recursos como:

- Cadastro e login de usuários
- Registro de receitas e despesas
- Categorização automática de transações
- Integração com serviços externos (Uber, 99, iFood)
- Relatórios financeiros
- Controle de orçamentos

## Tecnologias

- **Backend**: Node.js, Express
- **Frontend**: HTML, CSS, JavaScript (vanilla)
- **Banco de Dados**: MongoDB Atlas
- **Autenticação**: JWT
- **Deploy**: Netlify (frontend + funções serverless)

## Configuração Local

1. Clone o repositório:
   ```bash
   git clone https://github.com/Thucosta0/financas-pro.git
   cd financas-pro
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Configure o ambiente:
   ```bash
   cp .env.example .env
   ```
   
4. Edite o arquivo `.env` com suas configurações

5. Inicie o servidor:
   ```bash
   npm run dev
   ```

6. Acesse http://localhost:3000 no seu navegador

## Deploy

O projeto pode ser implantado tanto no Netlify quanto no Render.com:

- Para instruções de deploy no Netlify, consulte o arquivo [NETLIFY_DEPLOY_GUIDE.md](NETLIFY_DEPLOY_GUIDE.md)
- Para Render.com, consulte o arquivo [render.yaml](render.yaml) para configuração

## Integrações Disponíveis

- **Uber**: Importação automática de gastos com viagens
- **99**: Importação de corridas e despesas
- **iFood**: Integração com pedidos e entregas
- **Open Banking**: Conexão com bancos para sincronização de dados

Para mais detalhes sobre a integração com o Uber, consulte [docs/UBER_INTEGRATION_GUIDE.md](docs/UBER_INTEGRATION_GUIDE.md).

## Licença

Este projeto está licenciado sob a licença MIT.

## Contato

Para dúvidas ou sugestões, entre em contato com o desenvolvedor. 

