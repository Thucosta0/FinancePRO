// URL base para todas as chamadas de API
const API_URL = '/api';

// Obter token de autenticação do localStorage
const authToken = localStorage.getItem('authToken');

// Elementos DOM - Perfil
const userNameElement = document.getElementById('userName');
const userEmailElement = document.getElementById('userEmail');
const profileForm = document.getElementById('profileForm');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');

// Elementos DOM - Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Elementos DOM - Alteração de Senha
const passwordForm = document.getElementById('passwordForm');
const currentPasswordInput = document.getElementById('currentPassword');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const passwordStrength = document.getElementById('passwordStrength');
const strengthText = document.getElementById('strengthText');

// Elementos DOM - Integrações
const uberStatusElement = document.getElementById('uber-status');
const app99StatusElement = document.getElementById('app99-status');
const connectUberBtn = document.getElementById('connectUberBtn');
const disconnectUberBtn = document.getElementById('disconnectUberBtn');
const connect99Btn = document.getElementById('connect99Btn');
const disconnect99Btn = document.getElementById('disconnect99Btn');

// Elemento DOM - Logout
const logoutBtn = document.getElementById('logoutBtn');

// Função para mostrar alerta
function showAlert(message, type = 'error') {
    const alertContainer = document.querySelector('.alert-container');
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <div class="alert-icon">
            <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        </div>
        <div class="alert-content">
            <p>${message}</p>
        </div>
        <button class="alert-close">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    alertContainer.appendChild(alert);
    
    // Adicionar evento para fechar alerta
    alert.querySelector('.alert-close').addEventListener('click', () => {
        alert.remove();
    });
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
        if (alert.parentNode) {
            alert.remove();
        }
    }, 5000);
}

// Função para verificar se o usuário está logado
function checkAuthentication() {
    console.log('Verificando autenticação na página de perfil...');
    
    // Verificar se tem token no localStorage
    const token = localStorage.getItem('authToken');
    
    if (!token) {
        console.log('Nenhum token encontrado. Redirecionando para login...');
        // Salvar a página atual para redirecionamento após login
        localStorage.setItem('redirectAfterLogin', window.location.href);
        window.location.href = 'index.html?message=login_required';
        return false;
    }
    
    // Verificar expiração do token
    const tokenExpiration = localStorage.getItem('tokenExpiration');
    if (tokenExpiration && new Date(tokenExpiration) < new Date()) {
        console.warn('Token expirado! Redirecionando para login...');
        localStorage.removeItem('authToken');
        localStorage.removeItem('tokenExpiration');
        localStorage.removeItem('currentUser');
        
        // Salvar a página atual para redirecionamento após login
        localStorage.setItem('redirectAfterLogin', window.location.href);
        window.location.href = 'index.html?message=session_expired';
        return false;
    }
    
    return true;
}

// Carregar dados do usuário
async function loadUserProfile() {
    console.log('Carregando perfil do usuário...');
    
    if (!checkAuthentication()) {
        console.warn('Tentativa de carregar perfil sem autenticação');
        return;
    }
    
    try {
        const token = getToken();
        
        const response = await fetch('/api/user/profile', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                console.warn('Token inválido ou expirado ao carregar perfil');
                // Redirecionar para login se token estiver inválido
                localStorage.removeItem('authToken');
                localStorage.removeItem('tokenExpiration');
                localStorage.removeItem('currentUser');
                window.location.href = 'index.html?message=session_expired';
                return;
            }
            throw new Error('Falha ao carregar perfil');
        }
        
        const data = await response.json();
        console.log('Dados do perfil carregados com sucesso');
        
        // Preencher dados do perfil
        const user = data.user || {};
        
        // Atualizar nome de usuário
        const userNameElements = document.querySelectorAll('.user-name, #userName');
        userNameElements.forEach(el => {
            if (el) el.textContent = user.name || user.nome || user.email?.split('@')[0] || 'Usuário';
        });
        
        // Atualizar email
        const userEmailElements = document.querySelectorAll('.user-email, #userEmail');
        userEmailElements.forEach(el => {
            if (el) el.textContent = user.email || '';
        });
        
        // Preencher campos do formulário se existirem
        const nameInput = document.getElementById('name');
        if (nameInput) nameInput.value = user.name || user.nome || '';
        
        const emailInput = document.getElementById('email');
        if (emailInput) emailInput.value = user.email || '';
        
        // Salvar os dados do usuário no localStorage (cache)
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        return user;
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        showAlert('Não foi possível carregar seus dados de perfil. Por favor, tente novamente.', 'error');
        return null;
    }
}

