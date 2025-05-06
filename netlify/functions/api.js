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

// Backup do usuário para desenvolvimento
const BACKUP_USER = {
  id: "backup-user-id",
  nome: "Usuário Backup",
  email: "admin@financaspro.com",
  senha_hash: "$2a$10$kVB2wxRNpdGPn7.JlBJ8AOUuKIVLWfgjFOjyJsA.Xnm4GVClHxlC2" // senha: admin123
};

// Rotas da API
const routes = {
  // Rota de login - Aprimorada e mais robusta
  'POST /login': async (event) => {
    console.log('[Login] Iniciando processamento de login...');
    
    try {
      // Processar corpo da requisição
      let requestBody;
      try {
        requestBody = JSON.parse(event.body);
      } catch (err) {
        console.error('[Login] Erro ao analisar JSON:', err.message);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Formato JSON inválido' })
        };
      }
      
      const { email, senha } = requestBody;
      console.log(`[Login] Tentativa para email: ${email}`);
      
      if (!email || !senha) {
        console.error('[Login] Email ou senha não fornecidos');
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Email e senha são obrigatórios' })
        };
      }

      try {
        // Tentativa 1: Autenticação via Supabase Auth
        console.log('[Login] Tentando autenticar via Supabase Auth...');
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: email,
          password: senha
        });
        
        // Se autenticação via Auth for bem-sucedida
        if (!authError && authData && authData.user) {
          console.log('[Login] Autenticação via Supabase Auth bem-sucedida!');
          
          // Buscar dados do perfil
          let { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();
          
          // Se não encontrar o perfil, cria automaticamente
          if (profileError || !profileData) {
            console.log('[Login] Perfil não encontrado, criando novo perfil...');
            
            const newProfile = {
              id: authData.user.id,
              nome: authData.user.user_metadata?.nome || "Usuário",
              email: authData.user.email,
              created_at: new Date().toISOString()
            };
            
            const { error: insertError } = await supabase
              .from('profiles')
              .insert([newProfile]);
              
            if (!insertError) {
              profileData = newProfile;
              console.log('[Login] Perfil criado com sucesso');
            } else {
              console.error('[Login] Erro ao criar perfil:', insertError.message);
            }
          }
          
          const userData = profileData || { 
            id: authData.user.id, 
            nome: authData.user.user_metadata?.nome || "Usuário", 
            email: authData.user.email 
          };
          
          // Gerar token JWT
          const token = jwt.sign(
            { id: userData.id, email: userData.email },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Login realizado com sucesso',
              token,
              user: { id: userData.id, nome: userData.nome, email: userData.email }
            })
          };
        } else if (authError) {
          console.log('[Login] Erro Auth:', authError.message);
        }
        
        // Tentativa 2: Se falhar Auth, tenta pela tabela profiles
        console.log('[Login] Tentando autenticar pela tabela profiles...');
        const { data: users, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('email', email)
          .limit(1);
        
        if (error) {
          console.error('[Login] Erro ao buscar usuário na tabela profiles:', error.message);
          throw new Error('Erro ao acessar banco de dados');
        }
        
        const user = users && users.length > 0 ? users[0] : null;
        
        if (!user) {
          // Tentativa 3: Conta de emergência (para desenvolvimento)
          if (email === BACKUP_USER.email) {
            console.log('[Login] Email corresponde ao usuário de backup, verificando senha...');
            const senhaCorreta = await bcrypt.compare(senha, BACKUP_USER.senha_hash);
            
            if (senhaCorreta) {
              console.log('[Login] Login de emergência bem-sucedido');
              const token = jwt.sign(
                { id: BACKUP_USER.id, email: BACKUP_USER.email },
                JWT_SECRET,
                { expiresIn: '7d' }
              );
              
              return {
                statusCode: 200,
                body: JSON.stringify({
                  message: 'Login de emergência realizado com sucesso',
                  token,
                  user: { id: BACKUP_USER.id, nome: BACKUP_USER.nome, email: BACKUP_USER.email }
                })
              };
            }
          }
          
          console.error('[Login] Usuário não encontrado para o email:', email);
          return {
            statusCode: 401,
            body: JSON.stringify({ message: 'Email ou senha inválidos' })
          };
        }
        
        // Verificar senha
        // Se o usuário não tiver hash de senha (caso conta criada via Auth)
        if (!user.senha_hash) {
          console.log('[Login] Usuário sem hash de senha, tentando gerar hash...');
          
          // Tenta atualizar a senha hash para futuros logins
          const hashedPassword = await bcrypt.hash(senha, 10);
          
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ senha_hash: hashedPassword })
            .eq('id', user.id);
            
          if (updateError) {
            console.log('[Login] Aviso: Não foi possível atualizar hash de senha:', updateError.message);
          }
          
          // Assume que é a primeira vez fazendo login e permite acesso
          const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
          );
          
          console.log('[Login] Login por primeiro acesso para:', email);
          return {
            statusCode: 200,
            body: JSON.stringify({
              message: 'Login realizado com sucesso',
              token,
              user: { id: user.id, nome: user.nome, email: user.email }
            })
          };
        }
        
        // Verificação normal de senha hash
        const senhaCorreta = await bcrypt.compare(senha, user.senha_hash);
        
        if (!senhaCorreta) {
          console.error('[Login] Senha incorreta para o email:', email);
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
        
        console.log('[Login] Login bem-sucedido para:', email);
        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'Login realizado com sucesso',
            token,
            user: { id: user.id, nome: user.nome, email: user.email }
          })
        };
      } catch (error) {
        console.error('[Login] Erro ao processar login:', error.message, error.stack);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro na autenticação', 
            error: error.message 
          })
        };
      }
    } catch (error) {
      console.error('[Login] ERRO GERAL:', error.message, error.stack);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
      };
    }
  },
  
  // Rota de registro - Super simplificada e robusta
  'POST /register': async (event) => {
    console.log('[Register] Iniciando processamento de registro...');
    
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
      console.log(`[Register] Tentativa para email: ${email} e nome: ${nome}`);
      
      if (!nome || !email || !senha) {
        console.error('[Register] Campos obrigatórios ausentes:', { nome: !!nome, email: !!email, senha: !!senha });
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Nome, email e senha são obrigatórios' })
        };
      }

      // Primeiro criar no Auth do Supabase (método preferido)
      console.log('[Register] Tentando criar usuário no Supabase Auth...');
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: email,
        password: senha,
        options: {
          data: {
            nome: nome
          }
        }
      });
      
      let userId;
      
      if (!authError && authData && authData.user) {
        // Auth criado com sucesso
        userId = authData.user.id;
        console.log('[Register] Usuário criado com sucesso no Auth com ID:', userId);
      } else {
        // Verificar se o erro é porque o email já existe
        if (authError && authError.message.includes('already')) {
          console.log('[Register] Email já registrado no Auth:', email);
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Este email já está em uso' })
          };
        }
        
        // Se falhar por outro motivo, gerar um UUID para usar
        userId = crypto.randomUUID();
        console.log('[Register] Falha ao criar no Auth, usando UUID gerado:', userId);
      }
      
      // Verificar se o email já existe em profiles (verificação adicional)
      console.log('[Register] Verificando se o email já está em uso na tabela profiles...');
      const { data: existingProfiles, error: checkError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .limit(1);
      
      if (checkError) {
        console.error('[Register] Erro ao verificar email existente:', checkError.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao verificar disponibilidade do email', 
            error: checkError.message 
          })
        };
      }
      
      if (existingProfiles && existingProfiles.length > 0) {
        console.log('[Register] Email já em uso na tabela profiles:', email);
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Este email já está em uso' })
        };
      }
      
      console.log('[Register] Email disponível, prosseguindo com o registro...');
      
      // Criptografar senha
      const hashedPassword = await bcrypt.hash(senha, 10);
      
      // Criar objeto do usuário
      const userData = {
        id: userId,
        nome: nome,
        email: email,
        senha_hash: hashedPassword,
        created_at: new Date().toISOString()
      };
      
      // Inserir o usuário na tabela profiles
      console.log('[Register] Inserindo usuário na tabela profiles...');
      console.log('[Register] Dados a serem inseridos:', JSON.stringify(userData, null, 2));
      
      const { data: insertResult, error: insertError } = await supabase
        .from('profiles')
        .insert([userData]);
      
      if (insertError) {
        console.error('[Register] Erro ao inserir usuário:', insertError.message);
        console.error('[Register] Código do erro:', insertError.code);
        console.error('[Register] Detalhes do erro:', JSON.stringify(insertError, null, 2));
        
        // Verificar se é um erro de violação de restrição única
        if (insertError.code === '23505') {
          return {
            statusCode: 400,
            body: JSON.stringify({ message: 'Este email já está em uso' })
          };
        }
        
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao criar usuário no banco de dados', 
            error: insertError.message 
          })
        };
      }
      
      console.log('[Register] Usuário inserido com sucesso!');
      
      // Gerar token JWT
      const token = jwt.sign(
        { id: userId, email },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log('[Register] Registro finalizado com sucesso para:', email);
      return {
        statusCode: 201,
        body: JSON.stringify({
          message: 'Usuário registrado com sucesso',
          token,
          user: { id: userId, nome, email }
        })
      };
    } catch (error) {
      console.error('[Register] ERRO GERAL:', error.message);
      console.error('[Register] Stack trace completo:', error.stack);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno do servidor ao processar o registro', 
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
      
      try {
        // Primeira tentativa: buscar na tabela profiles
        const { data: user, error } = await supabase
          .from('profiles')
          .select('id, nome, email, created_at')
          .eq('id', userId)
          .single();
        
        if (error) {
          console.error('[UserMe] Erro ao buscar perfil:', error.message);
          throw error;
        }
        
        if (!user) {
          // Segunda tentativa: verificar se existe no Auth
          const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
          
          if (authError || !authUser) {
            console.log('[UserMe] Usuário não encontrado no Auth também');
            return {
              statusCode: 404,
              body: JSON.stringify({ message: 'Usuário não encontrado' })
            };
          }
          
          // Criar um perfil baseado nos dados do Auth
          const userData = {
            id: authUser.user.id,
            nome: authUser.user.user_metadata?.nome || "Usuário",
            email: authUser.user.email,
            created_at: authUser.user.created_at
          };
          
          console.log('[UserMe] Retornando dados do Auth já que perfil não existe');
          return {
            statusCode: 200,
            body: JSON.stringify({ user: userData })
          };
        }
        
        console.log('[UserMe] Usuário encontrado');
        return {
          statusCode: 200,
          body: JSON.stringify({ user })
        };
      } catch (error) {
        console.error('[UserMe] Erro ao buscar usuário:', error.message);
        
        // Verificar se é uma situação de backup
        if (authResult.user.id === BACKUP_USER.id) {
          console.log('[UserMe] Retornando usuário de backup');
          return {
            statusCode: 200,
            body: JSON.stringify({ 
              user: { 
                id: BACKUP_USER.id, 
                nome: BACKUP_USER.nome, 
                email: BACKUP_USER.email,
                created_at: new Date().toISOString()
              } 
            })
          };
        }
        
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao obter perfil', 
            error: error.message 
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
        
        if (error) {
          console.error('[Transactions] Erro ao buscar transações:', error.message);
          throw error;
        }
        
        console.log('[Transactions] Transações obtidas do Supabase');
        
        // Garantir que o retorno sempre seja um array
        const transactionsArray = Array.isArray(transactions) ? transactions : [];
        console.log(`[Transactions] Retornando ${transactionsArray.length} transações`);
        
        return {
          statusCode: 200,
          body: JSON.stringify({ transactions: transactionsArray })
        };
      } catch (error) {
        console.error('[Transactions] Erro ao buscar transações:', error.message);
        
        // Em caso de erro, retornar um array vazio
        return {
          statusCode: 200,
          body: JSON.stringify({ transactions: [] })
        };
      }
    } catch (error) {
      console.error('[Transactions] ERRO:', error.message);
      
      // Mesmo em caso de erro, retornar um array vazio
      return {
        statusCode: 200,
        body: JSON.stringify({ transactions: [] })
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
      } catch (error) {
        console.error('[DeleteTransaction] Erro ao excluir transação:', error.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao excluir transação', 
            error: error.message 
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
        // Gerar ID único para a transação
        const transactionId = crypto.randomUUID();
        
        // Preparar dados da transação
        const transactionData = {
          id: transactionId,
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
          content: content || '',
          created_at: new Date().toISOString()
        };
        
        // Inserir transação no Supabase
        const { data, error } = await supabase
          .from('transacoes')
          .insert([transactionData]);
        
        if (error) {
          console.error('[AddTransaction] Erro ao salvar no Supabase:', error.message);
          throw error;
        }
        
        console.log('[AddTransaction] Transação salva no Supabase:', transactionId);
        return {
          statusCode: 201,
          body: JSON.stringify({ 
            message: 'Transação adicionada com sucesso',
            transaction: transactionData
          })
        };
      } catch (error) {
        console.error('[AddTransaction] Erro ao adicionar transação:', error.message);
        return {
          statusCode: 500,
          body: JSON.stringify({ 
            message: 'Erro ao adicionar transação', 
            error: error.message 
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

// Função principal para processar as requisições
exports.handler = async (event, context) => {
  console.log(`Recebido: ${event.httpMethod} ${event.path}`);
  
  // Adicionar cabeçalhos CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };
  
  // Verificar se é uma requisição OPTIONS (preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }
  
  try {
    // Construir a chave da rota
    const routeKey = `${event.httpMethod} ${event.path.replace('/.netlify/functions/api', '')}`;
    console.log(`Procurando rota: "${routeKey}"`);
    
    // Verificar se a rota existe
    const route = routes[routeKey];
    
    if (route) {
      console.log(`Rota encontrada: ${routeKey}`);
      const response = await route(event);
      
      // Adicionar cabeçalhos CORS à resposta
      return {
        ...response,
        headers: { ...headers, ...response.headers }
      };
    }
    
    // Rota não encontrada
    console.log(`Rota não encontrada: ${routeKey}`);
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ message: 'Endpoint não encontrado' })
    };
  } catch (error) {
    console.error(`ERRO FATAL: ${error.message}`);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ message: 'Erro interno do servidor', error: error.message })
    };
  }
}; 