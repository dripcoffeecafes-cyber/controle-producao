// Página do cliente "Monte seu kit": montador em 3 etapas (Caixa → Itens → Enviar), sem login.
// Modelo dos montadores de caixa de presente (etapas numeradas, "Seu kit" sempre visível com o valor
// estimado, "+" direto no produto, menu de categorias fixo, − até zero com desfazer, recomeçar, rascunho salvo).
// Lê só o catálogo público (nome, categoria, foto e preço de venda; nunca o custo) e envia o pedido para a
// coleção pública "solicitacoes". O app da equipe transforma o pedido em lead.
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
const MAX_POR_ITEM = 99;
const computador = () => matchMedia('(min-width: 1024px)').matches;

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
      // criadoEm precisa ser o horário do servidor (as regras do Firebase conferem)
      await fs.addDoc(fs.collection(db, 'solicitacoes'), { ...d, criadoEm: fs.serverTimestamp() });
    },
  };
}

// ---------------- Estado ----------------
const s = { produtos: [], caixaId: null, qtd: {}, passo: 1, dados: null, enviando: false, pronto: false };
let timerAvanco = null; // avanço automático depois de escolher a caixa

const porNome = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
const caixas = () => s.produtos.filter(ehCaixa).sort(porNome);
const acharProduto = id => s.produtos.find(p => p.id === id);
const caixaAtual = () => caixas().find(c => c.id === s.caixaId) || null;
// Para escolher, vale a foto da caixa (a do item); a do kit montado abre em "Ver kit montado"
const fotoCaixa = c => c?.foto || c?.fotoPrincipal || '';

function linhas() {
  return s.produtos
    .filter(p => !ehCaixa(p) && (s.qtd[p.id] || 0) > 0)
    .sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria) || porNome(a, b))
    .map(p => ({ id: p.id, nome: p.nome, categoria: categoriaDe(p.categoria), preco: Number(p.preco) || 0, foto: p.foto, qtd: s.qtd[p.id] }));
}
const form = $('#formPedido');
const qtdKits = () => Math.min(9999, Math.max(1, parseInt(String(form.qtdKits.value).replace(/\D/g, ''), 10) || 1));

function totais() {
  const ls = linhas();
  const cx = caixaAtual();
  const completo = !!cx && ls.length > 0;
  const { preco } = precoDoKit(ls, cx?.preco);
  const n = qtdKits();
  return { ls, cx, completo, porKit: preco, n, total: arred(preco * n), pecas: ls.reduce((t, l) => t + l.qtd, 0) };
}
const textoPecas = n => `${n} ${n === 1 ? 'item' : 'itens'}`;

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
      if (p && !ehCaixa(p) && q > 0) s.qtd[id] = Math.min(MAX_POR_ITEM, q);
    }
  } catch {}
}

// ---------------- Aviso (com desfazer) ----------------
let timerAviso;
function aviso(texto, acao) {
  const el = $('#aviso');
  el.innerHTML = `<span>${esc(texto)}</span>${acao ? `<button type="button">${esc(acao.texto)}</button>` : ''}`;
  el.hidden = false;
  if (acao) el.querySelector('button').onclick = () => { acao.fn(); el.hidden = true; };
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { el.hidden = true; }, acao ? 5000 : 2600);
}

// ---------------- Desenho ----------------
const foto = (src, nome, cls) => src
  ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async">`
  : `<span class="${cls} sem-foto" aria-hidden="true">${esc((nome || '?').trim().charAt(0).toUpperCase())}</span>`;
const ICONE_FOTO = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.6" fill="currentColor"/><path d="m5 17 4.5-4.5 3 3 2.5-2.5L19.5 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
const ICONE_OK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m6.5 12.5 3.6 3.6 7.4-7.6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function stepper(id, q, nome, cls = '') {
  return `<div class="stepper ${cls}" role="group" aria-label="Quantidade de ${esc(nome)}" data-item="${esc(id)}">
    <button type="button" data-passo="-1" aria-label="${q === 1 ? 'Tirar do kit' : 'Tirar um'}">${q === 1 ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2m-7 0 1 12h8l1-12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '−'}</button>
    <span class="qtd" aria-live="polite">${q}</span>
    <button type="button" data-passo="1" aria-label="Pôr mais um" ${q >= MAX_POR_ITEM ? 'disabled' : ''}>+</button>
  </div>`;
}

