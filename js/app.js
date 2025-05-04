// app.js - Versão corrigida para FinançasPro com autenticação via MongoDB

// URL base para todas as chamadas de API
const API_BASE_URL = '/.netlify/functions/api'; // Atualizado para usar as funções do Netlify

// Elementos do DOM
document.addEventListener('DOMContentLoaded', () => {
    initApp();
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

// Inicialização do app
function initApp() {
    setupEventListeners();
    checkAuthentication();
    initTheme();
}

// Configurar listeners de eventos
function setupEventListeners() {
    // Eventos de autenticação
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Dropdown do usuário
    const userMenuButton = document.getElementById('user-menu-button');
    if (userMenuButton) {
        userMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('open');
        });
    }

    // Fechar dropdown ao clicar fora
    document.addEventListener('click', (e) => {
        if (userDropdown && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('open');
        }
    });

    // Botão de logout
    document.querySelectorAll('.user-dropdown-menu-item.logout').forEach(button => {
        button.addEventListener('click', handleLogout);
    });

    // Formulário de nova transação
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', handleAddTransaction);
    }

    // Toggle de tema
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Avaliador de força de senha
    setupPasswordStrength();

    // Filtros de transação
    if (applyFiltersButton) {
        applyFiltersButton.addEventListener('click', handleFilterTransactions);
    }

    // Gerenciamento de categorias
    if (newCategoryForm) {
        newCategoryForm.addEventListener('submit', handleAddCategory);
    }

    // Carregamento das categorias quando o modal é aberto
    if (categoriesModal) {
        categoriesModal.addEventListener('show.bs.modal', loadCategories);
    }
}

// Verificar autenticação
async function checkAuthentication() {
    const token = localStorage.getItem('authToken');
    
    if (token) {
        try {
            const response = await fetch(`${API_BASE_URL}/user/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                currentUser = data.user;
                updateUI();
                loadUserData();
            } else {
                // Token inválido
                localStorage.removeItem('authToken');
                currentUser = null;
                updateUI();
            }
        } catch (error) {
            console.error('Erro ao verificar autenticação:', error);
            localStorage.removeItem('authToken');
            currentUser = null;
            updateUI();
        }
    } else {
        // Sem token
        currentUser = null;
        updateUI();
    }
}

// Login
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('email').value;
    const senha = document.getElementById('senha').value;
    
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, senha })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Erro ao fazer login');
        }
        
        // Login bem-sucedido
        localStorage.setItem('authToken', data.token);
        currentUser = data.user;
        
        // Fechar modal
        const loginModal = bootstrap.Modal.getInstance(document.getElementById('loginModal'));
        if (loginModal) {
            loginModal.hide();
        }
        
        // Atualizar interface
        updateUI();
        await loadUserData();
        
        showAlert(`Bem-vindo, ${currentUser.nome}!`, 'success');
    } catch (error) {
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Registro
async function handleRegister(event) {
    event.preventDefault();
    
    const nome = document.getElementById('nome_reg').value;
    const email = document.getElementById('email_reg').value;
    const senha = document.getElementById('senha_reg').value;
    const senhaConf = document.getElementById('senha_conf').value;
    
    // Validar senhas
    if (senha !== senhaConf) {
        return showAlert('As senhas não coincidem', 'danger');
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
        showAlert(`Erro: ${error.message}`, 'danger');
    }
}

// Logout
function handleLogout() {
    localStorage.removeItem('authToken');
    currentUser = null;
    updateUI();
    showAlert('Você saiu da sua conta', 'info');
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
    if (currentUser) {
        // Usuário logado
        if (mainContainer) mainContainer.style.display = 'none';
        if (loggedInView) loggedInView.style.display = 'block';
        if (authButtons) authButtons.style.display = 'none';
        if (userDropdown) userDropdown.style.display = 'block';
        
        // Atualizar nome do usuário
        if (userNameElement) userNameElement.textContent = currentUser.nome;
        
        // Atualizar outros elementos com info do usuário
        document.querySelectorAll('.user-name-display').forEach(el => {
            el.textContent = currentUser.nome;
        });
        
        document.querySelectorAll('.user-email-display').forEach(el => {
            el.textContent = currentUser.email;
        });
    } else {
        // Usuário não logado
        if (mainContainer) mainContainer.style.display = 'block';
        if (loggedInView) loggedInView.style.display = 'none';
        if (authButtons) authButtons.style.display = 'flex';
        if (userDropdown) userDropdown.style.display = 'none';
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