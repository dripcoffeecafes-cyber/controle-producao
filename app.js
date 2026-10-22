import { criarStoreLocal, criarStoreFirebase, pedidosLocais, limparPedidosLocais } from './store.js';

// ---------------- Utilidades ----------------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = v => brl.format(Number(v) || 0);
const brlCompacto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 });
const dinheiroCurto = v => (Math.abs(v) >= 1000 ? brlCompacto.format(v) : brl.format(v).replace(',00', ''));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function diasAte(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(y, m - 1, d);
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((alvo - h) / 86400000);
}
function dataCurta(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}${y !== String(new Date().getFullYear()) ? '/' + y.slice(2) : ''}`;
}
function lerNumero(txt) {
  if (txt == null) return 0;
  let s = String(txt).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function numeroParaCampo(n) {
  return n ? String(n).replace('.', ',') : '';
}
function linkWhats(contato) {
  const d = String(contato || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
}

const ETAPAS = {
  fila: 'A produzir', producao: 'Em produção', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado',
};
const PROXIMA = { fila: ['producao', 'Iniciar produção'], producao: ['pronto', 'Marcar pronto'], pronto: ['entregue', 'Marcar entregue'] };
const PRIORIDADES = { 1: 'Urgente', 2: 'Alta', 3: 'Normal', 4: 'Baixa' };
const ATIVOS = ['fila', 'producao', 'pronto'];

// ---------------- Estado ----------------
const estado = {
  store: null,
  pedidos: [],
  config: { empresas: [] },
  view: 'fila',
  empresa: '',
  pagamento: '',
  busca: '',
  editando: null,
};

// ---------------- Ordenação e filtros ----------------
function ordenarFila(a, b) {
  const pa = a.prioridade || 3, pb = b.prioridade || 3;
  if (pa !== pb) return pa - pb;
  const da = a.prazo || '9999-99-99', dbb = b.prazo || '9999-99-99';
  if (da !== dbb) return da < dbb ? -1 : 1;
  return (a.criadoEm || '') < (b.criadoEm || '') ? -1 : 1;
}

function emAberto(p) {
  return p.status !== 'cancelado' && p.pagamento !== 'pago' && (Number(p.valor) || 0) > (Number(p.valorPago) || 0);
}
function aReceber(p) {
  if (p.status === 'cancelado' || p.pagamento === 'pago') return 0;
  return Math.max(0, (Number(p.valor) || 0) - (p.pagamento === 'parcial' ? Number(p.valorPago) || 0 : 0));
}
function atrasado(p) {
  return ATIVOS.includes(p.status) && p.prazo && diasAte(p.prazo) < 0;
}

function filtrados() {
  const q = estado.busca.trim().toLowerCase();
  return estado.pedidos.filter(p => {
    if (estado.empresa && p.empresa !== estado.empresa) return false;
    if (estado.pagamento === 'aberto' && !emAberto(p)) return false;
    if (estado.pagamento === 'pago' && p.pagamento !== 'pago') return false;
    if (q) {
      const alvo = `${p.cliente} ${p.descricao} ${p.ref} ${p.obs} ${p.contato}`.toLowerCase();
      if (!alvo.includes(q)) return false;
    }
    return true;
  });
}

// ---------------- Render ----------------
function renderResumo() {
  const base = estado.pedidos.filter(p => !estado.empresa || p.empresa === estado.empresa);
  const produzir = base.filter(p => p.status === 'fila' || p.status === 'producao').length;
  const prontos = base.filter(p => p.status === 'pronto').length;
  const atrasados = base.filter(atrasado).length;
  const receber = base.reduce((s, p) => s + aReceber(p), 0);
  $('#resumo').innerHTML = `
    <div><strong>${produzir}</strong><span>A produzir</span></div>
    <div><strong>${prontos}</strong><span>Prontos</span></div>
    <div class="${atrasados ? 'alerta' : ''}"><strong>${atrasados}</strong><span>Atrasados</span></div>
    <div class="receber"><strong title="${dinheiro(receber)}">${dinheiroCurto(receber)}</strong><span>A receber</span></div>`;
}

function chipPrazo(p) {
  if (p.status === 'entregue') return p.entregueEm ? `<span class="chip">Entregue ${dataCurta(p.entregueEm)}</span>` : '';
  if (!p.prazo) return '';
  const d = diasAte(p.prazo);
  if (!ATIVOS.includes(p.status)) return `<span class="chip">Prazo ${dataCurta(p.prazo)}</span>`;
  if (d < 0) return `<span class="chip atrasado">Atrasado ${-d} ${-d === 1 ? 'dia' : 'dias'}</span>`;
  if (d === 0) return `<span class="chip hoje">Entregar hoje</span>`;
  if (d === 1) return `<span class="chip hoje">Entregar amanhã</span>`;
  return `<span class="chip">Prazo ${dataCurta(p.prazo)}, em ${d} dias</span>`;
}

function chipPagamento(p) {
  const v = Number(p.valor) || 0;
  if (p.pagamento === 'pago') return `<span class="chip pago">${v ? dinheiro(v) + ' pago' : 'Pago'}</span>`;
  if (p.pagamento === 'parcial') return `<span class="chip parcial">Falta ${dinheiro(aReceber(p))}</span>`;
  return `<span class="chip aberto">${v ? dinheiro(v) + ' a receber' : 'Não pago'}</span>`;
}

function cartao(p, posicao) {
  const prio = p.prioridade || 3;
  const proxima = PROXIMA[p.status];
  const whats = linkWhats(p.contato);
  const etapaChip = p.status !== 'fila' ? `<span class="chip etapa-${p.status}">${ETAPAS[p.status]}</span>` : '';
  const prioChip = prio <= 2 ? `<span class="chip prio-${prio}">${PRIORIDADES[prio]}</span>` : '';
  const qtd = p.quantidade ? `<span class="chip">${esc(p.quantidade)} un.</span>` : '';
  return `
  <article class="comanda p${prio} ${posicao ? '' : 'sem-pos'} ${p.status === 'cancelado' ? 'cancelado' : ''}" data-id="${esc(p.id)}">
    ${posicao ? `<div class="pos" aria-label="Posição ${posicao} na fila"><b>${posicao}</b><small>na fila</small></div>` : ''}
    <div class="corpo">
      <div class="abrir" role="button" tabindex="0" data-acao="editar" aria-label="Abrir pedido de ${esc(p.cliente)}">
        <div class="cab">
          <span class="cliente">${esc(p.cliente)}</span>
          ${estado.empresa ? '' : `<span class="empresa-tag">${esc(p.empresa || '')}</span>`}
        </div>
        <p class="descricao">${esc(p.descricao)}</p>
        <div class="chips">${etapaChip}${prioChip}${chipPrazo(p)}${qtd}${chipPagamento(p)}</div>
      </div>
      ${(proxima || p.pagamento !== 'pago' || whats) && p.status !== 'cancelado' ? `
      <div class="acoes">
        ${proxima ? `<button class="btn btn-primary" data-acao="avancar">${proxima[1]}</button>` : ''}
        ${p.pagamento !== 'pago' ? `<button class="btn" data-acao="pago">Marcar pago</button>` : ''}
        ${whats ? `<a class="btn" href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      </div>` : ''}
    </div>
  </article>`;
}

