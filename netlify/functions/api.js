// Função principal para gerenciar a API do FinançasPRO no Netlify
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

// Configurações
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-do-jwt-aqui';

// Log das configurações (sem mostrar senhas completas)
console.log('Iniciando API FinançasPRO no Netlify');
console.log('MongoDB URI configurado:', MONGODB_URI ? 'Sim ('+MONGODB_URI.substring(0, 20)+'...)' : 'Não');
console.log('JWT Secret configurado:', JWT_SECRET ? 'Sim' : 'Não');

// Cliente MongoDB
let cachedDb = null;
let cachedClient = null;

// Função para conectar ao MongoDB
async function connectToDatabase() {
  console.log('Tentando conectar ao MongoDB...');
  
  if (cachedDb) {
    console.log('Usando conexão MongoDB em cache');
    return { client: cachedClient, db: cachedDb };
  }
  
  if (!MONGODB_URI) {
    console.error('URL de conexão MongoDB não definida!');
    throw new Error('MONGODB_URI não configurado nas variáveis de ambiente');
  }
  
  try {
    console.log('Criando nova conexão com MongoDB');
    const client = new MongoClient(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 10000
    });
    
    await client.connect();
    console.log('Conexão com MongoDB estabelecida com sucesso');
    
    const db = client.db('financas-pro');
    cachedClient = client;
    cachedDb = db;
    return { client, db };
  } catch (error) {
    console.error('Erro ao conectar ao MongoDB:', error);
    throw error;
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
      console.log('Executando healthcheck...');
      const { db } = await connectToDatabase();
      let dbOperational = false;
      
      try {
        await db.command({ ping: 1 });
        dbOperational = true;
        console.log('Ping do MongoDB bem-sucedido');
      } catch (error) {
        console.error('Erro ao verificar operação do banco:', error);
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          status: dbOperational ? 'healthy' : 'degraded',
          timestamp: new Date().toISOString(),
          mongoStatus: {
            connected: !!db,
            operational: dbOperational
          },
          environment: process.env.NODE_ENV || 'development'
        })
      };
    } catch (error) {
      console.error('Erro no healthcheck:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({
          status: 'unhealthy',
          error: error.message
        })
      };
    }
  },
  
  // Rota de registro
  'POST /register': async (event) => {
    try {
      console.log('Iniciando processamento da rota /register');
      
      const { nome, email, senha } = JSON.parse(event.body);
      console.log(`Tentativa de registro para o email: ${email}`);
      
      if (!nome || !email || !senha) {
        console.log('Dados incompletos no registro');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Dados incompletos' })
        };
      }
      
      console.log('Conectando ao banco de dados...');
      const { db } = await connectToDatabase();
      console.log('Conexão ao banco estabelecida');
      
      // Verificar se o email já está cadastrado
      console.log('Verificando se o email já existe...');
      const existingUser = await db.collection('users').findOne({ email });
      if (existingUser) {
        console.log('Email já está em uso');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Este email já está em uso.' })
        };
      }
      
      // Criptografar a senha
      const hashedPassword = await bcrypt.hash(senha, 10);
      
      // Criar novo usuário
      const result = await db.collection('users').insertOne({
        nome,
        email,
        senha: hashedPassword,
        createdAt: new Date()
      });
      
      // Gerar token JWT
      const token = jwt.sign(
        { id: result.insertedId, email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Usuário registrado com sucesso',
          token,
          user: { id: result.insertedId, nome, email }
        })
      };
    } catch (error) {
      console.error("Erro ao registrar usuário:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor',
          error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
        })
      };
    }
  },
  
  // Rota de login
  'POST /login': async (event) => {
    try {
      console.log('Iniciando processamento da rota /login');
      
      const { email, senha } = JSON.parse(event.body);
      console.log(`Tentativa de login para o email: ${email}`);
      
      if (!email || !senha) {
        console.log('Email ou senha não fornecidos');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Email e senha são obrigatórios' })
        };
      }
      
      console.log('Conectando ao banco de dados...');
      const { db } = await connectToDatabase();
      console.log('Conexão ao banco estabelecida');
      
      // Buscar usuário pelo email
      console.log('Buscando usuário no banco de dados...');
      const user = await db.collection('users').findOne({ email });
      if (!user) {
        console.log('Usuário não encontrado');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email ou senha inválidos' })
        };
      }
      
      // Verificar senha
      const isPasswordValid = await bcrypt.compare(senha, user.senha);
      if (!isPasswordValid) {
        console.log('Senha inválida');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email ou senha inválidos' })
        };
      }
      
      // Gerar token JWT
      const token = jwt.sign(
        { id: user._id, email: user.email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Login realizado com sucesso',
          token,
          user: { id: user._id, nome: user.nome, email: user.email }
        })
      };
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor',
          error: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno'
        })
      };
    }
  },
  
  // Rota para obter usuário atual
  'GET /user/me': async (event) => {
    try {
      console.log('Iniciando processamento da rota /user/me');
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        console.log('Autenticação falhou:', authResult.error);
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const { db } = await connectToDatabase();
      const userId = new ObjectId(authResult.user.id);
      
      // Buscar usuário pelo ID
      console.log('Buscando usuário com ID:', userId);
      const user = await db.collection('users').findOne({ _id: userId });
      if (!user) {
        console.log('Usuário não encontrado pelo ID');
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
      console.error("Erro ao buscar dados do usuário:", error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor' })
      };
    }
  }
};

// Handler principal da função Netlify
exports.handler = async (event, context) => {
  // Configurar para reutilizar conexão com MongoDB entre invocações
  context.callbackWaitsForEmptyEventLoop = false;
  
  console.log(`Recebida requisição: ${event.httpMethod} ${event.path}`);
  
  // Construir identificador de rota
  const path = event.path.replace('/.netlify/functions/api', '');
  const routeKey = `${event.httpMethod} ${path}`;
  console.log(`Rota identificada: ${routeKey}`);
  
  // Adicionar cabeçalhos CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
  
  // Responder a solicitações OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    console.log('Requisição CORS preflight detectada, retornando 204');
    return {
      statusCode: 204,
      headers
    };
  }
  
  // Verificar se a rota existe
  const route = routes[routeKey];
  if (route) {
    console.log(`Rota encontrada: ${routeKey}`);
    try {
      // Executar função da rota
      const response = await route(event);
      // Adicionar cabeçalhos CORS à resposta
      console.log(`Resposta para ${routeKey}: Status ${response.statusCode}`);
      return {
        ...response,
        headers: { ...headers, ...response.headers }
      };
    } catch (error) {
      console.error(`Erro ao processar rota ${routeKey}:`, error);
      console.error('Stack trace:', error.stack);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Erro interno do servidor',
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        })
      };
    }
  }
  
  // Rota não encontrada
  console.log(`Rota não encontrada: ${routeKey}`);
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ 
      message: 'Rota não encontrada',
      requestedPath: path
    })
  };
}; 