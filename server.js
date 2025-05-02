require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const morgan = require('morgan'); // Logging
const compression = require('compression'); // Compressão GZIP
const path = require('path');
const mongoSanitize = require('express-mongo-sanitize'); // Prevenção de NoSQL Injection

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secreto-do-jwt-aqui';
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(express.static('.', { 
    maxAge: isProd ? '1d' : 0 // Cache de 1 dia em produção
})); 

// Logging simples para desenvolvimento
app.use(morgan('dev'));

// Prevenir NoSQL Injection
app.use(mongoSanitize());

// Aplicar compressão GZIP em produção
if (isProd) {
    app.use(compression());
}

// String de conexão MongoDB
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
let db;

// Conectar ao MongoDB
async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("Conectado ao MongoDB com sucesso!");
        db = client.db("financas-pro");
        
        // Verificar se a coleção de usuários existe, senão criar
        const collections = await db.listCollections({ name: "users" }).toArray();
        if (collections.length === 0) {
            await db.createCollection("users");
            // Criar índice único para email
            await db.collection("users").createIndex({ email: 1 }, { unique: true });
            console.log("Coleção de usuários criada");
        }
        
        // Verificar se a coleção de transações existe, senão criar
        const dataCollections = await db.listCollections({ name: "transactions" }).toArray();
        if (dataCollections.length === 0) {
            await db.createCollection("transactions");
            // Criar índices para otimizar consultas
            await db.collection("transactions").createIndex({ user_id: 1, date: -1 });
            await db.collection("transactions").createIndex({ user_id: 1, type: 1 });
            console.log("Coleção de transações criada");
        }
    } catch (error) {
        console.error("Erro ao conectar ao MongoDB:", error);
        // Encerrar o aplicativo se não conseguir conectar ao MongoDB
        console.error("ERRO CRÍTICO: Não foi possível conectar ao MongoDB. O aplicativo será encerrado.");
        process.exit(1); // Encerra o processo com código de erro
    }
}

// Middleware para verificar token de autenticação
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ message: 'Token de autenticação não fornecido' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Token inválido ou expirado' });
        }
        
        req.user = user;
        next();
    });
}

