// Página do cliente: monta o Kit Blooming Club Cafés sem login.
// Lê só o catálogo público (nome, categoria, foto e preço de venda; nunca o custo) e envia o pedido
// para a coleção pública "solicitacoes". O app da equipe transforma o pedido em lead.
// O cliente vê só o valor estimado do kit (não o preço de cada item).
import { TITULO_KIT, CATEGORIAS, categoriaDe, ehCaixa, ordemCategoria, precoDoKit, arred, WHATSAPP_EQUIPE } from '../regras-kit.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = v => brl.format(Number(v) || 0);
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const LS_RASCUNHO = 'kit_cliente_rascunho';
const CATS_ITENS = CATEGORIAS.filter(c => c !== 'Caixas');

// ---------------- Dados ----------------
async function criarDados() {
  const cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey) {
    // modo de teste: as mesmas chaves que o app da equipe usa no aparelho
    const ler = k => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
    return {
      async catalogo() { return ler('cp_pub_catalogo_v1'); },
      async enviar(d) {
        const lista = ler('cp_pub_solicitacoes_v1');
        lista.push({ ...d, id: novoId(), criadoEm: new Date().toISOString() });
        localStorage.setItem('cp_pub_solicitacoes_v1', JSON.stringify(lista));
      },
    };
  }
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);
  const db = fs.getFirestore(initializeApp(cfg));
  return {
    async catalogo() {
      const snap = await fs.getDocs(fs.collection(db, 'catalogo'));
      return snap.docs.map(d => ({ ...d.data(), id: d.id }));
    },
    async enviar(d) {
      await fs.addDoc(fs.collection(db, 'solicitacoes'), { ...d, criadoEm: fs.serverTimestamp() });
    },
  };
}

// ---------------- Estado ----------------
const s = { produtos: [], caixaId: null, qtd: {}, dados: null, enviando: false };

const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
const caixas = () => s.produtos.filter(ehCaixa).sort(porNome);
const acharProduto = id => s.produtos.find(p => p.id === id);
const caixaAtual = () => caixas().find(c => c.id === s.caixaId) || null;

function linhas() {
  return s.produtos
    .filter(p => !ehCaixa(p) && (s.qtd[p.id] || 0) > 0)
    .sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria) || porNome(a, b))
    .map(p => ({ id: p.id, nome: p.nome, categoria: categoriaDe(p.categoria), preco: Number(p.preco) || 0, qtd: s.qtd[p.id] }));
}
const qtdKits = () => Math.min(9999, Math.max(1, parseInt($('#formPedido').qtdKits.value.replace(/\D/g, ''), 10) || 1));

function totais() {
  const ls = linhas();
  const cx = caixaAtual();
  const pronto = !!cx && ls.length > 0;
  const { preco } = precoDoKit(ls, cx?.preco);
  const n = qtdKits();
  return { ls, cx, pronto, porKit: preco, n, total: arred(preco * n), pecas: ls.reduce((t, l) => t + l.qtd, 0) };
}

function guardarRascunho() {
  try { localStorage.setItem(LS_RASCUNHO, JSON.stringify({ caixaId: s.caixaId, qtd: s.qtd })); } catch {}
}
function lerRascunho() {
  try {
    const r = JSON.parse(localStorage.getItem(LS_RASCUNHO) || 'null');
    if (!r) return;
    if (r.caixaId && caixas().some(c => c.id === r.caixaId)) s.caixaId = r.caixaId;
    for (const [id, q] of Object.entries(r.qtd || {})) {
      const p = acharProduto(id);
      if (p && !ehCaixa(p) && q > 0) s.qtd[id] = Math.min(99, q);
    }
  } catch {}
}

// ---------------- Tela ----------------
const foto = (src, nome, cls) => src
  ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async">`
  : `<span class="${cls} sem-foto" aria-hidden="true">${esc((nome || '?').trim().charAt(0).toUpperCase())}</span>`;

function renderCaixas() {
  const lista = caixas();
  $('#caixas').innerHTML = lista.length ? lista.map(c => `
    <button type="button" class="caixa" role="radio" aria-checked="${c.id === s.caixaId}" data-caixa="${esc(c.id)}">
      ${foto(c.fotoPrincipal || c.foto, c.nome, 'caixa-foto')}
      <span class="caixa-nome">${esc(c.nome)}</span>
      <span class="marca-ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16"><path d="m6.5 12.5 3.6 3.6 7.4-7.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </button>`).join('') : '<p class="vazio">As caixas ainda estão sendo preparadas. Fale com a gente pelo WhatsApp.</p>';

  const cx = caixaAtual();
  const amostra = $('#amostra');
  if (cx && cx.fotoPrincipal) {
    amostra.innerHTML = `<img src="${esc(cx.fotoPrincipal)}" alt="Exemplo de kit montado com a ${esc(cx.nome)}"><figcaption>Imagem ilustrativa · ${esc(cx.nome)}</figcaption>`;
    amostra.hidden = false;
  } else amostra.hidden = true;
}

