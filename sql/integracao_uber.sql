-- Tabela para armazenar integrações externas
CREATE TABLE IF NOT EXISTS public.integracoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'uber', 'app99', etc.
    access_token TEXT, -- Token de acesso para a API do provedor
    refresh_token TEXT, -- Token de atualização (se aplicável)
    token_expires_at TIMESTAMP WITH TIME ZONE, -- Data de expiração do token
    active BOOLEAN NOT NULL DEFAULT true, -- Se a integração está ativa
    user_data JSONB, -- Dados adicionais do usuário na plataforma
    settings JSONB, -- Configurações da integração
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    
    -- Índices
    UNIQUE(usuario_id, provider)
);

-- Comentários da tabela
COMMENT ON TABLE public.integracoes IS 'Armazena informações de integração com aplicativos externos';
COMMENT ON COLUMN public.integracoes.usuario_id IS 'Referência ao usuário dono da integração';
COMMENT ON COLUMN public.integracoes.provider IS 'Nome do provedor/serviço integrado';
COMMENT ON COLUMN public.integracoes.access_token IS 'Token de acesso para a API do provedor';
COMMENT ON COLUMN public.integracoes.refresh_token IS 'Token de atualização para renovar o access_token quando expirar';
COMMENT ON COLUMN public.integracoes.token_expires_at IS 'Data e hora de expiração do token de acesso';
COMMENT ON COLUMN public.integracoes.active IS 'Indica se a integração está ativa';
COMMENT ON COLUMN public.integracoes.user_data IS 'Dados adicionais do usuário na plataforma integrada';
COMMENT ON COLUMN public.integracoes.settings IS 'Configurações personalizadas para a integração';

-- Função para atualizar timestamp de updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Adicionar trigger para atualizar updated_at
CREATE TRIGGER update_integracoes_updated_at
BEFORE UPDATE ON public.integracoes
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Tabela para armazenar viagens importadas do Uber
CREATE TABLE IF NOT EXISTS public.viagens_uber (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    integracao_id UUID NOT NULL REFERENCES public.integracoes(id) ON DELETE CASCADE,
    uber_id VARCHAR(255) UNIQUE, -- ID da viagem no Uber
    data TIMESTAMP WITH TIME ZONE,
    valor DECIMAL(10, 2),
    origem TEXT,
    destino TEXT,
    status VARCHAR(50),
    detalhes JSONB,
    transacao_id UUID, -- Referência opcional para uma transação criada a partir desta viagem
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Comentários da tabela
COMMENT ON TABLE public.viagens_uber IS 'Armazena viagens importadas da integração com Uber';
COMMENT ON COLUMN public.viagens_uber.usuario_id IS 'Referência ao usuário dono da viagem';
COMMENT ON COLUMN public.viagens_uber.integracao_id IS 'Referência à integração que importou a viagem';
COMMENT ON COLUMN public.viagens_uber.uber_id IS 'ID único da viagem no sistema do Uber';
COMMENT ON COLUMN public.viagens_uber.transacao_id IS 'Referência à transação financeira criada a partir desta viagem';

-- Adicionar trigger para atualizar updated_at
CREATE TRIGGER update_viagens_uber_updated_at
BEFORE UPDATE ON public.viagens_uber
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

-- Permissões RLS (Row Level Security)
ALTER TABLE public.integracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.viagens_uber ENABLE ROW LEVEL SECURITY;

-- Políticas para integracoes
CREATE POLICY "Usuários podem ver suas próprias integrações"
    ON public.integracoes FOR SELECT
    USING (auth.uid() = usuario_id);
    
CREATE POLICY "Usuários podem inserir suas próprias integrações"
    ON public.integracoes FOR INSERT
    WITH CHECK (auth.uid() = usuario_id);
    
CREATE POLICY "Usuários podem atualizar suas próprias integrações"
    ON public.integracoes FOR UPDATE
    USING (auth.uid() = usuario_id);
    
CREATE POLICY "Usuários podem deletar suas próprias integrações"
    ON public.integracoes FOR DELETE
    USING (auth.uid() = usuario_id);

-- Políticas para viagens_uber
CREATE POLICY "Usuários podem ver suas próprias viagens"
    ON public.viagens_uber FOR SELECT
    USING (auth.uid() = usuario_id);
    
CREATE POLICY "Usuários podem inserir suas próprias viagens"
    ON public.viagens_uber FOR INSERT
    WITH CHECK (auth.uid() = usuario_id);
    
CREATE POLICY "Usuários podem atualizar suas próprias viagens"
    ON public.viagens_uber FOR UPDATE
    USING (auth.uid() = usuario_id);
    
CREATE POLICY "Usuários podem deletar suas próprias viagens"
    ON public.viagens_uber FOR DELETE
    USING (auth.uid() = usuario_id); 