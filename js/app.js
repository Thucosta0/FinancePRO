// app.js - Versão corrigida para FinançasPro com autenticação via MongoDB

// URL base para todas as chamadas de API
const API_BASE_URL = '/.netlify/functions/api'; // Atualizado para usar as funções do Netlify

// Dados de emergência (para caso o MongoDB não esteja acessível)
const EMERGENCY_EMAIL = 'teste@financaspro.com';
const EMERGENCY_PASSWORD = 'teste123';

// Elementos do DOM
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    
    // Adicionar link de emergência
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        const emergencyLoginLink = document.createElement('a');
        emergencyLoginLink.href = '#';
        emergencyLoginLink.className = 'emergency-login text-center d-block mt-2 small text-muted';
        emergencyLoginLink.textContent = 'Problemas para entrar? Use a conta de teste';
        emergencyLoginLink.onclick = (e) => {
            e.preventDefault();
            document.getElementById('email').value = EMERGENCY_EMAIL;
            document.getElementById('senha').value = EMERGENCY_PASSWORD;
            loginForm.dispatchEvent(new Event('submit'));
        };
        
        loginForm.appendChild(emergencyLoginLink);
    }
});

// Elementos globais
const loggedInView = document.getElementById('logged-in-view');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const userNameElement = document.getElementById('username-display');
const totalIncomeElement = document.getElementById('total-income');
const totalExpensesElement = document.getElementById('total-expenses');
const balanceElement = document.getElementById('balance');
const themeToggle = document.getElementById('theme-toggle');
const alertsContainer = document.getElementById('alerts-container');
const userDropdown = document.getElementById('user-dropdown');
const authButtons = document.getElementById('auth-buttons');
const mainContainer = document.querySelector('.main-container');
const transactionsTableBody = document.getElementById('transactions-table-body');
const noTransactions = document.getElementById('no-transactions');
const filterTypeSelect = document.getElementById('filter-type');
const filterCategorySelect = document.getElementById('filter-category');
const filterDateStart = document.getElementById('filter-date-start');
const filterDateEnd = document.getElementById('filter-date-end');
const applyFiltersButton = document.getElementById('apply-filters');
const newCategoryForm = document.getElementById('new-category-form');
const incomeCategoriesList = document.getElementById('income-categories-list');
const expenseCategoriesList = document.getElementById('expense-categories-list');
const categoriesModal = document.getElementById('categoriesModal');

// Estado global
let currentUser = null;
let userCategories = [];

// Verificar a presença de elementos na página atual
function checkElementsPresence() {
    console.log('Verificando elementos presentes na página...');
    
    // Verificar presença dos elementos principais
    const elements = {
        loginForm: document.getElementById('login-form'),
        registerForm: document.getElementById('register-form'),
        logoutButton: document.getElementById('logoutButton'),
        userDropdown: document.getElementById('user-dropdown'),
        authButtons: document.getElementById('auth-buttons'),
        landingContent: document.getElementById('landing-content'),
        loggedInView: document.getElementById('logged-in-view'),
        themeToggle: document.getElementById('theme-toggle')
    };
    
    // Log dos elementos encontrados para debug
    Object.entries(elements).forEach(([key, element]) => {
        console.log(`Elemento ${key}: ${element ? 'Encontrado' : 'Não encontrado'}`);
    });
    
    return elements;
}

