// Função principal para gerenciar a API do FinançasPRO no Netlify
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// ===== CONFIGURAÇÕES SUPABASE =====
// Credenciais do projeto Supabase
const SUPABASE_URL = 'https://tqorakmunmdmfhpupcxa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxb3Jha211bm1kbWZocHVwY3hhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjA0OTYwMTksImV4cCI6MjAzNjA3MjAxOX0.eyJpc3MiOiJzdXBhYmFzZSJ9';

// Inicializar o cliente Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Configurações
const JWT_SECRET = 'financaspro-secure-token-2024';

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

      // Login usando Supabase Auth API
      try {
        // Primeiro, tente fazer login com a autenticação nativa do Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password: senha
        });
        
        if (authError) {
          console.log('[Login] Erro no login via Supabase Auth:', authError.message);
          
          // Se falhar no login nativo (talvez o usuário foi criado de outra forma),
          // tentaremos o método alternativo buscando o perfil
          const { data: users, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', email)
            .limit(1);
          
          console.log('[Login] Resultado da consulta de perfil:', users);
          
          if (error) {
            throw error;
          }
          
          const user = users && users.length > 0 ? users[0] : null;
          
          if (!user) {
            return {
              statusCode: 401,
              body: JSON.stringify({ message: 'Email ou senha inválidos' })
            };
          }
          
          // Verificar senha (caso usando hash personalizado)
          if (user.senha_hash) {
            const senhaCorreta = await bcrypt.compare(senha, user.senha_hash);
            
            if (!senhaCorreta) {
              return {
                statusCode: 401,
                body: JSON.stringify({ message: 'Email ou senha inválidos' })
              };
            }
          } else {
            return {
              statusCode: 401,
              body: JSON.stringify({ message: 'Método de autenticação não suportado para este usuário' })
            };
          }
          
          // Gerar token JWT
          const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          
          console.log('[Login] Login bem-sucedido via perfil personalizado');
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Login realizado com sucesso',
              token,
              user: { id: user.id, nome: user.nome, email: user.email }
            })
          };
        }
        
        // Login bem-sucedido via Supabase Auth
        const user = authData.user;
        
        // Obter o perfil completo do usuário
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (profileError) {
          console.warn('[Login] Aviso ao obter perfil completo:', profileError.message);
        }
        
        // Gerar token JWT
        const token = jwt.sign(
          { id: user.id, email: user.email },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        const userProfile = profileData || { 
          id: user.id, 
          nome: user.user_metadata?.nome || 'Usuário', 
          email: user.email 
        };
        
        console.log('[Login] Login bem-sucedido via Supabase Auth');
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Login realizado com sucesso',
            token,
            user: { 
              id: userProfile.id, 
              nome: userProfile.nome, 
              email: userProfile.email 
            }
          })
        };
      } catch (supabaseError) {
        console.error('[Login] Erro no Supabase:', supabaseError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro na autenticação', 
            error: supabaseError.message 
          })
        };
      }
    } catch (error) {
      console.error('[Login] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota de registro - SIMPLIFICADA
  'POST /register': async (event) => {
    console.log('[Register] Iniciando processamento de registro simplificado...');
    
    try {
      // Processar corpo da requisição
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
      } catch (err) {
        console.error('[Register] Erro ao analisar JSON:', err.message);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Formato JSON inválido' })
        };
      }
      
      const { nome, email, senha } = requestBody;
      console.log(`[Register] Tentativa para email: ${email}`);
      
      if (!nome || !email || !senha) {
        console.error('[Register] Campos obrigatórios ausentes');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Nome, email e senha são obrigatórios' })
        };
      }

      // Método de emergência - criar usuário diretamente com ID UUID
      try {
        // Gerar ID único
        const userId = crypto.randomUUID();
        console.log(`[Register] Criando usuário com ID: ${userId}`);
        
        // Criptografar senha
        const hashedPassword = await bcrypt.hash(senha, 10);
        
        // Inserir dados diretamente na tabela profiles
        const { data: newUser, error: insertError } = await supabase
          .from('profiles')
          .insert([
            {
              id: userId,
              email: email,
              nome: nome,
              senha_hash: hashedPassword,
              created_at: new Date().toISOString()
            }
          ])
          .select();
        
        if (insertError) {
          console.error('[Register] Erro ao inserir perfil:', insertError.message);
          throw insertError;
        }
        
        console.log('[Register] Perfil criado com sucesso:', newUser);
        
        // Gerar token JWT
        const token = jwt.sign(
          { id: userId, email },
          JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        return {
          statusCode: 201,
          body: JSON.stringify({
            message: 'Usuário registrado com sucesso',
            token,
            user: { id: userId, nome, email }
          })
        };
      } catch (dbError) {
        console.error('[Register] Erro ao salvar usuário:', dbError.message);
        console.error('[Register] Detalhes:', JSON.stringify(dbError));
        
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao criar usuário', 
            error: dbError.message 
          })
        };
      }
    } catch (error) {
      console.error('[Register] ERRO GERAL:', error.message);
      console.error('[Register] Stack trace:', error.stack);
      
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor', 
          error: error.message 
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
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      
      // Buscar usuário no Supabase
      try {
        const { data: user, error } = await supabase
          .from('profiles')
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
        
        console.log('[UserMe] Usuário encontrado');
        return {
          statusCode: 200,
          body: JSON.stringify({ user })
        };
      } catch (supabaseError) {
        console.error('[UserMe] Erro no Supabase:', supabaseError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao obter perfil', 
            error: supabaseError.message 
          })
        };
      }
    } catch (error) {
      console.error('[UserMe] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota para listar transações
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
      
      try {
        // Buscar transações no Supabase
        const { data: transactions, error } = await supabase
          .from('transacoes')
          .select('*')
          .eq('usuario_id', userId)
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
      
      try {
        // Excluir no Supabase
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
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao excluir transação', 
            error: supabaseError.message 
          })
        };
      }
    } catch (error) {
      console.error('[DeleteTransaction] ERRO:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota para adicionar uma nova transação
  'POST /transactions': async (event) => {
    try {
      console.log('[AddTransaction] Iniciando processamento...');
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      // Extrair dados da requisição
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
      } catch (err) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Formato JSON inválido' })
        };
      }
      
      const { title, amount, type, category, date, content } = requestBody;
      const userId = authResult.user.id;
      
      console.log('[AddTransaction] Dados recebidos:', { title, amount, type, category, date });
      
      // Validar campos obrigatórios
      if (!title || !amount || !type || !category || !date) {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Todos os campos obrigatórios devem ser preenchidos' })
        };
      }
      
      try {
        // Inserir transação no Supabase
        const { data, error } = await supabase
          .from('transacoes')
          .insert([
            {
              usuario_id: userId,
              title: title,
              descricao: title,
              amount: parseFloat(amount),
              valor: parseFloat(amount),
              type: type,
              tipo: type,
              category: category,
              categoria: category,
              date: date,
              data: date,
              content: content || ''
            }
          ])
          .select();
        
        if (error) {
          console.error('[AddTransaction] Erro ao salvar no Supabase:', error.message);
          throw error;
        }
        
        console.log('[AddTransaction] Transação salva no Supabase:', data);
        return {
          statusCode: 201,
          body: JSON.stringify({ 
            message: 'Transação adicionada com sucesso',
            transaction: data[0]
          })
        };
      } catch (supabaseError) {
        console.error('[AddTransaction] Erro no Supabase:', supabaseError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao adicionar transação', 
            error: supabaseError.message 
          })
        };
      }
    } catch (error) {
      console.error('[AddTransaction] ERRO:', error.message);
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