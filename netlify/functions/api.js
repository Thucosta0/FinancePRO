// Função principal para gerenciar a API do FinançasPRO no Netlify
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

// Configurações
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'financaspro-secure-token-2024';

// Log detalhado das configurações (sem mostrar senhas completas)
console.log('====== INICIANDO API FINANCASPRO ======');
console.log('Versão Node:', process.version);
console.log('MongoDB URI configurado:', MONGODB_URI ? `Sim (${MONGODB_URI.substring(0, 15)}...)` : 'NÃO CONFIGURADO - ERRO');
console.log('JWT Secret configurado:', JWT_SECRET ? 'Sim' : 'NÃO CONFIGURADO - ERRO');
console.log('Ambiente:', process.env.NODE_ENV || 'development');
console.log('======================================');

// Cliente MongoDB
let cachedDb = null;
let cachedClient = null;

// Função para conectar ao MongoDB
async function connectToDatabase() {
  console.log('[MongoDB] Tentando conectar ao MongoDB...');
  
  if (cachedDb) {
    console.log('[MongoDB] Usando conexão MongoDB em cache');
    return { client: cachedClient, db: cachedDb };
  }
  
  if (!MONGODB_URI) {
    console.error('[MongoDB] ERRO CRÍTICO: URL de conexão MongoDB não definida!');
    throw new Error('MONGODB_URI não configurado nas variáveis de ambiente. Configure no painel do Netlify.');
  }
  
  try {
    console.log('[MongoDB] Criando nova conexão...');
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000
    });
    
    console.log('[MongoDB] Tentando conectar...');
    await client.connect();
    console.log('[MongoDB] Conexão estabelecida com sucesso!');
    
    const db = client.db('financas-pro');
    cachedClient = client;
    cachedDb = db;
    
    console.log('[MongoDB] Verificando conexão com ping...');
    await db.command({ ping: 1 });
    console.log('[MongoDB] Ping bem-sucedido! Banco de dados operacional.');
    
    return { client, db };
  } catch (error) {
    console.error('[MongoDB] ERRO AO CONECTAR:', error.message);
    console.error('[MongoDB] Stack trace:', error.stack);
    throw new Error(`Falha na conexão com MongoDB: ${error.message}`);
  }
}

// Middleware para autenticação
const authenticateToken = async (authHeader) => {
  if (!authHeader) {
    return { authenticated: false, error: 'Token não fornecido' };
  }
  
  const token = authHeader.split(' ')[1];
  if (!token) {
    return { authenticated: false, error: 'Formato de token inválido' };
  }
  
  try {
    const user = jwt.verify(token, JWT_SECRET);
    return { authenticated: true, user };
  } catch (error) {
    return { authenticated: false, error: 'Token inválido ou expirado' };
  }
};

