const { MongoClient } = require('mongodb');

// URI simplificada para conexão com MongoDB
const MONGODB_URI = 'mongodb+srv://thucosta:Thu3048%23@to-my-life.vnkwkct.mongodb.net';
const DB_NAME = 'test';

// Função para diagnóstico de conexão MongoDB
exports.handler = async (event, context) => {
  // Configurar para não esperar por event loop vazio
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log('Iniciando diagnóstico MongoDB...');
  
  // Informações da configuração
  const diagnostico = {
    timestamp: new Date().toISOString(),
    config: {
      mongodb_uri: MONGODB_URI,
      database: DB_NAME,
      node_version: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    connection: {
      status: 'pending',
      error: null,
      details: {}
    },
    detailed_steps: []
  };
  
  // Adicionar cabeçalhos CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Testar a conexão passo a passo
  try {
    diagnostico.detailed_steps.push({
      step: 'Iniciando conexão com MongoDB',
      timestamp: new Date().toISOString(),
      status: 'pending'
    });
    
    // Criar cliente MongoDB
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // 5 segundos para seleção do servidor
      connectTimeoutMS: 10000 // 10 segundos para timeout de conexão
    });
    
    diagnostico.detailed_steps.push({
      step: 'Cliente MongoDB criado',
      timestamp: new Date().toISOString(),
      status: 'success'
    });
    
    // Tentar conectar
    await client.connect();
    
    diagnostico.detailed_steps.push({
      step: 'Conexão estabelecida com servidor MongoDB',
      timestamp: new Date().toISOString(),
      status: 'success'
    });
    
    // Testar acesso ao banco
    const db = client.db(DB_NAME);
    
    diagnostico.detailed_steps.push({
      step: `Banco de dados '${DB_NAME}' selecionado`,
      timestamp: new Date().toISOString(),
      status: 'success'
    });
    
    // Testar comando ping
    const pingResult = await db.command({ ping: 1 });
    
    diagnostico.detailed_steps.push({
      step: 'Comando ping executado com sucesso',
      timestamp: new Date().toISOString(),
      status: 'success',
      ping_result: pingResult
    });
    
    // Verificar coleções disponíveis
    const collections = await db.listCollections().toArray();
    
    diagnostico.detailed_steps.push({
      step: 'Listagem de coleções executada com sucesso',
      timestamp: new Date().toISOString(),
      status: 'success',
      collections: collections.map(c => c.name)
    });
    
    // Fechar conexão após testes
    await client.close();
    
    diagnostico.detailed_steps.push({
      step: 'Conexão fechada normalmente',
      timestamp: new Date().toISOString(),
      status: 'success'
    });
    
    // Atualizar status geral
    diagnostico.connection.status = 'success';
    diagnostico.connection.details = {
      connected: true,
      database_accessed: true,
      collections_listed: true
    };
    
    // Retornar resultado de sucesso
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(diagnostico, null, 2)
    };
    
  } catch (error) {
    // Registrar o ponto de falha
    diagnostico.detailed_steps.push({
      step: 'Erro na conexão',
      timestamp: new Date().toISOString(),
      status: 'error',
      error_message: error.message,
      error_name: error.name,
      error_stack: error.stack
    });
    
    // Detalhar o erro
    diagnostico.connection.status = 'error';
    diagnostico.connection.error = {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
    
    // Análise específica de erros comuns
    if (error.name === 'MongoServerSelectionError') {
      diagnostico.connection.details.error_type = 'SERVER_SELECTION';
      diagnostico.connection.details.possible_causes = [
        'IP não está na whitelist do MongoDB Atlas',
        'Servidor MongoDB não está acessível',
        'Problemas de rede entre o Netlify e o MongoDB Atlas'
      ];
    } else if (error.message.includes('Authentication failed')) {
      diagnostico.connection.details.error_type = 'AUTHENTICATION';
      diagnostico.connection.details.possible_causes = [
        'Nome de usuário incorreto',
        'Senha incorreta',
        'Usuário não tem permissão para acessar o banco de dados'
      ];
    } else if (error.message.includes('ENOTFOUND')) {
      diagnostico.connection.details.error_type = 'HOST_NOT_FOUND';
      diagnostico.connection.details.possible_causes = [
        'Nome do host MongoDB incorreto',
        'Problemas de DNS'
      ];
    }
    
    // Retornar erro detalhado
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(diagnostico, null, 2)
    };
  }
}; 