// Rota de registro
app.post('/api/register', async (req, res) => {
    try {
        const { nome, email, senha } = req.body;
        
        // Verificar se o email já está cadastrado
        const existingUser = await db.collection('users').findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Este email já está em uso.' });
        }
        
        // Criptografar a senha
        const hashedPassword = await bcrypt.hash(senha, 10);
        
        // Criar novo usuário
        const result = await db.collection('users').insertOne({
            nome,
            email,
            senha: hashedPassword,
            createdAt: new Date()
        });
        
        // Gerar token JWT
        const token = jwt.sign(
            { id: result.insertedId, email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.status(201).json({
            message: 'Usuário registrado com sucesso',
            token,
            user: { id: result.insertedId, nome, email }
        });
    } catch (error) {
        console.error("Erro ao registrar usuário:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Rota de login
app.post('/api/login', async (req, res) => {
    try {
        const { email, senha } = req.body;
        
        // Buscar usuário pelo email
        const user = await db.collection('users').findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Email ou senha inválidos' });
        }
        
        // Verificar senha
        const isPasswordValid = await bcrypt.compare(senha, user.senha);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Email ou senha inválidos' });
        }
        
        // Gerar token JWT
        const token = jwt.sign(
            { id: user._id, email: user.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            message: 'Login realizado com sucesso',
            token,
            user: { id: user._id, nome: user.nome, email: user.email }
        });
    } catch (error) {
        console.error("Erro ao fazer login:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Rota para obter dados do usuário
app.get('/api/user/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const userObjectId = new ObjectId(userId);
        
        // Buscar usuário pelo ID
        const user = await db.collection('users').findOne({ _id: userObjectId });
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }
        
        // Retornar dados do usuário sem a senha
        const { senha, ...userWithoutPassword } = user;
        
        res.json({
            user: userWithoutPassword
        });
    } catch (error) {
        console.error("Erro ao buscar dados do usuário:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Rota para atualizar perfil
app.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const { nome, email } = req.body;
        
        // Verificar se outro usuário já usa este email
        if (email !== req.user.email) {
            const existingUser = await db.collection('users').findOne({ email });
            if (existingUser) {
                return res.status(400).json({ message: 'Este email já está em uso por outro usuário.' });
            }
        }
        
        // Atualizar perfil
        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { nome, email, updatedAt: new Date() } }
        );
        
        // Gerar novo token JWT com email atualizado
        const token = jwt.sign(
            { id: userId, email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({
            message: 'Perfil atualizado com sucesso',
            token,
            user: { id: userId, nome, email }
        });
    } catch (error) {
        console.error("Erro ao atualizar perfil:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Rota para alterar senha
app.put('/api/user/password', authenticateToken, async (req, res) => {
    try {
        const userId = new ObjectId(req.user.id);
        const { currentPassword, newPassword } = req.body;
        
        // Buscar usuário pelo ID
        const user = await db.collection('users').findOne({ _id: userId });
        if (!user) {
            return res.status(404).json({ message: 'Usuário não encontrado' });
        }
        
        // Verificar senha atual
        const isPasswordValid = await bcrypt.compare(currentPassword, user.senha);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Senha atual incorreta' });
        }
        
        // Criptografar nova senha
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Atualizar senha
        await db.collection('users').updateOne(
            { _id: userId },
            { $set: { senha: hashedPassword, passwordUpdatedAt: new Date() } }
        );
        
        res.json({
            message: 'Senha alterada com sucesso'
        });
    } catch (error) {
        console.error("Erro ao alterar senha:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Rotas para transações
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Buscar todas as transações do usuário
        const transactions = await db.collection('transactions')
            .find({ user_id: userId })
            .sort({ date: -1 })
            .toArray();
        
        res.json(transactions);
    } catch (error) {
        console.error("Erro ao buscar transações:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// NOVAS ROTAS PARA GERENCIAMENTO DE CATEGORIAS
// Listar categorias
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Buscar categorias do usuário ou usar categorias padrão
        let userCategories = await db.collection('categories')
            .find({ user_id: userId })
            .toArray();
        
        // Se o usuário não tem categorias, retornar categorias padrão
        if (userCategories.length === 0) {
            // Categorias padrão
            const defaultCategories = [
                { name: 'Salário', key: 'salary', type: 'income', icon: 'money-bill-wave' },
                { name: 'Freelance', key: 'freelance', type: 'income', icon: 'laptop' },
                { name: 'Investimentos', key: 'investments', type: 'income', icon: 'chart-line' },
                { name: 'Alimentação', key: 'food', type: 'expense', icon: 'utensils' },
                { name: 'Transporte', key: 'transport', type: 'expense', icon: 'car' },
                { name: 'Moradia', key: 'housing', type: 'expense', icon: 'home' },
                { name: 'Saúde', key: 'health', type: 'expense', icon: 'heartbeat' },
                { name: 'Educação', key: 'education', type: 'expense', icon: 'graduation-cap' },
                { name: 'Entretenimento', key: 'entertainment', type: 'expense', icon: 'film' },
                { name: 'Compras', key: 'shopping', type: 'expense', icon: 'shopping-cart' },
                { name: 'Contas', key: 'bills', type: 'expense', icon: 'file-invoice-dollar' },
                { name: 'Outros', key: 'other', type: 'expense', icon: 'question-circle' }
            ];
            
            // Inserir categorias padrão para o usuário
            const result = await db.collection('categories').insertMany(
                defaultCategories.map(cat => ({ ...cat, user_id: userId, isDefault: true }))
            );
            
            userCategories = await db.collection('categories')
                .find({ user_id: userId })
                .toArray();
        }
        
        res.json(userCategories);
    } catch (error) {
        console.error("Erro ao buscar categorias:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Criar nova categoria
app.post('/api/categories', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, type, icon } = req.body;
        
        // Validar campos obrigatórios
        if (!name || !type || !icon) {
            return res.status(400).json({ message: 'Nome, tipo e ícone são obrigatórios' });
        }
        
        // Criar chave única baseada no nome (para usar em IDs CSS e filtros)
        const key = name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remover acentos
            .replace(/[^a-z0-9]/g, '_'); // substituir caracteres especiais
        
        // Verificar se já existe uma categoria com este nome para o usuário
        const existingCategory = await db.collection('categories').findOne({
            user_id: userId,
            name: { $regex: new RegExp(`^${name}$`, 'i') } // case insensitive
        });
        
        if (existingCategory) {
            return res.status(400).json({ message: 'Já existe uma categoria com este nome' });
        }
        
        // Inserir nova categoria
        const result = await db.collection('categories').insertOne({
            user_id: userId,
            name,
            key,
            type, // 'income' ou 'expense'
            icon,
            isDefault: false,
            createdAt: new Date()
        });
        
        res.status(201).json({
            message: 'Categoria criada com sucesso',
            category: {
                id: result.insertedId,
                user_id: userId,
                name,
                key,
                type,
                icon,
                isDefault: false
            }
        });
    } catch (error) {
        console.error("Erro ao criar categoria:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Excluir categoria
app.delete('/api/categories/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const categoryId = req.params.id;
        const categoryObjectId = new ObjectId(categoryId);
        
        // Verificar se a categoria existe e pertence ao usuário
        const category = await db.collection('categories').findOne({
            _id: categoryObjectId,
            user_id: userId
        });
        
        if (!category) {
            return res.status(404).json({ message: 'Categoria não encontrada' });
        }
        
        // Não permitir excluir categorias padrão
        if (category.isDefault) {
            return res.status(403).json({ message: 'Não é possível excluir categorias padrão' });
        }
        
        // Excluir categoria
        await db.collection('categories').deleteOne({
            _id: categoryObjectId,
            user_id: userId
        });
        
        // Atualizar transações que usam esta categoria para "Outros"
        const defaultCategory = await db.collection('categories').findOne({
            user_id: userId,
            key: 'other'
        });
        
        if (defaultCategory) {
            await db.collection('transactions').updateMany(
                { user_id: userId, category: category.key },
                { $set: { category: 'other' } }
            );
        }
        
        res.json({ message: 'Categoria excluída com sucesso' });
    } catch (error) {
        console.error("Erro ao excluir categoria:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { title, amount, type, category, date, content } = req.body;
        
        // Validar campos obrigatórios
        if (!title || !amount || !type || !category || !date) {
            return res.status(400).json({ message: 'Faltam campos obrigatórios' });
        }
        
        // Criar nova transação
        const result = await db.collection('transactions').insertOne({
            user_id: userId,
            title,
            amount: Number(amount),
            type, // 'income' ou 'expense'
            category,
            date: new Date(date),
            content,
            createdAt: new Date()
        });
        
        res.status(201).json({
            message: 'Transação criada com sucesso',
            transaction: {
                id: result.insertedId,
                user_id: userId,
                title,
                amount: Number(amount),
                type,
                category,
                date: new Date(date),
                content
            }
        });
    } catch (error) {
        console.error("Erro ao criar transação:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const transactionId = req.params.id;
        const transactionObjectId = new ObjectId(transactionId);
        
        // Verificar se a transação existe e pertence ao usuário
        const transaction = await db.collection('transactions').findOne({
            _id: transactionObjectId,
            user_id: userId
        });
        
        if (!transaction) {
            return res.status(404).json({ message: 'Transação não encontrada' });
        }
        
        // Excluir a transação
        await db.collection('transactions').deleteOne({
            _id: transactionObjectId,
            user_id: userId
        });
        
        res.json({ message: 'Transação excluída com sucesso' });
    } catch (error) {
        console.error("Erro ao excluir transação:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

app.get('/api/summary', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // Calcular o período dos últimos 30 dias
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        // Buscar todas as transações do usuário
        const transactions = await db.collection('transactions')
            .find({ user_id: userId })
            .toArray();
        
        // Filtrar transações dos últimos 30 dias
        const recentTransactions = transactions.filter(
            t => new Date(t.date) >= thirtyDaysAgo
        );
        
        // Calcular receitas dos últimos 30 dias
        const totalIncome = recentTransactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
        
        // Calcular despesas dos últimos 30 dias
        const totalExpenses = recentTransactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        
        // Calcular saldo total (todas as transações)
        const allTimeIncome = transactions
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const allTimeExpenses = transactions
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + t.amount, 0);
        
        const balance = allTimeIncome - allTimeExpenses;
        
        res.json({
            income: totalIncome,
            expenses: totalExpenses,
            balance: balance
        });
    } catch (error) {
        console.error("Erro ao calcular resumo financeiro:", error);
        res.status(500).json({ message: 'Erro interno do servidor' });
    }
});

// Middleware para servir arquivos estáticos
app.use(express.static(__dirname));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota explícita para o CSS 
app.get('/styles.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'styles.css'));
});

// Rota para perfil
app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

// Iniciar servidor
async function startServer() {
    try {
        await connectToMongoDB();
        app.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });
    } catch (error) {
        console.error("Erro ao iniciar servidor:", error);
    }
}

startServer(); 