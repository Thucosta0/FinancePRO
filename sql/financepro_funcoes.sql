-- FinancePRO - Arquivo de Funções (Relatórios e Estatísticas)
-- Este arquivo contém as funções de relatórios e estatísticas do sistema FinancePRO.
-- Deve ser executado após a criação das tabelas e triggers (financepro_consolidado.sql e financepro_triggers.sql)

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

-- Função para calcular estatísticas básicas de gastos
CREATE OR REPLACE FUNCTION estatisticas_gastos(
    p_usuario_id UUID,
    p_meses INT DEFAULT 6
) RETURNS TABLE (
    media_mensal DECIMAL(15, 2),
    mediana_mensal DECIMAL(15, 2),
    maximo_mensal DECIMAL(15, 2),
    minimo_mensal DECIMAL(15, 2),
    desvio_padrao DECIMAL(15, 2),
    tendencia TEXT,
    previsao_proximo_mes DECIMAL(15, 2)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_data_inicio DATE;
    v_data_fim DATE;
    v_valores DECIMAL(15, 2)[];
    v_tendencia TEXT;
    v_mes_atual DECIMAL(15, 2);
    v_mes_anterior DECIMAL(15, 2);
    v_previsao DECIMAL(15, 2);
BEGIN
    -- Define o período de análise
    v_data_fim := CURRENT_DATE;
    v_data_inicio := (v_data_fim - (p_meses || ' months')::interval)::DATE;
    
    -- Coleta os totais mensais em um array para cálculos estatísticos
    SELECT array_agg(total ORDER BY mes)
    INTO v_valores
    FROM (
        SELECT 
            EXTRACT(YEAR FROM date) * 12 + EXTRACT(MONTH FROM date) AS mes,
            SUM(amount) AS total
        FROM transacoes
        WHERE usuario_id = p_usuario_id
          AND type = 'despesa'
          AND date BETWEEN v_data_inicio AND v_data_fim
        GROUP BY mes
        ORDER BY mes
    ) AS mensais;
    
    -- Se não houver dados suficientes, retorna valores zerados
    IF v_valores IS NULL OR array_length(v_valores, 1) < 2 THEN
        RETURN QUERY SELECT 
            0::DECIMAL(15, 2) AS media_mensal,
            0::DECIMAL(15, 2) AS mediana_mensal,
            0::DECIMAL(15, 2) AS maximo_mensal,
            0::DECIMAL(15, 2) AS minimo_mensal,
            0::DECIMAL(15, 2) AS desvio_padrao,
            'Sem dados suficientes'::TEXT AS tendencia,
            0::DECIMAL(15, 2) AS previsao_proximo_mes;
        RETURN;
    END IF;
    
    -- Calcula tendência (comparação dos últimos dois meses)
    v_mes_atual := v_valores[array_length(v_valores, 1)];
    v_mes_anterior := v_valores[array_length(v_valores, 1) - 1];
    
    IF v_mes_atual > v_mes_anterior * 1.1 THEN
        v_tendencia := 'Alta significativa';
    ELSIF v_mes_atual > v_mes_anterior * 1.03 THEN
        v_tendencia := 'Alta moderada';
    ELSIF v_mes_atual < v_mes_anterior * 0.9 THEN
        v_tendencia := 'Baixa significativa';
    ELSIF v_mes_atual < v_mes_anterior * 0.97 THEN
        v_tendencia := 'Baixa moderada';
    ELSE
        v_tendencia := 'Estável';
    END IF;
    
    -- Previsão simples para o próximo mês (média ponderada com mais peso nos meses recentes)
    v_previsao := (
        v_valores[array_length(v_valores, 1)] * 0.5 +
        v_valores[array_length(v_valores, 1) - 1] * 0.3 +
        (CASE WHEN array_length(v_valores, 1) >= 3 THEN v_valores[array_length(v_valores, 1) - 2] * 0.2 ELSE 0 END)
    );
    
    -- Se não há 3 meses de dados, ajusta o cálculo
    IF array_length(v_valores, 1) < 3 THEN
        v_previsao := v_previsao / (0.5 + 0.3);
    END IF;
    
    -- Retorna as estatísticas calculadas
    RETURN QUERY SELECT
        (SELECT AVG(val) FROM unnest(v_valores) AS val)::DECIMAL(15, 2) AS media_mensal,
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY val) FROM unnest(v_valores) AS val)::DECIMAL(15, 2) AS mediana_mensal,
        (SELECT MAX(val) FROM unnest(v_valores) AS val)::DECIMAL(15, 2) AS maximo_mensal,
        (SELECT MIN(val) FROM unnest(v_valores) AS val)::DECIMAL(15, 2) AS minimo_mensal,
        (SELECT STDDEV(val) FROM unnest(v_valores) AS val)::DECIMAL(15, 2) AS desvio_padrao,
        v_tendencia AS tendencia,
        v_previsao::DECIMAL(15, 2) AS previsao_proximo_mes;
END;
$$; 