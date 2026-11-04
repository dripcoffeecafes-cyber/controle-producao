// Custos: ficha técnica em cascata para precificar qualquer produto que a equipe monta.
// Insumos (o que se compra) + Processos (o que se faz) formam Produtos; um produto pode entrar em outro
// (café torrado → drip → box). Mudou o preço de um insumo, tudo acima recalcula na hora.
// Preço de venda por canal: preço = custo ÷ (1 − imposto − cartão − frete − comissão − margem).
// Coleções em equipes/{chave}/: custos_insumos, custos_processos, custos_produtos, custos_canais.
// Tudo aqui é só da equipe: custo nunca vai para o catálogo público nem para a página do cliente.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = v => brl.format(Number(v) || 0);
// custo unitário pode ser centavos de centavo (1 g de café): mostra até 4 casas quando precisa
const dinheiroFino = v => {
  const n = Number(v) || 0;
  if (n && Math.abs(n) < 0.1) return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return brl.format(n);
};
const pct = v => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const num = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
function lerNumero(txt) {
  if (txt == null) return 0;
  let s = String(txt).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
const paraCampo = n => (n || n === 0) && n !== '' ? String(n).replace('.', ',') : '';

export const UNIDADES = { g: 'grama (g)', ml: 'mililitro (ml)', un: 'unidade (un)' };
export const GRUPOS_INSUMO = ['Café', 'Embalagem', 'Material', 'Frete', 'Outro'];
export const TIPOS_PRODUTO = ['Café', 'Drip', 'Box', 'Kit', 'Outro'];
// Canais padrão (aparecem até a equipe editar; aí passam a vir do Firebase)
export const CANAIS_PADRAO = [
  { id: 'site', nome: 'Site / loja', imposto: 4, cartao: 3.9, frete: 0, comissao: 0, margem: 40 },
  { id: 'assinatura', nome: 'Assinatura', imposto: 4, cartao: 3.9, frete: 0, comissao: 0, margem: 35 },
  { id: 'atacado', nome: 'Atacado / corporativo', imposto: 4, cartao: 0, frete: 0, comissao: 0, margem: 25 },
];

// ---------------- Cálculo (puro, sem tela) ----------------
// insumo: { preco, rende, unidade, perda }  → custo por unidade de uso, já com a perda
export function custoInsumo(i) {
  const rende = Number(i.rende) || 0;
  if (!rende) return 0;
  const perda = Math.min(99, Math.max(0, Number(i.perda) || 0));
  return (Number(i.preco) || 0) / rende / (1 - perda / 100);
}
// processo: { custoHora, minutos, unidades } → custo por unidade produzida
export function custoProcesso(p) {
  const un = Number(p.unidades) || 1;
  return (Number(p.custoHora) || 0) / 60 * (Number(p.minutos) || 0) / un;
}
// produto: { componentes: [{ tipo: 'insumo'|'processo'|'produto', ref, qtd }], perda }
// Devolve o detalhe por componente e o total. "pilha" evita produto dentro dele mesmo.
export function custoProduto(prod, dados, pilha = []) {
  const linhas = [];
  let insumos = 0, processos = 0, subprodutos = 0;
  if (!prod || pilha.includes(prod.id)) return { linhas, insumos, processos, subprodutos, base: 0, total: 0, ciclo: true };
  for (const c of prod.componentes || []) {
    const qtd = Number(c.qtd) || 0;
    let nome = '?', unit = 0, unidade = '', faltando = false, ciclo = false;
    if (c.tipo === 'insumo') {
      const i = dados.insumos.find(x => x.id === c.ref);
      if (i) { nome = i.nome; unit = custoInsumo(i); unidade = i.unidade || 'un'; } else faltando = true;
    } else if (c.tipo === 'processo') {
      const p = dados.processos.find(x => x.id === c.ref);
      if (p) { nome = p.nome; unit = custoProcesso(p); unidade = 'un'; } else faltando = true;
    } else {
      const s = dados.produtos.find(x => x.id === c.ref);
      if (s) {
        nome = s.nome; unidade = 'un';
        const r = custoProduto(s, dados, [...pilha, prod.id]);
        unit = r.total; ciclo = r.ciclo;
      } else faltando = true;
    }
    const sub = unit * qtd;
    if (c.tipo === 'insumo') insumos += sub; else if (c.tipo === 'processo') processos += sub; else subprodutos += sub;
    linhas.push({ ...c, nome, unit, unidade, sub, faltando, ciclo });
  }
  const base = insumos + processos + subprodutos;
  const perda = Math.min(99, Math.max(0, Number(prod.perda) || 0));
  const total = base / (1 - perda / 100);
  return { linhas, insumos, processos, subprodutos, base, perda, total, ciclo: linhas.some(l => l.ciclo) };
}
// canal: { imposto, cartao, frete, comissao, margem } (todos em % do preço de venda)
export const variaveisCanal = c => ['imposto', 'cartao', 'frete', 'comissao'].reduce((s, k) => s + (Number(c[k]) || 0), 0);
export function precoSugerido(custo, canal) {
  const divisor = 1 - (variaveisCanal(canal) + (Number(canal.margem) || 0)) / 100;
  if (divisor <= 0) return null;
  return custo / divisor;
}
// quanto sobra de um preço praticado, depois do custo e das taxas do canal
export function resultadoDoPreco(preco, custo, canal) {
  const p = Number(preco) || 0;
  if (!p) return null;
  const taxas = p * variaveisCanal(canal) / 100;
  const lucro = p - taxas - custo;
  return { taxas, lucro, margem: lucro / p * 100, markup: custo ? p / custo : 0 };
}

export function criarCustos(ctx) {
  // ctx: { store: () => store, toast, quem }
  const D = { insumos: [], processos: [], produtos: [], canais: [], aba: 'produtos', busca: '', canalId: '' };
  const area = $('#areaCustos');
  const lista = $('#custosLista');

  const canais = () => D.canais.length ? D.canais : CANAIS_PADRAO;
  const canalAtual = () => canais().find(c => c.id === D.canalId) || canais()[0];
  const nomeAba = { produtos: 'produto', insumos: 'insumo', processos: 'processo', canais: 'canal' };
  const ordenar = (a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
  const bate = (t) => !D.busca.trim() || String(t).toLowerCase().includes(D.busca.trim().toLowerCase());

  // ---------------- Tela ----------------
  function render() {
    $$('#custosAbas button').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === D.aba));
    const fab = $('#novoCusto');
    fab.querySelector('span').textContent = `Novo ${nomeAba[D.aba]}`;
    $('#custosCanal').hidden = D.aba !== 'produtos';
    renderSeletorCanal();
    const f = { produtos: renderProdutos, insumos: renderInsumos, processos: renderProcessos, canais: renderCanais }[D.aba];
    lista.innerHTML = f();
  }

  function renderSeletorCanal() {
    const sel = $('#custosCanal');
    const atual = canalAtual();
    sel.innerHTML = canais().map(c => `<option value="${esc(c.id)}" ${c.id === atual.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  }

  function vazio(titulo, texto, acao) {
    return `<div class="vazio"><h2>${titulo}</h2><p>${texto}</p><button class="btn btn-primary" data-cacao="novo">${acao}</button></div>`;
  }

  function renderProdutos() {
    const itens = D.produtos.filter(p => bate(`${p.nome} ${p.tipo}`)).sort(ordenar);
    if (!D.produtos.length) return vazio('Nenhum produto ainda', 'Cadastre primeiro os insumos e os processos; depois monte a ficha de cada produto (café, drip, box).', 'Cadastrar produto');
    if (!itens.length) return '<div class="vazio"><h2>Nada encontrado</h2><p>Ajuste a busca.</p></div>';
    const canal = canalAtual();
    const grupos = {};
    itens.forEach(p => { (grupos[p.tipo || 'Outro'] ||= []).push(p); });
    return TIPOS_PRODUTO.filter(t => grupos[t]).map(t => `
      <p class="item-cat">${esc(t)}</p>
      <div class="custos-grade">${grupos[t].map(p => cartaoProduto(p, canal)).join('')}</div>`).join('');
  }

  function cartaoProduto(p, canal) {
    const r = custoProduto(p, D);
    const sug = precoSugerido(r.total, canal);
    const res = resultadoDoPreco(p.precoAtual, r.total, canal);
    const problemas = r.linhas.filter(l => l.faltando).length;
    const chips = [];
    if (r.ciclo) chips.push('<span class="chip atrasado">Produto dentro dele mesmo</span>');
    if (problemas) chips.push(`<span class="chip atrasado">${problemas} item apagado</span>`);
    if (!r.linhas.length) chips.push('<span class="chip prevista">Sem componentes</span>');
    if (res) {
      const cls = res.margem >= (Number(canal.margem) || 0) ? 'pago' : res.margem > 0 ? 'hoje' : 'atrasado';
      chips.push(`<span class="chip ${cls}">Hoje ${dinheiro(p.precoAtual)} · margem ${pct(res.margem)}</span>`);
    }
    return `
    <article class="comanda sem-pos custo-card" data-id="${esc(p.id)}">
      <div class="corpo">
        <div class="abrir" role="button" tabindex="0" data-cacao="editar" aria-label="Abrir ${esc(p.nome)}">
          <div class="cab"><span class="cliente">${esc(p.tipo || 'Produto')} · ${r.linhas.length} ${r.linhas.length === 1 ? 'componente' : 'componentes'}</span></div>
          <p class="descricao custo-nome">${esc(p.nome)}</p>
          <div class="custo-numeros">
            <div><span>Custo</span><strong>${dinheiro(r.total)}</strong></div>
            <div><span>Sugerido · ${esc(canal.nome)}</span><strong class="acento">${sug == null ? '—' : dinheiro(sug)}</strong></div>
          </div>
          <div class="chips">${chips.join('')}</div>
        </div>
      </div>
    </article>`;
  }

  function renderInsumos() {
    const itens = D.insumos.filter(i => bate(`${i.nome} ${i.grupo}`)).sort(ordenar);
    if (!D.insumos.length) return vazio('Nenhum insumo ainda', 'Insumo é tudo que você compra: café torrado, filtro de drip, envelope, caixa, etiqueta, frete.', 'Cadastrar insumo');
    if (!itens.length) return '<div class="vazio"><h2>Nada encontrado</h2><p>Ajuste a busca.</p></div>';
    const grupos = {};
    itens.forEach(i => { (grupos[i.grupo || 'Outro'] ||= []).push(i); });
    return `<div class="item-lista">${GRUPOS_INSUMO.filter(g => grupos[g]).map(g => `
      <p class="item-cat">${esc(g)}</p>
      ${grupos[g].map(i => `
        <button type="button" class="prod-linha custo-linha" data-id="${esc(i.id)}" data-cacao="editar">
          <span class="custo-linha-txt">
            <span class="item-nome">${esc(i.nome)}</span>
            <small>${dinheiro(i.preco)} rende ${num(i.rende)} ${esc(i.unidade || 'un')}${Number(i.perda) ? ` · perda ${pct(i.perda)}` : ''}</small>
          </span>
          <span class="custo-unit"><b>${dinheiroFino(custoInsumo(i))}</b><small>por ${esc(i.unidade || 'un')}</small></span>
        </button>`).join('')}`).join('')}</div>`;
  }

  function renderProcessos() {
    const itens = D.processos.filter(p => bate(p.nome)).sort(ordenar);
    if (!D.processos.length) return vazio('Nenhum processo ainda', 'Processo é o trabalho da equipe: envasar drips, selar, moer, montar a box. Informe o custo da hora e quanto tempo leva por lote.', 'Cadastrar processo');
    if (!itens.length) return '<div class="vazio"><h2>Nada encontrado</h2><p>Ajuste a busca.</p></div>';
    return `<div class="item-lista">${itens.map(p => `
      <button type="button" class="prod-linha custo-linha" data-id="${esc(p.id)}" data-cacao="editar">
        <span class="custo-linha-txt">
          <span class="item-nome">${esc(p.nome)}</span>
          <small>${dinheiro(p.custoHora)}/h · ${num(p.minutos)} min para ${num(p.unidades || 1)} un</small>
        </span>
        <span class="custo-unit"><b>${dinheiroFino(custoProcesso(p))}</b><small>por un</small></span>
      </button>`).join('')}</div>`;
  }

  function renderCanais() {
    const lista = canais();
    const aviso = D.canais.length ? '' : '<p class="muted custos-aviso">Estes são os canais padrão. Toque num canal para ajustar as taxas e a margem; a partir daí ficam salvos para toda a equipe.</p>';
    return aviso + `<div class="item-lista">${lista.map(c => `
      <button type="button" class="prod-linha custo-linha" data-id="${esc(c.id)}" data-cacao="editar">
        <span class="custo-linha-txt">
          <span class="item-nome">${esc(c.nome)}</span>
          <small>Imposto ${pct(c.imposto)} · cartão ${pct(c.cartao)}${Number(c.frete) ? ` · frete ${pct(c.frete)}` : ''}${Number(c.comissao) ? ` · comissão ${pct(c.comissao)}` : ''}</small>
        </span>
        <span class="custo-unit"><b>${pct(c.margem)}</b><small>margem</small></span>
      </button>`).join('')}</div>
      <p class="muted custos-aviso">A margem é sobre o preço de venda (o que sobra depois do custo e das taxas), não sobre o custo. Preço sugerido = custo ÷ (1 − taxas − margem).</p>`;
  }

  // ---------------- Salvar ----------------
  const colecao = { produtos: 'custos_produtos', insumos: 'custos_insumos', processos: 'custos_processos', canais: 'custos_canais' };
  async function salvar(aba, d, msg) {
    d.atualizadoEm = new Date().toISOString();
    d.atualizadoPor = ctx.quem();
    await ctx.store().salvarDoc(colecao[aba], d);
    if (msg) ctx.toast(msg);
  }
  async function excluir(aba, d) {
    await ctx.store().excluirDoc(colecao[aba], d.id);
    ctx.toast(`${d.nome} excluído`, { texto: 'Desfazer', fn: () => ctx.store().salvarDoc(colecao[aba], d) });
  }
  // Ao editar um canal padrão pela primeira vez, grava todos os padrões (senão os outros sumiriam da lista)
  async function garantirCanais() {
    if (D.canais.length) return;
    for (const c of CANAIS_PADRAO) await ctx.store().salvarDoc('custos_canais', { ...c });
  }

  // ---------------- Formulários simples: insumo, processo, canal ----------------
  const dlgInsumo = $('#dlgInsumo'), fIns = $('#formInsumo');
  const dlgProc = $('#dlgProcesso'), fProc = $('#formProcesso');
  const dlgCanal = $('#dlgCanal'), fCan = $('#formCanal');
  let editando = null;

  fIns.grupo.innerHTML = GRUPOS_INSUMO.map(g => `<option>${g}</option>`).join('');
  fIns.unidade.innerHTML = Object.entries(UNIDADES).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');

  function abrirInsumo(i) {
    editando = i || null;
    fIns.reset();
    $('#insumoTitulo').textContent = i ? 'Editar insumo' : 'Novo insumo';
    $('#excluirInsumo').hidden = !i;
    $('#insumoErro').textContent = '';
    const d = i || { grupo: 'Café', unidade: 'g' };
    fIns.nome.value = d.nome || '';
    fIns.grupo.value = d.grupo || 'Outro';
    fIns.preco.value = paraCampo(d.preco);
    fIns.rende.value = paraCampo(d.rende);
    fIns.unidade.value = d.unidade || 'un';
    fIns.perda.value = paraCampo(d.perda);
    fIns.obs.value = d.obs || '';
    previaInsumo();
    dlgInsumo.showModal();
    if (!i) fIns.nome.focus();
  }
  function previaInsumo() {
    const i = { preco: lerNumero(fIns.preco.value), rende: lerNumero(fIns.rende.value), perda: lerNumero(fIns.perda.value) };
    const c = custoInsumo(i);
    $('#insumoPrevia').innerHTML = c
      ? `Custo por ${esc(fIns.unidade.value)}: <b>${dinheiroFino(c)}</b>${i.perda ? ` <span class="muted-inline">(já com ${pct(i.perda)} de perda)</span>` : ''}`
      : 'Preencha o preço e o rendimento para ver o custo por unidade.';
  }
  fIns.addEventListener('input', previaInsumo);
  fIns.addEventListener('change', previaInsumo);
  fIns.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = fIns.nome.value.trim();
    const preco = lerNumero(fIns.preco.value), rende = lerNumero(fIns.rende.value);
    if (!nome) { $('#insumoErro').textContent = 'Dê um nome ao insumo.'; fIns.nome.focus(); return; }
    if (!rende) { $('#insumoErro').textContent = 'Informe quanto rende (ex.: 1000 g, 100 un).'; fIns.rende.focus(); return; }
    const d = {
      ...(editando || {}), id: editando?.id || novoId(), nome, grupo: fIns.grupo.value, preco, rende,
      unidade: fIns.unidade.value, perda: lerNumero(fIns.perda.value), obs: fIns.obs.value.trim(),
      criadoEm: editando?.criadoEm || new Date().toISOString(), criadoPor: editando?.criadoPor || ctx.quem(),
    };
    dlgInsumo.close();
    await salvar('insumos', d, editando ? 'Insumo salvo' : 'Insumo cadastrado');
  });
  $('#excluirInsumo').addEventListener('click', async () => {
    const usado = D.produtos.filter(p => (p.componentes || []).some(c => c.tipo === 'insumo' && c.ref === editando.id));
    if (usado.length && !confirm(`${editando.nome} entra em ${usado.length} produto(s): ${usado.map(p => p.nome).join(', ')}. Excluir mesmo assim?`)) return;
    if (!usado.length && !confirm(`Excluir ${editando.nome}?`)) return;
    dlgInsumo.close();
    await excluir('insumos', editando);
  });

  function abrirProcesso(p) {
    editando = p || null;
    fProc.reset();
    $('#processoTitulo').textContent = p ? 'Editar processo' : 'Novo processo';
    $('#excluirProcesso').hidden = !p;
    $('#processoErro').textContent = '';
    const d = p || {};
    fProc.nome.value = d.nome || '';
    fProc.custoHora.value = paraCampo(d.custoHora);
    fProc.minutos.value = paraCampo(d.minutos);
    fProc.unidades.value = paraCampo(d.unidades);
    fProc.obs.value = d.obs || '';
    previaProcesso();
    dlgProc.showModal();
    if (!p) fProc.nome.focus();
  }
  function previaProcesso() {
    const c = custoProcesso({ custoHora: lerNumero(fProc.custoHora.value), minutos: lerNumero(fProc.minutos.value), unidades: lerNumero(fProc.unidades.value) });
    $('#processoPrevia').innerHTML = c ? `Custo por unidade: <b>${dinheiroFino(c)}</b>` : 'Preencha o custo da hora, os minutos e as unidades por lote.';
  }
  fProc.addEventListener('input', previaProcesso);
  fProc.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = fProc.nome.value.trim();
    if (!nome) { $('#processoErro').textContent = 'Dê um nome ao processo.'; fProc.nome.focus(); return; }
    const d = {
      ...(editando || {}), id: editando?.id || novoId(), nome,
      custoHora: lerNumero(fProc.custoHora.value), minutos: lerNumero(fProc.minutos.value), unidades: lerNumero(fProc.unidades.value) || 1,
      obs: fProc.obs.value.trim(),
      criadoEm: editando?.criadoEm || new Date().toISOString(), criadoPor: editando?.criadoPor || ctx.quem(),
    };
    dlgProc.close();
    await salvar('processos', d, editando ? 'Processo salvo' : 'Processo cadastrado');
  });
  $('#excluirProcesso').addEventListener('click', async () => {
    if (!confirm(`Excluir ${editando.nome}?`)) return;
    dlgProc.close();
    await excluir('processos', editando);
  });

  function abrirCanal(c) {
    editando = c || null;
    fCan.reset();
    $('#canalTitulo').textContent = c ? 'Editar canal' : 'Novo canal';
    $('#excluirCanal').hidden = !c || canais().length <= 1;
    $('#canalErro').textContent = '';
    const d = c || { imposto: 4, cartao: 3.9, frete: 0, comissao: 0, margem: 35 };
    fCan.nome.value = d.nome || '';
    ['imposto', 'cartao', 'frete', 'comissao', 'margem'].forEach(k => { fCan[k].value = paraCampo(d[k]); });
    previaCanal();
    dlgCanal.showModal();
    if (!c) fCan.nome.focus();
  }
  function lerCanal() {
    const c = {};
    ['imposto', 'cartao', 'frete', 'comissao', 'margem'].forEach(k => { c[k] = lerNumero(fCan[k].value); });
    return c;
  }
  function previaCanal() {
    const c = lerCanal();
    const sug = precoSugerido(100, c);
    $('#canalPrevia').innerHTML = sug == null
      ? '<span class="erro-inline">Taxas + margem chegam a 100% ou mais: assim não existe preço.</span>'
      : `Exemplo: um produto que custa <b>R$ 100</b> sai por <b>${dinheiro(sug)}</b> neste canal (markup ${num(sug / 100)}×).`;
  }
  fCan.addEventListener('input', previaCanal);
  fCan.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = fCan.nome.value.trim();
    if (!nome) { $('#canalErro').textContent = 'Dê um nome ao canal.'; fCan.nome.focus(); return; }
    const c = lerCanal();
    if (precoSugerido(100, c) == null) { $('#canalErro').textContent = 'Taxas + margem precisam somar menos de 100%.'; return; }
    await garantirCanais();
    const d = { ...(editando || {}), id: editando?.id || novoId(), nome, ...c };
    dlgCanal.close();
    await salvar('canais', d, editando ? 'Canal salvo' : 'Canal cadastrado');
  });
  $('#excluirCanal').addEventListener('click', async () => {
    if (!confirm(`Excluir o canal ${editando.nome}?`)) return;
    await garantirCanais();
    dlgCanal.close();
    await excluir('canais', editando);
  });

  // ---------------- Formulário do produto (ficha técnica) ----------------
  const dlgProd = $('#dlgProdutoCusto'), fProd = $('#formProdutoCusto');
  let rascunho = null; // { componentes: [...] } enquanto edita
  fProd.tipo.innerHTML = TIPOS_PRODUTO.map(t => `<option>${t}</option>`).join('');

  function abrirProduto(p) {
    editando = p || null;
    fProd.reset();
    $('#produtoCustoTitulo').textContent = p ? 'Editar ficha' : 'Nova ficha de produto';
    $('#excluirProdutoCusto').hidden = !p;
    $('#produtoCustoErro').textContent = '';
    const d = p || { tipo: 'Café' };
    fProd.nome.value = d.nome || '';
    fProd.tipo.value = d.tipo || 'Outro';
    fProd.perda.value = paraCampo(d.perda);
    fProd.precoAtual.value = paraCampo(d.precoAtual);
    fProd.obs.value = d.obs || '';
    rascunho = { id: d.id || '__novo__', componentes: (d.componentes || []).map(c => ({ ...c })) };
    preencherOpcoesComponente();
    renderComponentes();
    dlgProd.showModal();
    if (!p) fProd.nome.focus();
  }

  function preencherOpcoesComponente() {
    const sel = $('#compRef');
    const tipo = $('#compTipo').value;
    const fonte = tipo === 'insumo' ? D.insumos : tipo === 'processo' ? D.processos : D.produtos.filter(p => p.id !== rascunho.id);
    const rotulo = x => tipo === 'insumo' ? `${x.nome} (${dinheiroFino(custoInsumo(x))}/${x.unidade || 'un'})`
      : tipo === 'processo' ? `${x.nome} (${dinheiroFino(custoProcesso(x))}/un)`
      : `${x.nome} (${dinheiro(custoProduto(x, D).total)}/un)`;
    sel.innerHTML = fonte.length
      ? [...fonte].sort(ordenar).map(x => `<option value="${esc(x.id)}">${esc(rotulo(x))}</option>`).join('')
      : `<option value="">Nenhum ${tipo} cadastrado</option>`;
    $('#compQtd').placeholder = tipo === 'insumo' ? 'Qtd' : 'Qtd';
    $('#compUnidade').textContent = tipo === 'insumo' ? (fonte.find(x => x.id === sel.value)?.unidade || '') : 'un';
  }
  $('#compTipo').addEventListener('change', preencherOpcoesComponente);
  $('#compRef').addEventListener('change', () => {
    if ($('#compTipo').value === 'insumo') $('#compUnidade').textContent = D.insumos.find(x => x.id === $('#compRef').value)?.unidade || '';
  });
  $('#compAdd').addEventListener('click', () => {
    const tipo = $('#compTipo').value, ref = $('#compRef').value, qtd = lerNumero($('#compQtd').value);
    if (!ref) return;
    if (!qtd) { $('#compQtd').focus(); return; }
    const ja = rascunho.componentes.find(c => c.tipo === tipo && c.ref === ref);
    if (ja) ja.qtd = Number(ja.qtd) + qtd; else rascunho.componentes.push({ tipo, ref, qtd });
    $('#compQtd').value = '';
    renderComponentes();
  });
  $('#compQtd').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#compAdd').click(); } });

  function produtoDoForm() {
    return {
      id: rascunho.id, nome: fProd.nome.value.trim(), tipo: fProd.tipo.value,
      componentes: rascunho.componentes, perda: lerNumero(fProd.perda.value), precoAtual: lerNumero(fProd.precoAtual.value),
    };
  }

  function renderComponentes() {
    const p = produtoDoForm();
    const r = custoProduto(p, D);
    const tipoNome = { insumo: 'Insumo', processo: 'Processo', produto: 'Produto' };
    $('#compLista').innerHTML = r.linhas.length ? r.linhas.map((l, i) => `
      <li class="comp-linha ${l.faltando || l.ciclo ? 'comp-erro' : ''}" data-i="${i}">
        <span class="comp-txt">
          <span class="comp-nome">${esc(l.nome)}${l.faltando ? ' (apagado)' : ''}${l.ciclo ? ' (produto dentro dele mesmo)' : ''}</span>
          <small>${tipoNome[l.tipo]} · ${dinheiroFino(l.unit)} por ${esc(l.unidade || 'un')}</small>
        </span>
        <span class="comp-qtd"><input type="text" inputmode="decimal" value="${esc(paraCampo(l.qtd))}" aria-label="Quantidade de ${esc(l.nome)}" data-comp="qtd"><small>${esc(l.unidade || 'un')}</small></span>
        <b class="comp-sub">${dinheiro(l.sub)}</b>
        <button type="button" class="icon-btn comp-remover" data-comp="remover" aria-label="Tirar ${esc(l.nome)}">×</button>
      </li>`).join('') : '<li class="comp-vazio">Adicione os insumos, processos e produtos que compõem este item.</li>';
    renderResumoProduto(p, r);
  }
  $('#compLista').addEventListener('input', e => {
    if (e.target.dataset.comp !== 'qtd') return;
    const i = Number(e.target.closest('[data-i]').dataset.i);
    rascunho.componentes[i].qtd = lerNumero(e.target.value);
    const p = produtoDoForm(), r = custoProduto(p, D);
    e.target.closest('.comp-linha').querySelector('.comp-sub').textContent = dinheiro(r.linhas[i].sub);
    renderResumoProduto(p, r);
  });
  $('#compLista').addEventListener('click', e => {
    const b = e.target.closest('[data-comp="remover"]'); if (!b) return;
    rascunho.componentes.splice(Number(b.closest('[data-i]').dataset.i), 1);
    renderComponentes();
  });
  fProd.perda.addEventListener('input', () => { const p = produtoDoForm(); renderResumoProduto(p, custoProduto(p, D)); });
  fProd.precoAtual.addEventListener('input', () => { const p = produtoDoForm(); renderResumoProduto(p, custoProduto(p, D)); });

  function renderResumoProduto(p, r) {
    const linhas = [];
    if (r.insumos) linhas.push(['Insumos', dinheiro(r.insumos)]);
    if (r.processos) linhas.push(['Processos', dinheiro(r.processos)]);
    if (r.subprodutos) linhas.push(['Outros produtos', dinheiro(r.subprodutos)]);
    if (r.perda) linhas.push([`Perda no processo (${pct(r.perda)})`, dinheiro(r.total - r.base)]);
    $('#produtoCustoResumo').innerHTML = `
      ${linhas.map(([k, v]) => `<div class="pc-linha"><span>${k}</span><span>${v}</span></div>`).join('')}
      <div class="pc-linha pc-total"><span>Custo por unidade</span><strong>${dinheiro(r.total)}</strong></div>`;
    $('#produtoCustoCanais').innerHTML = canais().map(c => {
      const sug = precoSugerido(r.total, c);
      const res = resultadoDoPreco(p.precoAtual, r.total, c);
      const cls = !res ? '' : res.margem >= (Number(c.margem) || 0) ? 'ok' : res.margem > 0 ? 'meio' : 'baixa';
      return `<div class="pc-canal">
        <div class="pc-canal-nome">${esc(c.nome)}<small>taxas ${pct(variaveisCanal(c))} · margem ${pct(c.margem)}</small></div>
        <div class="pc-canal-preco"><strong>${sug == null ? '—' : dinheiro(sug)}</strong><small>sugerido${sug != null && r.total ? ` · ${num(sug / r.total)}×` : ''}</small></div>
        <div class="pc-canal-hoje ${cls}">${res ? `<strong>${pct(res.margem)}</strong><small>no preço de hoje</small>` : '<small>sem preço de hoje</small>'}</div>
      </div>`;
    }).join('');
  }

  fProd.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = fProd.nome.value.trim();
    if (!nome) { $('#produtoCustoErro').textContent = 'Dê um nome ao produto.'; fProd.nome.focus(); return; }
    const comps = rascunho.componentes.filter(c => Number(c.qtd) > 0).map(c => ({ tipo: c.tipo, ref: c.ref, qtd: Number(c.qtd) }));
    const d = {
      ...(editando || {}), id: editando?.id || novoId(), nome, tipo: fProd.tipo.value, componentes: comps,
      perda: lerNumero(fProd.perda.value), precoAtual: lerNumero(fProd.precoAtual.value), obs: fProd.obs.value.trim(),
      criadoEm: editando?.criadoEm || new Date().toISOString(), criadoPor: editando?.criadoPor || ctx.quem(),
    };
    dlgProd.close();
    await salvar('produtos', d, editando ? 'Ficha salva' : 'Produto cadastrado');
  });
  $('#excluirProdutoCusto').addEventListener('click', async () => {
    const usado = D.produtos.filter(p => (p.componentes || []).some(c => c.tipo === 'produto' && c.ref === editando.id));
    if (usado.length && !confirm(`${editando.nome} entra em: ${usado.map(p => p.nome).join(', ')}. Excluir mesmo assim?`)) return;
    if (!usado.length && !confirm(`Excluir a ficha de ${editando.nome}?`)) return;
    dlgProd.close();
    await excluir('produtos', editando);
  });

  // ---------------- Cliques ----------------
  function abrirNovo() {
    ({ produtos: abrirProduto, insumos: abrirInsumo, processos: abrirProcesso, canais: abrirCanal })[D.aba]();
  }
  area.addEventListener('click', e => {
    const alvo = e.target.closest('[data-cacao]');
    if (!alvo) return;
    if (alvo.dataset.cacao === 'novo') return abrirNovo();
    const id = alvo.closest('[data-id]')?.dataset.id;
    if (D.aba === 'produtos') abrirProduto(D.produtos.find(x => x.id === id));
    if (D.aba === 'insumos') abrirInsumo(D.insumos.find(x => x.id === id));
    if (D.aba === 'processos') abrirProcesso(D.processos.find(x => x.id === id));
    if (D.aba === 'canais') abrirCanal(canais().find(x => x.id === id));
  });
  area.addEventListener('keydown', e => {
    const alvo = e.target.closest?.('.abrir');
    if (alvo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alvo.click(); }
  });
  $('#novoCusto').addEventListener('click', abrirNovo);
  $$('#custosAbas button').forEach(b => b.addEventListener('click', () => { D.aba = b.dataset.aba; render(); window.scrollTo({ top: 0 }); }));
  $('#custosBusca').addEventListener('input', e => { D.busca = e.target.value; render(); });
  $('#custosCanal').addEventListener('change', e => { D.canalId = e.target.value; render(); });

  // ---------------- Dados ----------------
  function conectar() {
    const st = ctx.store();
    if (!st.onColecao) return [];
    const erro = () => ctx.toast('Erro ao carregar os custos');
    return [
      st.onColecao('custos_insumos', l => { D.insumos = l; render(); }, erro),
      st.onColecao('custos_processos', l => { D.processos = l; render(); }, erro),
      st.onColecao('custos_produtos', l => { D.produtos = l; render(); }, erro),
      st.onColecao('custos_canais', l => { D.canais = l; render(); }, erro),
    ];
  }

  return { render, conectar };
}
