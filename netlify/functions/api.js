// Função principal para gerenciar a API do FinançasPRO no Netlify
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

// Configurações
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-do-jwt-aqui';

// Cliente MongoDB
let cachedDb = null;

// Função para conectar ao MongoDB
async function connectToDatabase() {
  if (cachedDb) {
    return cachedDb;
  }
  
  const client = new MongoClient(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000
  });
  
  await client.connect();
  const db = client.db('financas-pro');
  cachedDb = db;
  return db;
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
      const db = await connectToDatabase();
      let dbOperational = false;
      
      try {
        await db.command({ ping: 1 });
        dbOperational = true;
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
      const { nome, email, senha } = JSON.parse(event.body);
      
      if (!nome || !email || !senha) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Dados incompletos' })
        };
      }
      
      const db = await connectToDatabase();
      
      // Verificar se o email já está cadastrado
      const existingUser = await db.collection('users').findOne({ email });
      if (existingUser) {
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
        body: JSON.stringify({ message: 'Erro interno do servidor' })
      };
    }
  },
  
  // Rota de login
  'POST /login': async (event) => {
    try {
      const { email, senha } = JSON.parse(event.body);
      
      if (!email || !senha) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Email e senha são obrigatórios' })
        };
      }
      
      const db = await connectToDatabase();
      
      // Buscar usuário pelo email
      const user = await db.collection('users').findOne({ email });
      if (!user) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email ou senha inválidos' })
        };
      }
      
      // Verificar senha
      const isPasswordValid = await bcrypt.compare(senha, user.senha);
      if (!isPasswordValid) {
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
        body: JSON.stringify({ message: 'Erro interno do servidor' })
      };
    }
  },
  
  // Rota para obter usuário atual
  'GET /user/me': async (event) => {
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const db = await connectToDatabase();
      const userId = new ObjectId(authResult.user.id);
      
      // Buscar usuário pelo ID
      const user = await db.collection('users').findOne({ _id: userId });
      if (!user) {
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
  
  // Construir identificador de rota
  const path = event.path.replace('/.netlify/functions/api', '');
  const routeKey = `${event.httpMethod} ${path}`;
  
  // Adicionar cabeçalhos CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
  };
  
  // Responder a solicitações OPTIONS (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }
  
  // Verificar se a rota existe
  const route = routes[routeKey];
  if (route) {
    try {
      // Executar função da rota
      const response = await route(event);
      // Adicionar cabeçalhos CORS à resposta
      return {
        ...response,
        headers: { ...headers, ...response.headers }
      };
    } catch (error) {
      console.error(`Erro ao processar rota ${routeKey}:`, error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Erro interno do servidor',
          error: process.env.NODE_ENV === 'development' ? error.message : undefined
        })
      };
    }
  }
  
  // Rota não encontrada
  return {
    statusCode: 404,
    headers,
    body: JSON.stringify({ message: 'Rota não encontrada' })
  };
}; 