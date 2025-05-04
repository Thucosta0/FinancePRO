-- Sistema de estatísticas e análises financeiras para o FinancePRO

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

-- Função para analisar categorias com maior crescimento/redução
CREATE OR REPLACE FUNCTION analise_categorias_variacao(
    p_usuario_id UUID,
    p_meses INT DEFAULT 3,
    p_tipo TEXT DEFAULT 'despesa'
) RETURNS TABLE (
    categoria TEXT,
    valor_anterior DECIMAL(15, 2),
    valor_atual DECIMAL(15, 2),
    variacao_absoluta DECIMAL(15, 2),
    variacao_percentual DECIMAL(5, 2),
    tendencia TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_data_atual DATE := CURRENT_DATE;
    v_data_meio DATE := (v_data_atual - (p_meses/2 || ' months')::interval)::DATE;
    v_data_inicio DATE := (v_data_atual - (p_meses || ' months')::interval)::DATE;
BEGIN
    RETURN QUERY
    WITH periodo_anterior AS (
        SELECT 
            category AS categoria,
            SUM(amount) AS total
        FROM transacoes
        WHERE usuario_id = p_usuario_id
          AND type = p_tipo
          AND date BETWEEN v_data_inicio AND v_data_meio
        GROUP BY category
    ),
    periodo_atual AS (
        SELECT 
            category AS categoria,
            SUM(amount) AS total
        FROM transacoes
        WHERE usuario_id = p_usuario_id
          AND type = p_tipo
          AND date BETWEEN v_data_meio AND v_data_atual
        GROUP BY category
    )
    SELECT 
        COALESCE(pa.categoria, pc.categoria) AS categoria,
        COALESCE(pa.total, 0) AS valor_anterior,
        COALESCE(pc.total, 0) AS valor_atual,
        COALESCE(pc.total, 0) - COALESCE(pa.total, 0) AS variacao_absoluta,
        CASE 
            WHEN COALESCE(pa.total, 0) = 0 THEN 100
            ELSE ROUND(((COALESCE(pc.total, 0) - COALESCE(pa.total, 0)) / COALESCE(pa.total, 1) * 100), 2)
        END AS variacao_percentual,
        CASE 
            WHEN COALESCE(pc.total, 0) > COALESCE(pa.total, 0) * 1.2 THEN 'Alta significativa'
            WHEN COALESCE(pc.total, 0) > COALESCE(pa.total, 0) * 1.05 THEN 'Alta moderada'
            WHEN COALESCE(pc.total, 0) < COALESCE(pa.total, 0) * 0.8 THEN 'Redução significativa'
            WHEN COALESCE(pc.total, 0) < COALESCE(pa.total, 0) * 0.95 THEN 'Redução moderada'
            ELSE 'Estável'
        END AS tendencia
    FROM periodo_anterior pa
    FULL OUTER JOIN periodo_atual pc ON pa.categoria = pc.categoria
    WHERE COALESCE(pa.total, 0) > 0 OR COALESCE(pc.total, 0) > 0
    ORDER BY ABS(variacao_percentual) DESC;
END;
$$;

-- Função para calcular a saúde financeira do usuário
CREATE OR REPLACE FUNCTION indice_saude_financeira(
    p_usuario_id UUID
) RETURNS TABLE (
    indice_geral DECIMAL(5, 2),
    classificacao TEXT,
    economia_percentual DECIMAL(5, 2),
    regularidade_receitas DECIMAL(5, 2),
    equilibrio_categorias DECIMAL(5, 2),
    recomendacoes TEXT[]
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_receitas DECIMAL(15, 2);
    v_despesas DECIMAL(15, 2);
    v_economia DECIMAL(5, 2);
    v_regularidade DECIMAL(5, 2);
    v_equilibrio DECIMAL(5, 2);
    v_indice DECIMAL(5, 2);
    v_classificacao TEXT;
    v_recomendacoes TEXT[] := ARRAY[]::TEXT[];
    v_data_inicio DATE := (CURRENT_DATE - INTERVAL '3 months')::DATE;
BEGIN
    -- Calcular receitas e despesas dos últimos 3 meses
    SELECT COALESCE(SUM(amount), 0) INTO v_receitas
    FROM transacoes
    WHERE usuario_id = p_usuario_id
      AND type = 'receita'
      AND date >= v_data_inicio;
      
    SELECT COALESCE(SUM(amount), 0) INTO v_despesas
    FROM transacoes
    WHERE usuario_id = p_usuario_id
      AND type = 'despesa'
      AND date >= v_data_inicio;
    
    -- Calcular percentual de economia
    IF v_receitas > 0 THEN
        v_economia := ROUND(((v_receitas - v_despesas) / v_receitas) * 100, 2);
    ELSE
        v_economia := 0;
    END IF;
    
    -- Avaliar regularidade das receitas (verificar se há receitas em todos os meses)
    SELECT 
        CASE 
            WHEN COUNT(DISTINCT mes) = 3 THEN 10.0
            WHEN COUNT(DISTINCT mes) = 2 THEN 6.5
            WHEN COUNT(DISTINCT mes) = 1 THEN 3.0
            ELSE 0.0
        END INTO v_regularidade
    FROM (
        SELECT EXTRACT(YEAR FROM date) * 12 + EXTRACT(MONTH FROM date) AS mes
        FROM transacoes
        WHERE usuario_id = p_usuario_id
          AND type = 'receita'
          AND date >= v_data_inicio
        GROUP BY mes
    ) AS meses_com_receita;
    
    -- Avaliar equilíbrio entre categorias (base: desvio padrão do gasto percentual)
    WITH categoria_percentual AS (
        SELECT 
            category,
            (SUM(amount) / v_despesas) * 100 AS percentual
        FROM transacoes
        WHERE usuario_id = p_usuario_id
          AND type = 'despesa'
          AND date >= v_data_inicio
        GROUP BY category
    )
    SELECT 
        CASE
            WHEN STDDEV(percentual) > 30 THEN 4.0 -- Muito desequilibrado
            WHEN STDDEV(percentual) > 20 THEN 6.0 -- Desequilibrado
            WHEN STDDEV(percentual) > 10 THEN 8.0 -- Moderado
            ELSE 10.0 -- Equilibrado
        END INTO v_equilibrio
    FROM categoria_percentual;
    
    -- Se não houver dados suficientes, usar valor padrão
    IF v_equilibrio IS NULL THEN
        v_equilibrio := 5.0;
    END IF;
    
    -- Calcular índice geral de saúde financeira (ponderado)
    v_indice := ROUND(
        CASE
            WHEN v_economia < 0 THEN 0 -- Se estiver gastando mais do que ganha, pontuação 0
            ELSE LEAST(v_economia, 40) / 4 -- Máx 10 pontos
        END * 0.4 + -- 40% do peso
        v_regularidade * 0.3 + -- 30% do peso
        v_equilibrio * 0.3,    -- 30% do peso
        2
    );
    
    -- Classificar saúde financeira
    v_classificacao := 
        CASE 
            WHEN v_indice >= 9.0 THEN 'Excelente'
            WHEN v_indice >= 7.5 THEN 'Muito boa'
            WHEN v_indice >= 6.0 THEN 'Boa'
            WHEN v_indice >= 4.0 THEN 'Regular'
            WHEN v_indice >= 2.0 THEN 'Ruim'
            ELSE 'Crítica'
        END;
    
    -- Gerar recomendações baseadas na análise
    IF v_economia < 10 THEN
        v_recomendacoes := v_recomendacoes || 'Aumentar taxa de economia para pelo menos 10% da renda';
    END IF;
    
    IF v_regularidade < 10 THEN
        v_recomendacoes := v_recomendacoes || 'Buscar fontes de renda mais regulares';
    END IF;
    
    IF v_equilibrio < 7 THEN
        v_recomendacoes := v_recomendacoes || 'Distribuir melhor os gastos entre as categorias';
    END IF;
    
    -- Se estiver gastando mais do que ganha
    IF v_economia < 0 THEN
        v_recomendacoes := v_recomendacoes || 'URGENTE: Reduzir despesas para ficar abaixo da receita mensal';
    END IF;
    
    -- Retornar resultado
    RETURN QUERY SELECT 
        v_indice,
        v_classificacao,
        v_economia,
        v_regularidade,
        v_equilibrio,
        v_recomendacoes;
END;
$$; 