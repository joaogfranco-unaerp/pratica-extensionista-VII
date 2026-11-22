const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const { pool, init } = require('./db');
const swaggerSpec = require('./swagger');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'troque-este-segredo';
const STATUSES = ['Recebido', 'Em preparo', 'Pronto', 'Entregue'];

app.use(express.json({ limit: '6mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const money = (v) => Number(v);
const fmtItem = (r) => ({ ...r, price: money(r.price) });

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function validateItem(b) {
  const errors = [];
  if (!b.name || !String(b.name).trim()) errors.push('Nome é obrigatório');
  if (!b.description || !String(b.description).trim()) errors.push('Descrição é obrigatória');
  if (b.price === undefined || b.price === '' || isNaN(Number(b.price)) || Number(b.price) < 0)
    errors.push('Preço inválido');
  if (!b.category_id) errors.push('Categoria é obrigatória');
  return errors;
}
app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha' });
  const { rows } = await pool.query('SELECT * FROM admins WHERE email = $1', [email.trim().toLowerCase()]);
  const admin = rows[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash)))
    return res.status(401).json({ error: 'E-mail ou senha incorretos' });
  const token = jwt.sign({ id: admin.id, email: admin.email, name: admin.name }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: admin.id, email: admin.email, name: admin.name } });
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));
app.get('/api/categories', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM categories ORDER BY position, id');
  res.json(rows);
}));

app.post('/api/categories', auth, wrap(async (req, res) => {
  const name = (req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome é obrigatório' });
  const { rows } = await pool.query(
    'INSERT INTO categories (name, position) VALUES ($1, (SELECT COALESCE(MAX(position),0)+1 FROM categories)) RETURNING *',
    [name]
  );
  res.status(201).json(rows[0]);
}));

app.delete('/api/categories/:id', auth, wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Categoria não encontrada' });
  res.status(204).end();
}));
app.get('/api/items', wrap(async (req, res) => {
  const params = [];
  let sql = `SELECT i.*, c.name AS category_name FROM items i JOIN categories c ON c.id = i.category_id`;
  if (req.query.category) {
    params.push(req.query.category);
    sql += ' WHERE i.category_id = $1';
  }
  sql += ' ORDER BY c.position, i.name';
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(fmtItem));
}));

app.get('/api/items/:id', wrap(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT i.*, c.name AS category_name FROM items i JOIN categories c ON c.id = i.category_id WHERE i.id = $1',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Item não encontrado' });
  res.json(fmtItem(rows[0]));
}));

app.post('/api/items', auth, wrap(async (req, res) => {
  const errors = validateItem(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const { category_id, name, description, ingredients = '', price, image = null } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO items (category_id, name, description, ingredients, price, image)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [category_id, name.trim(), description.trim(), ingredients.trim(), price, image || null]
  );
  res.status(201).json(fmtItem(rows[0]));
}));

app.put('/api/items/:id', auth, wrap(async (req, res) => {
  const errors = validateItem(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const { category_id, name, description, ingredients = '', price, image = null } = req.body;
  const { rows } = await pool.query(
    `UPDATE items SET category_id=$1, name=$2, description=$3, ingredients=$4, price=$5, image=$6
     WHERE id=$7 RETURNING *`,
    [category_id, name.trim(), description.trim(), ingredients.trim(), price, image || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Item não encontrado' });
  res.json(fmtItem(rows[0]));
}));

app.delete('/api/items/:id', auth, wrap(async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM items WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Item não encontrado' });
  res.status(204).end();
}));
async function loadOrder(id) {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
  if (!rows[0]) return null;
  const order = { ...rows[0], total: money(rows[0].total) };
  const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1 ORDER BY id', [id]);
  const history = await pool.query('SELECT * FROM status_history WHERE order_id = $1 ORDER BY changed_at', [id]);
  order.items = items.rows.map((r) => ({ ...r, unit_price: money(r.unit_price) }));
  order.history = history.rows;
  return order;
}

app.post('/api/orders', wrap(async (req, res) => {
  const { customer_name, customer_ref = '', notes = '', items } = req.body || {};
  if (!customer_name || !String(customer_name).trim())
    return res.status(400).json({ error: 'Informe seu nome' });
  if (!Array.isArray(items) || items.length === 0)
    return res.status(400).json({ error: 'O pedido está vazio' });

  const ids = items.map((i) => Number(i.item_id));
  const { rows: dbItems } = await pool.query('SELECT id, name, price FROM items WHERE id = ANY($1)', [ids]);
  const byId = Object.fromEntries(dbItems.map((r) => [r.id, r]));

  let total = 0;
  const lines = [];
  for (const i of items) {
    const it = byId[Number(i.item_id)];
    const qty = parseInt(i.quantity, 10);
    if (!it) return res.status(400).json({ error: `Item ${i.item_id} não existe mais no cardápio` });
    if (!qty || qty < 1) return res.status(400).json({ error: 'Quantidade inválida' });
    total += Number(it.price) * qty;
    lines.push([it.id, it.name, it.price, qty, (i.notes || '').trim()]);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO orders (customer_name, customer_ref, notes, total) VALUES ($1,$2,$3,$4) RETURNING id',
      [customer_name.trim(), String(customer_ref).trim(), String(notes).trim(), total.toFixed(2)]
    );
    const orderId = rows[0].id;
    for (const l of lines) {
      await client.query(
        'INSERT INTO order_items (order_id, item_id, name, unit_price, quantity, notes) VALUES ($1,$2,$3,$4,$5,$6)',
        [orderId, ...l]
      );
    }
    await client.query(
      "INSERT INTO status_history (order_id, status, changed_by) VALUES ($1, 'Recebido', 'cliente')",
      [orderId]
    );
    await client.query('COMMIT');
    res.status(201).json(await loadOrder(orderId));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));
app.get('/api/orders/:id/track', wrap(async (req, res) => {
  const order = await loadOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json({
    id: order.id,
    status: order.status,
    total: order.total,
    created_at: order.created_at,
    updated_at: order.updated_at,
    items: order.items.map(({ name, quantity, unit_price }) => ({ name, quantity, unit_price })),
    history: order.history.map(({ status, changed_at }) => ({ status, changed_at })),
  });
}));

app.get('/api/orders', auth, wrap(async (req, res) => {
  const params = [];
  let sql = 'SELECT id FROM orders';
  if (req.query.status) {
    params.push(req.query.status);
    sql += ' WHERE status = $1';
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';
  const { rows } = await pool.query(sql, params);
  const orders = await Promise.all(rows.map((r) => loadOrder(r.id)));
  res.json(orders);
}));

app.get('/api/orders/:id', auth, wrap(async (req, res) => {
  const order = await loadOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json(order);
}));

app.patch('/api/orders/:id/status', auth, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!STATUSES.includes(status))
    return res.status(400).json({ error: `Status deve ser um de: ${STATUSES.join(', ')}` });
  const { rowCount } = await pool.query(
    'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2',
    [status, req.params.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'Pedido não encontrado' });
  await pool.query('INSERT INTO status_history (order_id, status, changed_by) VALUES ($1,$2,$3)', [
    req.params.id,
    status,
    req.user.email,
  ]);
  res.json(await loadOrder(req.params.id));
}));
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'admin.html')));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

init()
  .then(() => app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`)))
  .catch((e) => {
    console.error('Falha ao iniciar banco de dados:', e);
    process.exit(1);
  });
