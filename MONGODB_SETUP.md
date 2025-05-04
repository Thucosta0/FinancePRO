# Guia de Instalação do MongoDB para Windows

## Passo 1: Baixar o MongoDB Community Edition
1. Acesse o site oficial do MongoDB: https://www.mongodb.com/try/download/community
2. Clique em "Download" para a versão mais recente do MongoDB Community Edition
3. Selecione a versão para Windows e a plataforma (64-bit)
4. Escolha "MSI" como tipo de pacote
5. Clique em "Download"

## Passo 2: Instalar o MongoDB
1. Execute o arquivo MSI baixado
2. Clique em "Next" para iniciar a instalação
3. Aceite os termos de licença e clique em "Next"
4. Escolha "Complete" como tipo de instalação e clique em "Next"
5. Na tela "Service Configuration", mantenha as opções padrão:
   - Instalar o MongoDB como um serviço
   - Executar o serviço como "Network Service"
6. Especifique o diretório de dados (mantenha o padrão ou escolha outro local)
7. Finalize a instalação clicando em "Install"

## Passo 3: Verificar a instalação
1. Abra o PowerShell como administrador
2. Digite o comando `mongod --version` para verificar se o MongoDB foi instalado corretamente

## Passo 4: Configurar o MongoDB para o FinancasPRO
1. Com o MongoDB instalado, o aplicativo FinancasPRO conseguirá se conectar automaticamente usando as configurações do arquivo .env:
```
MONGODB_URI=mongodb://localhost:27017/financas-pro
```

2. Certifique-se de que o serviço MongoDB está rodando:
   - Verifique nos Serviços do Windows (services.msc)
   - O serviço deve estar como "MongoDB Server" e status "Running"

## Solução alternativa: MongoDB Atlas (Nuvem)
Se preferir não instalar o MongoDB localmente, você pode usar o MongoDB Atlas, que é um serviço de banco de dados na nuvem:

1. Acesse https://www.mongodb.com/cloud/atlas/register
2. Crie uma conta gratuita
3. Configure um cluster gratuito (M0)
4. Configure um usuário e senha para o banco de dados
5. Configure o IP permitido (Adicione seu IP atual ou 0.0.0.0/0 para permitir acesso de qualquer lugar)
6. Obtenha a string de conexão e atualize o arquivo .env com:
```
MONGODB_URI=mongodb+srv://seu-usuario:sua-senha@cluster0.exemplo.mongodb.net/financas-pro
``` 