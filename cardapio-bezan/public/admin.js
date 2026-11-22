const $ = (id) => document.getElementById(id);
let token = store.get('adminToken', null);
let filter = '';
let orders = [];
let seenIds = null;
let newIds = new Set();
let pollTimer = null;
let categories = [];
let audioCtx = null;

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { ...opts, headers });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (res.status === 401 && token) {
    logout();
    throw new Error('Sessão expirada. Entre novamente.');
  }
  if (!res.ok) throw new Error(data?.error || 'Erro de comunicação');
  return data;
}
function showLogin() {
  clearInterval(pollTimer);
  $('appView').hidden = true;
  $('loginView').hidden = false;
}

function logout() {
  token = null;
  store.del('adminToken');
  seenIds = null;
  showLogin();
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').innerHTML = '';
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
  } catch {}
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: $('email').value, password: $('password').value }),
    });
    token = data.token;
    store.set('adminToken', token);
    startApp(data.user);
  } catch (err) {
    $('loginErr').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
  }
});

$('logoutBtn').onclick = logout;

function startApp(user) {
  $('loginView').hidden = true;
  $('appView').hidden = false;
  $('who').textContent = user.email;
  loadOrders();
  clearInterval(pollTimer);
  pollTimer = setInterval(loadOrders, 4000);
}
document.querySelector('.admin-nav').addEventListener('click', (e) => {
  const view = e.target.dataset.view;
  if (!view) return;
  document.querySelectorAll('.admin-nav [data-view]').forEach((b) => b.classList.toggle('active', b === e.target));
  $('ordersView').hidden = view !== 'orders';
  $('menuView').hidden = view !== 'menu';
  if (view === 'menu') loadMenu();
});
function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.2, audioCtx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + t + 0.15);
      o.connect(g).connect(audioCtx.destination);
      o.start(audioCtx.currentTime + t);
      o.stop(audioCtx.currentTime + t + 0.16);
    });
  } catch {}
}

async function loadOrders() {
  try {
    orders = await api('/api/orders');
  } catch (e) {
    return;
  }
  const ids = orders.map((o) => o.id);
  if (seenIds) {
    const fresh = ids.filter((id) => !seenIds.has(id));
    if (fresh.length) {
      fresh.forEach((id) => newIds.add(id));
      beep();
      toast(fresh.length === 1 ? 'Novo pedido' : `${fresh.length} novos pedidos`, 3500);
      document.title = `(${newIds.size}) Painel`;
    }
  }
  seenIds = new Set(ids);
  renderOrders();
}

function renderOrders() {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, orders.filter((o) => o.status === s).length]));
  $('filters').innerHTML = [['', 'Todos', orders.length], ...STATUSES.map((s) => [s, s, counts[s]])]
    .map(([v, label, n]) => `<button class="chip ${filter === v ? 'active' : ''}" data-f="${v}">${label}<span class="count">${n}</span></button>`)
    .join('');

  const list = filter ? orders.filter((o) => o.status === filter) : orders;
  $('ordersEmpty').hidden = list.length > 0;
  $('orders').innerHTML = list
    .map(
      (o) => `
    <article class="order-card s-${o.status.toLowerCase().replace(' ', '-')} ${newIds.has(o.id) ? 'is-new' : ''}" data-id="${o.id}">
      <div class="order-head">
        <strong>#${o.id}</strong>
        <span class="muted">${fmtDate(o.created_at)}</span>
      </div>
      <div><b>${esc(o.customer_name)}</b>${o.customer_ref ? ` - <span class="muted">${esc(o.customer_ref)}</span>` : ''}</div>
      <ul>${o.items.map((i) => `<li>${i.quantity}× ${esc(i.name)}${i.notes ? ` <em class="muted">(${esc(i.notes)})</em>` : ''}</li>`).join('')}</ul>
      ${o.notes ? `<div class="muted" style="font-size:14px">Obs.: ${esc(o.notes)}</div>` : ''}
      <div style="display:flex;justify-content:space-between;margin-top:8px"><span>Status: <b>${o.status}</b></span><b>${brl(o.total)}</b></div>
      <div class="status-btns">${STATUSES.map((s) => `<button data-status="${s}" class="${o.status === s ? 'on' : ''}">${s}</button>`).join('')}</div>
      <details class="history"><summary>Histórico (${o.history.length})</summary>
        ${o.history.map((h) => `<div>${fmtDate(h.changed_at)} ${esc(h.status)} (${esc(h.changed_by)})</div>`).join('')}
      </details>
    </article>`
    )
    .join('');
}

$('filters').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-f]');
  if (!chip) return;
  filter = chip.dataset.f;
  renderOrders();
});

