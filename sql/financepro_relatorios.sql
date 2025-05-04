-- FinancePRO - Arquivo de Funções de Relatórios
-- Este arquivo contém as funções de geração de relatórios do sistema FinancePRO.
-- Deve ser executado após os outros arquivos SQL.

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

-- Função para gerar relatório de gastos por categoria em um período
CREATE OR REPLACE FUNCTION relatorio_gastos_por_categoria(
    p_usuario_id UUID,
    p_data_inicio DATE,
    p_data_fim DATE
) RETURNS TABLE (
    categoria TEXT,
    cor TEXT,
    icone TEXT,
    total DECIMAL(15, 2),
    percentual DECIMAL(5, 2)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_geral DECIMAL(15, 2);
BEGIN
    -- Calcula o total geral de despesas no período
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_geral
    FROM transacoes
    WHERE usuario_id = p_usuario_id
      AND type = 'despesa'
      AND date BETWEEN p_data_inicio AND p_data_fim;

    -- Retorna zero se não houver despesas
    IF v_total_geral = 0 THEN
        v_total_geral := 1; -- Evita divisão por zero
    END IF;

    -- Retorna os dados agrupados por categoria
    RETURN QUERY
    SELECT 
        t.category AS categoria,
        COALESCE(c.cor, '#3498db') AS cor,
        COALESCE(c.icone, 'tag') AS icone,
        COALESCE(SUM(t.amount), 0) AS total,
        ROUND((COALESCE(SUM(t.amount), 0) / v_total_geral) * 100, 2) AS percentual
    FROM transacoes t
    LEFT JOIN categorias c ON t.category = c.nome AND t.usuario_id = c.usuario_id
    WHERE t.usuario_id = p_usuario_id
      AND t.type = 'despesa'
      AND t.date BETWEEN p_data_inicio AND p_data_fim
    GROUP BY t.category, c.cor, c.icone
    ORDER BY total DESC;
END;
$$;

-- Função para gerar relatório de receitas por categoria em um período
CREATE OR REPLACE FUNCTION relatorio_receitas_por_categoria(
    p_usuario_id UUID,
    p_data_inicio DATE,
    p_data_fim DATE
) RETURNS TABLE (
    categoria TEXT,
    cor TEXT,
    icone TEXT,
    total DECIMAL(15, 2),
    percentual DECIMAL(5, 2)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_total_geral DECIMAL(15, 2);
BEGIN
    -- Calcula o total geral de receitas no período
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_geral
    FROM transacoes
    WHERE usuario_id = p_usuario_id
      AND type = 'receita'
      AND date BETWEEN p_data_inicio AND p_data_fim;

    -- Retorna zero se não houver receitas
    IF v_total_geral = 0 THEN
        v_total_geral := 1; -- Evita divisão por zero
    END IF;

    -- Retorna os dados agrupados por categoria
    RETURN QUERY
    SELECT 
        t.category AS categoria,
        COALESCE(c.cor, '#27ae60') AS cor,
        COALESCE(c.icone, 'tag') AS icone,
        COALESCE(SUM(t.amount), 0) AS total,
        ROUND((COALESCE(SUM(t.amount), 0) / v_total_geral) * 100, 2) AS percentual
    FROM transacoes t
    LEFT JOIN categorias c ON t.category = c.nome AND t.usuario_id = c.usuario_id
    WHERE t.usuario_id = p_usuario_id
      AND t.type = 'receita'
      AND t.date BETWEEN p_data_inicio AND p_data_fim
    GROUP BY t.category, c.cor, c.icone
    ORDER BY total DESC;
END;
$$;

-- Função para gerar fluxo de caixa mensal
CREATE OR REPLACE FUNCTION relatorio_fluxo_mensal(
    p_usuario_id UUID,
    p_ano INT,
    p_mes_inicio INT DEFAULT 1,
    p_mes_fim INT DEFAULT 12
) RETURNS TABLE (
    mes INT,
    nome_mes TEXT,
    receitas DECIMAL(15, 2),
    despesas DECIMAL(15, 2),
    saldo DECIMAL(15, 2)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH meses AS (
        SELECT m.mes, 
               CASE 
                  WHEN m.mes = 1 THEN 'Janeiro'
                  WHEN m.mes = 2 THEN 'Fevereiro'
                  WHEN m.mes = 3 THEN 'Março'
                  WHEN m.mes = 4 THEN 'Abril'
                  WHEN m.mes = 5 THEN 'Maio'
                  WHEN m.mes = 6 THEN 'Junho'
                  WHEN m.mes = 7 THEN 'Julho'
                  WHEN m.mes = 8 THEN 'Agosto'
                  WHEN m.mes = 9 THEN 'Setembro'
                  WHEN m.mes = 10 THEN 'Outubro'
                  WHEN m.mes = 11 THEN 'Novembro'
                  WHEN m.mes = 12 THEN 'Dezembro'
               END AS nome_mes
        FROM generate_series(p_mes_inicio, p_mes_fim) AS m(mes)
    ),
    receitas_mensais AS (
        SELECT EXTRACT(MONTH FROM date)::INT AS mes,
               COALESCE(SUM(amount), 0) AS total_receitas
        FROM transacoes
        WHERE usuario_id = p_usuario_id
          AND type = 'receita'
          AND EXTRACT(YEAR FROM date) = p_ano
          AND EXTRACT(MONTH FROM date) BETWEEN p_mes_inicio AND p_mes_fim
        GROUP BY mes
    ),
    despesas_mensais AS (
        SELECT EXTRACT(MONTH FROM date)::INT AS mes,
               COALESCE(SUM(amount), 0) AS total_despesas
        FROM transacoes
        WHERE usuario_id = p_usuario_id
          AND type = 'despesa'
          AND EXTRACT(YEAR FROM date) = p_ano
          AND EXTRACT(MONTH FROM date) BETWEEN p_mes_inicio AND p_mes_fim
        GROUP BY mes
    )
    SELECT 
        m.mes,
        m.nome_mes,
        COALESCE(r.total_receitas, 0) AS receitas,
        COALESCE(d.total_despesas, 0) AS despesas,
        COALESCE(r.total_receitas, 0) - COALESCE(d.total_despesas, 0) AS saldo
    FROM meses m
    LEFT JOIN receitas_mensais r ON m.mes = r.mes
    LEFT JOIN despesas_mensais d ON m.mes = d.mes
    ORDER BY m.mes;
END;
$$;

-- Função para gerar relatório de evolução patrimonial
CREATE OR REPLACE FUNCTION relatorio_evolucao_patrimonial(
    p_usuario_id UUID,
    p_data_inicio DATE,
    p_data_fim DATE,
    p_intervalo TEXT DEFAULT 'month' -- 'day', 'week', 'month', 'year'
) RETURNS TABLE (
    data_ponto DATE,
    descricao TEXT,
    saldo_acumulado DECIMAL(15, 2)
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    WITH datas AS (
        SELECT 
            CASE 
                WHEN p_intervalo = 'day' THEN d::DATE
                WHEN p_intervalo = 'week' THEN date_trunc('week', d)::DATE
                WHEN p_intervalo = 'month' THEN date_trunc('month', d)::DATE
                WHEN p_intervalo = 'year' THEN date_trunc('year', d)::DATE
                ELSE date_trunc('month', d)::DATE
            END AS data_ponto,
            CASE 
                WHEN p_intervalo = 'day' THEN to_char(d, 'DD/MM/YYYY')
                WHEN p_intervalo = 'week' THEN 'Semana de ' || to_char(date_trunc('week', d), 'DD/MM/YYYY')
                WHEN p_intervalo = 'month' THEN to_char(d, 'Month YYYY')
                WHEN p_intervalo = 'year' THEN to_char(d, 'YYYY')
                ELSE to_char(d, 'Month YYYY')
            END AS descricao
        FROM generate_series(p_data_inicio, p_data_fim, '1 day'::interval) AS d
        GROUP BY data_ponto, descricao
        ORDER BY data_ponto
    ),
    saldos AS (
        SELECT 
            d.data_ponto,
            d.descricao,
            SUM(
                CASE 
                    WHEN t.type = 'receita' THEN t.amount
                    WHEN t.type = 'despesa' THEN -t.amount
                    ELSE 0
                END
            ) OVER (ORDER BY d.data_ponto) AS saldo_acumulado
        FROM datas d
        LEFT JOIN transacoes t ON 
            CASE 
                WHEN p_intervalo = 'day' THEN t.date = d.data_ponto
                WHEN p_intervalo = 'week' THEN date_trunc('week', t.date)::DATE = d.data_ponto
                WHEN p_intervalo = 'month' THEN date_trunc('month', t.date)::DATE = d.data_ponto
                WHEN p_intervalo = 'year' THEN date_trunc('year', t.date)::DATE = d.data_ponto
                ELSE date_trunc('month', t.date)::DATE = d.data_ponto
            END
            AND t.usuario_id = p_usuario_id
    )
    SELECT DISTINCT
        s.data_ponto,
        s.descricao,
        COALESCE(s.saldo_acumulado, 0) AS saldo_acumulado
    FROM saldos s
    ORDER BY s.data_ponto;
END;
$$; 