// Carregar status das integrações
async function loadIntegrations() {
    if (!checkAuthentication()) return;
    
    try {
        const response = await fetch(`${API_URL}/integrations`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Falha ao carregar integrações');
        }
        
        const integrations = await response.json();
        
        // Atualizar UI para o Uber
        if (integrations.uber) {
            uberStatusElement.textContent = 'Conectado';
            uberStatusElement.className = 'status-connected';
            connectUberBtn.style.display = 'none';
            disconnectUberBtn.style.display = 'block';
        } else {
            uberStatusElement.textContent = 'Não conectado';
            uberStatusElement.className = 'status-disconnected';
            connectUberBtn.style.display = 'block';
            disconnectUberBtn.style.display = 'none';
        }
        
        // Atualizar UI para o 99
        if (integrations.app99) {
            app99StatusElement.textContent = 'Conectado';
            app99StatusElement.className = 'status-connected';
            connect99Btn.style.display = 'none';
            disconnect99Btn.style.display = 'block';
        } else {
            app99StatusElement.textContent = 'Não conectado';
            app99StatusElement.className = 'status-disconnected';
            connect99Btn.style.display = 'block';
            disconnect99Btn.style.display = 'none';
        }
    } catch (error) {
        console.error('Erro ao carregar integrações:', error);
        showAlert('Não foi possível carregar o status das integrações. Por favor, tente novamente.');
    }
}

// Atualizar perfil do usuário
async function updateProfile(event) {
    event.preventDefault();
    
    if (!checkAuthentication()) return;
    
    const nome = nameInput.value.trim();
    const email = emailInput.value.trim();
    
    if (!nome || !email) {
        showAlert('Por favor, preencha todos os campos');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/user/profile`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nome, email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Falha ao atualizar perfil');
        }
        
        const data = await response.json();
        
        // Atualizar token armazenado
        localStorage.setItem('authToken', data.token);
        
        // Atualizar UI
        userNameElement.textContent = nome;
        userEmailElement.textContent = email;
        
        showAlert('Perfil atualizado com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao atualizar perfil:', error);
        showAlert(error.message || 'Não foi possível atualizar seu perfil. Por favor, tente novamente.');
    }
}

// Alterar senha
async function changePassword(event) {
    event.preventDefault();
    
    if (!checkAuthentication()) return;
    
    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showAlert('Por favor, preencha todos os campos');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showAlert('As senhas não coincidem');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/user/password`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                currentPassword, 
                newPassword 
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Falha ao alterar senha');
        }
        
        // Limpar campos
        passwordForm.reset();
        passwordStrength.style.width = '0%';
        strengthText.textContent = 'Força: Fraca';
        
        showAlert('Senha alterada com sucesso!', 'success');
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        showAlert(error.message || 'Não foi possível alterar sua senha. Por favor, tente novamente.');
    }
}