function renderCaixas() {
  const lista = caixas();
  $('#caixas').innerHTML = lista.length ? lista.map(c => `
    <div class="caixa ${c.id === s.caixaId ? 'on' : ''}">
      <button type="button" class="caixa-escolher" role="radio" aria-checked="${c.id === s.caixaId}" data-caixa="${esc(c.id)}">
        <span class="caixa-foto-moldura">${foto(fotoCaixa(c), c.nome, 'caixa-foto')}</span>
        <span class="caixa-rodape">
          <span class="caixa-nome">${esc(c.nome)}</span>
          <span class="caixa-marca" aria-hidden="true">${ICONE_OK}</span>
        </span>
      </button>
      ${c.fotoPrincipal ? `<button type="button" class="caixa-amostra" data-amostra="${esc(c.id)}">${ICONE_FOTO}<span>Ver kit montado</span></button>` : ''}
    </div>`).join('') : '<p class="vazio">As caixas ainda estão sendo preparadas. Fale com a gente pelo WhatsApp.</p>';
}

function renderCats() {
  $('#cats').innerHTML = CATS_ITENS
    .filter(cat => s.produtos.some(p => !ehCaixa(p) && categoriaDe(p.categoria) === cat))
    .map(cat => {
      const n = s.produtos.filter(p => !ehCaixa(p) && categoriaDe(p.categoria) === cat).reduce((t, p) => t + (s.qtd[p.id] || 0), 0);
      return `<a class="cat" href="#cat-${esc(cat)}" data-cat="${esc(cat)}">${esc(cat)}${n ? `<span class="cat-n">${n}</span>` : ''}</a>`;
    }).join('');
}

function cartaoProduto(p) {
  const q = s.qtd[p.id] || 0;
  return `
    <article class="prod ${q ? 'on' : ''}" data-item="${esc(p.id)}">
      <div class="prod-foto">
        <button type="button" class="prod-toque" data-passo="1" aria-label="Pôr ${esc(p.nome)} no kit" ${q ? 'tabindex="-1"' : ''}>${foto(p.foto, p.nome, 'prod-img')}</button>
        ${q ? `<span class="prod-qtd" aria-hidden="true">${q}×</span>` : ''}
        ${q ? stepper(p.id, q, p.nome, 'stepper-foto') : `<button type="button" class="prod-mais" data-passo="1" aria-label="Pôr ${esc(p.nome)} no kit">+</button>`}
      </div>
      <h3 class="prod-nome">${esc(p.nome)}</h3>
    </article>`;
}

function renderItens() {
  const grupos = CATS_ITENS.map(cat => {
    const ps = s.produtos.filter(p => !ehCaixa(p) && categoriaDe(p.categoria) === cat).sort(porNome);
    if (!ps.length) return '';
    return `<section class="grupo" id="cat-${esc(cat)}" data-cat="${esc(cat)}">
      <h2 class="grupo-titulo">${esc(cat)}</h2>
      <div class="prods">${ps.map(cartaoProduto).join('')}</div>
    </section>`;
  }).join('');
  $('#itens').innerHTML = grupos || '<p class="vazio">Os produtos ainda estão sendo preparados. Fale com a gente pelo WhatsApp.</p>';
  renderCats();
  observarCategorias();
}

// Atualiza só o cartão que mudou (sem redesenhar a lista toda e sem perder a rolagem)
function atualizarCartao(id) {
  const atual = $(`#itens .prod[data-item="${CSS.escape(id)}"]`);
  const p = acharProduto(id);
  if (!atual || !p) return;
  atual.outerHTML = cartaoProduto(p);
  renderCats();
  marcarCategoriaAtiva();
}

