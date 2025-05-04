-- FinancePRO - Arquivo de Triggers e Funções Básicas
-- Este arquivo contém os triggers e funções básicas do sistema FinancePRO.
-- Deve ser executado após a criação das tabelas (financepro_consolidado.sql)

-- Trigger para criar um perfil automaticamente quando um usuário é registrado via Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, email, created_at, updated_at)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', 'Usuário'),
    new.email,
    NOW(),
    NOW()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop do trigger existente (caso exista)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Criação do trigger que executa a função acima quando um usuário é criado
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Inserir categorias padrão quando um novo usuário for criado
CREATE OR REPLACE FUNCTION public.criar_categorias_padrao()
RETURNS TRIGGER AS $$
BEGIN
  -- Categorias de despesas
  INSERT INTO public.categorias (usuario_id, nome, cor, icone, tipo, descricao)
  VALUES
    (NEW.id, 'Alimentação', '#e74c3c', 'utensils', 'despesa', 'Gastos com mercado, restaurantes e delivery'),
    (NEW.id, 'Transporte', '#3498db', 'car', 'despesa', 'Combustível, transporte público, aplicativos'),
    (NEW.id, 'Moradia', '#8e44ad', 'home', 'despesa', 'Aluguel, contas, manutenção'),
    (NEW.id, 'Lazer', '#f39c12', 'film', 'despesa', 'Entretenimento, viagens, hobbies'),
    (NEW.id, 'Saúde', '#2ecc71', 'heartbeat', 'despesa', 'Médicos, remédios, planos de saúde'),
    (NEW.id, 'Educação', '#1abc9c', 'graduation-cap', 'despesa', 'Cursos, livros, material escolar'),
    (NEW.id, 'Outros', '#95a5a6', 'ellipsis-h', 'despesa', 'Despesas diversas');
  
  -- Categorias de receitas
  INSERT INTO public.categorias (usuario_id, nome, cor, icone, tipo, descricao)
  VALUES
    (NEW.id, 'Salário', '#27ae60', 'briefcase', 'receita', 'Remuneração mensal'),
    (NEW.id, 'Freelance', '#2980b9', 'laptop', 'receita', 'Trabalhos extras'),
    (NEW.id, 'Investimentos', '#f1c40f', 'chart-line', 'receita', 'Rendimentos financeiros'),
    (NEW.id, 'Outras Receitas', '#95a5a6', 'ellipsis-h', 'receita', 'Receitas diversas');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar o trigger para inserir categorias padrão quando um perfil for criado
DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.criar_categorias_padrao();

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

-- Funções de auditoria
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