// Verificar força da senha
function checkPasswordStrength(password) {
    let strength = 0;
    
    // Tamanho mínimo
    if (password.length >= 8) strength += 25;
    
    // Letras maiúsculas e minúsculas
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength += 25;
    
    // Números
    if (/\d/.test(password)) strength += 25;
    
    // Caracteres especiais
    if (/[^a-zA-Z0-9]/.test(password)) strength += 25;
    
    // Atualizar UI
    passwordStrength.style.width = `${strength}%`;
    
    if (strength <= 25) {
        passwordStrength.className = 'strength-meter weak';
        strengthText.textContent = 'Força: Fraca';
    } else if (strength <= 50) {
        passwordStrength.className = 'strength-meter medium';
        strengthText.textContent = 'Força: Média';
    } else if (strength <= 75) {
        passwordStrength.className = 'strength-meter good';
        strengthText.textContent = 'Força: Boa';
    } else {
        passwordStrength.className = 'strength-meter strong';
        strengthText.textContent = 'Força: Forte';
    }
}

// Iniciar processo de conexão com o Uber
async function connectUber() {
    if (!checkAuthentication()) return;
    
    try {
        const response = await fetch(`${API_URL}/integrations/uber/auth`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Falha ao iniciar processo de autorização');
        }
        
        const data = await response.json();
        
        // Abrir janela de autorização
        window.open(data.authUrl, '_blank', 'width=600,height=600');
        
        // Informar o usuário
        showAlert('Uma nova janela foi aberta para autorização. Por favor, complete o processo e retorne a esta página.', 'info');
    } catch (error) {
        console.error('Erro ao conectar com Uber:', error);
        showAlert('Não foi possível conectar com o Uber. Por favor, tente novamente.');
    }
}

// Iniciar processo de conexão com o 99
async function connect99() {
    if (!checkAuthentication()) return;
    
    try {
        const response = await fetch(`${API_URL}/integrations/99/auth`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Falha ao iniciar processo de autorização');
        }
        
        const data = await response.json();
        
        // Abrir janela de autorização
        window.open(data.authUrl, '_blank', 'width=600,height=600');
        
        // Informar o usuário
        showAlert('Uma nova janela foi aberta para autorização. Por favor, complete o processo e retorne a esta página.', 'info');
    } catch (error) {
        console.error('Erro ao conectar com 99:', error);
        showAlert('Não foi possível conectar com o 99. Por favor, tente novamente.');
    }
}

// Desconectar do Uber
async function disconnectUber() {
    console.log('Desconectando Uber...');
    try {
        // Desabilitar botão durante processo
        const disconnectBtn = document.getElementById('disconnectUberBtn');
        if (disconnectBtn) {
            disconnectBtn.disabled = true;
            disconnectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Desconectando...';
        }
        
        const token = getToken();
        if (!token) {
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        
        const response = await fetch('/api/integrations/uber', {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Erro ao desconectar do Uber');
        }
        
        // Atualizar status e mostrar mensagem
        showAlert('Desconectado do Uber com sucesso!', 'success');
        
        // Atualizar UI
        checkIntegrationStatus();
    } catch (error) {
        console.error('Erro ao desconectar Uber:', error);
        showAlert(`Erro: ${error.message}`, 'error');
    } finally {
        // Restaurar botão
        const disconnectBtn = document.getElementById('disconnectUberBtn');
        if (disconnectBtn) {
            disconnectBtn.disabled = false;
            disconnectBtn.innerHTML = '<i class="fas fa-plug-circle-xmark me-1"></i> Desconectar';
        }
    }
}

// Desconectar do 99
async function disconnect99() {
    if (!checkAuthentication()) return;
    
    if (!confirm('Tem certeza que deseja desconectar sua conta do 99? Isso interromperá a importação automática de transações.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/integrations/app99`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Falha ao desconectar');
        }
        
        // Atualizar UI
        app99StatusElement.textContent = 'Não conectado';
        app99StatusElement.className = 'status-disconnected';
        connect99Btn.style.display = 'block';
        disconnect99Btn.style.display = 'none';
        
        showAlert('Desconectado com sucesso do 99', 'success');
    } catch (error) {
        console.error('Erro ao desconectar do 99:', error);
        showAlert('Não foi possível desconectar do 99. Por favor, tente novamente.');
    }
}

// Verificar se a autorização foi bem-sucedida (após redirecionamento)
function checkIntegrationCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const integration = urlParams.get('integration');
    const status = urlParams.get('status');
    
    if (integration && status) {
        if (status === 'success') {
            showAlert(`Conexão com ${integration === 'uber' ? 'Uber' : '99'} realizada com sucesso!`, 'success');
        } else {
            showAlert(`Falha na conexão com ${integration === 'uber' ? 'Uber' : '99'}. Por favor, tente novamente.`);
        }
        
        // Limpar URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Recarregar integrações
        loadIntegrations();
    }
}

