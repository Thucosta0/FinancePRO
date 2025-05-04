// Função principal para gerenciar a API do FinançasPRO no Netlify
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

// ===== SOLUÇÃO TEMPORÁRIA: MODO OFFLINE =====
// Essa é uma solução para permitir o uso do sistema sem MongoDB
const MODO_OFFLINE = true; // Forçar modo offline para garantir funcionamento

// DB Local (Apenas para solução temporária - dados são perdidos a cada deploy)
const dbLocal = {
  users: [
    {
      _id: "000000000000000000000001",
      nome: "Usuário Demo",
      email: "demo@financaspro.com",
      // Senha: demo123
      senha: "$2a$10$3WrVE3JRZ1UYJ6GasjNJj.MbR9RjEgvoCGlFsiaBGIEEkCBNEMzRS",
      createdAt: new Date("2024-05-01T10:00:00.000Z")
    }
  ],
  transacoes: []
};

// Configurações
const JWT_SECRET = 'financaspro-secure-token-2024';

// Log de inicialização
console.log('====== INICIANDO API FINANCASPRO ======');
console.log('Modo offline forçado:', MODO_OFFLINE ? 'SIM' : 'NÃO');
console.log('Ambiente:', process.env.NODE_ENV || 'development');
console.log('======================================');

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
        mode: MODO_OFFLINE ? 'offline (sem MongoDB)' : 'online',
        environment: process.env.NODE_ENV || 'development'
      })
    };
  },
  
  // Rota de status
  'GET /status': async () => {
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "operational",
        mode: MODO_OFFLINE ? "offline" : "online",
        timestamp: new Date().toISOString(),
        message: MODO_OFFLINE 
          ? "Sistema funcionando no modo offline (sem MongoDB)" 
          : "Sistema funcionando normalmente"
      })
    };
  },
  
  // Rota de login
  'POST /login': async (event) => {
    console.log('[Login] Iniciando processamento de login...');
    
    try {
      // Processar corpo da requisição
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
      } catch (err) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Formato JSON inválido' })
        };
      }
      
      const { email, senha } = requestBody;
      console.log(`[Login] Tentativa para email: ${email}`);
      
      if (!email || !senha) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Email e senha são obrigatórios' })
        };
      }
      
      // Login em modo offline
      if (MODO_OFFLINE) {
        console.log('[Login] Usando modo offline...');
        
        // Verificar usuário demo
        if (email === 'demo@financaspro.com' && senha === 'demo123') {
          console.log('[Login] Login com usuário demo bem-sucedido');
          
          const token = jwt.sign(
            { id: '000000000000000000000001', email: 'demo@financaspro.com' },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Login realizado com sucesso',
              token,
              user: { 
                id: '000000000000000000000001', 
                nome: 'Usuário Demo', 
                email: 'demo@financaspro.com' 
              }
            })
          };
        }
        
        // Buscar usuário pelo email no DB local
        const user = dbLocal.users.find(u => u.email === email);
        
        if (!user) {
          console.log('[Login] Usuário não encontrado');
          return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Email ou senha inválidos' })
          };
        }
        
        // Verificar senha
        const isPasswordValid = await bcrypt.compare(senha, user.senha);
        
        if (!isPasswordValid) {
          console.log('[Login] Senha inválida');
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
        
        console.log('[Login] Login bem-sucedido');
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Login realizado com sucesso',
            token,
            user: { id: user._id, nome: user.nome, email: user.email }
          })
        };
      }
      
      // Código original para login com MongoDB foi removido para simplificar
      // Sempre entrará no modo offline pela configuração atual
      
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro de configuração - o sistema deveria estar em modo offline' })
      };
    } catch (error) {
      console.error('[Login] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota de registro
  'POST /register': async (event) => {
    console.log('[Register] Iniciando processamento de registro...');
    
    try {
      // Processar corpo da requisição
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
      } catch (err) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Formato JSON inválido' })
        };
      }
      
      const { nome, email, senha } = requestBody;
      console.log(`[Register] Tentativa para email: ${email}`);
      
      if (!nome || !email || !senha) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Nome, email e senha são obrigatórios' })
        };
      }
      
      // Registro em modo offline
      if (MODO_OFFLINE) {
        console.log('[Register] Usando modo offline...');
        
        // Verificar se o email já está em uso no DB local
        const existingUser = dbLocal.users.find(u => u.email === email);
        
        if (existingUser) {
          console.log('[Register] Email já em uso');
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Este email já está em uso' })
          };
        }
        
        // Criptografar senha
        const hashedPassword = await bcrypt.hash(senha, 10);
        
        // Criar ID único (simulando MongoDB ObjectId)
        const timestamp = Math.floor(new Date().getTime() / 1000).toString(16).padStart(8, '0');
        const machineId = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0');
        const pid = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
        const increment = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0');
        const newId = timestamp + machineId + pid + increment;
        
        // Criar novo usuário
        const newUser = {
          _id: newId,
          nome,
          email,
          senha: hashedPassword,
          createdAt: new Date()
        };
        
        // Adicionar ao DB local
        dbLocal.users.push(newUser);
        
        console.log('[Register] Usuário registrado com ID:', newId);
        
        // Gerar token JWT
        const token = jwt.sign(
          { id: newId, email },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        console.log('[Register] Registro concluído com sucesso');
        return {
          statusCode: 201,
          body: JSON.stringify({
            message: 'Usuário registrado com sucesso (modo offline)',
            token,
            user: { id: newId, nome, email }
          })
        };
      }
      
      // Código original para registro com MongoDB foi removido para simplificar
      // Sempre entrará no modo offline pela configuração atual
      
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro de configuração - o sistema deveria estar em modo offline' })
      };
    } catch (error) {
      console.error('[Register] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota para obter usuário atual
  'GET /user/me': async (event) => {
    try {
      console.log('[UserMe] Iniciando processamento...');
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      if (MODO_OFFLINE) {
        console.log('[UserMe] Usando modo offline...');
        const userId = authResult.user.id;
        
        // Buscar usuário no DB local
        const user = dbLocal.users.find(u => u._id === userId);
        
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
          body: JSON.stringify({ user: userWithoutPassword })
        };
      }
      
      // Código original para buscar usuário com MongoDB foi removido para simplificar
      // Sempre entrará no modo offline pela configuração atual
      
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro de configuração - o sistema deveria estar em modo offline' })
      };
    } catch (error) {
      console.error('[UserMe] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  }
};

// Handler principal da função Netlify
exports.handler = async (event, context) => {
  // Configurar para não esperar por event loop vazio
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
      console.error(`[API] ERRO:`, error.message);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Erro interno do servidor',
          error: error.message
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