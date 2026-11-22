const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const connectionString =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/cardapio';

const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const schema = `
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS items (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  ingredients TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_ref TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  total NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'Recebido',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id INT REFERENCES items(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS status_history (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;
const seedMenu = [
  {
    category: 'Salgados',
    items: [
      ['Coxinha de frango (cento)', 'Coxinha de frango com requeijão.', 'Frango desfiado, requeijão, massa de batata, farinha de rosca', 95],
      ['Kibe (cento)', 'Kibe frito.', 'Carne bovina, trigo para kibe, hortelã, cebola', 95],
      ['Risoles de presunto e queijo (cento)', 'Risoles de presunto e queijo.', 'Presunto, queijo muçarela, massa de trigo, farinha de rosca', 95],
      ['Enroladinho de salsicha (cento)', 'Assado ou frito.', 'Salsicha, massa de trigo', 90],
      ['Esfiha de carne (cento)', 'Esfiha aberta de carne.', 'Carne moída, tomate, cebola, massa de pão', 110],
    ],
  },
  {
    category: 'Doces',
    items: [
      ['Brigadeiro (cento)', 'Brigadeiro tradicional.', 'Leite condensado, cacau, manteiga, granulado', 120],
      ['Beijinho (cento)', 'Docinho de coco.', 'Leite condensado, coco ralado, manteiga', 120],
      ['Cajuzinho (cento)', 'Docinho de amendoim.', 'Amendoim, leite condensado, chocolate', 115],
    ],
  },
  {
    category: 'Bolos e Tortas',
    items: [
      ['Bolo de festa (kg)', 'Massa branca ou chocolate, recheio a escolher.', 'Farinha, ovos, açúcar, recheio de brigadeiro ou ninho', 85],
      ['Torta salgada de frango (inteira)', 'Serve 12 pessoas.', 'Frango, milho, requeijão, massa podre', 90],
    ],
  },
  {
    category: 'Bebidas',
    items: [
      ['Refrigerante 2L', 'Coca-Cola, Guaraná ou Fanta.', 'Refrigerante', 14],
      ['Suco natural 1L', 'Laranja, limão ou maracujá.', 'Fruta, água, açúcar', 16],
    ],
  },
];

async function init() {
  await pool.query(schema);

  const { rows: admins } = await pool.query('SELECT COUNT(*)::int AS n FROM admins');
  if (admins[0].n === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@bezan.com').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'bezan123';
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO admins (name, email, password_hash) VALUES ($1,$2,$3)', [
      'Administrador',
      email,
      hash,
    ]);
    console.log(`Admin criado: ${email}`);
  }

  const { rows: cats } = await pool.query('SELECT COUNT(*)::int AS n FROM categories');
  if (cats[0].n === 0) {
    for (const [i, group] of seedMenu.entries()) {
      const { rows } = await pool.query(
        'INSERT INTO categories (name, position) VALUES ($1,$2) RETURNING id',
        [group.category, i]
      );
      for (const [name, description, ingredients, price] of group.items) {
        await pool.query(
          'INSERT INTO items (category_id, name, description, ingredients, price) VALUES ($1,$2,$3,$4,$5)',
          [rows[0].id, name, description, ingredients, price]
        );
      }
    }
    console.log('Cardápio de exemplo criado');
  }
}

module.exports = { pool, init };
