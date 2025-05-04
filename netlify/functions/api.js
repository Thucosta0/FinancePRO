// Função principal para gerenciar a API do FinançasPRO no Netlify
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ===== CONFIGURAÇÕES SUPABASE =====
// Credenciais do projeto Supabase
const SUPABASE_URL = 'https://tqorakmunmdmfhpupcxa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxb3Jha211bm1kbWZocHVwY3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjA0OTYwMTksImV4cCI6MjAzNjA3MjAxOX0.eyJpc3MiOiJzdXBhYmFzZSJ9';

// Opção de modo offline (fallback se Supabase não funcionar)
const MODO_OFFLINE = true; // Mude para false depois de testar a conexão com Supabase

// Inicializar o cliente Supabase
const supabase = SUPABASE_URL && SUPABASE_KEY ? 
  createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// DB Local (Apenas para solução temporária - modo offline)
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
console.log('Modo Supabase:', supabase ? 'ATIVO' : 'INATIVO');
console.log('Modo offline (fallback):', MODO_OFFLINE ? 'ATIVO' : 'INATIVO');
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
        mode: supabase ? 'Supabase' : (MODO_OFFLINE ? 'offline (sem banco de dados)' : 'error'),
        environment: process.env.NODE_ENV || 'development'
      })
    };
  },
  
  // Rota de status
  'GET /status': async () => {
    // Testar conexão com Supabase se estiver ativo
    let supabaseStatus = 'disabled';
    if (supabase) {
      try {
        const { data, error } = await supabase.from('users').select('count', { count: 'exact', head: true });
        supabaseStatus = error ? 'error' : 'connected';
      } catch (err) {
        supabaseStatus = 'error';
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "operational",
        mode: supabase ? "Supabase" : (MODO_OFFLINE ? "offline" : "error"),
        supabase: supabaseStatus,
        timestamp: new Date().toISOString(),
        message: supabase 
          ? "Sistema funcionando com Supabase" 
          : (MODO_OFFLINE ? "Sistema funcionando no modo offline (sem banco de dados)" : "Erro de configuração")
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

      // Tentar login com Supabase
      if (supabase) {
        console.log('[Login] Usando Supabase...');
        try {
          // Buscar usuário pelo email
          const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(1);
          
          if (error) throw error;
          
          const user = users && users.length > 0 ? users[0] : null;
          
          if (!user) {
            console.log('[Login] Usuário não encontrado');
            return {
              statusCode: 401,
              body: JSON.stringify({ message: 'Email ou senha inválidos' })
            };
          }
          
          // Verificar senha
          const isPasswordValid = await bcrypt.compare(senha, user.senha_hash);
          
          if (!isPasswordValid) {
            console.log('[Login] Senha inválida');
            return {
              statusCode: 401,
              body: JSON.stringify({ message: 'Email ou senha inválidos' })
            };
          }
          
          // Gerar token JWT
          const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          
          console.log('[Login] Login bem-sucedido via Supabase');
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Login realizado com sucesso',
              token,
              user: { id: user.id, nome: user.nome, email: user.email }
            })
          };
        } catch (supabaseError) {
          console.error('[Login] Erro no Supabase:', supabaseError.message);
          // Se falhar, tentar modo offline se habilitado
          if (!MODO_OFFLINE) {
            return {
              statusCode: 500,
              body: JSON.stringify({ 
                message: 'Erro na autenticação', 
                error: supabaseError.message 
              })
            };
          }
          // Prosseguir para modo offline
          console.log('[Login] Caindo para modo offline devido a erro do Supabase');
        }
      }
      
      // Login em modo offline (fallback)
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
              message: 'Login realizado com sucesso (modo offline)',
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
        
        console.log('[Login] Login bem-sucedido (modo offline)');
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Login realizado com sucesso (modo offline)',
            token,
            user: { id: user._id, nome: user.nome, email: user.email }
          })
        };
      }
      
      // Se chegou aqui é porque nem Supabase nem modo offline estão configurados
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro de configuração - nenhum banco de dados disponível' })
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

      // Criptografar senha - usada em ambos os modos
      const hashedPassword = await bcrypt.hash(senha, 10);
      
      // Tentar registro com Supabase
      if (supabase) {
        console.log('[Register] Usando Supabase...');
        try {
          // Verificar se o email já está em uso
          const { data: existingUsers, error: checkError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .limit(1);
          
          if (checkError) throw checkError;
          
          if (existingUsers && existingUsers.length > 0) {
            console.log('[Register] Email já em uso');
            return {
              statusCode: 400,
              body: JSON.stringify({ message: 'Este email já está em uso' })
            };
          }
          
          // Inserir novo usuário
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([
              { 
                nome, 
                email, 
                senha_hash: hashedPassword
              }
            ])
            .select();
          
          if (insertError) throw insertError;
          
          const user = newUser[0];
          
          // Gerar token JWT
          const token = jwt.sign(
            { id: user.id, email },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          
          console.log('[Register] Registro bem-sucedido via Supabase');
          return {
            statusCode: 201,
            body: JSON.stringify({
              message: 'Usuário registrado com sucesso',
              token,
              user: { id: user.id, nome, email }
            })
          };
        } catch (supabaseError) {
          console.error('[Register] Erro no Supabase:', supabaseError.message);
          // Se falhar, tentar modo offline se habilitado
          if (!MODO_OFFLINE) {
            return {
              statusCode: 500,
              body: JSON.stringify({ 
                message: 'Erro no registro', 
                error: supabaseError.message 
              })
            };
          }
          // Prosseguir para modo offline
          console.log('[Register] Caindo para modo offline devido a erro do Supabase');
        }
      }
      
      // Registro em modo offline (fallback)
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
        
        // Criar ID único (simulando UUID)
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
        
        console.log('[Register] Registro concluído com sucesso (modo offline)');
        return {
          statusCode: 201,
          body: JSON.stringify({
            message: 'Usuário registrado com sucesso (modo offline)',
            token,
            user: { id: newId, nome, email }
          })
        };
      }
      
      // Se chegou aqui é porque nem Supabase nem modo offline estão configurados
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro de configuração - nenhum banco de dados disponível' })
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
      
      const userId = authResult.user.id;
      
      // Tentar buscar usuário com Supabase
      if (supabase) {
        console.log('[UserMe] Usando Supabase...');
        try {
          const { data: user, error } = await supabase
            .from('users')
            .select('id, nome, email, created_at')
            .eq('id', userId)
            .single();
          
          if (error) throw error;
          
          if (!user) {
            return {
              statusCode: 404,
              body: JSON.stringify({ message: 'Usuário não encontrado' })
            };
          }
          
          console.log('[UserMe] Usuário encontrado via Supabase');
          return {
            statusCode: 200,
            body: JSON.stringify({ user })
          };
        } catch (supabaseError) {
          console.error('[UserMe] Erro no Supabase:', supabaseError.message);
          // Se falhar, tentar modo offline se habilitado
          if (!MODO_OFFLINE) {
            return {
              statusCode: 500,
              body: JSON.stringify({ 
                message: 'Erro ao obter perfil', 
                error: supabaseError.message 
              })
            };
          }
          // Prosseguir para modo offline
          console.log('[UserMe] Caindo para modo offline devido a erro do Supabase');
        }
      }
      
      // Buscar usuário em modo offline (fallback)
      if (MODO_OFFLINE) {
        console.log('[UserMe] Usando modo offline...');
        
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
        
        console.log('[UserMe] Usuário encontrado (modo offline)');
        return {
          statusCode: 200,
          body: JSON.stringify({ user: userWithoutPassword })
        };
      }
      
      // Se chegou aqui é porque nem Supabase nem modo offline estão configurados
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro de configuração - nenhum banco de dados disponível' })
      };
    } catch (error) {
      console.error('[UserMe] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota para listar transações (apenas com Supabase)
  'GET /transactions': async (event) => {
    try {
      console.log('[Transactions] Iniciando processamento...');
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      
      // Tentar buscar transações com Supabase
      if (supabase) {
        console.log('[Transactions] Usando Supabase...');
        try {
          const { data: transactions, error } = await supabase
            .from('transacoes')
            .select('*')
            .eq('user_id', userId)
            .order('data', { ascending: false });
          
          if (error) throw error;
          
          console.log('[Transactions] Transações obtidas via Supabase');
          return {
            statusCode: 200,
            body: JSON.stringify({ transactions: transactions || [] })
          };
        } catch (supabaseError) {
          console.error('[Transactions] Erro no Supabase:', supabaseError.message);
          return {
            statusCode: 500,
            body: JSON.stringify({ 
              message: 'Erro ao obter transações', 
              error: supabaseError.message 
            })
          };
        }
      }
      
      // Modo offline para transações (simplificado)
      if (MODO_OFFLINE) {
        console.log('[Transactions] Usando modo offline...');
        const userTransactions = dbLocal.transacoes.filter(t => t.user_id === userId) || [];
        
        return {
          statusCode: 200,
          body: JSON.stringify({ 
            transactions: userTransactions,
            message: 'Transações em modo offline (exemplo)'
          })
        };
      }
      
      return {
        statusCode: 501,
        body: JSON.stringify({ message: 'Funcionalidade não implementada' })
      };
    } catch (error) {
      console.error('[Transactions] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota para excluir uma transação
  'DELETE /transactions/:id': async (event) => {
    try {
      console.log('[DeleteTransaction] Iniciando processamento...');
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      const transactionId = event.path.split('/').pop();
      
      console.log(`[DeleteTransaction] Tentando excluir transação ${transactionId} para usuário ${userId}`);
      
      // Tentar excluir com Supabase
      if (supabase) {
        console.log('[DeleteTransaction] Usando Supabase...');
        try {
          const { data, error } = await supabase
            .from('transacoes')
            .delete()
            .eq('id', transactionId)
            .eq('usuario_id', userId);
          
          if (error) throw error;
          
          console.log('[DeleteTransaction] Transação excluída via Supabase');
          return {
            statusCode: 200,
            body: JSON.stringify({ 
              message: 'Transação excluída com sucesso',
              success: true
            })
          };
        } catch (supabaseError) {
          console.error('[DeleteTransaction] Erro no Supabase:', supabaseError.message);
          // Se falhar, tentar modo offline se habilitado
          if (!MODO_OFFLINE) {
            return {
              statusCode: 500,
              body: JSON.stringify({ 
                message: 'Erro ao excluir transação', 
                error: supabaseError.message 
              })
            };
          }
          // Prosseguir para modo offline
          console.log('[DeleteTransaction] Caindo para modo offline devido a erro do Supabase');
        }
      }
      
      // Modo offline para exclusão de transações
      if (MODO_OFFLINE) {
        console.log('[DeleteTransaction] Usando modo offline...');
        
        // Encontrar o índice da transação a ser excluída
        const index = dbLocal.transacoes.findIndex(t => 
          t.id === transactionId && t.user_id === userId
        );
        
        if (index === -1) {
          return {
            statusCode: 404,
            body: JSON.stringify({ message: 'Transação não encontrada' })
          };
        }
        
        // Remover a transação do array
        dbLocal.transacoes.splice(index, 1);
        
        console.log('[DeleteTransaction] Transação excluída (modo offline)');
        return {
          statusCode: 200,
          body: JSON.stringify({ 
            message: 'Transação excluída com sucesso (modo offline)',
            success: true
          })
        };
      }
      
      return {
        statusCode: 501,
        body: JSON.stringify({ message: 'Funcionalidade não implementada' })
      };
    } catch (error) {
      console.error('[DeleteTransaction] ERRO:', error.message);
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