function renderLista() {
  const lista = $('#lista');
  const itens = filtrados();
  let html = '';

  if (estado.view === 'fila') {
    const ativos = itens.filter(p => ATIVOS.includes(p.status));
    const prontos = ativos.filter(p => p.status === 'pronto').sort(ordenarFila);
    const produzir = ativos.filter(p => p.status !== 'pronto').sort(ordenarFila);
    html += produzir.map((p, i) => cartao(p, i + 1)).join('');
    if (prontos.length) {
      html += `<h2 class="secao-titulo">Prontos para entregar</h2>` + prontos.map(p => cartao(p)).join('');
    }
    if (!ativos.length) html = vazio('Nada na fila', estado.pedidos.length ? 'Todos os pedidos deste filtro já foram entregues.' : 'Cadastre o primeiro pedido para começar a fila de produção.');
  } else if (estado.view === 'entregues') {
    const ent = itens.filter(p => p.status === 'entregue')
      .sort((a, b) => (b.entregueEm || '').localeCompare(a.entregueEm || ''));
    html = ent.length ? ent.map(p => cartao(p)).join('') : vazio('Nenhum pedido entregue', 'Quando marcar um pedido como entregue, ele aparece aqui com a data.');
  } else {
    const todos = [...itens].sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
    html = todos.length ? todos.map(p => cartao(p)).join('') : vazio('Nenhum pedido encontrado', 'Ajuste a busca ou os filtros.');
  }
  lista.innerHTML = html;
}

