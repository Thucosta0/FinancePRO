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
  
  // Rota para validar token
  'GET /validate-token': async (event) => {
    console.log('[ValidateToken] Iniciando validação de token...');
    
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ 
            authenticated: false, 
            message: authResult.error 
          })
        };
      }
      
      // Token válido, retornar dados do usuário
      const userId = authResult.user.id;
      
      // Buscar perfil do usuário
      const { data: user, error } = await supabase
        .from('profiles')
        .select('id, nome, email, created_at')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.warn('[ValidateToken] Erro ao buscar perfil:', error.message);
        // Se falhar a busca do perfil mas o token é válido, retornar apenas o básico
        return {
          statusCode: 200,
          body: JSON.stringify({
            authenticated: true,
            user: { 
              id: authResult.user.id, 
              email: authResult.user.email 
            }
          })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: user.id,
            name: user.nome,
            email: user.email,
            created_at: user.created_at
          }
        })
      };
    } catch (error) {
      console.error('[ValidateToken] Erro:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          authenticated: false, 
          message: 'Erro interno ao validar token' 
        })
      };
    }
  },
  
  // Rota para obter perfil do usuário
  'GET /user/profile': async (event) => {
    console.log('[UserProfile] Iniciando busca de perfil...');
    
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      
      // Buscar perfil do usuário no Supabase
      const { data: user, error } = await supabase
        .from('profiles')
        .select('id, nome, email, created_at')
        .eq('id', userId)
        .single();
      
      if (error) {
        console.warn('[UserProfile] Erro ao buscar perfil:', error.message);
        return {
          statusCode: 404,
          body: JSON.stringify({ message: 'Perfil não encontrado' })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          user: {
            id: user.id,
            name: user.nome,
            email: user.email,
            created_at: user.created_at
          }
        })
      };
    } catch (error) {
      console.error('[UserProfile] Erro:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno ao buscar perfil' })
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
  
  // Rotas para integrações Uber
  'GET /user/integrations': async (event) => {
    console.log('[Integrations] Buscando integrações do usuário...');
    
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      
      // Buscar integrações do usuário no Supabase
      const { data: integrations, error } = await supabase
        .from('integracoes')
        .select('*')
        .eq('usuario_id', userId);
      
      if (error) {
        console.error('[Integrations] Erro ao buscar integrações:', error.message);
        throw error;
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          integrations: integrations || []
        })
      };
    } catch (error) {
      console.error('[Integrations] Erro:', error.message);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro ao buscar integrações', 
          integrations: [] 
        })
      };
    }
  },
  
  // Rota para verificar status das integrações
  'GET /integrations/status': async (event) => {
    console.log('Verificando status das integrações para o usuário:', event.user.id);
    
    try {
      // Consultar integrações ativas do usuário
      const { data: integracoes, error } = await supabase
        .from('integracoes')
        .select('*')
        .eq('usuario_id', event.user.id);
      
      if (error) {
        console.error('Erro ao buscar integrações:', error);
        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Erro ao buscar integrações' })
        };
      }
      
      // Formatar resposta
      const result = {
        uber: null,
        '99': null
      };
      
      // Processar integrações encontradas
      if (integracoes && integracoes.length > 0) {
        for (const integracao of integracoes) {
          if (integracao.provider === 'uber') {
            result.uber = integracao;
            
            // Verificar se o token ainda é válido
            if (integracao.token_expires_at) {
              const expiresAt = new Date(integracao.token_expires_at);
              const now = new Date();
              
              if (expiresAt < now) {
                // Token expirado
                result.uber.status = 'expired';
                console.log('Token do Uber expirado para o usuário:', event.user.id);
              }
            }
          } else if (integracao.provider === '99') {
            result['99'] = integracao;
          }
        }
      }
      
      console.log('Status das integrações recuperado com sucesso');
      return {
        statusCode: 200,
        body: JSON.stringify(result)
      };
    } catch (error) {
      console.error('Erro ao verificar status das integrações:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor' })
      };
    }
  },
  
  // Rota para iniciar autenticação com Uber
  'GET /integrations/uber/auth': async (event) => {
    console.log('Iniciando processo de autenticação com Uber para o usuário:', event.user.id);
    
    try {
      // Configuração do Uber
      const UBER_CLIENT_ID = process.env.UBER_CLIENT_ID;
      const REDIRECT_URI = process.env.API_URL + '/integrations/uber/callback';
      
      if (!UBER_CLIENT_ID || !REDIRECT_URI) {
        console.error('Configurações do Uber não encontradas nas variáveis de ambiente');
        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Erro de configuração do servidor' })
        };
      }
      
      // Montar URL de autorização
      const authUrl = new URL('https://auth.uber.com/oauth/v2/authorize');
      authUrl.searchParams.append('client_id', UBER_CLIENT_ID);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.append('scope', 'profile history');
      
      // O state será adicionado pelo frontend
      
      console.log('URL de autorização Uber gerada com sucesso');
      return {
        statusCode: 200,
        body: JSON.stringify({ authUrl: authUrl.toString() })
      };
    } catch (error) {
      console.error('Erro ao gerar URL de autorização Uber:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ message: 'Erro interno do servidor' })
      };
    }
  },
  
  // Rota para processar callback do Uber
  'GET /integrations/uber/callback': async (event) => {
    console.log('[UberCallback] Processando callback do Uber...');
    
    try {
      const urlParams = new URLSearchParams(event.queryStringParameters);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      
      // Se houver erro na autenticação
      if (error) {
        console.error('[UberCallback] Erro retornado pelo Uber:', error);
        return {
          statusCode: 302,
          headers: {
            Location: '/profile.html?integration=uber&status=error&error=' + error
          },
          body: 'Redirecionando...'
        };
      }
      
      // Se não tiver código de autorização
      if (!code) {
        console.error('[UberCallback] Código de autorização não recebido');
        return {
          statusCode: 302,
          headers: {
            Location: '/profile.html?integration=uber&status=error&error=no_auth_code'
          },
          body: 'Redirecionando...'
        };
      }
      
      // Configurações do Uber
      const UBER_CLIENT_ID = process.env.UBER_CLIENT_ID || 'PbZaiiahWAc-sIH9B4JZf8LtvYu-XnJPOPQVJhAn';
      const UBER_CLIENT_SECRET = process.env.UBER_CLIENT_SECRET || 'YOUR_UBER_CLIENT_SECRET';
      const REDIRECT_URI = process.env.UBER_REDIRECT_URI || 'https://tqorakmunmdmfhpupcxa.supabase.co/auth/v1/callback';
      
      // Trocar o código de autorização por tokens de acesso
      const tokenResponse = await fetch('https://auth.uber.com/oauth/v2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: UBER_CLIENT_ID,
          client_secret: UBER_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: REDIRECT_URI
        }).toString()
      });
      
      // Se a resposta não for bem-sucedida
      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        console.error('[UberCallback] Erro ao obter tokens:', errorData);
        return {
          statusCode: 302,
          headers: {
            Location: '/profile.html?integration=uber&status=error&error=token_exchange_failed'
          },
          body: 'Redirecionando...'
        };
      }
      
      // Processar resposta bem-sucedida
      const tokenData = await tokenResponse.json();
      
      // Obter informações do usuário do Uber
      const userInfoResponse = await fetch('https://api.uber.com/v1.2/me', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`
        }
      });
      
      let userData = {};
      if (userInfoResponse.ok) {
        userData = await userInfoResponse.json();
      } else {
        console.warn('[UberCallback] Erro ao obter dados do usuário Uber');
      }
      
      // Armazenar integração no Supabase
      // Como não temos o usuário pelo token (já que veio do Uber), usaremos o state
      // Em produção, você deve implementar um sistema mais seguro
      if (state) {
        try {
          const userId = state; // Em produção, decodifique e verifique este state
          
          // Verificar se já existe integração para este usuário
          const { data: existingIntegration, error: checkError } = await supabase
            .from('integracoes')
            .select('*')
            .eq('usuario_id', userId)
            .eq('provider', 'uber')
            .single();
          
          const expiresAt = new Date();
          expiresAt.setSeconds(expiresAt.getSeconds() + tokenData.expires_in);
          
          const integrationData = {
            usuario_id: userId,
            provider: 'uber',
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            token_expires_at: expiresAt.toISOString(),
            active: true,
            user_data: userData,
            settings: { scope: tokenData.scope }
          };
          
          // Se já existe, atualizar
          if (existingIntegration && !checkError) {
            const { error: updateError } = await supabase
              .from('integracoes')
              .update(integrationData)
              .eq('id', existingIntegration.id);
              
            if (updateError) {
              console.error('[UberCallback] Erro ao atualizar integração:', updateError);
            }
          } else {
            // Se não existe, criar nova
            const { error: insertError } = await supabase
              .from('integracoes')
              .insert([integrationData]);
              
            if (insertError) {
              console.error('[UberCallback] Erro ao inserir integração:', insertError);
            }
          }
        } catch (dbError) {
          console.error('[UberCallback] Erro no banco de dados:', dbError);
        }
      }
      
      // Redirecionar para a página de perfil com sucesso
      return {
        statusCode: 302,
        headers: {
          Location: '/profile.html?integration=uber&status=success'
        },
        body: 'Redirecionando...'
      };
    } catch (error) {
      console.error('[UberCallback] Erro geral:', error);
      return {
        statusCode: 302,
        headers: {
          Location: '/profile.html?integration=uber&status=error&error=server_error'
        },
        body: 'Redirecionando...'
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
  },
  
  // Rota para sincronizar viagens do Uber
  'POST /integrations/uber/sync': async (event) => {
    console.log('[UberSync] Iniciando sincronização de viagens...');
    
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      
      // Buscar a integração com o Uber no Supabase
      const { data: integration, error: integrationError } = await supabase
        .from('integracoes')
        .select('*')
        .eq('usuario_id', userId)
        .eq('provider', 'uber')
        .eq('active', true)
        .single();
      
      if (integrationError || !integration) {
        console.error('[UberSync] Integração não encontrada:', integrationError?.message);
        return {
          statusCode: 404,
          body: JSON.stringify({ message: 'Integração com Uber não encontrada ou inativa' })
        };
      }
      
      // Verificar se o token está válido
      const now = new Date();
      if (new Date(integration.token_expires_at) < now) {
        // Em produção: implementar lógica para renovar o token usando refresh_token
        console.warn('[UberSync] Token expirado, sincronização não disponível');
        return {
          statusCode: 401,
          body: JSON.stringify({ message: 'Token de acesso expirado, reconecte sua conta Uber' })
        };
      }
      
      // Obter histórico de viagens da API do Uber
      const tripsResponse = await fetch('https://api.uber.com/v1.2/history', {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`
        }
      });
      
      if (!tripsResponse.ok) {
        console.error('[UberSync] Erro ao buscar viagens:', await tripsResponse.text());
        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Erro ao sincronizar viagens do Uber' })
        };
      }
      
      const tripsData = await tripsResponse.json();
      
      // Estatísticas para o relatório
      let inserted = 0;
      let updated = 0;
      let transactions = 0;
      
      // Processar cada viagem
      for (const trip of tripsData.history || []) {
        // Verificar se a viagem já existe no banco
        const { data: existingTrip, error: tripCheckError } = await supabase
          .from('viagens_uber')
          .select('*')
          .eq('usuario_id', userId)
          .eq('uber_id', trip.uuid)
          .single();
        
        // Preparar dados da viagem
        const tripData = {
          usuario_id: userId,
          integracao_id: integration.id,
          uber_id: trip.uuid,
          data: new Date(trip.request_time * 1000).toISOString(),
          valor: trip.fare && parseFloat(trip.fare.value) || 0,
          origem: trip.start_city && trip.start_city.display_name || '',
          destino: trip.end_city && trip.end_city.display_name || '',
          status: trip.status,
          detalhes: trip
        };
        
        // Se a viagem já existe, atualizar
        if (existingTrip && !tripCheckError) {
          const { error: updateError } = await supabase
            .from('viagens_uber')
            .update(tripData)
            .eq('id', existingTrip.id);
          
          if (!updateError) {
            updated++;
            
            // Se já existe transação associada, atualizar
            if (existingTrip.transacao_id) {
              const { error: transUpdateError } = await supabase
                .from('transacoes')
                .update({
                  valor: tripData.valor,
                  data: tripData.data,
                  descricao: `Viagem Uber: ${tripData.origem} → ${tripData.destino}`,
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingTrip.transacao_id);
              
              if (!transUpdateError) transactions++;
            }
          }
        } else {
          // Se é uma nova viagem, inserir
          const { data: newTrip, error: insertError } = await supabase
            .from('viagens_uber')
            .insert([tripData])
            .select();
          
          if (!insertError && newTrip && newTrip.length > 0) {
            inserted++;
            
            // Criar uma transação financeira para esta viagem
            const transactionData = {
              usuario_id: userId,
              title: `Viagem Uber: ${tripData.origem || 'Origem'} → ${tripData.destino || 'Destino'}`,
              descricao: `Viagem Uber em ${new Date(tripData.data).toLocaleDateString('pt-BR')}`,
              amount: tripData.valor,
              valor: tripData.valor,
              type: 'expense',
              tipo: 'expense',
              category: 'transport',
              categoria: 'transport',
              date: tripData.data,
              data: tripData.data,
              created_at: new Date().toISOString(),
              content: `Viagem importada automaticamente da integração com Uber. ID: ${trip.uuid}`
            };
            
            const { data: newTransaction, error: transError } = await supabase
              .from('transacoes')
              .insert([transactionData])
              .select();
            
            if (!transError && newTransaction && newTransaction.length > 0) {
              // Atualizar a viagem com a referência da transação
              await supabase
                .from('viagens_uber')
                .update({ transacao_id: newTransaction[0].id })
                .eq('id', newTrip[0].id);
              
              transactions++;
            }
          }
        }
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Sincronização concluída com sucesso',
          stats: {
            total: tripsData.count || 0,
            inserted,
            updated,
            transactions
          }
        })
      };
    } catch (error) {
      console.error('[UberSync] Erro geral:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno ao sincronizar viagens', 
          error: error.message 
        })
      };
    }
  },
  
  // Rota para desconectar integração com Uber
  'DELETE /integrations/uber': async (event) => {
    console.log('[UberDisconnect] Desconectando integração com Uber...');
    
    try {
      const authResult = await authenticateToken(event.headers.authorization);
      
      if (!authResult.authenticated) {
        return {
          statusCode: 401,
          body: JSON.stringify({ message: authResult.error })
        };
      }
      
      const userId = authResult.user.id;
      
      // Buscar e desativar integração
      const { error: updateError } = await supabase
        .from('integracoes')
        .update({ 
          active: false,
          access_token: null, // Limpar token por segurança
          refresh_token: null,
          updated_at: new Date().toISOString()
        })
        .eq('usuario_id', userId)
        .eq('provider', 'uber');
      
      if (updateError) {
        console.error('[UberDisconnect] Erro ao desativar integração:', updateError);
        return {
          statusCode: 500,
          body: JSON.stringify({ message: 'Erro ao desconectar conta do Uber' })
        };
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          message: 'Integração com Uber desconectada com sucesso',
          success: true
        })
      };
    } catch (error) {
      console.error('[UberDisconnect] Erro:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ 
          message: 'Erro interno ao desconectar integração', 
          error: error.message 
        })
      };
    }
  },
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