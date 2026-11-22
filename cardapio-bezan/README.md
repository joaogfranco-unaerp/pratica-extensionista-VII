# Cardápio Digital - Buffet Bezan

Projeto da Prática Extensionista VII, Engenharia da Computação (UNAERP).

Cardápio digital para o Buffet Bezan. O cliente vê o cardápio e faz o pedido pelo navegador, e o administrador cadastra os itens e acompanha os pedidos pelo painel.

## Tecnologias

- Frontend: HTML, CSS e JavaScript
- Backend: Node.js com Express
- Banco de dados: PostgreSQL
- Autenticação: JWT
- Documentação da API: Swagger, em `/api-docs`

## Como rodar

Precisa de Node 18 ou mais novo e de um banco PostgreSQL.

```bash
npm install
export DATABASE_URL=postgres://usuario:senha@localhost:5432/cardapio
npm start
```

O site abre em `http://localhost:3000` e o painel em `http://localhost:3000/admin`.
Na primeira execução são criadas as tabelas, o usuário administrador e alguns itens no cardápio.

Variáveis de ambiente:

- `DATABASE_URL`: endereço do banco
- `JWT_SECRET`: chave usada nos tokens
- `ADMIN_EMAIL` e `ADMIN_PASSWORD`: login do administrador (padrão `admin@bezan.com` / `bezan123`)

## Rotas da API

| Método | Rota | Login |
| --- | --- | --- |
| POST | /api/auth/login | não |
| GET | /api/categories | não |
| POST, DELETE | /api/categories | sim |
| GET | /api/items | não |
| GET | /api/items/:id | não |
| POST, PUT, DELETE | /api/items | sim |
| POST | /api/orders | não |
| GET | /api/orders/:id/track | não |
| GET | /api/orders | sim |
| PATCH | /api/orders/:id/status | sim |

## Equipe

- Nome - Código
- Nome - Código
- Nome - Código
- Nome - Código
- Nome - Código
