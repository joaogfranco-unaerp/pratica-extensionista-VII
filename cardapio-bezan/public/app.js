let categories = [];
let currentCategory = null;
let cart = store.get('cart', []);
let trackTimer = null;

const $ = (id) => document.getElementById(id);

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error || 'Erro de comunicação');
  return data;
}
async function loadCategories() {
  categories = await api('/api/categories');
  renderTabs();
}

function renderTabs() {
  const all = [{ id: null, name: 'Todos' }, ...categories];
  $('tabs').innerHTML = all
    .map((c) => `<button class="tab ${c.id === currentCategory ? 'active' : ''}" data-id="${c.id ?? ''}">${esc(c.name)}</button>`)
    .join('');
}

$('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  currentCategory = btn.dataset.id ? Number(btn.dataset.id) : null;
  renderTabs();
  loadItems();
});

async function loadItems() {
  const q = currentCategory ? `?category=${currentCategory}` : '';
  const items = await api(`/api/items${q}`);
  $('empty').hidden = items.length > 0;
  $('grid').innerHTML = items
    .map(
      (it) => `
      <article class="card" data-id="${it.id}">
        ${thumbHtml(it)}
        <div class="card-body">
          <h3>${esc(it.name)}</h3>
          <p>${esc(it.description)}</p>
          <div class="card-foot">
            <span class="price">${brl(it.price)}</span>
            <button class="add-btn" data-quick="${it.id}" aria-label="Adicionar">+</button>
          </div>
        </div>
      </article>`
    )
    .join('');
}

$('grid').addEventListener('click', async (e) => {
  const quick = e.target.closest('[data-quick]');
  const card = e.target.closest('.card');
  if (!card) return;
  const item = await api(`/api/items/${card.dataset.id}`);
  if (quick) {
    addToCart(item, 1, '');
  } else {
    showItem(item);
  }
});
function showItem(item) {
  let qty = 1;
  openModal(
    `${thumbHtml(item)}
     <div class="sheet-body">
       <span class="muted">${esc(item.category_name)}</span>
       <h2>${esc(item.name)}</h2>
       <p>${esc(item.description)}</p>
       ${item.ingredients ? `<div class="label">Ingredientes</div><p class="muted" style="margin:0">${esc(item.ingredients)}</p>` : ''}
       <div class="label">Observações</div>
       <div class="field"><textarea id="obs" placeholder="Ex.: sem cebola"></textarea></div>
       <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px">
         <div class="stepper"><button id="minus">−</button><span id="qty">1</span><button id="plus">+</button></div>
         <button class="btn" id="addBtn" style="flex:1">Adicionar ${brl(item.price)}</button>
       </div>
     </div>`,
    (sheet, close) => {
      const update = () => {
        sheet.querySelector('#qty').textContent = qty;
        sheet.querySelector('#addBtn').textContent = `Adicionar ${brl(item.price * qty)}`;
      };
      sheet.querySelector('#minus').onclick = () => { if (qty > 1) { qty--; update(); } };
      sheet.querySelector('#plus').onclick = () => { qty++; update(); };
      sheet.querySelector('#addBtn').onclick = () => {
        addToCart(item, qty, sheet.querySelector('#obs').value.trim());
        close();
      };
    }
  );
}
function saveCart() {
  store.set('cart', cart);
  const count = cart.reduce((s, l) => s + l.quantity, 0);
  const badge = $('cartCount');
  badge.textContent = count;
  badge.classList.add('bump');
  setTimeout(() => badge.classList.remove('bump'), 200);
}

function addToCart(item, quantity, notes) {
  const existing = cart.find((l) => l.item_id === item.id && l.notes === notes);
  if (existing) existing.quantity += quantity;
  else
    cart.push({
      item_id: item.id,
      name: item.name,
      price: item.price,
      quantity,
      notes,
      image: item.image,
      category_name: item.category_name,
    });
  saveCart();
  toast(`${item.name} adicionado`);
}

const cartTotal = () => cart.reduce((s, l) => s + l.price * l.quantity, 0);

