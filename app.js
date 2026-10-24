import { criarStoreLocal, criarStoreFirebase, pedidosLocais, limparPedidosLocais } from './store.js';
import { criarKits } from './kits.js';

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
// Fila única: primeiro a data de entrega (confirmada ou prevista; sem data vai para o fim),
// depois a prioridade (Urgente > Alta > Normal > Baixa), depois a ordem de cadastro.
function ordenarFila(a, b) {
  const da = a.prazo || '9999-99-99', dbb = b.prazo || '9999-99-99';
  if (da !== dbb) return da < dbb ? -1 : 1;
  const pa = a.prioridade || 3, pb = b.prioridade || 3;
  if (pa !== pb) return pa - pb;
  return (a.criadoEm || '') < (b.criadoEm || '') ? -1 : 1;
}

// Finalizado = produzido, entregue e pago. Até lá o pedido continua na fila.
const finalizado = p => p.status === 'entregue' && p.pagamento === 'pago';
const naFila = p => p.status !== 'cancelado' && !finalizado(p);

function emAberto(p) {
  return p.status !== 'cancelado' && p.pagamento !== 'pago' && (Number(p.valor) || 0) > (Number(p.valorPago) || 0);
}
function aReceber(p) {
  if (p.status === 'cancelado' || p.pagamento === 'pago') return 0;
  return Math.max(0, (Number(p.valor) || 0) - (p.pagamento === 'parcial' ? Number(p.valorPago) || 0 : 0));
}
function atrasado(p) {
  return ATIVOS.includes(p.status) && p.prazo && p.prazoTipo !== 'prevista' && diasAte(p.prazo) < 0;
}