// Inicialização do app (melhorada)
function initApp() {
    console.log('Inicializando aplicação FinancePRO...');
    
    // Verificar elementos presentes na página
    const elements = checkElementsPresence();
    
    // Registrar manipuladores de eventos
    setupEventListeners();
    
    // Tentar restaurar usuário do localStorage primeiro (para UI mais rápida)
    try {
        const cachedUser = localStorage.getItem('currentUser');
        const authToken = localStorage.getItem('authToken');
        
        if (cachedUser && authToken) {
            try {
                currentUser = JSON.parse(cachedUser);
                console.log('Usuário restaurado do cache:', currentUser.email);
                
                // Verificar se o token expirou
                const tokenExpiration = localStorage.getItem('tokenExpiration');
                if (tokenExpiration && new Date(tokenExpiration) < new Date()) {
                    console.warn('Token expirado. Realizando logout automático...');
                    handleLogout();
                    return;
                }
                
                // Atualizar UI imediatamente com dados em cache
                updateUI();
            } catch (e) {
                console.error('Erro ao processar dados de usuário em cache:', e);
                localStorage.removeItem('currentUser');
                localStorage.removeItem('authToken');
                localStorage.removeItem('tokenExpiration');
            }
        } else {
            console.log('Nenhum dado de usuário em cache');
        }
    } catch (e) {
        console.warn('Erro ao carregar usuário em cache:', e);
    }
    
    // Verificar autenticação com o servidor
    checkAuthentication();
    
    // Inicializar tema
    initTheme();
    
    // Verificar se há parâmetros na URL
    const urlParams = new URLSearchParams(window.location.search);
    const message = urlParams.get('message');
    
    if (message === 'login_required') {
        showAlert('Por favor, faça login para acessar esta página', 'warning');
        setTimeout(() => {
            const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
            loginModal.show();
        }, 1000);
    } else if (message === 'account_created') {
        showAlert('Conta criada com sucesso! Por favor, faça login.', 'success');
        setTimeout(() => {
            const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
            loginModal.show();
        }, 1000);
    } else if (message === 'logout_success') {
        showAlert('Logout realizado com sucesso!', 'success');
    }
}

// Configurar listeners de eventos
function setupEventListeners() {
    console.log('Configurando ouvintes de eventos...');
    
    // Eventos para formulários
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLogin();
        });
    }
    
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleRegister();
        });
    }
    
    // Botão de logout
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
        logoutButton.addEventListener('click', function(e) {
            e.preventDefault();
            handleLogout();
        });
    }
    
    // Garantir que qualquer elemento com a classe "logout" também tenha o evento de logout
    document.querySelectorAll('.logout').forEach(el => {
        el.addEventListener('click', function(e) {
            e.preventDefault();
            handleLogout();
        });
    });
    
    // Toggle de tema
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }
    
    // Outros eventos específicos da aplicação
    // ...
}

// Função para verificar autenticação
async function checkAuthentication() {
    console.log('Verificando autenticação do usuário...');
    
    try {
        // Verificar se tem token no localStorage
        const token = localStorage.getItem('authToken');
        
        if (!token) {
            console.log('Nenhum token encontrado. Usuário não autenticado.');
            currentUser = null;
            updateUI();
            return false;
        }
        
        // Verificar expiração do token
        const tokenExpiration = localStorage.getItem('tokenExpiration');
        if (tokenExpiration && new Date(tokenExpiration) < new Date()) {
            console.warn('Token expirado! Realizando logout automático.');
            handleLogout();
            return false;
        }
        
        console.log('Token encontrado. Verificando com o servidor...');
        
        // Fazer requisição à API para validar o token
        const response = await fetch('/api/validate-token', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            // Token válido
            const data = await response.json();
            
            // Atualizar dados do usuário e token se necessário
            if (data.user) {
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                currentUser = data.user;
                
                console.log('Autenticação confirmada. Usuário:', currentUser.email);
            }
            
            // Atualizar interface
            updateUI();
            return true;
        } else {
            console.warn('Token inválido ou expirado. Status:', response.status);
            
            // Token inválido - fazer logout
            localStorage.removeItem('authToken');
            localStorage.removeItem('tokenExpiration');
            localStorage.removeItem('currentUser');
            currentUser = null;
            updateUI();
            
            // Se está numa página que requer autenticação, redirecionar
            if (window.location.pathname.includes('/dashboard.html') || 
                window.location.pathname.includes('/profile.html')) {
                // Guardar URL atual para redirecionar depois do login
                localStorage.setItem('redirectAfterLogin', window.location.href);
                
                // Redirecionar para a página inicial com mensagem
                window.location.href = '/?message=login_required';
            }
            
            return false;
        }
    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        
        // Manter o usuário logado em caso de falha temporária de rede
        // mas marcar para verificar novamente depois
        if (currentUser) {
            console.log('Mantendo usuário logado, mas verificando novamente mais tarde...');
            setTimeout(checkAuthentication, 60000); // Tentar novamente em 1 minuto
            return true;
        }
        
        return false;
    }
}