function vazio(titulo, texto) {
  return `<div class="vazio"><h2>${titulo}</h2><p>${texto}</p>
    <button class="btn btn-primary" data-acao="novo">Cadastrar pedido</button></div>`;
}

function renderEmpresas() {
  const empresas = estado.config.empresas || [];
  const sel = $('#filtroEmpresa');
  sel.innerHTML = `<option value="">Todas</option>` +
    empresas.map(e => `<option ${e === estado.empresa ? 'selected' : ''}>${esc(e)}</option>`).join('');
  if (estado.empresa && !empresas.includes(estado.empresa)) { estado.empresa = ''; sel.value = ''; }

  $('#listaEmpresas').innerHTML = empresas.map((e, i) =>
    `<li><span>${esc(e)}</span><button class="btn-link" data-remover="${i}">Remover</button></li>`).join('')
    || `<li class="muted">Nenhuma empresa cadastrada</li>`;
}

function render() { renderResumo(); renderLista(); }

// ---------------- Toast ----------------
let toastTimer;
function toast(msg, acao) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${acao ? `<button>${esc(acao.texto)}</button>` : ''}`;
  t.hidden = false;
  if (acao) t.querySelector('button').onclick = () => { acao.fn(); t.hidden = true; };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, acao ? 6000 : 2800);
}

// ---------------- Ações ----------------
function quem() {
  const u = estado.store?.usuario;
  return u?.displayName || u?.email || 'este aparelho';
}

async function salvar(p, msg, desfazer) {
  p.atualizadoEm = new Date().toISOString();
  p.atualizadoPor = quem();
  await estado.store.salvarPedido(p);
  if (msg) toast(msg, desfazer ? { texto: 'Desfazer', fn: () => estado.store.salvarPedido(desfazer) } : null);
}

function acharPedido(id) { return estado.pedidos.find(p => p.id === id); }

async function avancar(id) {
  const p = acharPedido(id); if (!p || !PROXIMA[p.status]) return;
  const antes = { ...p };
  const novo = { ...p, status: PROXIMA[p.status][0] };
  if (novo.status === 'entregue' && !novo.entregueEm) novo.entregueEm = hojeISO();
  await salvar(novo, `Movido para ${ETAPAS[novo.status].toLowerCase()}`, antes);
}

async function marcarPago(id) {
  const p = acharPedido(id); if (!p) return;
  const antes = { ...p };
  await salvar({ ...p, pagamento: 'pago', valorPago: Number(p.valor) || 0, pagoEm: hojeISO() }, 'Marcado como pago', antes);
}

// ---------------- Formulário ----------------
const dlg = $('#dlgPedido');
const form = $('#formPedido');

function preencherEmpresasForm(valorAtual) {
  const empresas = [...(estado.config.empresas || [])];
  if (valorAtual && !empresas.includes(valorAtual)) empresas.push(valorAtual);
  form.empresa.innerHTML = empresas.map(e => `<option>${esc(e)}</option>`).join('');
}

function abrirForm(p) {
  estado.editando = p ? p.id : null;
  form.reset();
  $('#formErro').textContent = '';
  $('#formTitulo').textContent = p ? 'Editar pedido' : 'Novo pedido';
  $('#excluirPedido').hidden = !p;
  preencherEmpresasForm(p?.empresa);

  const d = p || { status: 'fila', prioridade: 3, pagamento: 'nao', empresa: estado.empresa || (estado.config.empresas || [])[0] };
  form.cliente.value = d.cliente || '';
  form.empresa.value = d.empresa || '';
  form.ref.value = d.ref || '';
  form.contato.value = d.contato || '';
  form.descricao.value = d.descricao || '';
  form.quantidade.value = d.quantidade || '';
  form.valor.value = numeroParaCampo(d.valor);
  form.prazo.value = d.prazo || '';
  form.status.value = d.status || 'fila';
  form.entregueEm.value = d.entregueEm || '';
  form.valorPago.value = numeroParaCampo(d.valorPago);
  form.obs.value = d.obs || '';
  $(`input[name=prioridade][value="${d.prioridade || 3}"]`, form).checked = true;
  $(`input[name=pagamento][value="${d.pagamento || 'nao'}"]`, form).checked = true;
  atualizarCamposCondicionais();

  $('#formMeta').textContent = p?.atualizadoEm
    ? `Atualizado por ${p.atualizadoPor || '—'} em ${new Date(p.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
    : '';
  dlg.showModal();
  if (!p) form.cliente.focus();
}

function atualizarCamposCondicionais() {
  $('#campoEntregue').hidden = form.status.value !== 'entregue';
  $('#campoValorPago').hidden = form.pagamento.value !== 'parcial';
}

form.addEventListener('change', e => {
  if (e.target.name === 'status') {
    if (form.status.value === 'entregue' && !form.entregueEm.value) form.entregueEm.value = hojeISO();
  }
  atualizarCamposCondicionais();
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  const cliente = form.cliente.value.trim();
  const descricao = form.descricao.value.trim();
  if (!cliente || !descricao) {
    $('#formErro').textContent = !cliente ? 'Preencha o nome do cliente.' : 'Descreva o que deve ser produzido.';
    (!cliente ? form.cliente : form.descricao).focus();
    return;
  }
  const existente = estado.editando ? acharPedido(estado.editando) : null;
  const valor = lerNumero(form.valor.value);
  const pagamento = form.pagamento.value;
  const p = {
    ...(existente || {}),
    id: existente?.id || novoId(),
    cliente,
    empresa: form.empresa.value,
    ref: form.ref.value.trim(),
    contato: form.contato.value.trim(),
    descricao,
    quantidade: form.quantidade.value.trim(),
    valor,
    prioridade: Number(form.prioridade.value) || 3,
    prazo: form.prazo.value,
    status: form.status.value,
    entregueEm: form.status.value === 'entregue' ? (form.entregueEm.value || hojeISO()) : '',
    pagamento,
    valorPago: pagamento === 'pago' ? valor : pagamento === 'parcial' ? lerNumero(form.valorPago.value) : 0,
    obs: form.obs.value.trim(),
    criadoEm: existente?.criadoEm || new Date().toISOString(),
    criadoPor: existente?.criadoPor || quem(),
  };
  if (pagamento === 'pago' && existente?.pagamento !== 'pago') p.pagoEm = hojeISO();
  dlg.close();
  await salvar(p, existente ? 'Pedido salvo' : 'Pedido cadastrado');
});

$('#excluirPedido').addEventListener('click', async () => {
  const p = acharPedido(estado.editando); if (!p) return;
  if (!confirm(`Excluir o pedido de ${p.cliente}? Para guardar o histórico, prefira mudar a etapa para "Cancelado".`)) return;
  dlg.close();
  await estado.store.excluirPedido(p.id);
  toast('Pedido excluído', { texto: 'Desfazer', fn: () => estado.store.salvarPedido(p) });
});

// fechar sheets
$$('[data-fechar]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

// ---------------- Lista: cliques ----------------
document.addEventListener('click', e => {
  const alvo = e.target.closest('[data-acao]');
  if (!alvo) return;
  const acao = alvo.dataset.acao;
  if (acao === 'novo') return abrirForm();
  const id = alvo.closest('[data-id]')?.dataset.id;
  if (acao === 'editar') abrirForm(acharPedido(id));
  if (acao === 'avancar') avancar(id);
  if (acao === 'pago') marcarPago(id);
});

$('#novoPedido').addEventListener('click', () => abrirForm());
document.addEventListener('keydown', e => {
  const alvo = e.target.closest?.('.abrir');
  if (alvo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alvo.click(); }
});

$$('.abas button').forEach(b => b.addEventListener('click', () => {
  estado.view = b.dataset.view;
  $$('.abas button').forEach(x => x.setAttribute('aria-selected', x === b));
  renderLista();
  window.scrollTo({ top: 0 });
}));
$('#busca').addEventListener('input', e => { estado.busca = e.target.value; renderLista(); });
$('#filtroPagamento').addEventListener('change', e => { estado.pagamento = e.target.value; renderLista(); });
$('#filtroEmpresa').addEventListener('change', e => {
  estado.empresa = e.target.value;
  try { localStorage.setItem('cp_filtro_empresa', estado.empresa); } catch {}
  render();
});

// ---------------- Ajustes ----------------
$('#abrirAjustes').addEventListener('click', () => {
  const fb = estado.store.modo === 'firebase';
  $('#infoConexao').textContent = fb
    ? 'Sincronizado com a nuvem (Firebase). Alterações aparecem na hora para toda a equipe, e o app funciona sem internet.'
    : 'Modo de teste: os pedidos ficam só neste aparelho. Exporte a planilha de vez em quando como cópia de segurança.';
  $('#blocoConta').hidden = !fb;
  $('#infoUsuario').textContent = fb ? `Conectado como ${quem()}` : '';
  $('#migrarLocal').hidden = !(fb && pedidosLocais().length);
  $('#dlgAjustes').showModal();
});

$('#formEmpresa').addEventListener('submit', async e => {
  e.preventDefault();
  const nome = e.target.nome.value.trim();
  if (!nome) return;
  const empresas = [...(estado.config.empresas || [])];
  if (!empresas.includes(nome)) empresas.push(nome);
  e.target.reset();
  await estado.store.salvarConfig({ ...estado.config, empresas });
});
$('#listaEmpresas').addEventListener('click', async e => {
  const i = e.target.dataset.remover; if (i == null) return;
  const empresas = [...estado.config.empresas];
  const nome = empresas[i];
  if (!confirm(`Remover "${nome}" da lista? Os pedidos dessa empresa continuam salvos.`)) return;
  empresas.splice(Number(i), 1);
  await estado.store.salvarConfig({ ...estado.config, empresas });
});

$('#exportarCsv').addEventListener('click', () => {
  const cols = [
    ['Cliente', 'cliente'], ['Empresa', 'empresa'], ['Nº pedido', 'ref'], ['Contato', 'contato'],
    ['Descrição', 'descricao'], ['Quantidade', 'quantidade'], ['Valor', 'valor'], ['Pagamento', 'pagamento'],
    ['Valor recebido', 'valorPago'], ['Etapa', 'status'], ['Prioridade', 'prioridade'], ['Prazo', 'prazo'],
    ['Entregue em', 'entregueEm'], ['Observações', 'obs'], ['Criado em', 'criadoEm'], ['Criado por', 'criadoPor'],
    ['Atualizado em', 'atualizadoEm'], ['Atualizado por', 'atualizadoPor'],
  ];
  const pag = { nao: 'Não pago', parcial: 'Sinal pago', pago: 'Pago' };
  const fmt = (k, v) => {
    if (k === 'status') return ETAPAS[v] || v;
    if (k === 'prioridade') return PRIORIDADES[v] || v;
    if (k === 'pagamento') return pag[v] || v;
    if (k === 'valor' || k === 'valorPago') return String(Number(v) || 0).replace('.', ',');
    return v ?? '';
  };
  const linhas = [cols.map(c => c[0])].concat(
    [...estado.pedidos].sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''))
      .map(p => cols.map(([, k]) => fmt(k, p[k]))));
  const csv = '﻿' + linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `pedidos-${hojeISO()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

$('#migrarLocal').addEventListener('click', async () => {
  const locais = pedidosLocais();
  if (!locais.length) return;
  if (!confirm(`Enviar ${locais.length} pedido(s) cadastrados no modo de teste para a nuvem?`)) return;
  for (const p of locais) await estado.store.salvarPedido(p);
  limparPedidosLocais();
  $('#migrarLocal').hidden = true;
  toast(`${locais.length} pedido(s) enviados para a nuvem`);
});

$('#sair').addEventListener('click', async () => {
  $('#dlgAjustes').close();
  await estado.store.sair();
});

// ---------------- Instalação (PWA) ----------------
let promptInstalar = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  promptInstalar = e;
  mostrarAvisoInstalar('Instale o app na tela inicial para abrir mais rápido.', 'Instalar');
});
function mostrarAvisoInstalar(texto, botao) {
  if (standalone) return;
  try { if (localStorage.getItem('cp_instalar_dispensado')) return; } catch {}
  const el = $('#avisoInstalar');
  el.innerHTML = `<span>${texto}</span>${botao ? `<button class="btn">${botao}</button>` : `<button class="btn-link">Ok</button>`}`;
  el.hidden = false;
  el.querySelector('button').onclick = async () => {
    if (promptInstalar) { promptInstalar.prompt(); await promptInstalar.userChoice; promptInstalar = null; }
    try { localStorage.setItem('cp_instalar_dispensado', '1'); } catch {}
    el.hidden = true;
  };
}
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (ios && !standalone) {
  mostrarAvisoInstalar('Para instalar: toque em Compartilhar e depois em "Adicionar à Tela de Início".');
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------- Inicialização ----------------
let desinscrever = [];
function conectarDados() {
  desinscrever.forEach(f => f && f());
  desinscrever = [
    estado.store.onPedidos(lista => { estado.pedidos = lista; render(); },
      err => toast(err?.code === 'permission-denied' ? 'Seu e-mail não tem acesso aos pedidos. Fale com a administração.' : 'Erro ao carregar pedidos')),
    estado.store.onConfig(cfg => { estado.config = cfg; renderEmpresas(); render(); }),
  ];
}

function mostrarApp() { $('#login').hidden = true; $('#app').hidden = false; }
function mostrarLogin() { $('#app').hidden = true; $('#login').hidden = false; }

async function iniciar() {
  try { estado.empresa = localStorage.getItem('cp_filtro_empresa') || ''; } catch {}
  const cfg = window.FIREBASE_CONFIG;

  if (!cfg || !cfg.apiKey) {
    estado.store = criarStoreLocal();
    $('#avisoLocal').hidden = false;
    mostrarApp();
    conectarDados();
    return;
  }

  try {
    estado.store = await criarStoreFirebase(cfg);
  } catch (err) {
    console.error(err);
    estado.store = criarStoreLocal();
    $('#avisoLocal').hidden = false;
    $('#avisoLocal').textContent = 'Não foi possível conectar à nuvem agora. Verifique a internet e abra o app de novo.';
    mostrarApp(); conectarDados();
    return;
  }
  estado.store._onErro = err => toast(err?.code === 'permission-denied' ? 'Sem permissão para salvar. Fale com a administração.' : 'Erro ao salvar na nuvem');

  estado.store.onUsuario(u => {
    if (u) { mostrarApp(); conectarDados(); }
    else { desinscrever.forEach(f => f && f()); desinscrever = []; estado.pedidos = []; mostrarLogin(); }
  });

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target;
    const erro = $('#loginErro');
    erro.textContent = '';
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Entrando…';
    try {
      await estado.store.entrar(f.email.value.trim(), f.senha.value);
      f.reset();
    } catch (err) {
      erro.textContent = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(err.code)
        ? 'E-mail ou senha incorretos.'
        : err.code === 'auth/too-many-requests' ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
        : 'Não foi possível entrar. Verifique a internet.';
    } finally {
      btn.disabled = false; btn.textContent = 'Entrar';
    }
  });
  $('#esqueci').addEventListener('click', async () => {
    const email = $('#loginForm').email.value.trim();
    if (!email) { $('#loginErro').textContent = 'Digite seu e-mail acima e toque em "Esqueci minha senha" de novo.'; return; }
    try { await estado.store.recuperarSenha(email); $('#loginErro').textContent = 'Enviamos um link para redefinir a senha no seu e-mail.'; }
    catch { $('#loginErro').textContent = 'Não foi possível enviar o e-mail. Confira o endereço.'; }
  });
}

// atualiza "em X dias" quando o dia vira com o app aberto
setInterval(() => { if (!$('#app').hidden) render(); }, 60 * 60 * 1000);

iniciar();
