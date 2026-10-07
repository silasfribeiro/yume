# Yume · Controle de estoque

App de estoque e vendas da Yume (produtos, Box Liberdade, eventos de artist alley).

- **Site:** GitHub Pages (este repositório)
- **Banco de dados, login e fotos:** Supabase
- `config.js`: endereço e chave pública do Supabase, e o nome da marca (`BRAND`)
- `schema.sql`: estrutura do banco (pode rodar de novo no SQL Editor sem perder dados)
- `.github/workflows/manter-ativo.yml`: consulta o banco a cada 3 dias para o Supabase gratuito não pausar

**Trocar o nome da marca:** edite `BRAND` em `config.js`.
**Backup:** no app, Configurações → Baixar backup.
**Novo usuário:** Supabase → Authentication → Users → Add user → Create new user (marque "Auto Confirm User").