// Função para lidar com o processo de login
async function handleLogin(e) {
    if (e) e.preventDefault();
    
    console.log('Processando login...');
    
    // Limpar mensagens de erro anteriores
    const loginError = document.getElementById('loginError');
    if (loginError) {
        loginError.classList.add('d-none');
    }
    
    // Obter elementos do formulário
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('senha');
    const loginButton = document.querySelector('#login-form button[type="submit"]');
    
    if (!emailInput || !passwordInput) {
        console.error('Elementos do formulário não encontrados');
        showAlert('Erro ao processar formulário', 'danger');
        return;
    }
    
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    
    // Validação básica no cliente
    if (!email) {
        showFieldError(emailInput, 'Por favor, insira seu email');
        return;
    }
    
    // Validar formato de email com regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showFieldError(emailInput, 'Email inválido');
        return;
    }
    
    if (!password) {
        showFieldError(passwordInput, 'Por favor, insira sua senha');
        return;
    }
    
    // Mostrar estado de carregamento
    if (loginButton) {
        loginButton.disabled = true;
        loginButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Entrando...';
    }
    
    try {
        // Montar dados da requisição
        const loginData = {
            email: email,
            senha: password
        };
        
        console.log('Enviando requisição de login para a API...');
        
        // Fazer requisição para a API
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(loginData)
        });
        
        console.log('Status da resposta:', response.status);
        
        // Processar resposta
        if (response.ok) {
            try {
                const data = await response.json();
                console.log('Login bem-sucedido!');
                
                // Salvar token de autenticação
                localStorage.setItem('authToken', data.token);
                
                // Salvar dados do usuário
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                
                // Definir expiração do token (24 horas)
                const expirationTime = new Date();
                expirationTime.setHours(expirationTime.getHours() + 24);
                localStorage.setItem('tokenExpiration', expirationTime.toISOString());
                
                // Atualizar variáveis globais
                currentUser = data.user;
                authToken = data.token;
                
                // Fechar modal de login
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    const bsModal = bootstrap.Modal.getInstance(loginModal);
                    if (bsModal) bsModal.hide();
                }
                
                // Atualizar interface
                updateUI();
                
                // Mostrar mensagem de boas-vindas
                showAlert(`Bem-vindo, ${currentUser.name || currentUser.email.split('@')[0]}!`, 'success');
                
                // Redirecionar se necessário (se veio de uma página protegida)
                const redirectTo = localStorage.getItem('redirectAfterLogin');
                if (redirectTo) {
                    localStorage.removeItem('redirectAfterLogin');
                    window.location.href = redirectTo;
                }
            } catch (e) {
                console.error('Erro ao processar resposta JSON:', e);
                showLoginError('Erro ao processar resposta do servidor');
            }
        } else {
            // Tentar obter mensagem de erro da API
            try {
                const errorData = await response.json();
                showLoginError(errorData.message || 'Erro ao fazer login. Verifique suas credenciais.');
                console.error('Erro de login:', errorData);
            } catch (e) {
                // Se não conseguir processar o JSON de erro
                showLoginError('Credenciais inválidas ou servidor indisponível');
                console.error('Erro ao processar resposta de erro:', e);
            }
        }
    } catch (error) {
        console.error('Erro ao fazer login:', error);
        showLoginError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
        // Restaurar botão de login
        if (loginButton) {
            loginButton.disabled = false;
            loginButton.innerHTML = '<i class="fas fa-sign-in-alt me-2"></i>Entrar';
        }
    }
}

// Função para mostrar erro no login
function showLoginError(message) {
    const loginError = document.getElementById('loginError');
    const loginErrorMessage = document.getElementById('loginErrorMessage');
    
    if (loginError && loginErrorMessage) {
        loginErrorMessage.textContent = message;
        loginError.classList.remove('d-none');
    } else {
        showAlert(message, 'danger');
    }
}

// Função para mostrar erro em um campo específico
function showFieldError(inputElement, message) {
    // Adicionar classe de erro ao input
    inputElement.classList.add('is-invalid');
    
    // Verificar se já existe ou criar um elemento de feedback
    let feedbackElement = inputElement.nextElementSibling;
    if (!feedbackElement || !feedbackElement.classList.contains('invalid-feedback')) {
        feedbackElement = document.createElement('div');
        feedbackElement.classList.add('invalid-feedback');
        inputElement.parentNode.insertBefore(feedbackElement, inputElement.nextSibling);
    }
    
    // Definir a mensagem de erro
    feedbackElement.textContent = message;
    
    // Adicionar evento para remover o erro quando o usuário começar a digitar
    inputElement.addEventListener('input', function() {
        this.classList.remove('is-invalid');
    }, { once: true });
}