// Rotas da API
const routes = {
  // Rota de teste
  'GET /test': async () => {
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'API funcionando corretamente (Netlify Functions)',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      })
    };
  },
  
  // Rota de healthcheck
  'GET /healthcheck': async () => {
    try {
      console.log('[Healthcheck] Executando verificação...');
      let dbOperational = false;
      let dbConnected = false;
      let error = null;
      
      try {
        const { db } = await connectToDatabase();
        dbConnected = true;
        await db.command({ ping: 1 });
        dbOperational = true;
        console.log('[Healthcheck] Ping do MongoDB bem-sucedido');
      } catch (err) {
        error = err.message;
        console.error('[Healthcheck] Erro ao verificar banco:', err.message);
      }
      
      return {
        statusCode: dbOperational ? 200 : 500,
        body: JSON.stringify({
          status: dbOperational ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          mongoStatus: {
            connected: dbConnected,
            operational: dbOperational,
            error: error
          },
          mongoUri: MONGODB_URI ? `${MONGODB_URI.substring(0, 15)}...` : 'não configurado',
          environment: process.env.NODE_ENV || 'development'
        })
      };
    } catch (error) {
      console.error('[Healthcheck] Erro crítico:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({
          status: 'unhealthy',
          error: error.message,
          timestamp: new Date().toISOString()
        })
      };
    }
  },
  
  // Rota de registro
  'POST /register': async (event) => {
    try {
      console.log('[Register] Iniciando processamento...');
      
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
        console.log('[Register] Corpo da requisição parseado com sucesso');
      } catch (err) {
        console.error('[Register] Erro ao processar JSON do corpo:', err.message);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Formato JSON inválido' })
        };
      }
      
      const { nome, email, senha } = requestBody;
      console.log(`[Register] Tentativa para email: ${email}`);
      
      if (!nome || !email || !senha) {
        console.log('[Register] Dados incompletos');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Nome, email e senha são obrigatórios' })
        };
      }
      
      console.log('[Register] Conectando ao banco de dados...');
      const { db } = await connectToDatabase();
      console.log('[Register] Conexão estabelecida');
      
      // Verificar se o email já está cadastrado
      console.log('[Register] Verificando duplicidade de email...');
      const existingUser = await db.collection('users').findOne({ email });
      if (existingUser) {
        console.log('[Register] Email já em uso');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Este email já está em uso.' })
        };
      }
      
      // Criptografar a senha
      console.log('[Register] Criptografando senha...');
      const hashedPassword = await bcrypt.hash(senha, 10);
      
      // Criar novo usuário
      console.log('[Register] Inserindo novo usuário no banco...');
      const result = await db.collection('users').insertOne({
        nome,
        email,
        senha: hashedPassword,
        createdAt: new Date()
      });
      
      // Gerar token JWT
      console.log('[Register] Gerando token JWT...');
      const token = jwt.sign(
        { id: result.insertedId, email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('[Register] Usuário registrado com sucesso!');
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Usuário registrado com sucesso',
          token,
          user: { id: result.insertedId, nome, email }
        })
      };
    } catch (error) {
      console.error("[Register] ERRO:", error.message);
      console.error("[Register] Stack trace:", error.stack);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor',
          details: error.message
        })
      };
    }
  },
  
  // Rota de login
  'POST /login': async (event) => {
    try {
      console.log('[Login] Iniciando processamento...');
      
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
        console.log('[Login] Corpo da requisição parseado com sucesso');
      } catch (err) {
        console.error('[Login] Erro ao processar JSON do corpo:', err.message);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Formato JSON inválido' })
        };
      }
      
      const { email, senha } = requestBody;
      console.log(`[Login] Tentativa para email: ${email}`);
      
      if (!email || !senha) {
        console.log('[Login] Email ou senha não fornecidos');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Email e senha são obrigatórios' })
        };
      }
      
      console.log('[Login] Conectando ao banco de dados...');
      const { db } = await connectToDatabase();
      console.log('[Login] Conexão estabelecida');
      
      // Buscar usuário pelo email
      console.log('[Login] Buscando usuário no banco...');
      const user = await db.collection('users').findOne({ email });
      if (!user) {
        console.log('[Login] Usuário não encontrado');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email ou senha inválidos' })
        };
      }
      
      // Verificar senha
      console.log('[Login] Verificando senha...');
      const isPasswordValid = await bcrypt.compare(senha, user.senha);
      if (!isPasswordValid) {
        console.log('[Login] Senha inválida');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email ou senha inválidos' })
        };
      }
      
      // Gerar token JWT
      console.log('[Login] Gerando token JWT...');
      const token = jwt.sign(
        { id: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('[Login] Login realizado com sucesso!');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Login realizado com sucesso',
          token,
          user: { id: user._id, nome: user.nome, email: user.email }
        })
      };
    } catch (error) {
      console.error("[Login] ERRO:", error.message);
      console.error("[Login] Stack trace:", error.stack);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor',
          details: error.message
        })
      };
    }
  },
  
  // Rota para obter usuário atual
  'GET /user/me': async (event) => {
    try {
      console.log('[UserMe] Iniciando processamento...');
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        console.log('[UserMe] Autenticação falhou:', authResult.error);
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const { db } = await connectToDatabase();
      const userId = new ObjectId(authResult.user.id);
      
      // Buscar usuário pelo ID
      console.log('[UserMe] Buscando usuário com ID:', userId);
      const user = await db.collection('users').findOne({ _id: userId });
      if (!user) {
        console.log('[UserMe] Usuário não encontrado pelo ID');
        return {
          statusCode: 404,
          body: JSON.stringify({ message: 'Usuário não encontrado' })
        };
      }
      
      // Retornar dados do usuário sem a senha
      const { senha, ...userWithoutPassword } = user;
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          user: userWithoutPassword
        })
      };
    } catch (error) {
      console.error("[UserMe] ERRO:", error.message);
      console.error("[UserMe] Stack trace:", error.stack);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor',
          details: error.message
        })
      };
    }
  }
};

// Handler principal da função Netlify
exports.handler = async (event, context) => {
  // Configurar para reutilizar conexão com MongoDB entre invocações
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log(`[API] Requisição: ${event.httpMethod} ${event.path}`);
  
  // Construir identificador de rota
  const path = event.path.replace('/.netlify/functions/api', '');
  const routeKey = `${event.httpMethod} ${path}`;
  console.log(`[API] Rota identificada: ${routeKey}`);
  
  // Adicionar cabeçalhos CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Responder a solicitações OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    console.log('[API] Requisição CORS preflight detectada, retornando 204');
    return {
      statusCode: 204,
      headers
    };
  }
  
  // Verificar se a rota existe
  const route = routes[routeKey];
  if (route) {
    console.log(`[API] Rota encontrada: ${routeKey}, executando...`);
    try {
      // Executar função da rota
      const response = await route(event);
      // Adicionar cabeçalhos CORS à resposta
      console.log(`[API] Resposta para ${routeKey}: Status ${response.statusCode}`);
      return {
        ...response,
        headers: { ...headers, ...response.headers }
      };
    } catch (error) {
      console.error(`[API] ERRO AO PROCESSAR ROTA ${routeKey}:`, error.message);
      console.error('[API] Stack trace:', error.stack);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Erro interno do servidor',
          error: error.message,
          routeKey,
          path
        })
      };
    }
  }
  
  // Rota não encontrada
  console.log(`[API] Rota não encontrada: ${routeKey}`);
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ 
      message: 'Rota não encontrada',
      requestedPath: path,
      requestedRouteKey: routeKey,
      availableRoutes: Object.keys(routes)
    })
  };
}; 