// Fazer logout
function logout() {
    localStorage.removeItem('authToken');
    window.location.href = 'index.html';
}

// Trocar entre abas
function switchTab(event) {
    const tabId = event.target.getAttribute('data-tab');
    
    // Remover classes active
    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    
    // Adicionar classe active para a aba selecionada
    event.target.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// Inicializar
function init() {
    // Verificar autorização
    if (!checkAuthentication()) return;
    
    // Carregar dados do usuário
    loadUserProfile();
    
    // Carregar integrações
    loadIntegrations();
    
    // Verificar callback de integração
    checkIntegrationCallback();
    
    // Adicionar listeners
    profileForm.addEventListener('submit', updateProfile);
    passwordForm.addEventListener('submit', changePassword);
    connectUberBtn.addEventListener('click', connectUber);
    disconnectUberBtn.addEventListener('click', disconnectUber);
    connect99Btn.addEventListener('click', connect99);
    disconnect99Btn.addEventListener('click', disconnect99);
    logoutBtn.addEventListener('click', logout);
    
    // Verificar força da senha
    newPasswordInput.addEventListener('input', () => {
        checkPasswordStrength(newPasswordInput.value);
    });
    
    // Tab switching
    tabButtons.forEach(btn => {
        btn.addEventListener('click', switchTab);
    });
}

// Iniciar após o DOM ser carregado
document.addEventListener('DOMContentLoaded', init);

// Funções de Integração
function setupIntegrations() {
    console.log('Configurando integrações...');
    
    // Buscar status das integrações
    checkIntegrationStatus();
    
    // Configurar botões de integração
    const connectUberBtn = document.getElementById('connectUberBtn');
    if (connectUberBtn) {
        connectUberBtn.addEventListener('click', async () => {
            try {
                // Mostrar carregamento
                connectUberBtn.disabled = true;
                connectUberBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
                
                // Obter token e ID do usuário para o state
                const token = getToken();
                const userDataStr = localStorage.getItem('currentUser');
                if (!token || !userDataStr) {
                    throw new Error('Sessão expirada. Faça login novamente.');
                }
                
                // Fazer requisição para obter URL de autorização
                const authResponse = await fetch('/api/integrations/uber/auth', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (!authResponse.ok) {
                    throw new Error('Não foi possível iniciar processo de autorização');
                }
                
                const authData = await authResponse.json();
                
                // Extrair ID do usuário para state (em produção, use um sistema mais seguro)
                const userData = JSON.parse(userDataStr);
                const userId = userData.id;
                
                // Adicionar state ao URL (em produção, criptografe e valide este valor)
                const authUrl = new URL(authData.authUrl);
                authUrl.searchParams.append('state', userId);
                
                // Abrir janela de autorização
                window.open(authUrl.toString(), '_blank', 'width=600,height=600');
                
                // Informar o usuário
                showAlert('Uma nova janela foi aberta para autorização. Complete o processo e retorne a esta página.', 'info');
                
            } catch (error) {
                console.error('Erro ao conectar com Uber:', error);
                showAlert('Erro: ' + error.message, 'error');
            } finally {
                // Restaurar botão
                connectUberBtn.disabled = false;
                connectUberBtn.innerHTML = '<i class="fas fa-plug me-1"></i> Conectar';
            }
        });
    }
    
    const disconnectUberBtn = document.getElementById('disconnectUberBtn');
    if (disconnectUberBtn) {
        disconnectUberBtn.addEventListener('click', disconnectUber);
    }
    
    const syncUberBtn = document.getElementById('syncUberBtn');
    if (syncUberBtn) {
        syncUberBtn.addEventListener('click', syncUberTrips);
    }
    
    const connect99Btn = document.getElementById('connect99Btn');
    if (connect99Btn) {
        connect99Btn.addEventListener('click', () => {
            showAlert('Integração com 99 será disponibilizada em breve.', 'info');
        });
    }
    
    // Verificar parâmetros de URL para mensagens após retorno de autenticação
    checkUrlParams();
}

async function checkIntegrationStatus() {
    console.log('Verificando status das integrações...');
    try {
        const token = getToken();
        if (!token) {
            console.error('Token não disponível para verificar integrações');
            return;
        }

        const response = await fetch('/api/integrations/status', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Falha ao obter status das integrações');
        }

        const integrations = await response.json();
        
        // Atualizar UI para Uber
        updateIntegrationUI('uber', integrations.uber);
        
        // Atualizar UI para 99 (quando disponível)
        // updateIntegrationUI('99', integrations['99']);
        
        console.log('Status das integrações atualizado:', integrations);
    } catch (error) {
        console.error('Erro ao verificar status das integrações:', error);
    }
}

function updateIntegrationUI(provider, status) {
    const connectBtn = document.getElementById(`connect${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn`);
    const disconnectBtn = document.getElementById(`disconnect${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn`);
    const statusBadge = document.getElementById(`${provider}Status`);
    const syncBtn = document.getElementById(`sync${provider.charAt(0).toUpperCase() + provider.slice(1)}Btn`);
    
    if (!connectBtn || !disconnectBtn || !statusBadge) {
        console.error(`Elementos UI para ${provider} não encontrados`);
        return;
    }
    
    if (status && status.active) {
        // Integração ativa
        connectBtn.classList.add('d-none');
        disconnectBtn.classList.remove('d-none');
        statusBadge.textContent = 'Conectado';
        statusBadge.className = 'badge bg-success';
        
        // Se houver botão de sincronização, habilitar
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.classList.remove('d-none');
        }
        
        // Verificar e exibir informações adicionais
        if (status.user_data) {
            let userData;
            try {
                userData = typeof status.user_data === 'string' ? JSON.parse(status.user_data) : status.user_data;
                
                // Exibir informações do usuário se disponível
                const infoEl = document.getElementById(`${provider}Info`);
                if (infoEl && userData.email) {
                    infoEl.innerHTML = `<div class="mt-2 small text-muted">
                        <i class="fas fa-user me-1"></i> ${userData.email || userData.name || 'Usuário'}
                        <br><i class="fas fa-calendar-check me-1"></i> Conectado em ${new Date(status.created_at).toLocaleDateString()}
                    </div>`;
                    infoEl.classList.remove('d-none');
                }
            } catch (e) {
                console.error(`Erro ao processar dados do usuário para ${provider}:`, e);
            }
        }
    } else {
        // Integração inativa
        connectBtn.classList.remove('d-none');
        disconnectBtn.classList.add('d-none');
        statusBadge.textContent = 'Desconectado';
        statusBadge.className = 'badge bg-secondary';
        
        // Se houver botão de sincronização, desabilitar
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.classList.add('d-none');
        }
        
        // Limpar informações adicionais
        const infoEl = document.getElementById(`${provider}Info`);
        if (infoEl) {
            infoEl.innerHTML = '';
            infoEl.classList.add('d-none');
        }
    }
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const status = urlParams.get('status');
    const message = urlParams.get('message');
    
    if (status && message) {
        if (status === 'success') {
            showAlert(message, 'success');
        } else if (status === 'error') {
            showAlert(message, 'error');
        } else {
            showAlert(message, 'info');
        }
        
        // Limpar parâmetros da URL
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
        
        // Atualizar status das integrações após mensagem
        checkIntegrationStatus();
    }
}