$('orders').addEventListener('click', async (e) => {
  const card = e.target.closest('.order-card');
  if (!card) return;
  const id = Number(card.dataset.id);
  if (newIds.delete(id)) document.title = newIds.size ? `(${newIds.size}) Painel` : 'Painel | Buffet Bezan';
  const btn = e.target.closest('[data-status]');
  if (!btn) return;
  try {
    const updated = await api(`/api/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: btn.dataset.status }),
    });
    orders = orders.map((o) => (o.id === id ? updated : o));
    renderOrders();
    toast(`Pedido #${id}: ${updated.status}`);
  } catch (err) {
    toast(err.message);
  }
});
async function loadMenu() {
  const [cats, items] = await Promise.all([api('/api/categories'), api('/api/items')]);
  categories = cats;
  $('menuList').innerHTML =
    cats
      .map((c) => {
        const its = items.filter((i) => i.category_id === c.id);
        return `
        <div class="cat-head"><span>${esc(c.name)} <span class="muted">(${its.length})</span></span>
          <button class="link-btn" data-delcat="${c.id}">Excluir categoria</button></div>
        ${its
          .map(
            (i) => `
          <div class="row">
            ${i.image ? `<img src="${esc(i.image)}" alt="" />` : `<div class="mini">${emojiFor(c.name)}</div>`}
            <div class="info"><strong>${esc(i.name)}</strong><br/><small>${brl(i.price)}</small></div>
            <button class="btn small ghost" data-edit="${i.id}">Editar</button>
            <button class="btn small danger" data-del="${i.id}">Excluir</button>
          </div>`
          )
          .join('') || '<div class="row muted">Sem itens</div>'}`;
      })
      .join('') || '<div class="row muted">Nenhuma categoria.</div>';
}

$('menuList').addEventListener('click', async (e) => {
  const t = e.target;
  try {
    if (t.dataset.edit) {
      itemForm(await api(`/api/items/${t.dataset.edit}`));
    } else if (t.dataset.del) {
      if (!confirmInline(t)) return;
      await api(`/api/items/${t.dataset.del}`, { method: 'DELETE' });
      toast('Item removido');
      loadMenu();
    } else if (t.dataset.delcat) {
      if (!confirmInline(t, 'Apagar com os itens?')) return;
      await api(`/api/categories/${t.dataset.delcat}`, { method: 'DELETE' });
      toast('Categoria removida');
      loadMenu();
    }
  } catch (err) {
    toast(err.message);
  }
});
function confirmInline(btn, label = 'Confirmar?') {
  if (btn.dataset.armed) return true;
  const original = btn.textContent;
  btn.dataset.armed = '1';
  btn.textContent = label;
  setTimeout(() => {
    delete btn.dataset.armed;
    btn.textContent = original;
  }, 3000);
  return false;
}

$('newCatBtn').onclick = () => {
  openModal(
    `<div class="sheet-body"><h2>Nova categoria</h2><div id="err"></div>
      <div class="field"><label for="catName">Nome</label><input id="catName" placeholder="Ex.: Marmitas" /></div>
      <button class="btn" id="saveCat">Salvar</button></div>`,
    (sheet, close) => {
      sheet.querySelector('#saveCat').onclick = async () => {
        try {
          await api('/api/categories', { method: 'POST', body: JSON.stringify({ name: sheet.querySelector('#catName').value }) });
          close();
          toast('Categoria criada');
          loadMenu();
        } catch (err) {
          sheet.querySelector('#err').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
        }
      };
    }
  );
};

$('newItemBtn').onclick = () => {
  if (!categories.length) return toast('Crie uma categoria primeiro');
  itemForm(null);
};
function resizeImage(file, max = 800) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function itemForm(item) {
  const isNew = !item;
  let image = item?.image || null;
  openModal(
    `<div class="sheet-body">
      <h2>${isNew ? 'Novo item' : 'Editar item'}</h2>
      <div id="err"></div>
      <div class="field"><label for="fName">Nome *</label><input id="fName" value="${esc(item?.name)}" /></div>
      <div class="field"><label for="fCat">Categoria *</label>
        <select id="fCat">${categories.map((c) => `<option value="${c.id}" ${item?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="fDesc">Descrição *</label><textarea id="fDesc">${esc(item?.description)}</textarea></div>
      <div class="field"><label for="fIng">Ingredientes</label><textarea id="fIng">${esc(item?.ingredients)}</textarea></div>
      <div class="field"><label for="fPrice">Preço (R$) *</label><input id="fPrice" type="number" step="0.01" min="0" value="${item?.price ?? ''}" /></div>
      <div class="field"><label for="fImg">Imagem</label><input id="fImg" type="file" accept="image/*" />
        <img id="preview" class="img-preview" ${image ? `src="${esc(image)}"` : 'hidden'} />
        <button class="link-btn" id="rmImg" ${image ? '' : 'hidden'}>Remover imagem</button></div>
      <button class="btn" id="saveItem">${isNew ? 'Cadastrar' : 'Salvar alterações'}</button>
    </div>`,
    (sheet, close) => {
      const preview = sheet.querySelector('#preview');
      const rm = sheet.querySelector('#rmImg');
      sheet.querySelector('#fImg').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        image = await resizeImage(file);
        preview.src = image;
        preview.hidden = false;
        rm.hidden = false;
      };
      rm.onclick = () => {
        image = null;
        preview.hidden = true;
        rm.hidden = true;
      };
      sheet.querySelector('#saveItem').onclick = async () => {
        const payload = {
          name: sheet.querySelector('#fName').value.trim(),
          category_id: Number(sheet.querySelector('#fCat').value),
          description: sheet.querySelector('#fDesc').value.trim(),
          ingredients: sheet.querySelector('#fIng').value.trim(),
          price: sheet.querySelector('#fPrice').value,
          image,
        };
        const errs = [];
        if (!payload.name) errs.push('Nome é obrigatório');
        if (!payload.description) errs.push('Descrição é obrigatória');
        if (payload.price === '' || Number(payload.price) < 0) errs.push('Preço inválido');
        if (errs.length) {
          sheet.querySelector('#err').innerHTML = `<div class="error-msg">${errs.join('<br/>')}</div>`;
          return;
        }
        try {
          await api(isNew ? '/api/items' : `/api/items/${item.id}`, {
            method: isNew ? 'POST' : 'PUT',
            body: JSON.stringify({ ...payload, price: Number(payload.price) }),
          });
          close();
          toast(isNew ? 'Item cadastrado' : 'Item atualizado');
          loadMenu();
        } catch (err) {
          sheet.querySelector('#err').innerHTML = `<div class="error-msg">${esc(err.message)}</div>`;
        }
      };
    }
  );
}
(async function start() {
  if (!token) return showLogin();
  try {
    const { user } = await api('/api/auth/me');
    startApp(user);
  } catch {
    showLogin();
  }
})();
