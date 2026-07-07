import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import pg from "pg";

dotenv.config({ quiet: true });

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = Number(process.env.ESTRADAS_AUTH_PORT || process.env.CRECHES_AUTH_PORT || process.env.PORT || 3030);
const jwtSecret = process.env.ESTRADAS_JWT_SECRET || process.env.CRECHES_JWT_SECRET || process.env.JWT_SECRET;
const tokenTtl = process.env.ESTRADAS_SESSION_TTL || process.env.CRECHES_SESSION_TTL || "12h";
const databaseUrl = process.env.DATABASE_URL;
const corsOrigin = process.env.ESTRADAS_API_CORS_ORIGIN || process.env.ESTRADAS_REFRESH_CORS_ORIGIN || process.env.CRECHES_API_CORS_ORIGIN || process.env.CRECHES_REFRESH_CORS_ORIGIN || "http://localhost:5174";
const passwordSaltRounds = Number(process.env.ESTRADAS_PASSWORD_SALT_ROUNDS || process.env.CRECHES_PASSWORD_SALT_ROUNDS || 12);

if (!databaseUrl) {
  throw new Error("DATABASE_URL nao configurado. Configure a conexao PostgreSQL antes de iniciar o servidor de autenticacao.");
}

if (!jwtSecret || jwtSecret.length < 24) {
  throw new Error("ESTRADAS_JWT_SECRET precisa estar configurado com pelo menos 24 caracteres.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
});

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(cors({
  origin: corsOrigin.split(",").map((item) => item.trim()),
  credentials: false
}));

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function signUserToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      role: user.role
    },
    jwtSecret,
    { expiresIn: tokenTtl }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    isActive: user.is_active,
    lastLoginAt: user.last_login_at,
    createdAt: user.created_at,
    updatedAt: user.updated_at
  };
}

async function findActiveUser(username) {
  const result = await pool.query(
    `select id, username, password_hash, full_name, role, is_active
       from app_users
      where lower(username) = lower($1)
      limit 1`,
    [username]
  );

  const user = result.rows[0];
  return user?.is_active ? user : null;
}

function requireAdmin(request, response, next) {
  requireAuth(request, response, () => {
    if (request.user?.role !== "admin") {
      response.status(403).json({ message: "Apenas administradores podem executar esta acao." });
      return;
    }
    next();
  });
}

async function requireAuth(request, response, next) {
  const authHeader = request.get("authorization") || "";
  const [, token] = authHeader.match(/^Bearer\s+(.+)$/i) || [];

  if (!token) {
    response.status(401).json({ message: "Token ausente." });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    const result = await pool.query(
      `select id, username, full_name, role, is_active
         from app_users
        where id = $1
        limit 1`,
      [decoded.sub]
    );
    const user = result.rows[0];

    if (!user?.is_active) {
      response.status(401).json({ message: "Usuario inativo ou nao encontrado." });
      return;
    }

    request.user = user;
    next();
  } catch {
    response.status(401).json({ message: "Sessao expirada. Faca login novamente." });
  }
}

app.get("/api/health", async (_request, response) => {
  await pool.query("select 1");
  response.json({ ok: true });
});

app.post("/api/auth/login", async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const password = String(request.body?.password || "");

  if (!username || !password) {
    response.status(400).json({ message: "Informe usuario e senha." });
    return;
  }

  const user = await findActiveUser(username);
  const isPasswordValid = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !isPasswordValid) {
    response.status(401).json({ message: "Usuario ou senha invalidos." });
    return;
  }

  await pool.query("update app_users set last_login_at = now(), updated_at = now() where id = $1", [user.id]);

  response.json({
    token: signUserToken(user),
    user: {
      username: user.username,
      fullName: user.full_name,
      role: user.role
    }
  });
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  response.json({
    user: {
      username: request.user.username,
      fullName: request.user.full_name,
      role: request.user.role
    }
  });
});

app.post("/api/auth/logout", (_request, response) => {
  response.status(204).end();
});

app.get("/api/auth/users", requireAdmin, async (_request, response) => {
  const result = await pool.query(
    `select id, username, full_name, role, is_active, last_login_at, created_at, updated_at
       from app_users
      order by username`
  );

  response.json({ users: result.rows.map(publicUser) });
});

app.post("/api/auth/users", requireAdmin, async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const fullName = String(request.body?.fullName || "").trim();
  const password = String(request.body?.password || "");
  const role = request.body?.role === "admin" ? "admin" : "viewer";
  const isActive = request.body?.isActive !== false;

  if (!username || !fullName || !password) {
    response.status(400).json({ message: "Informe usuario, nome e senha." });
    return;
  }

  if (password.length < 6) {
    response.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, passwordSaltRounds);

  try {
    const result = await pool.query(
      `insert into app_users (username, password_hash, full_name, role, is_active, updated_at)
       values ($1, $2, $3, $4, $5, now())
       returning id, username, full_name, role, is_active, last_login_at, created_at, updated_at`,
      [username, passwordHash, fullName, role, isActive]
    );

    response.status(201).json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    if (error.code === "23505") {
      response.status(409).json({ message: "Ja existe usuario com esse login." });
      return;
    }
    throw error;
  }
});

app.put("/api/auth/users/:id", requireAdmin, async (request, response) => {
  const userId = request.params.id;
  const fullName = String(request.body?.fullName || "").trim();
  const role = request.body?.role === "admin" ? "admin" : "viewer";
  const isActive = request.body?.isActive !== false;

  if (!fullName) {
    response.status(400).json({ message: "Informe o nome do usuario." });
    return;
  }

  if (String(request.user.id) === String(userId) && !isActive) {
    response.status(400).json({ message: "Voce nao pode desativar o proprio usuario." });
    return;
  }

  const result = await pool.query(
    `update app_users
        set full_name = $2,
            role = $3,
            is_active = $4,
            updated_at = now()
      where id = $1
      returning id, username, full_name, role, is_active, last_login_at, created_at, updated_at`,
    [userId, fullName, role, isActive]
  );

  if (!result.rowCount) {
    response.status(404).json({ message: "Usuario nao encontrado." });
    return;
  }

  response.json({ user: publicUser(result.rows[0]) });
});

app.put("/api/auth/users/:id/password", requireAdmin, async (request, response) => {
  const password = String(request.body?.password || "");

  if (password.length < 6) {
    response.status(400).json({ message: "A senha precisa ter pelo menos 6 caracteres." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, passwordSaltRounds);
  const result = await pool.query(
    "update app_users set password_hash = $2, updated_at = now() where id = $1 returning id",
    [request.params.id, passwordHash]
  );

  if (!result.rowCount) {
    response.status(404).json({ message: "Usuario nao encontrado." });
    return;
  }

  response.status(204).end();
});

app.delete("/api/auth/users/:id", requireAdmin, async (request, response) => {
  if (String(request.user.id) === String(request.params.id)) {
    response.status(400).json({ message: "Voce nao pode excluir o proprio usuario." });
    return;
  }

  const result = await pool.query("delete from app_users where id = $1", [request.params.id]);

  if (!result.rowCount) {
    response.status(404).json({ message: "Usuario nao encontrado." });
    return;
  }

  response.status(204).end();
});

if (process.env.ESTRADAS_SERVE_STATIC === "true" || process.env.CRECHES_SERVE_STATIC === "true") {
  const distPath = path.join(root, "dist");
  app.use(express.static(distPath));
  app.use((_request, response) => {
    response.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ message: "Erro interno no servidor de autenticacao." });
});

app.listen(port, () => {
  console.log(`Servidor de autenticacao das estradas em http://127.0.0.1:${port}`);
});