function blocoKit({ editavel }) {
  const t = totais();
  const cx = t.cx;
  const caixaHtml = cx ? `
    <div class="kit-caixa">
      ${foto(fotoCaixa(cx), cx.nome, 'kit-caixa-foto')}
      <div class="kit-caixa-info">
        <span class="kit-rotulo">Caixa</span>
        <b>${esc(cx.nome)}</b>
        ${editavel ? '<button type="button" class="btn-texto pequeno" data-ir="1">Trocar caixa</button>' : ''}
      </div>
    </div>` : `
    <div class="kit-caixa vazia">
      <span class="kit-caixa-foto sem-foto" aria-hidden="true">1</span>
      <div class="kit-caixa-info"><span class="kit-rotulo">Caixa</span><b>Ainda não escolhida</b>
        <button type="button" class="btn-texto pequeno" data-ir="1">Escolher a caixa</button></div>
    </div>`;
  const itensHtml = t.ls.length ? `<ul class="kit-itens">${t.ls.map(l => `
      <li>
        ${foto(l.foto, l.nome, 'kit-item-foto')}
        <span class="kit-item-nome">${esc(l.nome)}</span>
        ${editavel ? stepper(l.id, l.qtd, l.nome, 'stepper-pequeno') : `<span class="kit-item-qtd">${l.qtd}×</span>`}
      </li>`).join('')}</ul>`
    : `<p class="kit-vazio">Nenhum item ainda.${editavel ? ' Toque no <b>+</b> dos produtos para colocar no kit.' : ''}</p>`;
  return caixaHtml + itensHtml;
}

function renderPainel() {
  const t = totais();
  $('#painelConteudo').innerHTML = blocoKit({ editavel: true });
  $('#painelValor').textContent = t.completo ? dinheiro(t.porKit) : '—';
  const botao = $('#painelAvancar');
  botao.hidden = s.passo === 3;
  botao.textContent = s.passo === 1 ? 'Escolher o que vai dentro' : 'Revisar e enviar';
  botao.classList.toggle('esperando', s.passo === 1 ? !t.cx : !t.ls.length);

  // barra do celular
  const pilha = [t.cx && fotoCaixa(t.cx), ...t.ls.map(l => l.foto)].filter(Boolean);
  const extra = Math.max(0, (t.cx ? 1 : 0) + t.ls.length - 3);
  $('#pilha').innerHTML = pilha.slice(0, 3).map(src => `<img src="${esc(src)}" alt="">`).join('')
    + (extra ? `<span class="pilha-mais">+${extra}</span>` : '')
    + (pilha.length ? '' : '<span class="pilha-vazia"></span>');
  $('#barraTitulo').textContent = t.pecas ? textoPecas(t.pecas) : 'Seu kit';
  $('#barraSub').textContent = t.completo ? `${dinheiro(t.porKit)} / kit` : !t.cx ? 'Escolha a caixa' : 'Adicione os itens';
  const ba = $('#barraAvancar');
  ba.textContent = s.passo === 1 ? 'Próximo' : 'Revisar';
  ba.classList.toggle('esperando', s.passo === 1 ? !t.cx : !t.ls.length);
}

function renderRevisao() {
  const t = totais();
  const cx = t.cx;
  $('#revisao').innerHTML = `
    <div class="cartao cartao-revisao">
      ${cx && cx.fotoPrincipal ? `<figure class="revisao-foto"><img src="${esc(cx.fotoPrincipal)}" alt="Exemplo de kit com a ${esc(cx.nome)}"><figcaption>Imagem ilustrativa · ${esc(cx.nome)}</figcaption></figure>` : ''}
      <div class="revisao-corpo">
        <div class="revisao-cab"><h2>${esc(TITULO_KIT)}</h2><button type="button" class="btn-texto pequeno" data-ir="2">Editar</button></div>
        ${blocoKit({ editavel: false })}
      </div>
    </div>`;
  renderTotaisForm();
}
function renderTotaisForm() {
  const t = totais();
  $('#totaisForm').innerHTML = t.completo ? `
    <div><span>Valor estimado por kit</span><strong>${dinheiro(t.porKit)}</strong></div>
    ${t.n > 1 ? `<div class="total-geral"><span>Total estimado (${t.n} kits)</span><strong>${dinheiro(t.total)}</strong></div>` : ''}` : '';
}

