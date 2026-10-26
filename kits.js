// Kits de presente: a caixa (produto da categoria Caixas) traz a foto do item e a foto principal do orçamento.
// Depois escolhemos os produtos que vão dentro, e o app gera a imagem 3:4 para o cliente.
// Os preços ficam na caixa e nos produtos; o valor do kit é calculado na hora.
// Tudo fica na coleção "itens". A caixa só ganha o campo fotoPrincipal; os documentos existentes não são alterados.
// A coleção antiga "caixas" só é lida, para reaproveitar as fotos já cadastradas nela.

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = v => brl.format(Number(v) || 0);
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const arred = n => Math.round(n * 100) / 100;

function lerNumero(txt) {
  if (txt == null) return 0;
  let s = String(txt).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? arred(n) : 0;
}
const paraCampo = n => (n ? String(n).replace('.', ',') : '');
const precoCampo = n => (n ? Number(n).toFixed(2).replace('.', ',') : '');

// Categorias fixas. Um produto na categoria Caixas é a caixa do kit (escolhida no passo 1).
const CAIXAS = 'Caixas';
const CATEGORIAS = ['Cafés', 'Acessórios', 'Xícaras', CAIXAS];
// "Outros" passou a se chamar Caixas. Só muda o nome mostrado: o documento salvo continua igual até alguém editá-lo.
// Drip vira Cafés; qualquer outra categoria antiga (Outros, Embalagem…) aparece em Caixas.
const categoriaDe = c => CATEGORIAS.includes(c) ? c : (c === 'Drip' ? 'Cafés' : CAIXAS);
const ehCaixa = i => categoriaDe(i?.categoria) === CAIXAS;
const ordemCategoria = c => CATEGORIAS.indexOf(categoriaDe(c));
// Regra dos cafés: se os cafés do kit somam menos de R$ 120, o valor do kit sobe 10%.
// Com R$ 120 ou mais em cafés, vale o preço cadastrado de cada item. Kit sem café também leva o acréscimo.
const LIMITE_CAFES = 120;
const ACRESCIMO_CAFES = 10;
const TITULO_KIT = 'Kit Blooming Club Cafés';

// Lista de partida: só nomes e categorias. Preços zerados para a equipe preencher.
const EXEMPLO_ITENS = [
  ['Café especial 250g', 'Cafés'],
  ['Drip coffee (unidade)', 'Cafés'],
  ['Moedor manual', 'Acessórios'],
  ['Coador V60', 'Acessórios'],
  ['Xícara de cerâmica', 'Xícaras'],
  ['Xícara artesanal Blooming', 'Xícaras'],
];
// Caixas de partida: nomes provisórios para renomear, com fotos e preço a definir
const EXEMPLO_CAIXAS = ['Caixa premium preta', 'Caixa premium branca', 'Caixa padrão 1', 'Caixa padrão 2', 'Caixa padrão 3', 'Caixa padrão 4'];