// Registro
async function handleRegister(event) {
    event.preventDefault();
    
    const nome = document.getElementById('nome_reg').value;
    const email = document.getElementById('email_reg').value;
    const senha = document.getElementById('senha_reg').value;
    const senhaConf = document.getElementById('senha_conf').value;
    
    // Ocultar mensagem de erro anterior
    const cadastroError = document.getElementById('cadastroError');
    cadastroError.classList.add('d-none');
    
    // Validar senhas
    if (senha !== senhaConf) {
        document.getElementById('cadastroErrorMessage').textContent = 'As senhas não coincidem';
        cadastroError.classList.remove('d-none');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nome, email, senha })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            // Mostrar erro específico
            document.getElementById('cadastroErrorMessage').textContent = data.message || 'Erro ao registrar usuário';
            cadastroError.classList.remove('d-none');
            throw new Error(data.message || 'Erro ao registrar usuário');
        }
        
        // Registro bem-sucedido
        localStorage.setItem('authToken', data.token);
        currentUser = data.user;
        
        // Fechar modal
        const registerModal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
        if (registerModal) {
            registerModal.hide();
        }
        
        // Atualizar interface
        updateUI();
        
        showAlert(`Conta criada com sucesso! Bem-vindo, ${nome}!`, 'success');
    } catch (error) {
        console.error("Erro de registro:", error);
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Função para lidar com o logout
function handleLogout() {
    console.log('Realizando logout...');
    
    // Limpar o token de autenticação e dados do usuário
    localStorage.removeItem('authToken');
    localStorage.removeItem('tokenExpires');
    localStorage.removeItem('currentUser');
    
    // Redefinir variáveis globais
    currentUser = null;
    
    // Atualizar a interface
    updateUI();
    
    // Exibir mensagem de sucesso
    showAlert('Logout realizado com sucesso!', 'success');
    
    // Redirecionar para a página inicial com mensagem de sucesso
    window.location.href = '/?message=logout_success';
}

// Adicionar transação
async function handleAddTransaction(event) {
    event.preventDefault();
    
    if (!currentUser) {
        return showAlert('Você precisa estar logado para adicionar transações', 'danger');
    }
    
    const title = document.getElementById('title').value;
    const amount = document.getElementById('amount').value;
    const type = document.querySelector('input[name="type"]:checked').value;
    const category = document.getElementById('category').value;
    const date = document.getElementById('date').value;
    const content = document.getElementById('content').value || '';
    
    if (!title || !amount || !type || !category || !date) {
        return showAlert('Preencha todos os campos obrigatórios', 'danger');
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title,
                amount,
                type,
                category,
                date,
                content
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao adicionar transação');
        }
        
        // Limpar formulário
        event.target.reset();
        
        // Recarregar dados
        await loadUserData();
        
        showAlert('Transação adicionada com sucesso!', 'success');
    } catch (error) {
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Excluir transação
async function handleDeleteTransaction(id) {
    if (!confirm('Tem certeza que deseja excluir esta transação?')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/transactions/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao excluir transação');
        }
        
        await loadUserData();
        showAlert('Transação excluída com sucesso!', 'success');
    } catch (error) {
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Carregamento e gerenciamento de categorias

// Carregar categorias do usuário
async function loadCategories() {
    if (!currentUser) return;
    
    // Mostrar spinners de carregamento
    if (incomeCategoriesList) incomeCategoriesList.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
    if (expenseCategoriesList) expenseCategoriesList.innerHTML = '<div class="text-center py-3"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Carregando...</span></div></div>';
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/categories`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao carregar categorias');
        }
        
        userCategories = await response.json();
        
        // Atualizar interface com as categorias
        updateCategoriesLists();
        updateCategoryDropdowns();
        
    } catch (error) {
        showAlert(`Erro ao carregar categorias: ${error.message}`, 'danger');
        
        if (incomeCategoriesList) {
            incomeCategoriesList.innerHTML = '<div class="text-center py-3 text-danger">Erro ao carregar categorias</div>';
        }
        if (expenseCategoriesList) {
            expenseCategoriesList.innerHTML = '<div class="text-center py-3 text-danger">Erro ao carregar categorias</div>';
        }
    }
}

// Atualizar listas de categorias na modal
function updateCategoriesLists() {
    if (!incomeCategoriesList || !expenseCategoriesList) return;
    
    // Filtrar categorias por tipo
    const incomeCategories = userCategories.filter(cat => cat.type === 'income');
    const expenseCategories = userCategories.filter(cat => cat.type === 'expense');
    
    // Limpar listas
    incomeCategoriesList.innerHTML = '';
    expenseCategoriesList.innerHTML = '';
    
    // Renderizar categorias de receita
    if (incomeCategories.length === 0) {
        incomeCategoriesList.innerHTML = '<div class="text-center py-3 text-muted">Nenhuma categoria de receita encontrada</div>';
    } else {
        incomeCategories.forEach(category => {
            incomeCategoriesList.appendChild(createCategoryElement(category));
        });
    }
    
    // Renderizar categorias de despesa
    if (expenseCategories.length === 0) {
        expenseCategoriesList.innerHTML = '<div class="text-center py-3 text-muted">Nenhuma categoria de despesa encontrada</div>';
    } else {
        expenseCategories.forEach(category => {
            expenseCategoriesList.appendChild(createCategoryElement(category));
        });
    }
}

// Criar elemento HTML para uma categoria
function createCategoryElement(category) {
    const div = document.createElement('div');
    div.className = `category-item category-${category.type}`;
    
    // Adicionar badge para categorias padrão
    if (category.isDefault) {
        div.innerHTML += '<span class="category-default-badge">Padrão</span>';
    }
    
    div.innerHTML += `
        <div class="category-info">
            <div class="category-icon">
                <i class="fas fa-${category.icon}"></i>
            </div>
            <p class="category-name">${category.name}</p>
        </div>
        <div class="category-actions">
            ${category.isDefault ? '' : `
                <button class="category-delete-btn" data-id="${category._id}" title="Excluir categoria">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `}
        </div>
    `;
    
    // Adicionar evento de exclusão
    const deleteBtn = div.querySelector('.category-delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => handleDeleteCategory(category._id));
    }
    
    return div;
}

// Adicionar nova categoria
async function handleAddCategory(event) {
    event.preventDefault();
    
    if (!currentUser) {
        return showAlert('Você precisa estar logado para adicionar categorias', 'danger');
    }
    
    const name = document.getElementById('category-name').value;
    const type = document.getElementById('category-type').value;
    const icon = document.getElementById('category-icon').value;
    
    if (!name || !type || !icon) {
        return showAlert('Preencha todos os campos obrigatórios', 'danger');
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/categories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                name,
                type,
                icon
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao adicionar categoria');
        }
        
        // Atualizar lista de categorias
        userCategories.push(data.category);
        updateCategoriesLists();
        updateCategoryDropdowns();
        
        // Limpar formulário
        document.getElementById('category-name').value = '';
        document.getElementById('category-type').value = 'income';
        document.getElementById('category-icon').value = 'money-bill-wave';
        
        showAlert('Categoria adicionada com sucesso!', 'success');
    } catch (error) {
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Excluir categoria
async function handleDeleteCategory(id) {
    if (!confirm('Tem certeza que deseja excluir esta categoria? As transações associadas serão movidas para a categoria "Outros".')) {
        return;
    }
    
    try {
        const token = localStorage.getItem('authToken');
        const response = await fetch(`${API_BASE_URL}/categories/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao excluir categoria');
        }
        
        // Remover categoria da lista
        userCategories = userCategories.filter(cat => cat._id !== id);
        updateCategoriesLists();
        updateCategoryDropdowns();
        
        // Recarregar dados das transações, pois algumas podem ter sido atualizadas
        await loadUserData();
        
        showAlert('Categoria excluída com sucesso!', 'success');
    } catch (error) {
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Atualizar dropdowns de categorias em formulários
function updateCategoryDropdowns() {
    // Atualizar dropdown no formulário de transação
    const transactionCategory = document.getElementById('category');
    if (transactionCategory) {
        // Guardar a categoria selecionada atualmente
        const selectedValue = transactionCategory.value;
        
        // Limpar as opções existentes, mantendo a opção vazia/placeholder
        transactionCategory.innerHTML = '<option value="">Selecione uma categoria</option>';
        
        // Separar categorias por tipo
        const incomeCategories = userCategories.filter(cat => cat.type === 'income');
        const expenseCategories = userCategories.filter(cat => cat.type === 'expense');
        
        // Adicionar optgroup para receitas
        if (incomeCategories.length > 0) {
            const incomeGroup = document.createElement('optgroup');
            incomeGroup.label = 'Receitas';
            
            incomeCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.key;
                option.textContent = category.name;
                option.dataset.type = 'income';
                incomeGroup.appendChild(option);
            });
            
            transactionCategory.appendChild(incomeGroup);
        }
        
        // Adicionar optgroup para despesas
        if (expenseCategories.length > 0) {
            const expenseGroup = document.createElement('optgroup');
            expenseGroup.label = 'Despesas';
            
            expenseCategories.forEach(category => {
                const option = document.createElement('option');
                option.value = category.key;
                option.textContent = category.name;
                option.dataset.type = 'expense';
                expenseGroup.appendChild(option);
            });
            
            transactionCategory.appendChild(expenseGroup);
        }
        
        // Restaurar a seleção, se possível
        if (selectedValue) {
            transactionCategory.value = selectedValue;
        }
        
        // Adicionar listener para alterar automaticamente o tipo quando a categoria muda
        transactionCategory.addEventListener('change', function() {
            const selectedOption = this.options[this.selectedIndex];
            const transactionType = selectedOption.dataset.type;
            
            if (transactionType) {
                // Selecionar o tipo de transação com base na categoria
                const radioButtons = document.querySelectorAll('input[name="type"]');
                radioButtons.forEach(radio => {
                    if (radio.value === transactionType) {
                        radio.checked = true;
                    }
                });
            }
        });
    }
    
    // Atualizar dropdown no formulário de filtros
    const filterCategory = document.getElementById('filter-category');
    if (filterCategory) {
        // Guardar a categoria selecionada atualmente
        const selectedValue = filterCategory.value;
        
        // Limpar as opções existentes, mantendo a opção 'Todas'
        filterCategory.innerHTML = '<option value="all">Todas</option>';
        
        // Adicionar todas as categorias
        userCategories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.key;
            option.textContent = category.name;
            filterCategory.appendChild(option);
        });
        
        // Restaurar a seleção, se possível
        if (selectedValue) {
            filterCategory.value = selectedValue;
        }
    }
}

