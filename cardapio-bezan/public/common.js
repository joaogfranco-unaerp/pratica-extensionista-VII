const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emojiFor(categoryName = '') {
  const n = categoryName.toLowerCase();
  if (n.includes('salgad')) return '🥟';
  if (n.includes('doce')) return '🍬';
  if (n.includes('bolo') || n.includes('torta')) return '🎂';
  if (n.includes('bebida') || n.includes('suco')) return '🥤';
  if (n.includes('marmit') || n.includes('prato')) return '🍛';
  return '🍽️';
}

function thumbHtml(item, cls = 'thumb') {
  if (item.image) return `<img class="${cls}" src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" />`;
  return `<div class="${cls} placeholder">${emojiFor(item.category_name)}</div>`;
}

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

function toast(msg, ms = 2200) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function openModal(html, onMount) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="overlay"><div class="sheet"><button class="close-x" aria-label="Fechar">✕</button>${html}</div></div>`;
  const overlay = root.firstElementChild;
  const close = () => (root.innerHTML = '');
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('close-x')) close();
  });
  if (onMount) onMount(overlay.querySelector('.sheet'), close);
  return close;
}

function fmtDate(d) {
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const STATUSES = ['Recebido', 'Em preparo', 'Pronto', 'Entregue'];