function renderEtapas() {
  const t = totais();
  $$('.etapa').forEach(b => {
    const n = Number(b.dataset.ir);
    b.classList.toggle('atual', n === s.passo);
    b.classList.toggle('feita', n < s.passo || (n === 1 && !!t.cx) || (n === 2 && t.ls.length > 0 && s.passo > 2));
    if (n === s.passo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
}

function renderTudo() {
  renderCaixas(); renderItens(); renderPainel(); renderEtapas();
  if (s.passo === 3) renderRevisao();
}
function aoMudarKit() {
  guardarRascunho();
  renderPainel(); renderEtapas();
  if (s.passo === 3) renderRevisao();
}

// ---------------- Navegação entre etapas ----------------
function irPara(passo, { historico = true, rolar = true } = {}) {
  clearTimeout(timerAvanco);
  const t = totais();
  if (passo >= 2 && !t.cx) { passo = 1; if (s.passo !== 1) aviso('Escolha a caixa primeiro.'); }
  if (passo === 3 && !t.ls.length) { passo = 2; aviso('Coloque pelo menos um item no kit.'); }
  s.passo = passo;
  document.body.dataset.etapa = String(passo);
  $$('.passo').forEach(el => { el.hidden = Number(el.dataset.etapa) !== passo; });
  fecharPainel();
  if (passo === 3) renderRevisao();
  renderPainel(); renderEtapas();
  if (historico && location.hash !== `#passo-${passo}`) history.pushState({ passo }, '', `#passo-${passo}`);
  if (rolar) window.scrollTo({ top: 0, behavior: 'smooth' });
  if (passo === 2) marcarCategoriaAtiva();
}
window.addEventListener('popstate', () => {
  const m = location.hash.match(/passo-(\d)/);
  if (s.pronto && $('#enviado').hidden) irPara(m ? Number(m[1]) : 1, { historico: false });
});

function avancar() {
  const t = totais();
  if (s.passo === 1) {
    if (!t.cx) { aviso('Escolha uma caixa para continuar.'); return; }
    irPara(2);
  } else if (s.passo === 2) {
    if (!t.ls.length) { aviso('Coloque pelo menos um item no kit.'); return; }
    irPara(3);
  }
}
$('#painelAvancar').addEventListener('click', avancar);
$('#barraAvancar').addEventListener('click', avancar);
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ir]');
  if (b) irPara(Number(b.dataset.ir));
});

// ---------------- Painel / gaveta ----------------
function abrirPainel() {
  if (computador()) return;
  $('#painel').classList.add('aberto');
  $('#fundo').hidden = false;
  document.body.classList.add('travado');
  $('#abrirPainel').setAttribute('aria-expanded', 'true');
}
function fecharPainel() {
  $('#painel').classList.remove('aberto');
  $('#fundo').hidden = true;
  document.body.classList.remove('travado');
  $('#abrirPainel').setAttribute('aria-expanded', 'false');
}
$('#abrirPainel').addEventListener('click', () => ($('#painel').classList.contains('aberto') ? fecharPainel() : abrirPainel()));
$('#fecharPainel').addEventListener('click', fecharPainel);
$('#fundo').addEventListener('click', fecharPainel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharPainel(); });

