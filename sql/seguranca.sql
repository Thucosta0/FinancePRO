-- Sistema de segurança e auditoria para o FinancePRO

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

-- Índices para otimização
CREATE INDEX IF NOT EXISTS idx_auditoria_entidade ON auditoria(entidade);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario_id ON auditoria(usuario_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_acao ON auditoria(acao);
CREATE INDEX IF NOT EXISTS idx_auditoria_data_hora ON auditoria(data_hora);

-- Função para registrar ações de auditoria em perfis
CREATE OR REPLACE FUNCTION auditar_perfis()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO auditoria (
            entidade, 
            entidade_id, 
            usuario_id, 
            acao, 
            dados_anteriores, 
            dados_novos
        )
        VALUES (
            'perfil',
            NEW.id,
            NEW.id,
            'criar',
            NULL,
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Não armazenar o hash da senha nos logs de auditoria
        NEW.senha_hash := NULL;
        OLD.senha_hash := NULL;
        
        INSERT INTO auditoria (
            entidade, 
            entidade_id, 
            usuario_id, 
            acao, 
            dados_anteriores, 
            dados_novos
        )
        VALUES (
            'perfil',
            NEW.id,
            NEW.id,
            'atualizar',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        -- Não armazenar o hash da senha nos logs de auditoria
        OLD.senha_hash := NULL;
        
        INSERT INTO auditoria (
            entidade, 
            entidade_id, 
            usuario_id, 
            acao, 
            dados_anteriores, 
            dados_novos
        )
        VALUES (
            'perfil',
            OLD.id,
            OLD.id,
            'excluir',
            to_jsonb(OLD),
            NULL
        );
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar ações de auditoria em transações
CREATE OR REPLACE FUNCTION auditar_transacoes()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO auditoria (
            entidade, 
            entidade_id, 
            usuario_id, 
            acao, 
            dados_anteriores, 
            dados_novos
        )
        VALUES (
            'transacao',
            NEW.id,
            NEW.usuario_id,
            'criar',
            NULL,
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO auditoria (
            entidade, 
            entidade_id, 
            usuario_id, 
            acao, 
            dados_anteriores, 
            dados_novos
        )
        VALUES (
            'transacao',
            NEW.id,
            NEW.usuario_id,
            'atualizar',
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO auditoria (
            entidade, 
            entidade_id, 
            usuario_id, 
            acao, 
            dados_anteriores, 
            dados_novos
        )
        VALUES (
            'transacao',
            OLD.id,
            OLD.usuario_id,
            'excluir',
            to_jsonb(OLD),
            NULL
        );
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar triggers de auditoria
DROP TRIGGER IF EXISTS audit_profiles_trigger ON profiles;
CREATE TRIGGER audit_profiles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON profiles
    FOR EACH ROW EXECUTE FUNCTION auditar_perfis();

DROP TRIGGER IF EXISTS audit_transacoes_trigger ON transacoes;
CREATE TRIGGER audit_transacoes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON transacoes
    FOR EACH ROW EXECUTE FUNCTION auditar_transacoes();

-- Função para registrar logins
CREATE OR REPLACE FUNCTION registrar_login(p_usuario_id UUID, p_ip_address TEXT, p_user_agent TEXT)
RETURNS VOID AS $$
BEGIN
    INSERT INTO auditoria (
        entidade,
        entidade_id,
        usuario_id,
        acao,
        ip_address,
        user_agent
    )
    VALUES (
        'auth',
        p_usuario_id,
        p_usuario_id,
        'login',
        p_ip_address,
        p_user_agent
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para registrar logouts
CREATE OR REPLACE FUNCTION registrar_logout(p_usuario_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO auditoria (
        entidade,
        entidade_id,
        usuario_id,
        acao
    )
    VALUES (
        'auth',
        p_usuario_id,
        p_usuario_id,
        'logout'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para detectar atividades suspeitas
CREATE OR REPLACE FUNCTION detectar_atividades_suspeitas()
RETURNS TABLE (
    usuario_id UUID,
    nome TEXT,
    email TEXT,
    descricao TEXT,
    nivel_risco TEXT,
    data_ocorrencia TIMESTAMP WITH TIME ZONE
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    
    -- Múltiplos logins de IPs diferentes em curto período
    SELECT 
        a.usuario_id,
        p.nome,
        p.email,
        'Múltiplos logins de IPs diferentes em curto período' AS descricao,
        'Alto' AS nivel_risco,
        MAX(a.data_hora) AS data_ocorrencia
    FROM auditoria a
    JOIN profiles p ON a.usuario_id = p.id
    WHERE a.acao = 'login'
      AND a.data_hora > NOW() - INTERVAL '24 hours'
    GROUP BY a.usuario_id, p.nome, p.email
    HAVING COUNT(DISTINCT a.ip_address) > 2
    
    UNION ALL
    
    -- Remoção ou edição de múltiplas transações em curto período
    SELECT 
        a.usuario_id,
        p.nome,
        p.email,
        'Múltiplas transações excluídas ou editadas em curto período' AS descricao,
        'Médio' AS nivel_risco,
        MAX(a.data_hora) AS data_ocorrencia
    FROM auditoria a
    JOIN profiles p ON a.usuario_id = p.id
    WHERE a.entidade = 'transacao'
      AND (a.acao = 'excluir' OR a.acao = 'atualizar')
      AND a.data_hora > NOW() - INTERVAL '1 hour'
    GROUP BY a.usuario_id, p.nome, p.email
    HAVING COUNT(*) > 10
    
    UNION ALL
    
    -- Valor de transação excepcionalmente alto comparado à média do usuário
    SELECT 
        t.usuario_id,
        p.nome,
        p.email,
        'Transação com valor muito acima da média do usuário' AS descricao,
        'Médio' AS nivel_risco,
        t.created_at AS data_ocorrencia
    FROM transacoes t
    JOIN profiles p ON t.usuario_id = p.id
    JOIN (
        SELECT 
            usuario_id,
            AVG(amount) AS media,
            STDDEV(amount) AS desvio
        FROM transacoes
        GROUP BY usuario_id
    ) AS stats ON t.usuario_id = stats.usuario_id
    WHERE t.amount > stats.media + (3 * stats.desvio) -- 3 desvios padrão acima da média
      AND t.amount > 1000 -- Valor mínimo significativo
      AND t.created_at > NOW() - INTERVAL '24 hours'
    
    ORDER BY nivel_risco, data_ocorrencia DESC;
END;
$$; 