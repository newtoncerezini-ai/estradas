# Autenticacao com PostgreSQL

Este projeto usa o mesmo desenho do painel de creches: um servidor Node separado valida usuarios no PostgreSQL e o frontend consome `/api/auth`.

## Variaveis de ambiente

Configure no `.env`:

```env
VITE_ESTRADAS_AUTH_URL=/api/auth
DATABASE_URL=postgres://estradas_user:SENHA_FORTE@127.0.0.1:5432/estradas
ESTRADAS_AUTH_PORT=3030
ESTRADAS_JWT_SECRET=troque-por-uma-chave-com-mais-de-24-caracteres
ESTRADAS_SESSION_TTL=12h
```

Em banco remoto com SSL, adicione:

```env
PGSSLMODE=require
```

## Criar banco

Execute no PostgreSQL como usuario administrador:

```sql
create database estradas;
create user estradas_user with encrypted password 'SENHA_FORTE';
grant all privileges on database estradas to estradas_user;

\c estradas
grant usage, create on schema public to estradas_user;
grant all privileges on all tables in schema public to estradas_user;
grant all privileges on all sequences in schema public to estradas_user;
```

## Criar tabela e usuarios iniciais

Depois de configurar o `.env`:

```bash
npm run auth:setup
```

## Rodar localmente

Em terminais separados:

```bash
npm run auth:server
npm run refresh:server
npm run dev -- --host 127.0.0.1 --port 5174
```

Acesse `http://127.0.0.1:5174`.