$('#recomecar').addEventListener('click', () => {
  if (!s.caixaId && !Object.keys(s.qtd).length) return;
  const antes = { caixaId: s.caixaId, qtd: { ...s.qtd } };
  s.caixaId = null; s.qtd = {};
  guardarRascunho();
  renderTudo();
  irPara(1);
  aviso('Kit esvaziado', { texto: 'Desfazer', fn: () => { s.caixaId = antes.caixaId; s.qtd = antes.qtd; guardarRascunho(); renderTudo(); } });
});

// ---------------- Escolhas ----------------
// Amostra do kit montado com a caixa (foto principal), ampliada, com "Escolher esta caixa"
const dlgAmostra = $('#dlgAmostra');
function abrirAmostra(id) {
  const c = caixas().find(x => x.id === id); if (!c?.fotoPrincipal) return;
  $('#amostraImg').src = c.fotoPrincipal;
  $('#amostraImg').alt = `Exemplo de kit montado com a ${c.nome}`;
  $('#amostraNome').textContent = c.nome;
  $('#amostraEscolher').dataset.caixa = c.id;
  $('#amostraEscolher').textContent = c.id === s.caixaId ? 'Continuar com esta caixa' : 'Escolher esta caixa';
  dlgAmostra.showModal();
}
dlgAmostra.addEventListener('click', e => {
  if (e.target === dlgAmostra || e.target.closest('[data-fechar-amostra]')) dlgAmostra.close();
});
$('#amostraEscolher').addEventListener('click', () => {
  const id = $('#amostraEscolher').dataset.caixa;
  dlgAmostra.close();
  escolherCaixa(id);
});

function escolherCaixa(id) {
  const primeira = !s.caixaId;
  s.caixaId = id;
  renderCaixas(); aoMudarKit();
  // escolheu a caixa: segue sozinho para os itens (só depois de um instante, para ver a marcação)
  clearTimeout(timerAvanco);
  if (s.passo === 1) timerAvanco = setTimeout(() => { if (s.passo === 1) irPara(2); }, primeira ? 380 : 260);
}

$('#caixas').addEventListener('click', e => {
  const a = e.target.closest('[data-amostra]');
  if (a) { abrirAmostra(a.dataset.amostra); return; }
  const b = e.target.closest('[data-caixa]'); if (!b) return;
  escolherCaixa(b.dataset.caixa);
});

function mudarQtd(id, passo) {
  const p = acharProduto(id); if (!p) return;
  const antes = s.qtd[id] || 0;
  const q = Math.min(MAX_POR_ITEM, Math.max(0, antes + passo));
  if (q === antes) return;
  if (q) s.qtd[id] = q; else delete s.qtd[id];
  atualizarCartao(id);
  aoMudarKit();
  if (!q) aviso(`${p.nome} saiu do kit`, { texto: 'Desfazer', fn: () => { s.qtd[id] = antes; atualizarCartao(id); aoMudarKit(); } });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-passo]');
  if (!b || b.closest('#formPedido')) return;
  const id = b.closest('[data-item]')?.dataset.item;
  if (!id) return;
  mudarQtd(id, Number(b.dataset.passo));
  // mantém o foco no mesmo controle depois de redesenhar
  const alvo = b.closest('#painel') ? '#painel' : '#itens';
  const novo = $(`${alvo} [data-item="${CSS.escape(id)}"] [data-passo="${b.dataset.passo}"]`) || $(`#itens .prod[data-item="${CSS.escape(id)}"] .prod-mais`);
  novo?.focus({ preventScroll: true });
});

