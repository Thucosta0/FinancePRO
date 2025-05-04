-- Sistema de categorias personalizadas para o FinancePRO

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

-- Índices
CREATE INDEX IF NOT EXISTS idx_categorias_usuario_id ON categorias(usuario_id);

-- Permissões de segurança
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY categorias_user_policy ON categorias
    FOR ALL
    USING (usuario_id = auth.uid());

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