function renderItens() {
  const grupos = CATS_ITENS.map(cat => {
    const ps = s.produtos.filter(p => !ehCaixa(p) && categoriaDe(p.categoria) === cat).sort(porNome);
    if (!ps.length) return '';
    return `<h3 class="cat">${esc(cat)}</h3><div class="itens">${ps.map(p => {
      const q = s.qtd[p.id] || 0;
      return `
      <div class="item ${q ? 'on' : ''}" data-item="${esc(p.id)}">
        ${foto(p.foto, p.nome, 'item-foto')}
        <span class="item-nome">${esc(p.nome)}</span>
        ${q ? `
        <div class="stepper" role="group" aria-label="Quantidade de ${esc(p.nome)}">
          <button type="button" data-passo="-1" aria-label="Tirar um">−</button>
          <span class="qtd" aria-live="polite">${q}</span>
          <button type="button" data-passo="1" aria-label="Pôr mais um">+</button>
        </div>`
        : `<button type="button" class="adicionar" data-passo="1">Adicionar</button>`}
      </div>`;
    }).join('')}</div>`;
  }).join('');
  $('#itens').innerHTML = grupos || '<p class="vazio">Os produtos ainda estão sendo preparados. Fale com a gente pelo WhatsApp.</p>';
}

function renderResumo() {
  const t = totais();
  const linhasHtml = [
    t.cx ? `<li><span>Caixa</span><b>${esc(t.cx.nome)}</b></li>` : '<li class="falta">Escolha a caixa no passo 1</li>',
    ...(t.ls.length ? t.ls.map(l => `<li><span>${l.qtd}×</span><b>${esc(l.nome)}</b></li>`) : ['<li class="falta">Escolha os itens no passo 2</li>']),
  ].join('');
  $('#resumo').innerHTML = `
    <p class="resumo-titulo">${esc(TITULO_KIT)}</p>
    <ul>${linhasHtml}</ul>
    ${t.pronto ? `
    <div class="resumo-valores">
      <div><span>Valor estimado por kit</span><strong>${dinheiro(t.porKit)}</strong></div>
      ${t.n > 1 ? `<div><span>Total estimado (${t.n} kits)</span><strong>${dinheiro(t.total)}</strong></div>` : ''}
    </div>` : ''}`;
}

function renderBarra() {
  const t = totais();
  $('#barraRotulo').textContent = t.pronto ? `Valor estimado por kit · ${t.pecas} ${t.pecas === 1 ? 'item' : 'itens'}` : 'Valor estimado por kit';
  $('#barraTotal').textContent = t.pronto ? dinheiro(t.porKit) : (t.cx ? 'Escolha os itens' : 'Escolha a caixa');
}

function renderTudo() { renderCaixas(); renderItens(); renderResumo(); renderBarra(); }

// ---------------- Ações ----------------
$('#caixas').addEventListener('click', e => {
  const b = e.target.closest('[data-caixa]'); if (!b) return;
  s.caixaId = b.dataset.caixa;
  guardarRascunho(); renderCaixas(); renderResumo(); renderBarra();
});

$('#itens').addEventListener('click', e => {
  const b = e.target.closest('[data-passo]'); if (!b) return;
  const id = b.closest('[data-item]').dataset.item;
  const q = Math.min(99, Math.max(0, (s.qtd[id] || 0) + Number(b.dataset.passo)));
  if (q) s.qtd[id] = q; else delete s.qtd[id];
  guardarRascunho(); renderItens(); renderResumo(); renderBarra();
  // mantém o foco no mesmo produto depois de redesenhar
  $(`[data-item="${CSS.escape(id)}"] ${q ? '[data-passo="1"]' : '.adicionar'}`)?.focus({ preventScroll: true });
});

const form = $('#formPedido');
form.addEventListener('click', e => {
  const b = e.target.closest('[data-qtd]'); if (!b) return;
  form.qtdKits.value = String(Math.min(9999, Math.max(1, qtdKits() + Number(b.dataset.qtd))));
  renderResumo();
});
form.qtdKits.addEventListener('input', () => { form.qtdKits.value = form.qtdKits.value.replace(/\D/g, '').slice(0, 4); renderResumo(); });
form.qtdKits.addEventListener('blur', () => { form.qtdKits.value = String(qtdKits()); });

// Máscara de telefone: (54) 99999-9999. Números com "+" ficam livres (internacional).
function formatarTelefone(v) {
  if (/^\s*\+/.test(v)) return v;
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
form.contato.addEventListener('input', e => {
  const apagando = e.inputType && e.inputType.startsWith('delete');
  const novo = formatarTelefone(form.contato.value);
  if (apagando && novo.length > form.contato.value.length) return;
  form.contato.value = novo;
});

$('#barraBotao').addEventListener('click', () => {
  $('#passoDados').scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { if (!form.nome.value) form.nome.focus({ preventScroll: true }); }, 450);
});

// A barra some quando os dados estão na tela (o resumo já mostra o valor ali)
new IntersectionObserver(([e]) => { document.body.classList.toggle('nos-dados', e.isIntersecting); }, { rootMargin: '0px 0px -30% 0px' })
  .observe($('#passoDados'));

