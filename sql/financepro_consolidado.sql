-- FinancePRO - Arquivo SQL Consolidado
-- Este arquivo contém todas as tabelas e funções do sistema FinancePRO organizadas 
-- na ordem correta para execução no Supabase.

--------------------------------------------------------
-- PARTE 1: CRIAÇÃO DE TABELAS BÁSICAS
--------------------------------------------------------

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

-- Índices para tabelas básicas
CREATE INDEX IF NOT EXISTS idx_transacoes_usuario_id ON transacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_transacoes_date ON transacoes(date);
CREATE INDEX IF NOT EXISTS idx_transacoes_type ON transacoes(type);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Permissões de segurança (RLS - Row Level Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacoes ENABLE ROW LEVEL SECURITY;

-- Remover políticas se existirem para evitar erros
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS transactions_user_policy ON transacoes;
    EXCEPTION WHEN OTHERS THEN
        -- Ignora se a política não existir
    END;
    
    BEGIN
        DROP POLICY IF EXISTS profiles_user_policy ON profiles;
    EXCEPTION WHEN OTHERS THEN
        -- Ignora se a política não existir
    END;
END $$;

-- Políticas para transações
CREATE POLICY transactions_user_policy ON transacoes
    FOR ALL
    USING (auth.uid() = usuario_id);

-- Política para perfis
CREATE POLICY profiles_user_policy ON profiles
    FOR ALL
    USING (auth.uid() = id);

-- Tabela de categorias
CREATE TABLE IF NOT EXISTS categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    cor TEXT NOT NULL DEFAULT '#3498db',
    icone TEXT DEFAULT 'tag',
    tipo TEXT NOT NULL, -- 'receita' ou 'despesa' ou 'ambos'
    descricao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(usuario_id, nome, tipo)
);

-- Índices para categorias
CREATE INDEX IF NOT EXISTS idx_categorias_usuario_id ON categorias(usuario_id);

-- Permissões de segurança para categorias
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- Remover política se existir
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS categorias_user_policy ON categorias;
    EXCEPTION WHEN OTHERS THEN
        -- Ignora se a política não existir
    END;
END $$;

-- Política de acesso para categorias
CREATE POLICY categorias_user_policy ON categorias
    FOR ALL
    USING (usuario_id = auth.uid());

-- Tabela de metas financeiras
CREATE TABLE IF NOT EXISTS metas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    valor_alvo DECIMAL(15, 2) NOT NULL,
    valor_atual DECIMAL(15, 2) DEFAULT 0,
    data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    data_fim DATE,
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    cor TEXT DEFAULT '#3498db',
    icone TEXT DEFAULT 'bullseye',
    status TEXT DEFAULT 'em_andamento', -- 'em_andamento', 'concluida', 'cancelada'
    recorrente BOOLEAN DEFAULT FALSE,
    periodo_recorrencia TEXT, -- 'mensal', 'anual', etc
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para metas
CREATE INDEX IF NOT EXISTS idx_metas_usuario_id ON metas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_metas_categoria_id ON metas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_metas_status ON metas(status);

-- Permissões de segurança para metas
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

-- Remover política se existir
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS metas_user_policy ON metas;
    EXCEPTION WHEN OTHERS THEN
        -- Ignora se a política não existir
    END;
END $$;

-- Política de acesso para metas
CREATE POLICY metas_user_policy ON metas
    FOR ALL
    USING (usuario_id = auth.uid());

-- Tabela de notificações
CREATE TABLE IF NOT EXISTS notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    tipo TEXT NOT NULL, -- 'alerta', 'lembrete', 'dica', 'sistema'
    icone TEXT DEFAULT 'bell',
    cor TEXT DEFAULT '#3498db',
    lida BOOLEAN DEFAULT FALSE,
    prioritaria BOOLEAN DEFAULT FALSE,
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    data_leitura TIMESTAMP WITH TIME ZONE,
    data_expiracao TIMESTAMP WITH TIME ZONE
);

-- Tabela de lembretes de contas a pagar/receber
CREATE TABLE IF NOT EXISTS lembretes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    valor DECIMAL(15, 2) NOT NULL,
    tipo TEXT NOT NULL, -- 'despesa', 'receita'
    categoria_id UUID REFERENCES categorias(id) ON DELETE SET NULL,
    data_vencimento DATE NOT NULL,
    data_notificacao DATE,
    dias_antecedencia INT DEFAULT 3,
    concluido BOOLEAN DEFAULT FALSE,
    recorrente BOOLEAN DEFAULT FALSE,
    frequencia TEXT, -- 'mensal', 'anual', etc.
    data_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ultima_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Políticas de segurança para notificações e lembretes
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lembretes ENABLE ROW LEVEL SECURITY;

-- Remover políticas se existirem
DO $$
BEGIN
    BEGIN
        DROP POLICY IF EXISTS notificacoes_user_policy ON notificacoes;
    EXCEPTION WHEN OTHERS THEN
        -- Ignora se a política não existir
    END;
    
    BEGIN
        DROP POLICY IF EXISTS lembretes_user_policy ON lembretes;
    EXCEPTION WHEN OTHERS THEN
        -- Ignora se a política não existir
    END;
END $$;

-- Políticas de acesso para notificações e lembretes
CREATE POLICY notificacoes_user_policy ON notificacoes
    FOR ALL
    USING (usuario_id = auth.uid());

CREATE POLICY lembretes_user_policy ON lembretes
    FOR ALL
    USING (usuario_id = auth.uid());

-- Índices para notificações e lembretes
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_id ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_lembretes_usuario_id ON lembretes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_data_vencimento ON lembretes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_lembretes_concluido ON lembretes(concluido);

-- Tabela de logs de auditoria
CREATE TABLE IF NOT EXISTS auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entidade TEXT NOT NULL, -- 'perfil', 'transacao', 'categoria', etc.
    entidade_id UUID NOT NULL,
    usuario_id UUID,
    acao TEXT NOT NULL, -- 'criar', 'atualizar', 'excluir', 'login', 'logout', etc.
    dados_anteriores JSONB,
    dados_novos JSONB,
    ip_address TEXT,
    user_agent TEXT,
    data_hora TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices para otimização de auditoria
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria(entidade);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_id ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_acao ON auditoria(acao);
CREATE INDEX IF NOT EXISTS idx_auditoria_data_hora ON auditoria(data_hora);

--------------------------------------------------------
-- PARTE 2: CRIAÇÃO DE TRIGGERS E FUNÇÕES
--------------------------------------------------------
-- Em funções adicional.sql e triggers.sql 