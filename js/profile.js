// URL base para todas as chamadas de API
const API_URL = 'https://financaspro-api.onrender.com';

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
    if (!authToken) {
        window.location.href = 'index.html?redirect=profile&message=login_required';
        return false;
    }
    return true;
}

// Carregar dados do usuário
async function loadUserProfile() {
    if (!checkAuthentication()) return;
    
    try {
        const response = await fetch(`${API_URL}/user/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Falha ao carregar perfil');
        }
        
        const data = await response.json();
        const user = data.user;
        
        // Preencher dados do perfil
        userNameElement.textContent = user.nome;
        userEmailElement.textContent = user.email;
        nameInput.value = user.nome;
        emailInput.value = user.email;
    } catch (error) {
        console.error('Erro ao carregar perfil:', error);
        showAlert('Não foi possível carregar seus dados. Por favor, tente novamente.');
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
    if (!checkAuthentication()) return;
    
    if (!confirm('Tem certeza que deseja desconectar sua conta do Uber? Isso interromperá a importação automática de transações.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/integrations/uber`, {
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
        uberStatusElement.textContent = 'Não conectado';
        uberStatusElement.className = 'status-disconnected';
        connectUberBtn.style.display = 'block';
        disconnectUberBtn.style.display = 'none';
        
        showAlert('Desconectado com sucesso do Uber', 'success');
    } catch (error) {
        console.error('Erro ao desconectar do Uber:', error);
        showAlert('Não foi possível desconectar do Uber. Por favor, tente novamente.');
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