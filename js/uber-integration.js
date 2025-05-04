/**
 * Uber API Integration Module
 * Este módulo gerencia a integração com a API da Uber para o Financas Pro
 */

// Configurações da integração Uber
const UBER_CONFIG = {
    clientId: process.env.UBER_CLIENT_ID,
    clientSecret: process.env.UBER_CLIENT_SECRET,
    redirectUri: process.env.UBER_REDIRECT_URI,
    authUrl: process.env.UBER_AUTH_URL,
    tokenUrl: process.env.UBER_TOKEN_URL,
    apiBaseUrl: process.env.UBER_API_BASE_URL
};

// Escopos requisitados: perfil de usuário e histórico de viagens
const UBER_SCOPES = 'profile history history_lite';

/**
 * Gera a URL de autorização para o fluxo OAuth da Uber
 * @returns {string} URL de autorização
 */
function getUberAuthUrl() {
    return `${UBER_CONFIG.authUrl}?` +
        `client_id=${UBER_CONFIG.clientId}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(UBER_SCOPES)}&` +
        `redirect_uri=${encodeURIComponent(UBER_CONFIG.redirectUri)}`;
}

/**
 * Troca o código de autorização por um token de acesso
 * @param {string} authCode - Código de autorização recebido no callback
 * @returns {Promise<Object>} - Token de acesso e informações relacionadas
 */
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

/**
 * Obtém o perfil do usuário Uber
 * @param {string} accessToken - Token de acesso
 * @returns {Promise<Object>} - Dados do perfil do usuário
 */
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

/**
 * Obtém o histórico de viagens do usuário
 * @param {string} accessToken - Token de acesso
 * @param {number} limit - Número máximo de registros (padrão: 50)
 * @param {number} offset - Deslocamento para paginação
 * @returns {Promise<Object>} - Histórico de viagens
 */
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

/**
 * Processa viagens do Uber e as converte para o formato de transações do Financas Pro
 * @param {Array} trips - Lista de viagens do Uber
 * @param {string} userId - ID do usuário no sistema
 * @returns {Array} - Transações formatadas
 */
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

/**
 * Inicializa as rotas de integração da Uber no Express
 * @param {Object} app - Instância do Express
 * @param {Object} db - Instância do banco de dados
 */
function initUberRoutes(app, db) {
    // Rota para iniciar o fluxo de autorização
    app.get('/api/integrations/uber/auth', (req, res) => {
        res.redirect(getUberAuthUrl());
    });

    // Rota para receber o callback após autorização
    app.get('/api/integrations/uber/callback', async (req, res) => {
        try {
            const { code } = req.query;
            const { error } = req.query;

            if (error) {
                return res.redirect('/profile.html?error=uber_auth_declined');
            }

            if (!code) {
                return res.redirect('/profile.html?error=no_auth_code');
            }

            // Troca o código por token
            const tokenData = await exchangeUberAuthCode(code);
            
            // Armazena o token no banco de dados (associado ao usuário)
            // Aqui você deve pegar o ID do usuário da sessão atual
            const userId = req.user.id; // Ajuste conforme seu sistema de autenticação
            
            // Atualiza ou insere dados de integração para o usuário
            await db.collection('user_integrations').updateOne(
                { user_id: userId, provider: 'uber' },
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
            res.redirect('/profile.html?integration=uber&status=success');
        } catch (error) {
            console.error('Erro no callback da Uber:', error);
            res.redirect(`/profile.html?error=uber_callback_error&details=${encodeURIComponent(error.message)}`);
        }
    });

    // Rota para sincronizar histórico de viagens
    app.post('/api/integrations/uber/sync', async (req, res) => {
        try {
            // Obter ID do usuário da sessão
            const userId = req.user.id;
            
            // Buscar os dados de integração do usuário
            const integration = await db.collection('user_integrations').findOne({ 
                user_id: userId, 
                provider: 'uber' 
            });
            
            if (!integration || !integration.access_token) {
                return res.status(400).json({ message: 'Integração com Uber não configurada' });
            }
            
            // Verificar se o token está expirado e renovar se necessário
            if (new Date() > integration.expires_at) {
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
            
            res.json({
                success: true,
                total: transactions.length,
                inserted,
                updated,
                message: `Sincronização concluída: ${inserted} novas transações, ${updated} atualizadas`
            });
        } catch (error) {
            console.error('Erro na sincronização do Uber:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Erro ao sincronizar viagens do Uber', 
                error: error.message 
            });
        }
    });

    // Rota para remover integração
    app.delete('/api/integrations/uber', async (req, res) => {
        try {
            const userId = req.user.id;
            
            await db.collection('user_integrations').deleteOne({ 
                user_id: userId, 
                provider: 'uber' 
            });
            
            res.json({ 
                success: true, 
                message: 'Integração com Uber removida com sucesso' 
            });
        } catch (error) {
            console.error('Erro ao remover integração do Uber:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Erro ao remover integração', 
                error: error.message 
            });
        }
    });
}

module.exports = {
    getUberAuthUrl,
    exchangeUberAuthCode,
    getUberUserProfile,
    getUberTripHistory,
    convertUberTripsToTransactions,
    initUberRoutes
}; 