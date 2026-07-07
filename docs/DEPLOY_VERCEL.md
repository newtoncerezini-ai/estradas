# Deploy no Vercel

Este painel pode ser publicado como aplicação estática no Vercel.

## Configuração

No Vercel, use:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

## Login temporário

O painel está usando uma máscara local de login, sem PostgreSQL:

```text
Usuário: admin
Senha: 123@mudar
```

Variáveis opcionais:

```env
VITE_ESTRADAS_AUTH_MODE=local
VITE_ESTRADAS_LOCAL_USER=admin
VITE_ESTRADAS_LOCAL_PASSWORD=123@mudar
VITE_ESTRADAS_STATIC_DEPLOY=true
```

## Atualização de dados

Neste modo estático, o botão de atualizar bases fica sem backend. Para publicar dados atualizados:

```bash
npm run data:update
npm run shapes:convert
npm run build
```

Depois publique novamente no Vercel.
