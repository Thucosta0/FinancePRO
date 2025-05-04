-- Sistema de notificações e lembretes financeiros para o FinancePRO

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

-- Políticas de segurança
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lembretes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY notificacoes_user_policy ON notificacoes
    FOR ALL
    USING (usuario_id = auth.uid());

CREATE POLICY lembretes_user_policy ON lembretes
    FOR ALL
    USING (usuario_id = auth.uid());

-- Índices
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_id ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(lida);
CREATE INDEX IF NOT EXISTS idx_lembretes_usuario_id ON lembretes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_data_vencimento ON lembretes(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_lembretes_concluido ON lembretes(concluido);

-- Função para gerar notificações a partir de lembretes
CREATE OR REPLACE FUNCTION gerar_notificacoes_lembretes()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_lembrete RECORD;
    v_notificacoes_geradas INT := 0;
    v_hoje DATE := CURRENT_DATE;
    v_cursor CURSOR FOR 
        SELECT l.*, c.nome AS categoria_nome
        FROM lembretes l
        LEFT JOIN categorias c ON l.categoria_id = c.id
        WHERE l.concluido = FALSE 
          AND l.data_vencimento >= v_hoje
          AND (
            -- Notificar na data de notificação definida ou
            (l.data_notificacao IS NOT NULL AND l.data_notificacao = v_hoje) OR
            -- Notificar conforme antecedência padrão
            (l.data_notificacao IS NULL AND 
             l.data_vencimento - l.dias_antecedencia = v_hoje)
          );
BEGIN
    -- Percorre os lembretes que precisam gerar notificação hoje
    OPEN v_cursor;
    LOOP
        FETCH v_cursor INTO v_lembrete;
        EXIT WHEN NOT FOUND;
        
        -- Gerar notificação
        INSERT INTO notificacoes (
            usuario_id, 
            titulo, 
            mensagem, 
            tipo, 
            icone, 
            cor, 
            prioritaria,
            data_expiracao
        )
        VALUES (
            v_lembrete.usuario_id,
            CASE 
                WHEN v_lembrete.tipo = 'despesa' THEN 'Conta a pagar: ' || v_lembrete.titulo
                WHEN v_lembrete.tipo = 'receita' THEN 'Receita a receber: ' || v_lembrete.titulo
            END,
            'Você tem ' || CASE 
                WHEN v_lembrete.data_vencimento = v_hoje THEN 'hoje'
                ELSE (v_lembrete.data_vencimento - v_hoje) || ' dias'
            END || 
            ' para ' || 
            CASE 
                WHEN v_lembrete.tipo = 'despesa' THEN 'pagar' 
                ELSE 'receber'
            END ||
            ' ' || v_lembrete.valor || ' referente a ' || 
            COALESCE(v_lembrete.categoria_nome, v_lembrete.titulo),
            'lembrete',
            CASE 
                WHEN v_lembrete.tipo = 'despesa' THEN 'calendar-minus' 
                ELSE 'calendar-plus'
            END,
            CASE 
                WHEN v_lembrete.tipo = 'despesa' THEN '#e74c3c' 
                ELSE '#2ecc71'
            END,
            v_lembrete.data_vencimento = v_hoje, -- Prioritária se for hoje
            v_lembrete.data_vencimento + INTERVAL '1 day'
        );
        
        v_notificacoes_geradas := v_notificacoes_geradas + 1;
    END LOOP;
    CLOSE v_cursor;
    
    RETURN v_notificacoes_geradas;
END;
$$;

-- Função para gerar notificações de saúde financeira
CREATE OR REPLACE FUNCTION gerar_notificacoes_saude_financeira()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_usuario RECORD;
    v_notificacoes_geradas INT := 0;
    v_saude RECORD;
    v_cursor CURSOR FOR 
        SELECT id FROM profiles;
BEGIN
    -- Percorrer todos os usuários
    OPEN v_cursor;
    LOOP
        FETCH v_cursor INTO v_usuario;
        EXIT WHEN NOT FOUND;
        
        -- Obter saúde financeira do usuário
        SELECT * FROM indice_saude_financeira(v_usuario.id) INTO v_saude;
        
        -- Gerar alertas baseados na saúde financeira
        IF v_saude.indice_geral < 4.0 THEN
            -- Saúde financeira ruim ou crítica
            INSERT INTO notificacoes (
                usuario_id, 
                titulo, 
                mensagem, 
                tipo, 
                icone, 
                cor, 
                prioritaria
            )
            VALUES (
                v_usuario.id,
                'Alerta de saúde financeira',
                'Sua saúde financeira está classificada como ' || v_saude.classificacao || 
                '. Recomendamos revisar seus gastos e verificar as dicas para melhorar.',
                'alerta',
                'exclamation-triangle',
                '#e74c3c',
                TRUE
            );
            
            v_notificacoes_geradas := v_notificacoes_geradas + 1;
            
            -- Adicionar uma notificação para cada recomendação importante
            IF v_saude.economia_percentual < 0 THEN
                INSERT INTO notificacoes (
                    usuario_id, 
                    titulo, 
                    mensagem, 
                    tipo, 
                    icone, 
                    cor
                )
                VALUES (
                    v_usuario.id,
                    'Despesas maiores que receitas',
                    'Você está gastando mais do que ganha. Reduzir despesas imediatamente é essencial para equilibrar suas finanças.',
                    'dica',
                    'money-bill-wave',
                    '#f39c12'
                );
                
                v_notificacoes_geradas := v_notificacoes_geradas + 1;
            END IF;
        END IF;
        
    END LOOP;
    CLOSE v_cursor;
    
    RETURN v_notificacoes_geradas;
END;
$$;

-- Função para marcar lembretes como concluídos com base nas transações
CREATE OR REPLACE FUNCTION processar_lembretes_apos_transacao()
RETURNS TRIGGER AS $$
DECLARE
    v_lembrete_id UUID;
    v_cursor CURSOR FOR 
        SELECT id
        FROM lembretes
        WHERE usuario_id = NEW.usuario_id
          AND tipo = NEW.type
          AND concluido = FALSE
          AND ABS(valor - NEW.amount) < 0.01
          AND (
            titulo ILIKE '%' || NEW.title || '%'
            OR descricao ILIKE '%' || NEW.title || '%'
            OR NEW.title ILIKE '%' || titulo || '%'
          )
          AND (categoria_id IS NULL OR 
               EXISTS (
                 SELECT 1 FROM categorias
                 WHERE id = lembretes.categoria_id
                   AND nome = NEW.category
               ));
BEGIN
    -- Verificar se a nova transação corresponde a algum lembrete
    OPEN v_cursor;
    LOOP
        FETCH v_cursor INTO v_lembrete_id;
        EXIT WHEN NOT FOUND;
        
        -- Marcar o lembrete como concluído
        UPDATE lembretes
        SET concluido = TRUE,
            ultima_atualizacao = CURRENT_TIMESTAMP
        WHERE id = v_lembrete_id;
        
        -- Adicionar notificação informando que o lembrete foi concluído
        INSERT INTO notificacoes (
            usuario_id, 
            titulo, 
            mensagem, 
            tipo, 
            icone, 
            cor
        )
        VALUES (
            NEW.usuario_id,
            'Lembrete finalizado',
            'Sua transação "' || NEW.title || '" coincide com um lembrete pendente, que foi marcado como concluído.',
            'sistema',
            'check-circle',
            '#2ecc71'
        );
    END LOOP;
    CLOSE v_cursor;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para processar lembretes após inserção de transação
DROP TRIGGER IF EXISTS on_transacao_inserted ON transacoes;
CREATE TRIGGER on_transacao_inserted
    AFTER INSERT ON transacoes
    FOR EACH ROW EXECUTE FUNCTION processar_lembretes_apos_transacao(); 