function showCart() {
  if (!cart.length) {
    openModal(`<div class="sheet-body"><h2>Seu pedido</h2><p class="empty">Nenhum item no pedido.</p></div>`);
    return;
  }
  const last = store.get('customer', { name: '', ref: '' });
  openModal(
    `<div class="sheet-body">
       <h2>Revisar pedido</h2>
       <div id="lines"></div>
       <div class="total-row"><span>Total</span><span id="total"></span></div>
       <div id="err"></div>
       <div class="field"><label for="cname">Seu nome *</label><input id="cname" value="${esc(last.name)}" /></div>
       <div class="field"><label for="cref">Mesa, telefone ou retirada</label><input id="cref" value="${esc(last.ref)}" placeholder="Ex.: Mesa 3 / (16) 99999-0000" /></div>
       <div class="field"><label for="cnotes">Observações gerais</label><textarea id="cnotes" placeholder="Ex.: retirar às 18h"></textarea></div>
       <button class="btn" id="sendBtn">Enviar pedido</button>
     </div>`,
    (sheet, close) => {
      const render = () => {
        if (!cart.length) { close(); saveCart(); return; }
        sheet.querySelector('#lines').innerHTML = cart
          .map(
            (l, i) => `
            <div class="cart-line">
              <div class="info">
                <strong>${esc(l.name)}</strong>
                <small>${brl(l.price)} un.${l.notes ? ` (${esc(l.notes)})` : ''}</small><br/>
                <button class="link-btn" data-rm="${i}">Remover</button>
              </div>
              <div class="stepper"><button data-dec="${i}">−</button><span>${l.quantity}</span><button data-inc="${i}">+</button></div>
            </div>`
          )
          .join('');
        sheet.querySelector('#total').textContent = brl(cartTotal());
        saveCart();
      };
      sheet.querySelector('#lines').addEventListener('click', (e) => {
        const t = e.target;
        if (t.dataset.inc) cart[t.dataset.inc].quantity++;
        else if (t.dataset.dec) {
          const l = cart[t.dataset.dec];
          if (l.quantity > 1) l.quantity--;
          else cart.splice(t.dataset.dec, 1);
        } else if (t.dataset.rm) cart.splice(t.dataset.rm, 1);
        else return;
        render();
      });
      render();

      sheet.querySelector('#sendBtn').onclick = async () => {
        const name = sheet.querySelector('#cname').value.trim();
        const ref = sheet.querySelector('#cref').value.trim();
        const errBox = sheet.querySelector('#err');
        if (!name) {
          errBox.innerHTML = '<div class="error-msg">Informe seu nome.</div>';
          return;
        }
        const btn = sheet.querySelector('#sendBtn');
        btn.disabled = true;
        btn.textContent = 'Enviando...';
        try {
          const order = await api('/api/orders', {
            method: 'POST',
            body: JSON.stringify({
              customer_name: name,
              customer_ref: ref,
              notes: sheet.querySelector('#cnotes').value.trim(),
              items: cart.map((l) => ({ item_id: l.item_id, quantity: l.quantity, notes: l.notes })),
            }),
          });
          store.set('customer', { name, ref });
          cart = [];
          saveCart();
          const mine = store.get('myOrders', []);
          store.set('myOrders', [order.id, ...mine.filter((id) => id !== order.id)].slice(0, 10));
          updateMyOrdersBtn();
          close();
          showTracking(order.id, true);
        } catch (e) {
          errBox.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
          btn.disabled = false;
          btn.textContent = 'Enviar pedido';
        }
      };
    }
  );
}

$('cartBtn').onclick = showCart;
function stepsHtml(status) {
  const idx = STATUSES.indexOf(status);
  return `<div class="steps">${STATUSES.map(
    (s, i) => `<div class="step ${i < idx ? 'done' : i === idx ? 'current' : ''}"><div class="dot">${i < idx ? '✓' : i + 1}</div>${s}</div>`
  ).join('')}</div>`;
}

function showTracking(orderId, justSent = false) {
  clearInterval(trackTimer);
  const close = openModal(
    `<div class="sheet-body" style="text-align:center">
       <h2>${justSent ? 'Pedido enviado' : 'Seu pedido'}</h2>
       <p class="muted" style="margin:0">Número do pedido</p>
       <div class="order-num">#${orderId}</div>
       <div id="track"><p class="muted">Carregando...</p></div>
     </div>`
  );
  const refresh = async () => {
    const box = document.getElementById('track');
    if (!box) return clearInterval(trackTimer);
    try {
      const o = await api(`/api/orders/${orderId}/track`);
      box.innerHTML = `
        ${stepsHtml(o.status)}
        <div style="text-align:left">
          ${o.items.map((i) => `<div class="cart-line"><div class="info">${i.quantity}× ${esc(i.name)}</div><span>${brl(i.unit_price * i.quantity)}</span></div>`).join('')}
          <div class="total-row"><span>Total</span><span>${brl(o.total)}</span></div>
        </div>`;
    } catch (e) {
      box.innerHTML = `<div class="error-msg">${esc(e.message)}</div>`;
    }
  };
  refresh();
  trackTimer = setInterval(refresh, 4000);
  return close;
}

function updateMyOrdersBtn() {
  const mine = store.get('myOrders', []);
  $('myOrdersBtn').hidden = mine.length === 0;
}

$('myOrdersBtn').onclick = () => {
  const mine = store.get('myOrders', []);
  if (mine.length) showTracking(mine[0]);
};
(async function start() {
  saveCart();
  updateMyOrdersBtn();
  try {
    await loadCategories();
    await loadItems();
  } catch (e) {
    $('grid').innerHTML = `<div class="error-msg">Erro ao carregar o cardápio.</div>`;
  }
})();