// Filtrar transações
async function handleFilterTransactions() {
    if (!currentUser) return;
    
    try {
        const token = localStorage.getItem('authToken');
        
        // Construir URL com parâmetros
        let url = `${API_BASE_URL}/transactions`;
        const params = new URLSearchParams();
        
        if (filterTypeSelect.value && filterTypeSelect.value !== 'all') {
            params.append('type', filterTypeSelect.value);
        }
        
        if (filterCategorySelect.value && filterCategorySelect.value !== 'all') {
            params.append('category', filterCategorySelect.value);
        }
        
        if (filterDateStart.value) {
            params.append('startDate', filterDateStart.value);
        }
        
        if (filterDateEnd.value) {
            params.append('endDate', filterDateEnd.value);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao filtrar transações');
        }
        
        displayTransactionsTable(data);
    } catch (error) {
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Carregar dados do usuário
async function loadUserData() {
    if (!currentUser) return;
    
    try {
        // Mostrar spinner de carregamento
        const loadingSpinner = document.getElementById('loading-spinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'block';
        }
        
        const token = localStorage.getItem('authToken');
        
        // Carregar categorias primeiro
        await loadCategories();
        
        // Carregar transações
        const transactionsResponse = await fetch(`${API_BASE_URL}/transactions`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!transactionsResponse.ok) {
            throw new Error('Erro ao carregar transações');
        }
        
        const transactions = await transactionsResponse.json();
        displayTransactionsTable(transactions);
        
        // Carregar resumo financeiro
        const summaryResponse = await fetch(`${API_BASE_URL}/summary`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!summaryResponse.ok) {
            throw new Error('Erro ao carregar resumo financeiro');
        }
        
        const summary = await summaryResponse.json();
        updateFinanceSummary(summary);
    } catch (error) {
        showAlert(`Erro ao carregar dados: ${error.message}`, 'danger');
    } finally {
        // Esconder spinner de carregamento
        const loadingSpinner = document.getElementById('loading-spinner');
        if (loadingSpinner) {
            loadingSpinner.style.display = 'none';
        }
    }
}

// Exibir transações na tabela
function displayTransactionsTable(transactions) {
    if (!transactionsTableBody) return;
    
    transactionsTableBody.innerHTML = '';
    
    if (!transactions || transactions.length === 0) {
        if (noTransactions) {
            noTransactions.style.display = 'block';
        }
        if (document.getElementById('transactions-table-container')) {
            document.getElementById('transactions-table-container').style.display = 'none';
        }
        return;
    }
    
    if (noTransactions) {
        noTransactions.style.display = 'none';
    }
    if (document.getElementById('transactions-table-container')) {
        document.getElementById('transactions-table-container').style.display = 'block';
    }
    
    transactions.forEach(transaction => {
        const row = document.createElement('tr');
        const iconClass = getCategoryIconClass(transaction.category);
        const categoryName = getCategoryName(transaction.category);
        
        row.innerHTML = `
            <td class="transaction-icon-cell">
                <div class="transaction-category-icon transaction-category-${transaction.category}">
                    <i class="${iconClass}"></i>
                </div>
            </td>
            <td>
                <div class="transaction-description">${transaction.title}</div>
            </td>
            <td>${categoryName}</td>
            <td>
                <div class="transaction-date">${formatDate(transaction.date)}</div>
            </td>
            <td class="transaction-amount-cell">
                <div class="transaction-amount ${transaction.type}">
                    ${transaction.type === 'income' ? '+ ' : '- '}
                    ${formatCurrency(transaction.amount)}
                </div>
            </td>
            <td class="transaction-actions-cell">
                <button class="action-btn edit" title="Editar" data-id="${transaction._id || transaction.id}">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" title="Excluir" data-id="${transaction._id || transaction.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        
        transactionsTableBody.appendChild(row);
    });
    
    // Adicionar listeners aos botões
    document.querySelectorAll('.action-btn.delete').forEach(button => {
        button.addEventListener('click', () => handleDeleteTransaction(button.dataset.id));
    });
    
    document.querySelectorAll('.action-btn.edit').forEach(button => {
        button.addEventListener('click', () => handleEditTransaction(button.dataset.id));
    });
}

// Editar transação (placeholder)
function handleEditTransaction(id) {
    // Implementar futuramente
    showAlert("Função de edição será implementada em breve", "info");
}

// Atualizar resumo financeiro
function updateFinanceSummary(summary) {
    if (totalIncomeElement) {
        totalIncomeElement.textContent = formatCurrency(summary.income);
    }
    
    if (totalExpensesElement) {
        totalExpensesElement.textContent = formatCurrency(summary.expenses);
    }
    
    if (balanceElement) {
        balanceElement.textContent = formatCurrency(summary.balance);
        
        if (summary.balance < 0) {
            balanceElement.classList.add('text-danger');
            balanceElement.classList.remove('text-success');
        } else {
            balanceElement.classList.add('text-success');
            balanceElement.classList.remove('text-danger');
        }
    }
}

// Atualizar interface com base no estado de autenticação
function updateUI() {
    console.log('Atualizando interface com base na autenticação...');
    
    const loggedOutElements = document.querySelectorAll('.logged-out-only');
    const loggedInElements = document.querySelectorAll('.logged-in-only');
    const userNameElements = document.querySelectorAll('.user-name');
    const userEmailElements = document.querySelectorAll('.user-email');
    
    if (currentUser) {
        console.log('Usuário autenticado:', currentUser.email);
        
        // Mostrar elementos para usuários logados
        loggedInElements.forEach(el => el.style.display = 'block');
        
        // Esconder elementos para usuários deslogados
        loggedOutElements.forEach(el => el.style.display = 'none');
        
        // Atualizar informações do usuário na interface
        userNameElements.forEach(el => {
            el.textContent = currentUser.name || currentUser.email.split('@')[0] || 'Usuário';
        });
        
        userEmailElements.forEach(el => {
            el.textContent = currentUser.email || '';
        });
        
        // Verificar se estamos na página de dashboard e carregá-la
        if (window.location.pathname.includes('/dashboard.html')) {
            loadDashboardData();
        }
    } else {
        console.log('Nenhum usuário autenticado');
        
        // Esconder elementos para usuários logados
        loggedInElements.forEach(el => el.style.display = 'none');
        
        // Mostrar elementos para usuários deslogados
        loggedOutElements.forEach(el => el.style.display = 'block');
        
        // Limpar informações do usuário na interface
        userNameElements.forEach(el => el.textContent = '');
        userEmailElements.forEach(el => el.textContent = '');
    }
}

// Alternar tema
function toggleTheme() {
    const html = document.documentElement;
    const icon = themeToggle.querySelector('i');
    
    if (html.getAttribute('data-theme') === 'dark') {
        html.setAttribute('data-theme', 'light');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
        localStorage.setItem('theme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
        localStorage.setItem('theme', 'dark');
    }
}

// Inicializar tema
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        if (savedTheme === 'dark' && themeToggle) {
            const icon = themeToggle.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            }
        }
    }
}

// Função para o avaliador de força de senha
function setupPasswordStrength() {
    const senhaInput = document.getElementById('senha_reg');
    const strengthBar = document.getElementById('password-strength');
    const strengthText = document.getElementById('strength-text');
    
    if (!senhaInput || !strengthBar || !strengthText) return;
    
    senhaInput.addEventListener('input', function() {
        const senha = this.value;
        let strength = 0;
        let status = '';
        
        // Verificar comprimento
        if (senha.length >= 8) {
            strength += 20;
        }
        
        // Verificar maiúsculas
        if (senha.match(/[A-Z]/)) {
            strength += 20;
        }
        
        // Verificar minúsculas
        if (senha.match(/[a-z]/)) {
            strength += 20;
        }
        
        // Verificar números
        if (senha.match(/[0-9]/)) {
            strength += 20;
        }
        
        // Verificar caracteres especiais
        if (senha.match(/[^A-Za-z0-9]/)) {
            strength += 20;
        }
        
        // Atualizar barra de força
        strengthBar.style.width = strength + '%';
        
        // Atualizar classe e texto
        if (strength < 40) {
            strengthBar.className = 'password-strength weak';
            status = 'Fraca';
        } else if (strength < 70) {
            strengthBar.className = 'password-strength medium';
            status = 'Média';
        } else {
            strengthBar.className = 'password-strength strong';
            status = 'Forte';
        }
        
        strengthText.textContent = status;
    });
}

// Funções de suporte e formatação
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(Number(value) || 0);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}

function getCategoryName(categoryKey) {
    // Buscar na lista de categorias do usuário
    if (userCategories.length > 0) {
        const category = userCategories.find(cat => cat.key === categoryKey);
        if (category) {
            return category.name;
        }
    }
    
    // Fallback para categorias padrão (caso as categorias não estejam carregadas)
    const categories = {
        'salary': 'Salário',
        'freelance': 'Freelance',
        'investments': 'Investimentos',
        'food': 'Alimentação',
        'transport': 'Transporte',
        'housing': 'Moradia',
        'health': 'Saúde',
        'education': 'Educação',
        'entertainment': 'Entretenimento',
        'shopping': 'Compras',
        'bills': 'Contas',
        'other': 'Outros'
    };
    
    return categories[categoryKey] || 'Desconhecido';
}

function getCategoryIconClass(categoryKey) {
    // Buscar na lista de categorias do usuário
    if (userCategories.length > 0) {
        const category = userCategories.find(cat => cat.key === categoryKey);
        if (category) {
            return `fas fa-${category.icon}`;
        }
    }
    
    // Fallback para ícones padrão (caso as categorias não estejam carregadas)
    const icons = {
        'salary': 'fas fa-money-bill-wave',
        'freelance': 'fas fa-laptop',
        'investments': 'fas fa-chart-line',
        'food': 'fas fa-utensils',
        'transport': 'fas fa-car',
        'housing': 'fas fa-home',
        'health': 'fas fa-heartbeat',
        'education': 'fas fa-graduation-cap',
        'entertainment': 'fas fa-film',
        'shopping': 'fas fa-shopping-cart',
        'bills': 'fas fa-file-invoice-dollar',
        'other': 'fas fa-question-circle'
    };
    
    return icons[categoryKey] || 'fas fa-tag';
}

// Exibir mensagens de alerta
function showAlert(message, type = 'danger') {
    if (!alertsContainer) return;
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show`;
    alert.role = 'alert';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Fechar"></button>
    `;
    
    alertsContainer.appendChild(alert);
    
    // Auto-remover após 5 segundos
    setTimeout(() => {
        if (alert.parentNode) {
            alert.classList.remove('show');
            setTimeout(() => alert.remove(), 300);
        }
    }, 5000);
} 