// Menu de categorias: rola até a categoria e marca a que está na tela
let observador;
function observarCategorias() {
  observador?.disconnect();
  observador = new IntersectionObserver(() => marcarCategoriaAtiva(), { rootMargin: '-140px 0px -55% 0px' });
  $$('.grupo').forEach(g => observador.observe(g));
}
let catTocada = null, catTocadaAte = 0;
function marcarCategoriaAtiva() {
  const grupos = $$('.grupo');
  let ativa = grupos[0]?.dataset.cat;
  for (const g of grupos) if (g.getBoundingClientRect().top - 150 <= 0) ativa = g.dataset.cat;
  // no fim da página a última categoria pode não chegar ao topo: vale a última
  if (grupos.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 8) ativa = grupos[grupos.length - 1].dataset.cat;
  if (catTocada && Date.now() < catTocadaAte) ativa = catTocada;
  const menu = $('#cats');
  $$('.cat').forEach(a => {
    const on = a.dataset.cat === ativa;
    const mudou = on && !a.classList.contains('ativa');
    a.classList.toggle('ativa', on);
    // mantém a categoria ativa à vista no menu (rolagem só para o lado, nunca a página)
    if (mudou && (a.offsetLeft < menu.scrollLeft || a.offsetLeft + a.offsetWidth > menu.scrollLeft + menu.clientWidth)) {
      menu.scrollTo({ left: Math.max(0, a.offsetLeft - 16), behavior: 'smooth' });
    }
  });
}
$('#cats').addEventListener('click', e => {
  const a = e.target.closest('[data-cat]'); if (!a) return;
  e.preventDefault();
  catTocada = a.dataset.cat; catTocadaAte = Date.now() + 900;
  marcarCategoriaAtiva();
  const g = document.getElementById(`cat-${a.dataset.cat}`);
  if (g) window.scrollTo({ top: g.getBoundingClientRect().top + scrollY - 128, behavior: 'smooth' });
});
window.addEventListener('scroll', () => { if (s.passo === 2) marcarCategoriaAtiva(); }, { passive: true });

// ---------------- Formulário ----------------
form.addEventListener('click', e => {
  const b = e.target.closest('[data-qtd]'); if (!b) return;
  form.qtdKits.value = String(Math.min(9999, Math.max(1, qtdKits() + Number(b.dataset.qtd))));
  renderTotaisForm();
});
form.qtdKits.addEventListener('focus', () => form.qtdKits.select());
form.qtdKits.addEventListener('input', () => { form.qtdKits.value = form.qtdKits.value.replace(/\D/g, '').slice(0, 4); renderTotaisForm(); });
form.qtdKits.addEventListener('blur', () => { form.qtdKits.value = String(qtdKits()); renderTotaisForm(); });

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
  if (!t.cx) { irPara(1); return; }
  if (!t.ls.length) { irPara(2); return; }
  const nome = form.nome.value.trim();
  const contato = form.contato.value.trim();
  if (!nome) { erro.textContent = 'Digite o seu nome.'; form.nome.focus(); return; }
  if (contato.replace(/\D/g, '').length < 10) { erro.textContent = 'Digite o seu WhatsApp com DDD.'; form.contato.focus(); return; }

  // só os 9 campos que as regras do Firebase aceitam (criadoEm entra no envio)
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
  $$('.passo').forEach(el => { el.hidden = true; });
  $('#enviado').hidden = false;
  document.body.dataset.etapa = 'enviado';
  fecharPainel();
  window.scrollTo({ top: 0 });
  // No celular, já abre o WhatsApp com a mensagem pronta (o botão continua ali, caso não abra)
  if (matchMedia('(hover: none)').matches) setTimeout(() => { location.href = link; }, 900);
});

$('#montarOutro').addEventListener('click', () => {
  s.caixaId = null; s.qtd = {};
  form.reset(); form.qtdKits.value = '1';
  $('#enviado').hidden = true;
  renderTudo();
  irPara(1);
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
    $('#barra').hidden = false;
    s.pronto = true;
    renderTudo();
    // volta para a etapa em que a pessoa estava (rascunho), senão começa pela caixa
    const m = location.hash.match(/passo-(\d)/);
    const inicial = m ? Number(m[1]) : (s.caixaId ? 2 : 1);
    history.replaceState({ passo: inicial }, '', `#passo-${inicial}`);
    irPara(inicial, { historico: false, rolar: false });
  } catch (err) {
    console.error(err);
    $('#carregando').hidden = true;
    $('#erroCarga').hidden = false;
  }
}
$('#tentarDeNovo').addEventListener('click', carregar);
carregar();
