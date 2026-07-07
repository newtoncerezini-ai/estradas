const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const pg = require("pg");

dotenv.config({ quiet: true });

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const saltRounds = Number(process.env.ESTRADAS_PASSWORD_SALT_ROUNDS || process.env.CRECHES_PASSWORD_SALT_ROUNDS || 12);

const initialUsers = [
  { username: "admin", password: "123@mudar", fullName: "Administrador", role: "admin" },
  { username: "rafael.amorim", password: "ramorim123", fullName: "Rafael Amorim", role: "viewer" },
  { username: "marion.lamenha", password: "mlamenha123", fullName: "Marion Lamenha", role: "viewer" },
  { username: "bruna.eloize", password: "beloize123", fullName: "Bruna Eloize", role: "viewer" },
  { username: "glaucy.ribas", password: "gribas123", fullName: "Glaucy Ribas", role: "viewer" },
  { username: "elisabeth.pontes", password: "epontes123", fullName: "Elisabeth Pontes", role: "viewer" },
  { username: "andreza.alves", password: "aalves123", fullName: "Andreza Alves", role: "viewer" },
  { username: "samuel.azevedo", password: "sazevedo123", fullName: "Samuel Azevedo", role: "viewer" },
  { username: "haina.coelho", password: "hcoelho123", fullName: "Haina Coelho", role: "viewer" },
  { username: "fabricio.marques", password: "fmarques123", fullName: "Fabricio Marques", role: "viewer" }
];

if (!databaseUrl) {
  console.error("DATABASE_URL nao configurado.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined
});

async function main() {
  await pool.query(`
    create extension if not exists pgcrypto;

    create table if not exists app_users (
      id uuid primary key default gen_random_uuid(),
      username text not null unique,
      password_hash text not null,
      full_name text not null default '',
      role text not null default 'viewer',
      is_active boolean not null default true,
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists app_users_username_lower_idx
      on app_users (lower(username));
  `);

  for (const user of initialUsers) {
    const passwordHash = await bcrypt.hash(user.password, saltRounds);
    await pool.query(
      `insert into app_users (username, password_hash, full_name, role, is_active, updated_at)
       values ($1, $2, $3, $4, true, now())
       on conflict (username) do update set
         password_hash = excluded.password_hash,
         full_name = excluded.full_name,
         role = excluded.role,
         is_active = true,
         updated_at = now()`,
      [user.username, passwordHash, user.fullName, user.role]
    );
  }

  const { rows } = await pool.query("select username, role, is_active from app_users order by username");
  console.log(`Banco de autenticacao pronto. Usuarios ativos: ${rows.filter((row) => row.is_active).length}`);
  rows.forEach((row) => console.log(`- ${row.username} (${row.role})`));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