// Função auxiliar para exibir alertas na interface
function showAlert(message, type = 'info') {
    const alertContainer = document.querySelector('.alert-container');
    
    const alertElement = document.createElement('div');
    alertElement.className = `alert alert-${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    alertElement.innerHTML = `
        <i class="fas fa-${icon}"></i> ${message}
        <button class="alert-close"><i class="fas fa-times"></i></button>
    `;
    
    alertContainer.appendChild(alertElement);
    
    // Configurar botão de fechar
    alertElement.querySelector('.alert-close').addEventListener('click', () => {
        alertElement.remove();
    });
    
    // Auto-remover após 5 segundos para tipos não-erro
    if (type !== 'error') {
        setTimeout(() => {
            if (alertElement.parentNode) {
                alertElement.remove();
            }
        }, 5000);
    }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    // Verificar autenticação
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return;
    }
    
    // Configurar tabs
    setupTabs();
    
    // Carregar dados do perfil
    loadUserProfile();
    
    // Configurar formulário de perfil
    setupProfileForm();
    
    // Configurar formulário de senha
    setupPasswordForm();
    
    // Configurar função de logout
    setupLogout();
    
    // Configurar integrações
    setupIntegrations();
});

// Função para obter o token de autenticação
function getToken() {
    return localStorage.getItem('authToken');
}

// Função para verificar se o usuário está autenticado
function isAuthenticated() {
    const token = getToken();
    const tokenExpiration = localStorage.getItem('tokenExpiration');
    
    if (!token) {
        return false;
    }
    
    // Verificar se o token expirou
    if (tokenExpiration && new Date(tokenExpiration) < new Date()) {
        console.warn('Token expirado durante verificação de autenticação');
        return false;
    }
    
    return true;
}

// Configurar tabs da página
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remover classe ativa de todos os botões e conteúdos
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Adicionar classe ativa ao botão clicado
            button.classList.add('active');
            
            // Mostrar conteúdo correspondente
            const tabId = button.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Configurar função de logout
function setupLogout() {
    console.log('Configurando evento de logout...');
    
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Realizando logout...');
        
        // Limpar todos os dados de autenticação
        localStorage.removeItem('authToken');
        localStorage.removeItem('tokenExpiration');
        localStorage.removeItem('currentUser');
        
        // Exibir mensagem de sucesso
        showAlert('Logout realizado com sucesso!', 'success');
        
        // Redirecionar para a página inicial com mensagem de sucesso
        window.location.href = 'index.html?message=logout_success';
    });
}

// Configurar formulário de perfil
function setupProfileForm() {
    // Implemente a lógica para configurar o formulário de perfil
}

// Configurar formulário de senha
function setupPasswordForm() {
    // Implemente a lógica para configurar o formulário de senha
}

async function syncUberTrips() {
    console.log('Sincronizando viagens do Uber...');
    try {
        // Obter token
        const token = getToken();
        if (!token) {
            throw new Error('Sessão expirada. Faça login novamente.');
        }
        
        // Atualizar estado do botão
        const syncBtn = document.getElementById('syncUberBtn');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sincronizando...';
        }
        
        // Mostrar notificação de início
        showAlert('Iniciando sincronização de viagens do Uber...', 'info');
        
        // Fazer requisição para sincronizar
        const response = await fetch('/api/integrations/uber/sync', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Falha ao sincronizar viagens do Uber');
        }
        
        // Processar resposta
        const result = await response.json();
        
        // Exibir resultado
        showAlert(`Sincronização do Uber concluída! ${result.inserted} novas viagens importadas, ${result.updated} atualizadas.`, 'success');
        
        // Atualizar tabela de transações se estiver na página
        if (typeof loadTransactions === 'function') {
            loadTransactions();
        }
    } catch (error) {
        console.error('Erro ao sincronizar viagens do Uber:', error);
        showAlert(`Erro: ${error.message}`, 'error');
    } finally {
        // Restaurar estado do botão
        const syncBtn = document.getElementById('syncUberBtn');
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '<i class="fas fa-sync-alt me-1"></i> Sincronizar';
        }
    }
} 