function linkWhats(texto) { return `https://wa.me/${WHATSAPP_EQUIPE}?text=${encodeURIComponent(texto)}`; }

function mensagemWhats(p, t) {
  return [
    'Olá! Montei um kit no site e quero um orçamento.',
    '',
    `*${TITULO_KIT}*`,
    `Caixa: ${p.caixa.nome}`,
    ...p.itens.map(i => `• ${i.qtd}× ${i.nome}`),
    '',
    `Quantidade: ${p.qtdKits} ${p.qtdKits === 1 ? 'kit' : 'kits'}`,
    `Valor estimado: ${dinheiro(t.porKit)} por kit${p.qtdKits > 1 ? ` (${dinheiro(t.total)} no total)` : ''}`,
    `Nome: ${p.nome}`,
    p.obs ? `Obs.: ${p.obs}` : '',
  ].filter((l, i, a) => l || (i > 0 && a[i - 1])).join('\n').trim();
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (s.enviando) return;
  const erro = $('#erroForm');
  erro.textContent = '';
  const t = totais();
  if (!t.cx) { erro.textContent = 'Escolha a caixa do kit (passo 1).'; $('#passoCaixa').scrollIntoView({ behavior: 'smooth' }); return; }
  if (!t.ls.length) { erro.textContent = 'Escolha pelo menos um item para o kit (passo 2).'; $('#passoItens').scrollIntoView({ behavior: 'smooth' }); return; }
  const nome = form.nome.value.trim();
  const contato = form.contato.value.trim();
  if (!nome) { erro.textContent = 'Digite o seu nome.'; form.nome.focus(); return; }
  if (contato.replace(/\D/g, '').length < 10) { erro.textContent = 'Digite o seu WhatsApp com DDD.'; form.contato.focus(); return; }

  const pedido = {
    nome: nome.slice(0, 80),
    contato: contato.slice(0, 30),
    qtdKits: t.n,
    obs: form.obs.value.trim().slice(0, 1000),
    caixa: { id: t.cx.id, nome: String(t.cx.nome).slice(0, 120) },
    itens: t.ls.slice(0, 40).map(l => ({ id: l.id, nome: String(l.nome).slice(0, 120), qtd: l.qtd })),
    valorEstimado: t.porKit,
    origem: 'pagina-kit',
  };

  const botao = $('#enviar');
  s.enviando = true; botao.disabled = true; botao.textContent = 'Enviando…';
  try {
    await s.dados.enviar(pedido);
  } catch (err) {
    console.error(err);
    erro.textContent = 'Não foi possível enviar agora. Confira a internet e tente de novo, ou fale com a gente pelo WhatsApp.';
    s.enviando = false; botao.disabled = false; botao.textContent = 'Enviar pedido de orçamento';
    return;
  }
  s.enviando = false; botao.disabled = false; botao.textContent = 'Enviar pedido de orçamento';
  try { localStorage.removeItem(LS_RASCUNHO); } catch {}

  const link = linkWhats(mensagemWhats(pedido, t));
  $('#abrirWhats').href = link;
  $('#montador').hidden = true;
  $('#barra').hidden = true;
  $('#enviado').hidden = false;
  window.scrollTo({ top: 0 });
  // No celular, já abre o WhatsApp com a mensagem pronta (o botão continua ali, caso não abra)
  if (matchMedia('(hover: none)').matches) setTimeout(() => { location.href = link; }, 900);
});

$('#montarOutro').addEventListener('click', () => {
  s.caixaId = null; s.qtd = {};
  form.reset(); form.qtdKits.value = '1';
  $('#enviado').hidden = true;
  $('#montador').hidden = false;
  $('#barra').hidden = false;
  renderTudo();
  window.scrollTo({ top: 0 });
});

// Links simples para o WhatsApp (rodapé e erro de carga)
$$('[data-whats-simples]').forEach(a => { a.href = linkWhats('Olá! Quero montar um Kit Blooming Club Cafés.'); });

// ---------------- Início ----------------
async function carregar() {
  $('#carregando').hidden = false;
  $('#erroCarga').hidden = true;
  try {
    s.dados = s.dados || await criarDados();
    const lista = await s.dados.catalogo();
    // segurança extra: só o que a página precisa (o catálogo já não tem custo)
    s.produtos = lista
      .filter(p => p && p.nome && Number(p.preco) > 0)
      .map(p => ({ id: p.id, nome: p.nome, categoria: categoriaDe(p.categoria), preco: Number(p.preco) || 0, foto: p.foto || '', fotoPrincipal: p.fotoPrincipal || '' }));
    lerRascunho();
    $('#carregando').hidden = true;
    $('#conteudo').hidden = false;
    $('#barra').hidden = false;
    renderTudo();
  } catch (err) {
    console.error(err);
    $('#carregando').hidden = true;
    $('#erroCarga').hidden = false;
  }
}
$('#tentarDeNovo').addEventListener('click', carregar);
carregar();
