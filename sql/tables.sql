-- Arquivo de criação das tabelas do FinancePRO no Supabase

-- Tabela de perfis de usuários
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    senha_hash TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de transações financeiras
CREATE TABLE IF NOT EXISTS transacoes (
    id UUID PRIMARY KEY,
    usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    descricao TEXT,
    amount DECIMAL(10, 2) NOT NULL,
    valor DECIMAL(10, 2) NOT NULL,
    type TEXT NOT NULL,
    tipo TEXT NOT NULL,
    category TEXT NOT NULL,
    categoria TEXT NOT NULL,
    date DATE NOT NULL,
    data DATE NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_transacoes_usuario_id ON transacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_date ON transacoes(date);
CREATE INDEX IF NOT EXISTS idx_transacoes_type ON transacoes(type);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Permissões de segurança (RLS - Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;

-- Políticas para transações (cada usuário só vê suas próprias transações)
CREATE POLICY transactions_user_policy ON transacoes
    FOR ALL
    USING (auth.uid() = usuario_id);

-- Política para perfis (cada usuário só vê seu próprio perfil)
CREATE POLICY profiles_user_policy ON profiles
    FOR ALL
    USING (auth.uid() = id); 