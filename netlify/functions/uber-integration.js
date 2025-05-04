// Função para gerenciar integração com Uber no Netlify
const { MongoClient, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');

// Configurações
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-do-jwt-aqui';

// Configurações da integração Uber
const UBER_CONFIG = {
  clientId: process.env.UBER_CLIENT_ID,
  clientSecret: process.env.UBER_CLIENT_SECRET,
  redirectUri: process.env.UBER_REDIRECT_URI || 'https://seu-site.netlify.app/.netlify/functions/uber-integration/callback',
  authUrl: process.env.UBER_AUTH_URL,
  tokenUrl: process.env.UBER_TOKEN_URL,
  apiBaseUrl: process.env.UBER_API_BASE_URL
};

// Escopos requisitados: perfil de usuário e histórico de viagens
const UBER_SCOPES = 'profile history history_lite';

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

// Gera a URL de autorização para o fluxo OAuth da Uber
function getUberAuthUrl() {
  return `${UBER_CONFIG.authUrl}?` +
      `client_id=${UBER_CONFIG.clientId}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(UBER_SCOPES)}&` +
      `redirect_uri=${encodeURIComponent(UBER_CONFIG.redirectUri)}`;
}

// Troca o código de autorização por um token de acesso
async function exchangeUberAuthCode(authCode) {
  try {
    const response = await fetch(UBER_CONFIG.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        client_id: UBER_CONFIG.clientId,
        client_secret: UBER_CONFIG.clientSecret,
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: UBER_CONFIG.redirectUri
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro na obtenção do token: ${errorData.error_description || 'Erro desconhecido'}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao trocar código por token:', error);
    throw error;
  }
}

// Obtém o perfil do usuário Uber
async function getUberUserProfile(accessToken) {
  try {
    const response = await fetch(`${UBER_CONFIG.apiBaseUrl}/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro ao obter perfil: ${errorData.message || 'Erro desconhecido'}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao obter perfil do usuário:', error);
    throw error;
  }
}

// Obtém o histórico de viagens do usuário
async function getUberTripHistory(accessToken, limit = 50, offset = 0) {
  try {
    const response = await fetch(`${UBER_CONFIG.apiBaseUrl}/history?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Erro ao obter histórico: ${errorData.message || 'Erro desconhecido'}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Erro ao obter histórico de viagens:', error);
    throw error;
  }
}

// Processa viagens do Uber e as converte para o formato de transações
function convertUberTripsToTransactions(trips, userId) {
  return trips.map(trip => {
    // Extrai data/hora da viagem
    const tripDate = new Date(trip.request_time * 1000);
    
    return {
      user_id: userId,
      description: `Uber: ${trip.start_city.display_name} para ${trip.end_city.display_name}`,
      amount: parseFloat(trip.fare.value),
      currency: trip.fare.currency_code,
      date: tripDate,
      category: 'Transporte',
      subcategory: 'Uber',
      payment_method: 'Uber',
      type: 'expense',
      status: 'completed',
      source: 'uber',
      source_id: trip.uuid,
      metadata: {
        distance: trip.distance,
        duration: trip.duration,
        start_location: `${trip.start_city.display_name} - ${trip.pickup.address || 'Endereço não disponível'}`,
        end_location: `${trip.end_city.display_name} - ${trip.dropoff.address || 'Endereço não disponível'}`
      },
      created_at: new Date()
    };
  });
}

// Rotas da API Uber
const routes = {
  // Iniciar fluxo de autorização
  'GET /api/integrations/uber/auth': async (event) => {
    const authUrl = getUberAuthUrl();
    return {
      statusCode: 302,
      headers: {
        Location: authUrl
      },
      body: ''
    };
  },

  // Receber callback após autorização
  'GET /api/integrations/uber/callback': async (event) => {
    try {
      const code = event.queryStringParameters?.code;
      const error = event.queryStringParameters?.error;

      if (error) {
        return {
          statusCode: 302,
          headers: {
            Location: `/profile.html?error=uber_auth_declined`
          },
          body: ''
        };
      }

      if (!code) {
        return {
          statusCode: 302,
          headers: {
            Location: `/profile.html?error=no_auth_code`
          },
          body: ''
        };
      }

      // Troca o código por token
      const tokenData = await exchangeUberAuthCode(code);
      
      // Armazena o token no banco de dados (associado ao usuário temporário)
      // Normalmente seria necessário extrair o user_id da sessão/cookie/token
      // Aqui usamos um placeholder que deve ser melhorado em produção
      const tempUserId = 'default-user-id';
      
      const db = await connectToDatabase();
      
      // Atualiza ou insere dados de integração para o usuário
      await db.collection('user_integrations').updateOne(
        { user_id: tempUserId, provider: 'uber' },
        { 
          $set: {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: new Date(Date.now() + tokenData.expires_in * 1000),
            scopes: tokenData.scope.split(' '),
            updated_at: new Date()
          },
          $setOnInsert: {
            created_at: new Date()
          }
        },
        { upsert: true }
      );

      // Redireciona para a página de perfil com sucesso
      return {
        statusCode: 302,
        headers: {
          Location: `/profile.html?integration=uber&status=success`
        },
        body: ''
      };
    } catch (error) {
      console.error('Erro no callback da Uber:', error);
      return {
        statusCode: 302,
        headers: {
          Location: `/profile.html?error=uber_callback_error&details=${encodeURIComponent(error.message)}`
        },
        body: ''
      };
    }
  },

  // Sincronizar histórico de viagens
  'POST /api/integrations/uber/sync': async (event) => {
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      const db = await connectToDatabase();
      
      // Buscar os dados de integração do usuário
      const integration = await db.collection('user_integrations').findOne({ 
        user_id: userId, 
        provider: 'uber' 
      });
      
      if (!integration || !integration.access_token) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Integração com Uber não configurada' })
        };
      }
      
      // Verificar se o token está expirado e renovar se necessário
      if (new Date() > new Date(integration.expires_at)) {
        // Lógica para renovar o token usando refresh_token
        // (implementação necessária)
      }
      
      // Obter histórico de viagens
      const tripHistory = await getUberTripHistory(integration.access_token);
      
      // Converter para formato de transações do sistema
      const transactions = convertUberTripsToTransactions(tripHistory.history, userId);
      
      // Salvar no banco de dados (evitando duplicações)
      let inserted = 0;
      let updated = 0;
      
      for (const transaction of transactions) {
        const result = await db.collection('transactions').updateOne(
          { 
            user_id: userId, 
            source: 'uber', 
            source_id: transaction.source_id 
          },
          { 
            $set: transaction,
            $setOnInsert: { created_at: new Date() }
          },
          { upsert: true }
        );
        
        if (result.upsertedCount > 0) {
          inserted++;
        } else if (result.modifiedCount > 0) {
          updated++;
        }
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          total: transactions.length,
          inserted,
          updated,
          message: `Sincronização concluída: ${inserted} novas transações, ${updated} atualizadas`
        })
      };
    } catch (error) {
      console.error('Erro na sincronização do Uber:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          success: false, 
          message: 'Erro ao sincronizar viagens do Uber', 
          error: error.message 
        })
      };
    }
  },

  // Remover integração
  'DELETE /api/integrations/uber': async (event) => {
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      const db = await connectToDatabase();
      
      await db.collection('user_integrations').deleteOne({ 
        user_id: userId, 
        provider: 'uber' 
      });
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: true, 
          message: 'Integração com Uber removida com sucesso' 
        })
      };
    } catch (error) {
      console.error('Erro ao remover integração do Uber:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          success: false, 
          message: 'Erro ao remover integração', 
          error: error.message 
        })
      };
    }
  }
};

// Handler principal da função Netlify
exports.handler = async (event, context) => {
  // Configurar para reutilizar conexão com MongoDB entre invocações
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Construir identificador de rota
  const routeKey = `${event.httpMethod} ${event.path}`;
  
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