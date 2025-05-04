-- Trigger para criar um perfil automaticamente quando um usuário é registrado via Auth

-- Função que será chamada pelo trigger
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