export function criarKits(ctx) {
  // ctx: { store: () => store, toast, quem, abrirPedido(preencher, extra), aoMudar() }
  const k = {
    itens: [],
    caixasAntigas: [],    // coleção antiga "caixas" (só leitura, para reaproveitar fotos)
    caixaId: null,        // caixa escolhida no montador
    qtd: {},              // itemId -> quantidade
    editando: null,       // produto aberto no formulário
    fotoItem: '', fotoPrincipal: '',
    imagem: null,         // { blob, url, nome }
    contato: '',          // WhatsApp do lead que originou o orçamento (vai para o pedido)
  };

  const areaOrcar = $('#areaOrcar');
  const orcando = () => !areaOrcar.hidden;
  const dlgItem = $('#dlgItem');
  const dlgImagem = $('#dlgImagem');
  const formItem = $('#formItem');

  // ---------------- Cálculos ----------------
  const acharItem = id => k.itens.find(i => i.id === id);
  const acharCaixa = id => k.itens.find(i => i.id === id && ehCaixa(i));
  const caixaAtual = () => acharCaixa(k.caixaId);
  const caixasOrdenadas = () => k.itens.filter(ehCaixa).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const nomeCaixa = c => (c ? c.nome : '');

  function itensOrdenados() {
    return [...k.itens].sort((a, b) =>
      ordemCategoria(a.categoria) - ordemCategoria(b.categoria) ||
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }

  function linhas() {
    return itensOrdenados()
      .filter(i => !ehCaixa(i) && (k.qtd[i.id] || 0) > 0)
      .map(i => ({ id: i.id, nome: i.nome, categoria: categoriaDe(i.categoria), foto: i.foto || '', qtd: k.qtd[i.id], preco: Number(i.preco) || 0, custo: Number(i.custo) || 0, temCusto: Number(i.custo) > 0 }));
  }

  // percentuais do dia (só para a equipe): ficam guardados no aparelho para não digitar toda vez
  const pct = sel => Math.min(100, Math.max(0, lerNumero($(sel).value)));
  const imposto = () => pct('#kitImposto');
  const cartao = () => pct('#kitCartao');

  const qtdKits = () => Math.max(1, Math.round(lerNumero($('#kitQtd').value)) || 1);
  const desconto = () => Math.min(100, Math.max(0, lerNumero($('#kitDesconto').value)));

  function totais() {
    const ls = linhas();
    const cx = caixaAtual();
    const cxPreco = Number(cx?.preco) || 0, cxCusto = Number(cx?.custo) || 0;
    const base = arred(ls.reduce((s, l) => s + l.preco * l.qtd, 0) + cxPreco);
    // Regra dos cafés: soma dos cafés (preço × quantidade) abaixo do limite → +10% sobre o valor calculado
    const cafes = arred(ls.filter(l => l.categoria === 'Cafés').reduce((s, l) => s + l.preco * l.qtd, 0));
    const acrescimo = cafes < LIMITE_CAFES ? ACRESCIMO_CAFES : 0;
    const preco = arred(base * (1 + acrescimo / 100));
    const custo = arred(ls.reduce((s, l) => s + l.custo * l.qtd, 0) + cxCusto);
    const n = qtdKits(), d = desconto();
    const porKit = arred(preco * (1 - d / 100));
    // margem (só para a equipe): venda por kit − custo − imposto − taxa do cartão, sobre a venda por kit
    const imp = imposto(), car = cartao();
    const impValor = arred(porKit * imp / 100), carValor = arred(porKit * car / 100);
    const lucro = arred(porKit - custo - impValor - carValor);
    const semCusto = ls.filter(l => !l.temCusto).length + (cx && cxPreco && !(cxCusto > 0) ? 1 : 0);
    return {
      ls, base, cafes, acrescimo, preco, custo, n, d, porKit, total: arred(porKit * n),
      imp, car, impValor, carValor, lucro, semCusto, margem: porKit > 0 ? lucro / porKit : 0,
      cx, semPreco: ls.filter(l => !l.preco).length + (cx && !cxPreco ? 1 : 0),
      custoCompleto: ls.length > 0 && ls.every(l => l.temCusto) && (!cx || !cxPreco || cxCusto > 0),
    };
  }

  // ---------------- Tela "Kits" ----------------
  const ICONE_FOTO = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M4 7.5h3.2L8.8 5h6.4l1.6 2.5H20V19H4z"/><circle cx="12" cy="12.8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const miniatura = (foto, nome, cls = 'mini') => foto
    ? `<img class="${cls}" src="${esc(foto)}" alt="" loading="lazy">`
    : `<span class="${cls} ${cls}-vazia" aria-hidden="true">${esc((nome || '?').trim().charAt(0).toUpperCase())}</span>`;

  function linhaProduto(d) {
    const sinal = ehCaixa(d) && !d.fotoPrincipal ? '<span class="prod-aviso">sem foto principal</span>' : '';
    return `
        <div class="prod-linha" data-iid="${esc(d.id)}">
          <button class="prod-abrir" data-kacao="editar-item" aria-label="Editar ${esc(d.nome)}">
            ${miniatura(d.foto, d.nome)}
            <span class="item-nome">${esc(d.nome)}${sinal}</span>
          </button>
          <label class="preco-rapido ${Number(d.preco) ? '' : 'sem'}">
            <span>R$</span><input inputmode="decimal" autocomplete="off" value="${precoCampo(d.preco)}" placeholder="0,00" aria-label="Preço de ${esc(d.nome)}">
          </label>
        </div>`;
  }

  function html() {
    if (!k.itens.length) {
      return `
      <section class="k-sec">
        <div class="k-sec-topo"><h2>Produtos e preços</h2></div>
        <div class="vazio kits-vazio">
          <p>Cadastre os produtos e as caixas que podem entrar nos kits, com foto e preço.</p>
          <div class="botoes-centro">
            <button class="btn btn-primary" data-kacao="exemplo">Começar com lista de exemplo</button>
            <button class="btn" data-kacao="novo-item">Cadastrar produto</button>
          </div>
        </div>
      </section>`;
    }
    const porCat = {};
    for (const i of itensOrdenados()) (porCat[categoriaDe(i.categoria)] ||= []).push(i);
    const grupos = CATEGORIAS.map(cat => `<h3 class="item-cat">${esc(cat)}</h3>${porCat[cat]?.length
      ? porCat[cat].map(linhaProduto).join('')
      : `<p class="muted prod-vazio">Nenhum produto em ${esc(cat)}.</p>`}`);
    return `
      <section class="k-sec">
        <div class="k-sec-topo">
          <h2>Produtos e preços</h2>
          <button class="btn btn-sm" data-kacao="novo-item">+ Produto</button>
        </div>
        <p class="muted">Toque no preço para atualizar. Toque no produto para mudar foto, nome, categoria ou custo. As caixas têm duas fotos: a do item e a principal do orçamento.</p>
        <div class="item-lista">${grupos.join('')}</div>
      </section>`;
  }

  // preço editado direto na lista
  document.addEventListener('change', async e => {
    const input = e.target.closest?.('.preco-rapido input');
    if (!input) return;
    const item = acharItem(input.closest('[data-iid]')?.dataset.iid);
    if (!item) return;
    const preco = lerNumero(input.value);
    if (preco === (Number(item.preco) || 0)) { input.value = precoCampo(preco); return; }
    await salvarDoc('itens', { ...item, preco }, `${item.nome}: ${dinheiro(preco)}`);
  });
  document.addEventListener('focusin', e => { if (e.target.closest?.('.preco-rapido input')) e.target.select(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.closest?.('.preco-rapido input')) e.target.blur();
  });

  // ---------------- Montador ----------------
  // Página "Orçar kit": desenha tudo (chamada ao entrar na área)
  function renderOrcar() {
    const falta = [];
    if (!caixasOrdenadas().length) falta.push('as caixas');
    if (!k.itens.some(i => !ehCaixa(i))) falta.push('os produtos');
    $('#orcarVazio').hidden = !falta.length;
    $('#orcarConteudo').hidden = !!falta.length;
    $('#orcarBarra').hidden = !!falta.length;
    if (falta.length) {
      $('#orcarVazio').innerHTML = `
        <div class="vazio kits-vazio">
          <h2>Falta pouco para orçar</h2>
          <p>Cadastre ${falta.join(' e ')} na área Produtos, com fotos e preços.</p>
          <div class="botoes-centro"><button class="btn btn-primary" data-kacao="ir-produtos">Ir para Produtos</button></div>
        </div>`;
      return;
    }
    if (!acharCaixa(k.caixaId)) k.caixaId = caixasOrdenadas()[0]?.id || null;
    renderCaixas(); renderAmostra(); renderItensDialogo(); renderTotal();
  }

  function limparMontador() {
    k.qtd = {};
    $('#kitQtd').value = '1';
    $('#kitDesconto').value = '';
    $('#kitCliente').value = '';
    k.contato = '';
  }

  // Vindo da aba Leads: começa um orçamento novo já com o nome e o WhatsApp do lead
  function comecarPara({ cliente, contato }) {
    limparMontador();
    $('#kitCliente').value = cliente || '';
    k.contato = contato || '';
  }

  function renderCaixas() {
    if (!caixasOrdenadas().length) {
      $('#kitCaixas').innerHTML = '<p class="muted">Cadastre as caixas na área Produtos.</p>';
      return;
    }
    $('#kitCaixas').innerHTML = `<div class="kc-grupo"><div class="kc-lista">${caixasOrdenadas().map(c => `
        <button type="button" class="kc" role="radio" data-kacao="escolher-caixa" data-cid="${esc(c.id)}" aria-checked="${c.id === k.caixaId}">
          ${miniatura(c.fotoPrincipal || c.foto, c.nome, 'kc-foto')}
          <span class="kc-nome">${esc(c.nome)}</span>
          <span class="kc-preco">${Number(c.preco) ? dinheiro(c.preco) : 'sem preço'}</span>
        </button>`).join('')}</div></div>`;
  }

  function renderAmostra() {
    const c = caixaAtual();
    if (!c) { $('#kitAmostra').innerHTML = ''; return; }
    $('#kitAmostra').innerHTML = c.fotoPrincipal
      ? `<img src="${esc(c.fotoPrincipal)}" alt="Foto do kit com ${esc(c.nome)}"><span class="selo">Imagem ilustrativa · ${esc(c.nome)}</span>`
      : `<button type="button" class="kit-amostra-vazia" data-kacao="editar-caixa-atual">${ICONE_FOTO}<span>Adicionar a foto principal da ${esc(c.nome)}</span></button>`;
  }

  function linhaItem(i) {
    const q = k.qtd[i.id] || 0;
    const preco = Number(i.preco) || 0;
    const detalhe = preco ? `${dinheiro(preco)}${q > 1 ? ` · ${q} = ${dinheiro(preco * q)}` : ''}` : '<em>sem preço</em>';
    return `
      <div class="kit-linha ${q ? 'on' : ''}" data-iid="${esc(i.id)}">
        ${miniatura(i.foto, i.nome)}
        <div class="kit-linha-txt">
          <span class="kit-linha-nome">${esc(i.nome)}</span>
          <span class="kit-linha-preco">${detalhe}</span>
        </div>
        <div class="stepper">
          <button type="button" data-kacao="passo" data-passo="-1" aria-label="Menos ${esc(i.nome)}" ${q ? '' : 'disabled'}>−</button>
          <input class="stepper-qtd" inputmode="numeric" value="${q}" aria-label="Quantidade de ${esc(i.nome)}">
          <button type="button" data-kacao="passo" data-passo="1" aria-label="Mais ${esc(i.nome)}">+</button>
        </div>
      </div>`;
  }

  function renderItensDialogo() {
    const lista = itensOrdenados().filter(i => !ehCaixa(i));
    if (!lista.length) {
      $('#kitItens').innerHTML = '<p class="muted">Cadastre os produtos na área Produtos para montar.</p>';
      return;
    }
    let catAtual = null;
    $('#kitItens').innerHTML = lista.map(i => {
      const cat = categoriaDe(i.categoria);
      const cab = cat !== catAtual ? `<h3 class="item-cat">${esc(cat)}</h3>` : '';
      catAtual = cat;
      return cab + linhaItem(i);
    }).join('');
  }

  function atualizarLinha(id) {
    const el = $(`.kit-linha[data-iid="${CSS.escape(id)}"]`, areaOrcar);
    const item = acharItem(id);
    if (!el || !item) return renderItensDialogo();
    const tmp = document.createElement('div');
    tmp.innerHTML = linhaItem(item);
    el.replaceWith(tmp.firstElementChild);
  }

  function renderTotal() {
    const t = totais();
    if (!t.ls.length && !t.cx) {
      $('#kitTotal').innerHTML = '<div class="kt-linha"><span>Escolha a caixa e os itens</span><strong class="kt-grande">R$ 0,00</strong></div>';
      return;
    }
    const detalhe = [];
    if (t.n > 1) detalhe.push(`${t.n} kits × ${dinheiro(t.porKit)}`);
    if (t.acrescimo) detalhe.push(`+${t.acrescimo}% (cafés < ${dinheiro(LIMITE_CAFES).replace(',00', '')})`);
    if (t.d) detalhe.push(`desc. ${String(t.d).replace('.', ',')}%`);
    // só para a equipe: custo, imposto, cartão, lucro e margem (nunca vai para a imagem do cliente)
    const chips = [];
    const temCusto = t.custo > 0;
    if (temCusto) chips.push(`<span class="kt-chip">Custo${t.semCusto ? ' parcial' : ''} <b>${dinheiro(t.custo)}</b></span>`);
    if (t.imp) chips.push(`<span class="kt-chip">Imposto ${String(t.imp).replace('.', ',')}% <b>${dinheiro(t.impValor)}</b></span>`);
    if (t.car) chips.push(`<span class="kt-chip">Cartão ${String(t.car).replace('.', ',')}% <b>${dinheiro(t.carValor)}</b></span>`);
    let custo = '';
    if (temCusto && !t.semCusto && t.porKit > 0) {
      const m = Math.round(t.margem * 100);
      chips.push(`<span class="kt-chip">Lucro <b class="${t.lucro < 0 ? 'baixa' : ''}">${dinheiro(t.lucro)}</b></span>`);
      chips.push(`<span class="kt-chip">Margem <b class="${m < 30 ? 'baixa' : 'ok'}">${m}%</b></span>`);
      if (t.n > 1) chips.push(`<span class="kt-chip">Lucro nos ${t.n} kits <b class="${t.lucro < 0 ? 'baixa' : ''}">${dinheiro(arred(t.lucro * t.n))}</b></span>`);
    } else if (temCusto && t.semCusto) {
      chips.push(`<span class="kt-chip kt-chip-aviso">Margem indisponível: falta o custo de ${t.semCusto} ${t.semCusto === 1 ? 'item' : 'itens'}</span>`);
    }
    if (chips.length) custo = `<div class="kt-equipe" aria-label="Só para a equipe, valores por kit">${chips.join('')}</div>`;
    const aviso = t.semPreco ? `<p class="kt-aviso">${t.semPreco} ${t.semPreco === 1 ? 'item está' : 'itens estão'} sem preço</p>` : '';
    $('#kitTotal').innerHTML = `
      <div class="kt-linha">
        <span>${detalhe.length ? esc(detalhe.join(' · ')) : 'Valor do kit'}</span>
        <strong class="kt-grande">${dinheiro(t.total)}</strong>
      </div>${custo}${aviso}`;
  }

  function mudarQtd(id, q) {
    q = Math.max(0, Math.min(9999, Math.round(q) || 0));
    if (q) k.qtd[id] = q; else delete k.qtd[id];
    atualizarLinha(id);
    renderTotal();
  }

  $('#kitItens').addEventListener('change', e => {
    if (!e.target.classList.contains('stepper-qtd')) return;
    const id = e.target.closest('.kit-linha')?.dataset.iid;
    if (id) mudarQtd(id, lerNumero(e.target.value));
  });
  $('#kitItens').addEventListener('focusin', e => { if (e.target.classList.contains('stepper-qtd')) e.target.select(); });
  $('#kitQtd').addEventListener('input', renderTotal);
  for (const [sel, chave] of [['#kitImposto', 'cp_imposto'], ['#kitCartao', 'cp_cartao']]) {
    try { $(sel).value = localStorage.getItem(chave) || ''; } catch {}
    $(sel).addEventListener('input', () => {
      try { localStorage.setItem(chave, $(sel).value.trim()); } catch {}
      renderTotal();
    });
    $(sel).addEventListener('focusin', e => e.target.select());
  }
  $('#kitDesconto').addEventListener('input', renderTotal);

  // ---------------- Texto (para colar no WhatsApp) ----------------
  function mensagem() {
    const t = totais();
    const cliente = $('#kitCliente').value.trim();
    const partes = [`*${TITULO_KIT}*${cliente ? ` para ${cliente}` : ''}`, t.cx ? nomeCaixa(t.cx) : '', ...t.ls.map(l => `• ${l.qtd}x ${l.nome}`), ''].filter((x, i) => x || i > 1);
    partes.push(t.d
      ? `Valor por kit: ~${dinheiro(t.preco)}~ ${dinheiro(t.porKit)} (${String(t.d).replace('.', ',')}% de desconto)`
      : `Valor por kit: ${dinheiro(t.porKit)}`);
    if (t.n > 1) partes.push(`Quantidade: ${t.n} kits`, `*Total: ${dinheiro(t.total)}*`);
    return partes.join('\n');
  }

  // ---------------- Imagem para o cliente ----------------
  const carregar = src => new Promise(ok => {
    if (!src) return ok(null);
    const i = new Image();
    i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src;
  });

  function cobrir(g, img, x, y, w, h) {
    const r = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / r, sh = h / r;
    g.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  function retangulo(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function quebrar(g, texto, larg) {
    const palavras = String(texto).split(/\s+/);
    const out = []; let linha = '';
    for (const p of palavras) {
      const teste = linha ? `${linha} ${p}` : p;
      if (g.measureText(teste).width > larg && linha) { out.push(linha); linha = p; } else linha = teste;
    }
    if (linha) out.push(linha);
    return out;
  }

  // Ícones do rodapé do orçamento: Instagram e WhatsApp (Simple Icons, CC0); globo e envelope (Lucide, ISC).
  const ICONES = {
    instagram: { tipo: 'preencher', d: 'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077' },
    whatsapp: { tipo: 'preencher', cor: '#25D366', d: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z' },
    globo: { tipo: 'tracar', cor: '#A8661F', ds: ['M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20', 'M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20'] },
    email: { tipo: 'tracar', cor: '#A8661F', ds: ['m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7', 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'] },
  };
  function icone(g, nome, x, y, tam) {
    const ic = ICONES[nome];
    g.save();
    g.translate(x, y); g.scale(tam / 24, tam / 24);
    if (ic.tipo === 'preencher') {
      if (nome === 'instagram') {   // degradê oficial do Instagram
        const gr = g.createLinearGradient(2, 22, 22, 2);
        [[0, '#FEDA75'], [0.25, '#FA7E1E'], [0.5, '#D62976'], [0.75, '#962FBF'], [1, '#4F5BD5']].forEach(([p, c]) => gr.addColorStop(p, c));
        g.fillStyle = gr;
      } else g.fillStyle = ic.cor;
      g.fill(new Path2D(ic.d));
    } else {
      g.strokeStyle = ic.cor; g.lineWidth = 2; g.lineCap = 'round'; g.lineJoin = 'round';
      ic.ds.forEach(d => g.stroke(new Path2D(d)));
    }
    g.restore();
  }

  // Imagem para o cliente, largura 1080. A foto principal (4:3, igual à foto do celular) tem tamanho fixo.
  // Os itens ficam em linhas de até 5 cartões: com mais itens, entra mais uma linha e a imagem cresce em altura.
  // Com poucos itens, a imagem tem 1080×1440 (3:4).
  async function gerarImagem() {
    const t = totais();
    const cx = t.cx;
    const cliente = $('#kitCliente').value.trim();
    const F = 'Archivo, system-ui, sans-serif';
    await Promise.all(['400', '600', '800'].map(w => document.fonts?.load(`${w} 32px Archivo`).catch(() => {})));
    const cards = [...(cx ? [{ nome: cx.nome, qtd: 1, foto: cx.foto || '' }] : []), ...t.ls];
    const [logo, foto, ...fotosCards] = await Promise.all([
      carregar('marca/logo-blooming-club.svg'), carregar(cx?.fotoPrincipal), ...cards.map(c => carregar(c.foto)),
    ]);

    const C = { fundo: '#F6F1EA', cartao: '#FFFFFF', tinta: '#1A1714', tinta2: '#6B645B', linha: '#E3DCD2', caramelo: '#A8661F' };
    const W = 1080, H = 1440, P = 44, CW = W - P * 2, TOPO = 34, BASE = 34, GAPB = 16, MAX_COLS = 5;
    const medida = document.createElement('canvas').getContext('2d');
    const n = cards.length;

    // cabeçalho enxuto: logo ao lado do título (legenda e data em cima, caixa e cliente embaixo)
    const hCab = 0;
    const hTitulo = 24 + 52 + 36;
    const hLogo = hTitulo - 6;
    const hFoto = foto ? Math.round(CW * 3 / 4) : 0;       // 4:3, sem corte para foto de celular
    const hTituloItens = 44;
    const PB = 18;
    const hValores = PB * 2 + 22 + 6 + 44 + (t.d ? 30 : 0);
    // rodapé de contato: fica abaixo de tudo e aumenta a imagem, sem mexer no restante do layout
    const hRodape = 22 + 34 + 18 + 28 + 34 * 2 + 26;

    // grade de itens para um número de colunas
    function grade(cols) {
      const GAP = 14;
      const CARD = (CW - GAP * (cols - 1)) / cols;
      const PAD = 9, FOTO = CARD - PAD * 2;
      const fs = cols <= 3 ? 26 : cols === 4 ? 23 : 20, lh = fs + 7, maxL = 3;
      medida.font = `600 ${fs}px ${F}`;
      const textos = cards.map(c => {
        const ls = quebrar(medida, c.nome, FOTO);
        if (ls.length <= maxL) return ls;
        // nome muito longo: corta na última linha e fecha com reticências
        const cort = ls.slice(0, maxL);
        let u = cort[maxL - 1];
        while (u && medida.measureText(u + '…').width > FOTO) u = u.replace(/\s*\S+$/, '');
        cort[maxL - 1] = (u || cort[maxL - 1]) + '…';
        return cort;
      });
      const linhas = [];
      for (let i = 0; i < n; i += cols) {
        const nl = Math.max(...textos.slice(i, i + cols).map(x => x.length));
        linhas.push({ ini: i, fim: Math.min(n, i + cols), h: PAD + FOTO + 9 + nl * lh + PAD });
      }
      const hTotal = linhas.reduce((s, l) => s + l.h, 0) + GAP * Math.max(0, linhas.length - 1);
      return { cols, GAP, CARD, PAD, FOTO, fs, lh, textos, linhas, hTotal };
    }

    const fixo = TOPO + hCab + hTitulo + GAPB + (foto ? hFoto + GAPB : 0) + hTituloItens + GAPB + hValores + BASE;
    // poucos itens: cartões maiores enquanto tudo couber em 3:4; senão, 5 colunas e mais linhas (a imagem cresce)
    let G = grade(MAX_COLS);
    if (n <= MAX_COLS) {
      for (let cols = Math.max(3, n); cols <= MAX_COLS; cols++) {
        const g2 = grade(cols);
        if (fixo + g2.hTotal <= H) { G = g2; break; }
      }
    }
    const usado = fixo + G.hTotal;
    const alturaBase = Math.max(H, usado);
    const altura = alturaBase + GAPB + hRodape;
    const folga = Math.min(44, (alturaBase - usado) / (foto ? 4 : 3));   // sobra distribuída entre os blocos

    const tela = document.createElement('canvas');
    tela.width = W; tela.height = altura;
    const g = tela.getContext('2d');
    g.fillStyle = C.fundo; g.fillRect(0, 0, W, altura);
    let y = TOPO;

    // logo à esquerda e, ao lado, o bloco de texto: legenda e data, título, caixa e cliente
    let tx = P;
    if (logo) {
      const lw = hLogo * (logo.naturalWidth / logo.naturalHeight || 1.5);
      g.drawImage(logo, P, y + 3, lw, hLogo);
      tx = P + lw + 22;
    }
    g.font = `600 20px ${F}`; g.fillStyle = C.tinta2;
    g.fillText(`Orçamento de kit presente  ·  ${new Date().toLocaleDateString('pt-BR')}`, tx, y + 19);
    g.font = `800 46px ${F}`; g.fillStyle = C.tinta;
    g.fillText(TITULO_KIT, tx, y + 24 + 42);
    let sx = tx;
    const sy = y + 24 + 52;
    if (cx) {
      g.font = `700 27px ${F}`; g.fillStyle = C.caramelo; g.fillText(nomeCaixa(cx), sx, sy + 28);
      sx += g.measureText(nomeCaixa(cx)).width;
    }
    if (cliente) {
      g.font = `400 25px ${F}`; g.fillStyle = C.tinta2;
      let txt = `${cx ? '  ·  ' : ''}Preparado para ${cliente}`;
      while (txt.length > 8 && sx + g.measureText(txt).width > W - P) txt = txt.slice(0, -2).trimEnd() + '…';
      g.fillText(txt, sx, sy + 28);
    }
    y += hTitulo + GAPB + folga;

    // foto principal (tamanho fixo), com a legenda de demonstração
    if (foto) {
      g.save(); retangulo(g, P, y, CW, hFoto, 26); g.clip(); cobrir(g, foto, P, y, CW, hFoto); g.restore();
      const selo = 'Foto de demonstração do kit · os itens inclusos estão listados abaixo';
      g.font = `600 22px ${F}`;
      const sw = Math.min(CW - 36, g.measureText(selo).width + 36);
      g.fillStyle = 'rgba(26,23,20,.82)'; retangulo(g, P + 18, y + hFoto - 18 - 46, sw, 46, 23); g.fill();
      g.fillStyle = '#fff'; g.fillText(selo, P + 36, y + hFoto - 18 - 15);
      y += hFoto + GAPB + folga;
    }

    // itens em linhas de até 5 cartões (cada linha centralizada)
    g.font = `800 31px ${F}`; g.fillStyle = C.tinta;
    g.fillText('O seu kit contém', P, y + 30); y += hTituloItens + folga;
    for (const ln of G.linhas) {
      const q2 = ln.fim - ln.ini;
      const x0 = P + (CW - (q2 * G.CARD + (q2 - 1) * G.GAP)) / 2;
      for (let j = 0; j < q2; j++) {
        const i = ln.ini + j, c = cards[i], img = fotosCards[i];
        const x = x0 + j * (G.CARD + G.GAP);
        g.fillStyle = C.cartao; retangulo(g, x, y, G.CARD, ln.h, 20); g.fill();
        const fx = x + G.PAD, fy = y + G.PAD;
        g.save(); retangulo(g, fx, fy, G.FOTO, G.FOTO, 13); g.clip();
        if (img) cobrir(g, img, fx, fy, G.FOTO, G.FOTO);
        else {
          g.fillStyle = C.linha; g.fillRect(fx, fy, G.FOTO, G.FOTO);
          g.font = `800 ${Math.round(G.FOTO * 0.32)}px ${F}`; g.fillStyle = C.tinta2; g.textAlign = 'center';
          g.fillText(c.nome.trim().charAt(0).toUpperCase(), fx + G.FOTO / 2, fy + G.FOTO / 2 + G.FOTO * 0.11); g.textAlign = 'left';
        }
        g.restore();
        // selo de quantidade no canto da foto
        const q = `${c.qtd}x`, qf = G.cols <= 3 ? 26 : G.cols === 4 ? 22 : 19, qh = qf + 16;
        g.font = `800 ${qf}px ${F}`;
        const qw = g.measureText(q).width + qh * 0.6;
        g.fillStyle = C.caramelo; retangulo(g, fx + G.FOTO - qw - 7, fy + 7, qw, qh, qh / 2); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(q, fx + G.FOTO - 7 - qw / 2, fy + 7 + qh / 2 + qf * 0.35); g.textAlign = 'left';
        g.font = `600 ${G.fs}px ${F}`; g.fillStyle = C.tinta;
        G.textos[i].forEach((tx, k2) => g.fillText(tx, fx, fy + G.FOTO + 9 + G.fs + k2 * G.lh));
      }
      y += ln.h + G.GAP;
    }
    y += -G.GAP + GAPB + folga;

    // valores
    g.fillStyle = C.cartao; retangulo(g, P, y, CW, hValores, 24); g.fill();
    const xe = P + 26, xd = W - P - 26;
    let vy = y + PB;
    g.font = `400 22px ${F}`; g.fillStyle = C.tinta2;
    g.fillText('Valor por kit', xe, vy + 20);
    if (t.n > 1) { g.textAlign = 'right'; g.fillText(`Total · ${t.n} kits`, xd, vy + 20); g.textAlign = 'left'; }
    vy += 22 + 6;
    g.font = `800 42px ${F}`; g.fillStyle = C.tinta;
    g.fillText(dinheiro(t.porKit), xe, vy + 40);
    if (t.n > 1) {
      g.font = `800 46px ${F}`; g.fillStyle = C.caramelo; g.textAlign = 'right';
      g.fillText(dinheiro(t.total), xd, vy + 41); g.textAlign = 'left';
    }
    vy += 44;
    if (t.d) {
      g.font = `400 21px ${F}`; g.fillStyle = C.tinta2;
      const antes = dinheiro(t.preco);
      g.fillText(antes, xe, vy + 22);
      const aw = g.measureText(antes).width;
      g.fillRect(xe, vy + 15, aw, 2);
      g.fillText(` · desconto de ${String(t.d).replace('.', ',')}%`, xe + aw, vy + 22);
    }

    // rodapé: contato, redes e validade, ancorado no fim da imagem
    {
      const fy0 = altura - BASE - hRodape;
      g.fillStyle = C.cartao; retangulo(g, P, fy0, CW, hRodape, 24); g.fill();
      const IC = 28, TXT = 23;
      const xl = P + 26, xr = P + CW / 2 + 12, xd2 = W - P - 26;
      const linhaTxt = (nome, txt, x, cy, cor = C.tinta, peso = 600) => {
        icone(g, nome, x, cy - IC / 2, IC);
        g.font = `${peso} ${TXT}px ${F}`; g.fillStyle = cor;
        g.fillText(txt, x + IC + 12, cy + TXT * 0.35);
      };
      // linha 1: WhatsApp à esquerda, validade à direita
      let cy = fy0 + 22 + 17;
      linhaTxt('whatsapp', '(54) 99968-3444', xl, cy, C.tinta, 800);
      g.font = `600 ${TXT - 2}px ${F}`; g.fillStyle = C.caramelo; g.textAlign = 'right';
      g.fillText('Orçamento válido por 10 dias', xd2, cy + TXT * 0.33); g.textAlign = 'left';
      // divisória
      const sepY = fy0 + 22 + 34 + 9;
      g.fillStyle = C.linha; g.fillRect(xl, sepY, CW - 52, 2);
      // duas colunas, uma por marca
      const topo = sepY + 2 + 16;
      g.font = `800 ${TXT - 5}px ${F}`; g.fillStyle = C.tinta2;
      g.fillText('BLOOMING CLUB', xl, topo + 14);
      g.fillText('DRIP COFFEE LABEL', xr, topo + 14);
      cy = topo + 28 + 17;
      linhaTxt('globo', 'www.bloomingclub.com.br', xl, cy);
      linhaTxt('globo', 'driplabel.bloomingclub.com.br', xr, cy);
      cy += 34;
      linhaTxt('instagram', '@bloomingclubcafes', xl, cy);
      linhaTxt('instagram', '@driplabel.cafes', xr, cy);
    }

    const blob = await new Promise(ok2 => tela.toBlob(ok2, 'image/jpeg', 0.9));
    const base = `kit-blooming${cx ? ' ' + cx.nome : ''}${cliente ? ' ' + cliente : ''}`
      .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase();
    return { blob, nome: `${base}.jpg` };
  }

  $('#kitGerarImagem').addEventListener('click', async () => {
    if (!caixaAtual()) { ctx.toast('Escolha a caixa do kit'); return; }
    if (!linhas().length) { ctx.toast('Escolha os itens do kit'); return; }
    const btn = $('#kitGerarImagem');
    btn.disabled = true; btn.textContent = 'Gerando…';
    try {
      const img = await gerarImagem();
      if (k.imagem?.url) URL.revokeObjectURL(k.imagem.url);
      k.imagem = { ...img, url: URL.createObjectURL(img.blob) };
      $('#imgPrevia').src = k.imagem.url;
      const arquivo = new File([img.blob], img.nome, { type: 'image/jpeg' });
      $('#imgEnviar').hidden = !navigator.canShare?.({ files: [arquivo] });
      $('#imgBaixar').classList.toggle('btn-primary', $('#imgEnviar').hidden);
      dlgImagem.showModal();
      $('.sheet-corpo', dlgImagem).scrollTop = 0;
    } catch (err) {
      console.error(err);
      ctx.toast('Não foi possível gerar a imagem');
    } finally {
      btn.disabled = false; btn.textContent = 'Gerar imagem';
    }
  });

  $('#imgEnviar').addEventListener('click', async () => {
    if (!k.imagem) return;
    try {
      await navigator.share({ files: [new File([k.imagem.blob], k.imagem.nome, { type: 'image/jpeg' })] });
    } catch (err) {
      if (err?.name !== 'AbortError') ctx.toast('Não foi possível enviar. Use "Baixar".');
    }
  });
  $('#imgBaixar').addEventListener('click', () => {
    if (!k.imagem) return;
    const a = document.createElement('a');
    a.href = k.imagem.url; a.download = k.imagem.nome; a.click();
  });
  $('#imgCopiarTexto').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(mensagem()); ctx.toast('Texto copiado'); }
    catch { ctx.toast('Não foi possível copiar'); }
  });

  $('#kitCriarPedido').addEventListener('click', () => {
    const t = totais();
    if (!t.ls.length) { ctx.toast('Escolha os itens do kit'); return; }
    const nome = t.cx ? `Kit ${nomeCaixa(t.cx)}` : 'Kit';
    const descricao = `${t.n}x ${nome}\n${t.ls.map(l => `• ${l.qtd}x ${l.nome}`).join('\n')}`;
    const obs = t.d ? `Desconto de ${String(t.d).replace('.', ',')}% (${dinheiro(t.preco)} → ${dinheiro(t.porKit)} por kit)` : '';
    const kit = {
      caixa: t.cx ? { id: t.cx.id, nome: t.cx.nome, preco: Number(t.cx.preco) || 0 } : null,
      nome, quantidade: t.n, desconto: t.d, valorPorKit: t.porKit,
      itens: t.ls.map(l => ({ id: l.id, nome: l.nome, qtd: l.qtd, preco: l.preco })),
    };
    const cliente = $('#kitCliente').value.trim();
    const contato = k.contato;
    limparMontador();
    renderOrcar();
    ctx.abrirPedido({ cliente, contato, descricao, valor: t.total, obs }, { kit });
  });

  // ---------------- Fotos: reduz para caber no banco ----------------
  async function comprimirFoto(file, lado, limite) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
      let qualidade = 0.82, dataUrl = '';
      for (let t = 0; t < 6; t++) {
        const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * escala);
        c.height = Math.round(img.naturalHeight * escala);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        dataUrl = c.toDataURL('image/jpeg', qualidade);
        if (dataUrl.length < limite) break;
        lado *= 0.8; qualidade = Math.max(0.5, qualidade - 0.08);
      }
      return dataUrl;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---------------- Salvar ----------------
  async function salvarDoc(colecao, d, msg) {
    d.atualizadoEm = new Date().toISOString();
    d.atualizadoPor = ctx.quem();
    try {
      await ctx.store().salvarDoc(colecao, d);
      if (msg) ctx.toast(msg);
      return true;
    } catch (err) {
      ctx.toast(err?.message === 'sem-espaco' ? 'Sem espaço neste aparelho. Use uma foto menor.' : 'Não foi possível salvar');
      return false;
    }
  }

  async function semearExemplo() {
    const agora = Date.now();
    let n = 0;
    const lista = [...EXEMPLO_ITENS, ...EXEMPLO_CAIXAS.map(nome => [nome, CAIXAS])];
    for (const [nome, categoria] of lista) {
      await ctx.store().salvarDoc('itens', { id: novoId(), nome, categoria, preco: 0, custo: '', foto: '', criadoEm: new Date(agora + n++).toISOString(), atualizadoPor: ctx.quem() });
    }
    ctx.toast('Lista criada. Agora coloque os preços e as fotos.');
  }

  // ---------------- Produto (na categoria Caixas, também a foto principal) ----------------
  const categoriaMarcada = () => formItem.querySelector('input[name=categoria]:checked')?.value || '';

  function abrirItem(doc) {
    k.editando = doc ? doc.id : null;
    k.fotoItem = doc?.foto || '';
    k.fotoPrincipal = doc?.fotoPrincipal || '';
    formItem.reset();
    $('#itemErro').textContent = '';
    $('#itemTitulo').textContent = !doc ? 'Novo produto' : ehCaixa(doc) ? 'Editar caixa' : 'Editar produto';
    $('#excluirItem').hidden = !doc;
    formItem.nome.value = doc?.nome || '';
    const cat = doc ? categoriaDe(doc.categoria) : '';
    $('#itemCategorias').innerHTML = CATEGORIAS.map(c =>
      `<label><input type="radio" name="categoria" value="${esc(c)}" ${c === cat ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('');
    formItem.preco.value = paraCampo(doc?.preco);
    formItem.custo.value = paraCampo(doc?.custo);
    renderFotoItem(); renderFotoPrincipal(); mostrarCampoCaixa();
    dlgItem.showModal();
    $('.sheet-corpo', dlgItem).scrollTop = 0;
    if (!doc) formItem.nome.focus();
  }
  function mostrarCampoCaixa() {
    const caixa = categoriaMarcada() === CAIXAS;
    $('#campoFotoPrincipal').hidden = !caixa;
    $('#itemFotoRotulo').textContent = caixa ? 'Foto do item (aparece entre os itens do kit)' : 'Foto do item';
    $('#itemSalvar').textContent = caixa ? 'Salvar caixa' : 'Salvar produto';
  }
  $('#itemCategorias').addEventListener('change', mostrarCampoCaixa);

  function renderFotoItem() {
    $('#itemFotoPrevia').innerHTML = k.fotoItem ? `<img src="${esc(k.fotoItem)}" alt="Foto do item">` : '<span>Sem foto</span>';
    $('#itemFotoRemover').hidden = !k.fotoItem;
  }
  function renderFotoPrincipal() {
    $('#principalFotoPrevia').innerHTML = k.fotoPrincipal ? `<img src="${esc(k.fotoPrincipal)}" alt="Foto principal do orçamento">` : '<span>Sem foto</span>';
    $('#principalFotoRemover').hidden = !k.fotoPrincipal;
    // fotos já cadastradas na tela antiga de caixas: um toque usa a foto como principal
    const antigas = k.caixasAntigas.filter(c => c.foto);
    $('#principalAntigas').hidden = !antigas.length;
    $('#principalAntigasLista').innerHTML = antigas.map(c => `
      <button type="button" class="antiga ${c.foto === k.fotoPrincipal ? 'on' : ''}" data-antiga="${esc(c.id)}" title="${esc(c.nome)}">
        <img src="${esc(c.foto)}" alt=""><span>${esc(c.nome)}</span>
      </button>`).join('');
  }
  $('#principalAntigasLista').addEventListener('click', e => {
    const b = e.target.closest('[data-antiga]'); if (!b) return;
    const c = k.caixasAntigas.find(x => x.id === b.dataset.antiga);
    if (c?.foto) { k.fotoPrincipal = c.foto; renderFotoPrincipal(); }
  });
  $('#itemFotoArquivo').addEventListener('change', async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { k.fotoItem = await comprimirFoto(file, 600, 150000); renderFotoItem(); }
    catch { ctx.toast('Não foi possível abrir essa foto'); }
  });
  $('#itemFotoRemover').addEventListener('click', () => { k.fotoItem = ''; renderFotoItem(); });
  $('#principalFotoArquivo').addEventListener('change', async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { k.fotoPrincipal = await comprimirFoto(file, 1200, 450000); renderFotoPrincipal(); }
    catch { ctx.toast('Não foi possível abrir essa foto'); }
  });
  $('#principalFotoRemover').addEventListener('click', () => { k.fotoPrincipal = ''; renderFotoPrincipal(); });

  formItem.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = formItem.nome.value.trim();
    if (!nome) { $('#itemErro').textContent = 'Preencha o nome do produto.'; formItem.nome.focus(); return; }
    const cat = categoriaMarcada();
    if (!cat) { $('#itemErro').textContent = 'Escolha a categoria.'; return; }
    const existente = acharItem(k.editando);
    const custoTxt = formItem.custo.value.trim();
    // mantém todos os campos que já existem no documento e só troca o que foi editado
    const d = {
      ...(existente || {}),
      id: existente?.id || novoId(),
      nome,
      categoria: cat,
      preco: lerNumero(formItem.preco.value),
      custo: custoTxt ? lerNumero(custoTxt) : '',
      foto: k.fotoItem,
      criadoEm: existente?.criadoEm || new Date().toISOString(),
    };
    if (cat === CAIXAS) d.fotoPrincipal = k.fotoPrincipal;
    const caixa = cat === CAIXAS;
    const msg = existente ? (caixa ? 'Caixa salva' : 'Produto salvo') : (caixa ? 'Caixa cadastrada' : 'Produto cadastrado');
    if (caixa) delete k.qtd[d.id];
    if (await salvarDoc('itens', d, msg)) dlgItem.close();
  });

  $('#excluirItem').addEventListener('click', async () => {
    const d = acharItem(k.editando);
    if (!d) return;
    if (!confirm(`Excluir "${d.nome}"?`)) return;
    dlgItem.close();
    delete k.qtd[d.id];
    await ctx.store().excluirDoc('itens', d.id);
    ctx.toast(ehCaixa(d) ? 'Caixa excluída' : 'Produto excluído', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('itens', d) });
  });

  // ---------------- Cliques ----------------
  document.addEventListener('click', e => {
    const alvo = e.target.closest('[data-kacao]');
    if (!alvo) return;
    const acao = alvo.dataset.kacao;
    const cid = alvo.closest('[data-cid]')?.dataset.cid;
    if (acao === 'exemplo') semearExemplo();
    else if (acao === 'editar-caixa-atual') abrirItem(caixaAtual());
    else if (acao === 'escolher-caixa') { k.caixaId = cid; renderCaixas(); renderAmostra(); renderTotal(); }
    else if (acao === 'novo-item') abrirItem();
    else if (acao === 'editar-item') abrirItem(acharItem(alvo.closest('[data-iid]')?.dataset.iid));
    else if (acao === 'ir-produtos') ctx.irPara('produtos');
    else if (acao === 'passo') {
      const id = alvo.closest('.kit-linha')?.dataset.iid;
      if (id) mudarQtd(id, (k.qtd[id] || 0) + Number(alvo.dataset.passo));
    }
  });

  // ---------------- Dados ----------------
  function conectar() {
    const st = ctx.store();
    if (!st.onColecao) return [];
    return [
      st.onColecao('itens', lista => {
        k.itens = lista;
        if (orcando()) renderOrcar();
        ctx.aoMudar();
      }),
      st.onColecao('caixas', lista => {
        k.caixasAntigas = lista;
        if (orcando()) renderOrcar();
        ctx.aoMudar();
      }),
    ];
  }

  $('#kitLimpar').addEventListener('click', () => { limparMontador(); renderOrcar(); window.scrollTo({ top: 0 }); });

  return { html, conectar, renderOrcar, comecarPara };
}
