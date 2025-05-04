-- Sistema de relatórios financeiros para o FinancePRO

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