function filtrados() {
  const q = estado.busca.trim().toLowerCase();
  return estado.pedidos.filter(p => {
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
  const base = estado.pedidos;
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
  if (!p.prazo) return ATIVOS.includes(p.status) ? `<span class="chip prevista">Sem data</span>` : '';
  const d = diasAte(p.prazo);
  if (p.prazoTipo === 'prevista') {
    if (!ATIVOS.includes(p.status)) return `<span class="chip prevista">Previsto ${dataCurta(p.prazo)}</span>`;
    if (d < 0) return `<span class="chip prevista vencida">Previsão passou (${dataCurta(p.prazo)})</span>`;
    if (d === 0) return `<span class="chip prevista">Previsto para hoje</span>`;
    if (d === 1) return `<span class="chip prevista">Previsto para amanhã</span>`;
    return `<span class="chip prevista">Previsto ${dataCurta(p.prazo)}, em ${d} dias</span>`;
  }
  if (!ATIVOS.includes(p.status)) return `<span class="chip">Entrega ${dataCurta(p.prazo)}</span>`;
  if (d < 0) return `<span class="chip atrasado">Atrasado ${-d} ${-d === 1 ? 'dia' : 'dias'}</span>`;
  if (d === 0) return `<span class="chip hoje">Entregar hoje</span>`;
  if (d === 1) return `<span class="chip hoje">Entregar amanhã</span>`;
  return `<span class="chip">Entrega ${dataCurta(p.prazo)}, em ${d} dias</span>`;
}

function textoValor(p) {
  const v = Number(p.valor) || 0;
  if (!v) return '';
  const falta = p.pagamento === 'parcial' ? ` <span class="falta">falta ${dinheiro(aReceber(p))}</span>` : '';
  return `<span class="valor">${dinheiro(v)}${falta}</span>`;
}

function chipPagamento(p) {
  const v = Number(p.valor) || 0;
  if (p.pagamento === 'pago') return `<span class="chip pago">${v ? dinheiro(v) + ' pago' : 'Pago'}</span>`;
  if (p.pagamento === 'parcial') return `<span class="chip parcial">Falta ${dinheiro(aReceber(p))}</span>`;
  return `<span class="chip aberto">${v ? dinheiro(v) + ' a receber' : 'Não pago'}</span>`;
}

const produzido = p => p.status === 'pronto' || p.status === 'entregue';
const ICONE_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle class="anel" cx="12" cy="12" r="9"/><path class="tique" d="m7.5 12.3 3 3 6-6.3"/></svg>';
function marcador(tipo, texto, ativo) {
  return `<button class="marcador m-${tipo}" data-acao="marcar" data-tipo="${tipo}" aria-pressed="${ativo}">${ICONE_CHECK}<span>${texto}</span></button>`;
}

function cartao(p, posicao) {
  const prio = p.prioridade || 3;
  const proxima = PROXIMA[p.status];
  const whats = linkWhats(p.contato);
  const etapaChip = p.status === 'producao' || p.status === 'cancelado' ? `<span class="chip etapa-${p.status}">${ETAPAS[p.status]}</span>` : '';
  const prioChip = prio <= 2 ? `<span class="chip prio-${prio}">${PRIORIDADES[prio]}</span>` : '';
  // pedidos antigos tinham quantidade separada: mostra junto da descrição
  const descricao = p.quantidade && !String(p.descricao || '').includes(p.quantidade) ? `${p.quantidade} un. — ${p.descricao}` : p.descricao;
  return `
  <article class="comanda p${prio} ${posicao ? '' : 'sem-pos'} ${p.status === 'cancelado' ? 'cancelado' : ''}" data-id="${esc(p.id)}">
    ${posicao ? `<div class="pos" aria-label="Posição ${posicao} na fila"><b>${posicao}</b><small>na fila</small></div>` : ''}
    <div class="corpo">
      <div class="abrir" role="button" tabindex="0" data-acao="editar" aria-label="Abrir pedido de ${esc(p.cliente)}">
        <div class="cab">
          <span class="cliente">${esc(p.cliente)}</span>
          ${textoValor(p)}
        </div>
        <p class="descricao">${esc(descricao)}</p>
        <div class="chips">${etapaChip}${prioChip}${chipPrazo(p)}</div>
      </div>
      ${p.status !== 'cancelado' ? `
      <div class="marcadores" role="group" aria-label="Situação do pedido">
        ${marcador('produzido', 'Produzido', produzido(p))}
        ${marcador('entregue', 'Entregue', p.status === 'entregue')}
        ${marcador('pago', 'Pago', p.pagamento === 'pago')}
      </div>
      ${whats ? `<a class="link-whats" href="${whats}" target="_blank" rel="noopener">Chamar no WhatsApp</a>` : ''}` : ''}
    </div>
  </article>`;
}

function renderLista() {
  const lista = $('#lista');
  const itens = filtrados();
  let html = '';

  if (estado.view === 'fila') {
    const fila = itens.filter(naFila).sort(ordenarFila);
    html = fila.map((p, i) => cartao(p, i + 1)).join('');
    if (!fila.length) html = vazio('Nada na fila', estado.pedidos.length ? 'Todos os pedidos deste filtro já foram finalizados.' : 'Cadastre o primeiro pedido para começar a fila de produção.');
  } else if (estado.view === 'finalizados') {
    const fin = itens.filter(finalizado)
      .sort((a, b) => (b.entregueEm || '').localeCompare(a.entregueEm || ''));
    html = fin.length ? fin.map(p => cartao(p)).join('') : vazio('Nenhum pedido finalizado', 'Um pedido vem para cá quando estiver entregue e pago.');
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

function render() { renderResumo(); renderLista(); }

// ---------------- Kits de presente ----------------
const kits = criarKits({
  store: () => estado.store,
  toast: (...a) => toast(...a),
  quem: () => quem(),
  irPara: area => irPara(area),
  // pedido criado a partir do orçamento: volta para a Produção e abre o formulário preenchido
  abrirPedido: (preencher, extra) => { irPara('producao'); abrirForm(null, preencher, extra); },
  aoMudar: () => { if (estado.area === 'produtos') renderProdutos(); },
});

// ---------------- Áreas do app (cabeçalho): Produção, Orçar kit, Produtos ----------------
const AREAS = ['producao', 'orcar', 'produtos'];
function renderProdutos() { $('#areaProdutos').innerHTML = kits.html(); }
function irPara(area) {
  if (!AREAS.includes(area)) area = 'producao';
  const mudou = estado.area !== area;
  estado.area = area;
  document.body.dataset.area = area;
  try { localStorage.setItem('cp_area', area); } catch {}
  $$('.areas button').forEach(b => {
    if (b.dataset.area === area) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const producao = area === 'producao';
  $('#topoProducao').hidden = !producao;
  $('#lista').hidden = !producao;
  $('#novoPedido').hidden = !producao;
  $('#areaOrcar').hidden = area !== 'orcar';
  $('#areaProdutos').hidden = area !== 'produtos';
  if (area === 'orcar') kits.renderOrcar();
  if (area === 'produtos') renderProdutos();
  if (mudou) window.scrollTo({ top: 0 });
}
$$('.areas button').forEach(b => b.addEventListener('click', () => irPara(b.dataset.area)));

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
  try { return localStorage.getItem('cp_nome') || 'Equipe'; } catch { return 'Equipe'; }
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
  await salvar(novo, finalizado(novo) ? 'Pedido finalizado' : `Movido para ${ETAPAS[novo.status].toLowerCase()}`, antes);
}

async function marcarPago(id) {
  const p = acharPedido(id); if (!p) return;
  const antes = { ...p };
  const novo = { ...p, pagamento: 'pago', valorPago: Number(p.valor) || 0, pagoEm: hojeISO() };
  await salvar(novo, finalizado(novo) ? 'Pedido finalizado' : 'Marcado como pago', antes);
}

// Liga/desliga Produzido, Entregue e Pago direto no cartão
async function alternar(id, tipo) {
  const p = acharPedido(id); if (!p) return;
  const antes = { ...p };
  const novo = { ...p };
  let msg;
  if (tipo === 'produzido') {
    if (produzido(p)) { novo.status = 'producao'; novo.entregueEm = ''; msg = 'Voltou para produção'; }
    else { novo.status = 'pronto'; msg = 'Marcado como produzido'; }
  } else if (tipo === 'entregue') {
    if (p.status === 'entregue') { novo.status = 'pronto'; novo.entregueEm = ''; msg = 'Entrega desmarcada'; }
    else { novo.status = 'entregue'; novo.entregueEm = hojeISO(); msg = 'Marcado como entregue'; }
  } else if (tipo === 'pago') {
    if (p.pagamento === 'pago') { novo.pagamento = 'nao'; novo.valorPago = 0; novo.pagoEm = ''; msg = 'Pagamento desmarcado'; }
    else { novo.pagamento = 'pago'; novo.valorPago = Number(p.valor) || 0; novo.pagoEm = hojeISO(); msg = 'Marcado como pago'; }
  } else return;
  if (finalizado(novo) && !finalizado(p)) msg = 'Pedido finalizado';
  if (!finalizado(novo) && finalizado(p)) msg += ', voltou para a fila';
  await salvar(novo, msg, antes);
}

// ---------------- Formulário ----------------
const dlg = $('#dlgPedido');
const form = $('#formPedido');

function abrirForm(p, preencher, extra) {
  estado.editando = p ? p.id : null;
  estado.extraNovo = p ? null : extra || null;
  form.reset();
  $('#formErro').textContent = '';
  $('#formTitulo').textContent = p ? 'Editar pedido' : 'Novo pedido';
  $('#excluirPedido').hidden = !p;

  const d = p || { status: 'fila', prioridade: 3, pagamento: 'nao', prazoTipo: 'confirmada' };
  form.cliente.value = d.cliente || '';
  form.ref.value = d.ref || '';
  form.contato.value = formatarTelefone(d.contato || '');
  form.descricao.value = d.descricao || '';
  // pedidos antigos: leva a quantidade para a descrição ao editar
  if (d.quantidade && !String(d.descricao || '').includes(d.quantidade)) form.descricao.value = `${d.quantidade} un. — ${d.descricao || ''}`;
  form.valor.value = numeroParaCampo(d.valor);
  form.prazo.value = d.prazo || '';
  form.status.value = d.status || 'fila';
  form.entregueEm.value = d.entregueEm || '';
  form.valorPago.value = numeroParaCampo(d.valorPago);
  form.obs.value = d.obs || '';
  $(`input[name=prioridade][value="${d.prioridade || 3}"]`, form).checked = true;
  $(`input[name=pagamento][value="${d.pagamento || 'nao'}"]`, form).checked = true;
  $(`input[name=prazoTipo][value="${d.prazoTipo === 'prevista' ? 'prevista' : 'confirmada'}"]`, form).checked = true;
  // vindo do montador de kits: descrição, valor e observação já preenchidos
  if (!p && preencher) {
    if (preencher.cliente) form.cliente.value = preencher.cliente;
    if (preencher.descricao) form.descricao.value = preencher.descricao;
    if (preencher.valor) form.valor.value = numeroParaCampo(preencher.valor);
    if (preencher.obs) form.obs.value = preencher.obs;
  }
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
  $('#campoPrazoTipo').hidden = !form.prazo.value;
}

// Máscara de telefone: (11) 99999-9999 ou (11) 3333-4444. Números com "+" ficam livres (internacional).
function formatarTelefone(v) {
  if (/^\s*\+/.test(v)) return v;
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
form.contato.addEventListener('input', e => {
  const el = e.target;
  const apagando = e.inputType && e.inputType.startsWith('delete');
  const novo = formatarTelefone(el.value);
  // ao apagar, não recoloca o símbolo que a pessoa acabou de remover
  if (apagando && novo.length > el.value.length) return;
  el.value = novo;
});

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
    ...(existente || estado.extraNovo || {}),
    id: existente?.id || novoId(),
    cliente,
    ref: form.ref.value.trim(),
    contato: form.contato.value.trim(),
    descricao,
    quantidade: '',
    valor,
    prioridade: Number(form.prioridade.value) || 3,
    prazo: form.prazo.value,
    prazoTipo: form.prazo.value ? form.prazoTipo.value : '',
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
  if (acao === 'marcar') alternar(id, alvo.dataset.tipo);
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

// ---------------- Ajustes ----------------
$('#abrirAjustes').addEventListener('click', () => {
  const fb = estado.store.modo === 'firebase';
  $('#infoConexao').textContent = fb
    ? 'Sincronizado com a nuvem (Firebase). Alterações aparecem na hora para toda a equipe, e o app funciona sem internet.'
    : 'Modo de teste: os pedidos ficam só neste aparelho. Exporte a planilha de vez em quando como cópia de segurança.';
  $('#blocoLink').hidden = !fb;
  try { $('#formNome').nome.value = localStorage.getItem('cp_nome') || ''; } catch {}
  $('#migrarLocal').hidden = !(fb && pedidosLocais().length);
  $('#dlgAjustes').showModal();
});


$('#exportarCsv').addEventListener('click', () => {
  const cols = [
    ['Cliente', 'cliente'], ['Nº pedido', 'ref'], ['Contato', 'contato'],
    ['Descrição', 'descricao'], ['Valor', 'valor'], ['Pagamento', 'pagamento'],
    ['Valor recebido', 'valorPago'], ['Etapa', 'status'], ['Prioridade', 'prioridade'], ['Data de entrega', 'prazo'], ['Tipo da data', 'prazoTipo'],
    ['Entregue em', 'entregueEm'], ['Observações', 'obs'], ['Criado em', 'criadoEm'], ['Criado por', 'criadoPor'],
    ['Atualizado em', 'atualizadoEm'], ['Atualizado por', 'atualizadoPor'],
  ];
  const pag = { nao: 'Não pago', parcial: 'Sinal pago', pago: 'Pago' };
  const fmt = (k, v) => {
    if (k === 'status') return ETAPAS[v] || v;
    if (k === 'prioridade') return PRIORIDADES[v] || v;
    if (k === 'pagamento') return pag[v] || v;
    if (k === 'prazoTipo') return v === 'prevista' ? 'Prevista' : v ? 'Confirmada' : '';
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

$('#formNome').addEventListener('submit', e => {
  e.preventDefault();
  try { localStorage.setItem('cp_nome', e.target.nome.value.trim()); } catch {}
  toast('Nome salvo');
});

function linkEquipe() { return `${location.origin}${location.pathname}#k=${estado.chave}`; }
$('#copiarLink').addEventListener('click', async () => {
  const link = linkEquipe();
  try {
    if (navigator.share) { await navigator.share({ title: 'Produção', url: link }); return; }
    await navigator.clipboard.writeText(link);
    toast('Link copiado');
  } catch (err) {
    if (err?.name !== 'AbortError') prompt('Copie o link da equipe:', link);
  }
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
      err => toast(err?.code === 'permission-denied' ? 'Link da equipe inválido. Abra o app pelo link correto.' : 'Erro ao carregar pedidos')),
    estado.store.onConfig(cfg => { estado.config = cfg; render(); }),
    ...kits.conectar(),
  ];
}

function mostrarApp() {
  $('#semChave').hidden = true; $('#app').hidden = false;
  let area = 'producao';
  try { area = localStorage.getItem('cp_area') || 'producao'; } catch {}
  irPara(area);
}

async function iniciar() {
  const cfg = window.FIREBASE_CONFIG;

  if (!cfg || !cfg.apiKey) {
    estado.store = criarStoreLocal();
    $('#avisoLocal').hidden = false;
    mostrarApp();
    conectarDados();
    return;
  }

  // A chave vem no link (#k=...). Fica guardada no aparelho e continua no endereço,
  // para o app instalado na tela inicial do iPhone também abrir com ela.
  const daUrl = new URLSearchParams(location.hash.slice(1)).get('k');
  let chave = daUrl;
  try {
    if (daUrl) localStorage.setItem('cp_chave', daUrl);
    else chave = localStorage.getItem('cp_chave');
  } catch {}
  if (!chave) { $('#app').hidden = true; $('#semChave').hidden = false; return; }
  estado.chave = chave;
  if (!daUrl) history.replaceState(null, '', `#k=${chave}`);

  try {
    estado.store = await criarStoreFirebase(cfg, chave);
  } catch (err) {
    console.error(err);
    estado.store = criarStoreLocal();
    $('#avisoLocal').hidden = false;
    $('#avisoLocal').textContent = 'Não foi possível conectar à nuvem agora. Verifique a internet e abra o app de novo.';
    mostrarApp(); conectarDados();
    return;
  }
  estado.store._onErro = err => toast(err?.code === 'permission-denied' ? 'Link da equipe inválido. Abra o app pelo link correto.' : 'Erro ao salvar na nuvem');
  mostrarApp();
  conectarDados();
}

// atualiza "em X dias" quando o dia vira com o app aberto
setInterval(() => { if (!$('#app').hidden) render(); }, 60 * 60 * 1000);

iniciar();
