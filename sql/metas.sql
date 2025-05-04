-- Sistema de metas financeiras para o FinancePRO

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

-- Índices
CREATE INDEX IF NOT EXISTS idx_metas_usuario_id ON metas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_metas_categoria_id ON metas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_metas_status ON metas(status);

-- Permissões de segurança
ALTER TABLE metas ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY metas_user_policy ON metas
    FOR ALL
    USING (usuario_id = auth.uid());

-- Função para atualizar o progresso de uma meta
CREATE OR REPLACE FUNCTION atualizar_progresso_meta(meta_id UUID)
RETURNS DECIMAL AS $$
DECLARE
    v_meta RECORD;
    v_total DECIMAL(15, 2) := 0;
    v_categoria TEXT;
BEGIN
    -- Buscar informações da meta
    SELECT m.*, c.nome AS categoria_nome 
    INTO v_meta 
    FROM metas m 
    LEFT JOIN categorias c ON m.categoria_id = c.id
    WHERE m.id = meta_id;
    
    IF NOT FOUND THEN
        RETURN 0;
    END IF;
    
    v_categoria := v_meta.categoria_nome;
    
    -- Soma as transações relacionadas à categoria da meta
    IF v_categoria IS NOT NULL THEN
        SELECT COALESCE(SUM(
            CASE WHEN t.type = 'receita' THEN t.amount
                 WHEN t.type = 'despesa' THEN -t.amount
                 ELSE 0
            END
        ), 0)
        INTO v_total
        FROM transacoes t
        WHERE t.usuario_id = v_meta.usuario_id
          AND t.category = v_categoria
          AND t.date BETWEEN v_meta.data_inicio AND COALESCE(v_meta.data_fim, CURRENT_DATE);
    END IF;
    
    -- Atualiza o valor atual da meta
    UPDATE metas
    SET valor_atual = v_total,
        updated_at = CURRENT_TIMESTAMP,
        status = CASE 
                   WHEN v_total >= valor_alvo THEN 'concluida'
                   ELSE status
                 END
    WHERE id = meta_id;
    
    RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para atualizar metas quando uma transação for criada/atualizada/deletada
CREATE OR REPLACE FUNCTION atualizar_metas_apos_transacao()
RETURNS TRIGGER AS $$
DECLARE
    v_categoria TEXT;
    v_meta_id UUID;
    v_cursor CURSOR FOR 
        SELECT m.id 
        FROM metas m 
        JOIN categorias c ON m.categoria_id = c.id
        WHERE c.nome = v_categoria
          AND m.usuario_id = COALESCE(NEW.usuario_id, OLD.usuario_id);
BEGIN
    -- Se for DELETE, usar categoria da transação que foi removida
    IF TG_OP = 'DELETE' THEN
        v_categoria := OLD.category;
    ELSE
        v_categoria := NEW.category;
    END IF;
    
    -- Atualizar todas as metas relacionadas à categoria
    OPEN v_cursor;
    LOOP
        FETCH v_cursor INTO v_meta_id;
        EXIT WHEN NOT FOUND;
        
        PERFORM atualizar_progresso_meta(v_meta_id);
    END LOOP;
    CLOSE v_cursor;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para atualizar metas quando uma transação for alterada
DROP TRIGGER IF EXISTS on_transacao_changed ON transacoes;
CREATE TRIGGER on_transacao_changed
    AFTER INSERT OR UPDATE OR DELETE ON transacoes
    FOR EACH ROW EXECUTE FUNCTION atualizar_metas_apos_transacao(); 