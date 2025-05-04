// Função principal para gerenciar a API do FinançasPRO no Netlify
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');

// Configurações FIXAS sem parâmetros extras
const MONGODB_URI_SIMPLE = 'mongodb+srv://thucosta:Thu3048%23@to-my-life.vnkwkct.mongodb.net';
const JWT_SECRET = 'financaspro-secure-token-2024';
const DB_NAME = 'test'; // Usando apenas o banco test por padrão no MongoDB Atlas

// Log detalhado das configurações
console.log('====== INICIANDO API FINANCASPRO ======');
console.log('Versão Node:', process.version);
console.log('MongoDB URI simplificada configurada:', MONGODB_URI_SIMPLE ? 'Sim' : 'NÃO CONFIGURADO - ERRO');
console.log('JWT Secret configurado:', JWT_SECRET ? 'Sim' : 'NÃO CONFIGURADO - ERRO');
console.log('Banco de dados:', DB_NAME);
console.log('Ambiente:', process.env.NODE_ENV || 'development');
console.log('======================================');

// Cliente MongoDB (global)
let cachedDb = null;
let cachedClient = null;

// Função para conectar ao MongoDB (ultrasimplificada)
async function connectToDatabase() {
  console.log('[MongoDB] Tentando conectar ao MongoDB...');
  
  if (cachedDb) {
    console.log(`[MongoDB] Usando conexão MongoDB em cache`);
    return { client: cachedClient, db: cachedDb };
  }
  
  try {
    console.log('[MongoDB] Criando nova conexão usando URI simples...');
    
    // Opções básicas
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true
    };
    
    // Tentativa de conexão mais direta
    console.log('[MongoDB] Iniciando conexão...');
    const client = new MongoClient(MONGODB_URI_SIMPLE, options);
    await client.connect();
    console.log('[MongoDB] Cliente conectado com sucesso!');
    
    const db = client.db(DB_NAME);
    console.log(`[MongoDB] Usando banco "${DB_NAME}"`);
    
    // Verificar conexão com ping
    try {
      console.log('[MongoDB] Verificando conexão com ping...');
      await db.command({ ping: 1 });
      console.log('[MongoDB] Ping bem-sucedido!');
      
      // Armazenar para reutilização
      cachedClient = client;
      cachedDb = db;
      
      return { client, db };
    } catch (pingError) {
      console.error('[MongoDB] Erro no ping:', pingError.message);
      throw pingError;
    }
  } catch (error) {
    console.error('[MongoDB] ERRO DE CONEXÃO:', error.message);
    console.error('[MongoDB] Stack trace:', error.stack);
    
    if (error.name === 'MongoServerSelectionError') {
      console.error('[MongoDB] Não foi possível conectar ao servidor MongoDB');
      console.error('[MongoDB] Verifique se o serviço MongoDB Atlas está funcionando');
      console.error('[MongoDB] Verifique se o IP está liberado no MongoDB Atlas');
    } else if (error.message.includes('Authentication failed')) {
      console.error('[MongoDB] ERRO DE AUTENTICAÇÃO - Usuário ou senha incorretos');
    }
    
    throw new Error(`Falha na conexão MongoDB: ${error.message}`);
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
  // Nova rota de diagnóstico para verificar MongoDB
  'GET /diagnostico': async () => {
    console.log('[Diagnostico] Iniciando verificação detalhada da conexão MongoDB...');
    
    try {
      // Tentar conectar e mostrar informações detalhadas
      console.log('[Diagnostico] Tentando conectar ao MongoDB...');
      
      // Informações da configuração
      const diagnostico = {
        timestamp: new Date().toISOString(),
        config: {
          mongodb_uri: MONGODB_URI_SIMPLE,
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
      
      // Testar a conexão passo a passo
      try {
        diagnostico.detailed_steps.push({
          step: 'Iniciando conexão com MongoDB',
          timestamp: new Date().toISOString(),
          status: 'pending'
        });
        
        // Criar cliente MongoDB com URI simplificada
        const client = new MongoClient(MONGODB_URI_SIMPLE, {
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
      }
      
      // Retornar diagnóstico completo
      return {
        statusCode: 200,
        body: JSON.stringify(diagnostico, null, 2)
      };
      
    } catch (error) {
      // Erro geral na função de diagnóstico
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Erro ao executar diagnóstico',
          error: error.message,
          stack: error.stack
        }, null, 2)
      };
    }
  },
  
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
  
  // Rota de login simplificada
  'POST /login': async (event) => {
    console.log('[Login] ===== INICIANDO PROCESSO DE LOGIN =====');
    
    try {
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
        console.log('[Login] JSON parseado com sucesso');
      } catch (err) {
        console.error('[Login] Erro no parse do JSON:', err.message);
        return {
          statusCode: 400,
          body: JSON.stringify({ 
            message: 'Formato de dados inválido',
            error: 'Invalid JSON format'
          })
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
      
      // AUTENTICAÇÃO TEMPORÁRIA PARA TESTE
      // Se a string de conexão estiver causando problemas, vamos permitir um login de teste
      if (email === 'teste@financaspro.com' && senha === 'teste123') {
        console.log('[Login] Usando login de teste (emergency fallback)');
        
        const token = jwt.sign(
          { id: '000000000000000000000001', email: email },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Login de teste realizado com sucesso',
            token,
            user: { 
              id: '000000000000000000000001', 
              nome: 'Usuário de Teste', 
              email: email 
            }
          })
        };
      }
      
      // Login normal
      console.log('[Login] Tentando conectar ao MongoDB...');
      let db;
      
      try {
        const dbConnection = await connectToDatabase();
        db = dbConnection.db;
        console.log('[Login] Conexão ao MongoDB estabelecida com sucesso');
      } catch (dbError) {
        console.error('[Login] ERRO NA CONEXÃO COM MONGODB:', dbError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro interno no servidor - falha na conexão ao banco de dados',
            details: dbError.message
          })
        };
      }
      
      // Buscar usuário pelo email
      console.log('[Login] Buscando usuário no banco...');
      let user;
      
      try {
        user = await db.collection('users').findOne({ email });
        console.log('[Login] Consulta ao banco realizada com sucesso');
      } catch (queryError) {
        console.error('[Login] ERRO NA CONSULTA AO BANCO:', queryError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro interno no servidor - falha na consulta ao banco de dados',
            details: queryError.message
          })
        };
      }
      
      if (!user) {
        console.log('[Login] Usuário não encontrado');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email ou senha inválidos' })
        };
      }
      
      // Verificar senha
      console.log('[Login] Verificando senha...');
      let isPasswordValid;
      
      try {
        isPasswordValid = await bcrypt.compare(senha, user.senha);
        console.log('[Login] Verificação de senha concluída:', isPasswordValid ? 'válida' : 'inválida');
      } catch (pwError) {
        console.error('[Login] ERRO NA VERIFICAÇÃO DE SENHA:', pwError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro interno no servidor - falha na verificação de senha',
            details: pwError.message
          })
        };
      }
      
      if (!isPasswordValid) {
        console.log('[Login] Senha inválida');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Email ou senha inválidos' })
        };
      }
      
      // Gerar token JWT
      console.log('[Login] Gerando token JWT...');
      let token;
      
      try {
        token = jwt.sign(
          { id: user._id, email: user.email },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        console.log('[Login] Token gerado com sucesso');
      } catch (tokenError) {
        console.error('[Login] ERRO NA GERAÇÃO DO TOKEN:', tokenError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro interno no servidor - falha na geração do token',
            details: tokenError.message
          })
        };
      }
      
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
      console.error("[Login] ERRO GLOBAL:", error.message);
      console.error("[Login] Stack trace:", error.stack);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor',
          details: error.message,
          stack: error.stack
        })
      };
    }
  },
  
  // Rota de registro
  'POST /register': async (event) => {
    console.log('[Register] ===== INICIANDO PROCESSO DE REGISTRO =====');
    console.log('[Register] Headers:', JSON.stringify(event.headers));
    
    try {
      // Analisar o corpo da requisição
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
        console.log('[Register] Corpo da requisição parseado com sucesso');
      } catch (err) {
        console.error('[Register] ERRO AO PROCESSAR JSON DO CORPO:', err.message);
        return {
          statusCode: 400,
          body: JSON.stringify({ 
            message: 'Formato JSON inválido',
            error: err.message
          })
        };
      }
      
      // Validar campos obrigatórios
      const { nome, email, senha } = requestBody;
      console.log(`[Register] Tentativa para email: ${email}`);
      
      if (!nome || !email || !senha) {
        console.log('[Register] Dados incompletos');
        return {
          statusCode: 400,
          body: JSON.stringify({ 
            message: 'Nome, email e senha são obrigatórios' 
          })
        };
      }

      // Conexão direta ao MongoDB
      let db;
      let client;
      
      try {
        console.log('[Register] Conectando ao MongoDB...');
        const connection = await connectToDatabase();
        client = connection.client;
        db = connection.db;
        console.log('[Register] Conexão ao MongoDB estabelecida com sucesso');
      } catch (dbError) {
        console.error('[Register] ERRO NA CONEXÃO COM MONGODB:', dbError.message);
        
        // Resposta de erro detalhada
        return {
          statusCode: 500,
          body: JSON.stringify({
            message: 'Erro interno no servidor - falha na conexão ao banco de dados',
            details: dbError.message,
            step: 'database_connection'
          })
        };
      }
      
      // SOLUÇÃO TEMPORÁRIA: Criar usuário com ID fixo para teste
      // Se estamos tendo problemas com MongoDB, pelo menos permitir registrar
      if (!db) {
        console.log('[Register] Usando solução de emergência - sem banco de dados');
        
        // Gerar uma senha hash (que não será armazenada)
        const hashedPassword = await bcrypt.hash(senha, 10);
        
        // Gerar token JWT com ID fixo
        const token = jwt.sign(
          { id: '000000000000000000000001', email },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        return {
          statusCode: 201,
          body: JSON.stringify({
            message: 'Usuário registrado com sucesso (modo emergência)',
            token,
            user: { 
              id: '000000000000000000000001', 
              nome, 
              email 
            }
          })
        };
      }
      
      // Processamento normal com banco de dados disponível
      
      // Verificar se a coleção users existe
      console.log('[Register] Verificando coleção users...');
      const collections = await db.listCollections({name: 'users'}).toArray();
      if (collections.length === 0) {
        console.log('[Register] Coleção users não existe, criando...');
        await db.createCollection('users');
      }
      
      // Verificar se o email já está em uso
      console.log('[Register] Verificando duplicidade de email...');
      const existingUser = await db.collection('users').findOne({ email });
      
      if (existingUser) {
        console.log('[Register] Email já em uso');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Este email já está em uso' })
        };
      }
      
      // Criptografar senha e criar usuário
      console.log('[Register] Criptografando senha...');
      const hashedPassword = await bcrypt.hash(senha, 10);
      
      console.log('[Register] Inserindo novo usuário...');
      const result = await db.collection('users').insertOne({
        nome,
        email,
        senha: hashedPassword,
        createdAt: new Date()
      });
      
      console.log('[Register] Usuário inserido com ID:', result.insertedId);
      
      // Gerar token JWT
      console.log('[Register] Gerando token JWT...');
      const token = jwt.sign(
        { id: result.insertedId.toString(), email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('[Register] REGISTRO CONCLUÍDO COM SUCESSO');
      
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Usuário registrado com sucesso',
          token,
          user: { 
            id: result.insertedId.toString(), 
            nome, 
            email 
          }
        })
      };
    } catch (error) {
      console.error('[Register] ERRO GLOBAL:', error.message);
      console.error('[Register] Stack trace:', error.stack);
      
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor',
          details: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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