// Kits de presente: a caixa define a linha (Premium ou Padrão) e a foto principal do kit.
// Depois escolhemos os produtos que vão dentro, e o app gera a imagem para o cliente.
// Os preços ficam na caixa e nos produtos; o valor do kit é calculado na hora.

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

// Categorias fixas. A embalagem não é item: ela entra como caixa.
const CATEGORIAS = ['Cafés', 'Acessórios', 'Xícaras', 'Outros'];
// Produtos antigos com outra categoria (Drip, Embalagem, texto livre) caem na mais próxima
const categoriaDe = c => CATEGORIAS.includes(c) ? c : (c === 'Drip' ? 'Cafés' : 'Outros');
const ordemCategoria = c => CATEGORIAS.indexOf(categoriaDe(c));

const LINHAS = [['premium', 'Premium'], ['padrao', 'Padrão']];
const nomeLinha = id => (LINHAS.find(l => l[0] === id) || LINHAS[1])[1];
// Kit com um único café custa 10% a mais sobre o valor calculado
const ACRESCIMO_UM_CAFE = 10;
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
// Caixas de partida: nomes provisórios para renomear, com foto e preço a definir
const EXEMPLO_CAIXAS = [
  ['Caixa preta', 'premium'], ['Caixa branca', 'premium'],
  ['Caixa padrão 1', 'padrao'], ['Caixa padrão 2', 'padrao'], ['Caixa padrão 3', 'padrao'], ['Caixa padrão 4', 'padrao'],
];

export function criarKits(ctx) {
  // ctx: { store: () => store, toast, quem, abrirPedido(preencher, extra), aoMudar() }
  const k = {
    itens: [],
    caixas: [],           // { id, nome, linha, foto, preco, custo }
    caixaId: null,        // caixa escolhida no montador
    qtd: {},              // itemId -> quantidade
    editandoItem: null, fotoItem: '',
    editandoCaixa: null, fotoCaixa: '',
    imagem: null,         // { blob, url, nome }
  };

  const areaOrcar = $('#areaOrcar');
  const orcando = () => !areaOrcar.hidden;
  const dlgItem = $('#dlgItem');
  const dlgCaixa = $('#dlgCaixa');
  const formCaixa = $('#formCaixa');
  const dlgImagem = $('#dlgImagem');
  const formItem = $('#formItem');

  // ---------------- Cálculos ----------------
  const acharItem = id => k.itens.find(i => i.id === id);
  const acharCaixa = id => k.caixas.find(c => c.id === id);
  const caixaAtual = () => acharCaixa(k.caixaId);
  const caixasOrdenadas = () => [...k.caixas].sort((a, b) =>
    (a.linha === 'premium' ? 0 : 1) - (b.linha === 'premium' ? 0 : 1) ||
    (a.criadoEm || '').localeCompare(b.criadoEm || '') || (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  const nomeCaixa = c => (c ? `${nomeLinha(c.linha)} · ${c.nome}` : '');

  function itensOrdenados() {
    return [...k.itens].sort((a, b) =>
      ordemCategoria(a.categoria) - ordemCategoria(b.categoria) ||
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }

  function linhas() {
    return itensOrdenados()
      .filter(i => (k.qtd[i.id] || 0) > 0)
      .map(i => ({ id: i.id, nome: i.nome, categoria: categoriaDe(i.categoria), foto: i.foto || '', qtd: k.qtd[i.id], preco: Number(i.preco) || 0, custo: Number(i.custo) || 0, temCusto: Number(i.custo) > 0 }));
  }

  const qtdKits = () => Math.max(1, Math.round(lerNumero($('#kitQtd').value)) || 1);
  const desconto = () => Math.min(100, Math.max(0, lerNumero($('#kitDesconto').value)));

  function totais() {
    const ls = linhas();
    const cx = caixaAtual();
    const cxPreco = Number(cx?.preco) || 0, cxCusto = Number(cx?.custo) || 0;
    const base = arred(ls.reduce((s, l) => s + l.preco * l.qtd, 0) + cxPreco);
    // Regra dos cafés: com exatamente 1 café no kit, o valor sobe 10%; com 2 ou mais, vale o preço base
    const cafes = ls.filter(l => l.categoria === 'Cafés').reduce((s, l) => s + l.qtd, 0);
    const acrescimo = cafes === 1 ? ACRESCIMO_UM_CAFE : 0;
    const preco = arred(base * (1 + acrescimo / 100));
    const custo = arred(ls.reduce((s, l) => s + l.custo * l.qtd, 0) + cxCusto);
    const n = qtdKits(), d = desconto();
    const porKit = arred(preco * (1 - d / 100));
    return {
      ls, base, cafes, acrescimo, preco, custo, n, d, porKit, total: arred(porKit * n),
      cx, semPreco: ls.filter(l => !l.preco).length + (cx && !cxPreco ? 1 : 0),
      custoCompleto: ls.length > 0 && ls.every(l => l.temCusto) && (!cx || !cxPreco || cxCusto > 0),
    };
  }

  // ---------------- Tela "Kits" ----------------
  const ICONE_FOTO = '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M4 7.5h3.2L8.8 5h6.4l1.6 2.5H20V19H4z"/><circle cx="12" cy="12.8" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  const miniatura = (foto, nome, cls = 'mini') => foto
    ? `<img class="${cls}" src="${esc(foto)}" alt="" loading="lazy">`
    : `<span class="${cls} ${cls}-vazia" aria-hidden="true">${esc((nome || '?').trim().charAt(0).toUpperCase())}</span>`;

  function cartaoCaixa(c) {
    return `
      <article class="caixa-card" data-cid="${esc(c.id)}">
        <button class="caixa-abrir" data-kacao="editar-caixa" aria-label="Editar ${esc(c.nome)}">
          <div class="caixa-foto">${c.foto ? `<img src="${esc(c.foto)}" alt="" loading="lazy">` : `<span class="caixa-foto-vazia">${ICONE_FOTO}</span>`}</div>
          <strong>${esc(c.nome)}</strong>
          <span class="caixa-preco ${Number(c.preco) ? '' : 'sem'}">${Number(c.preco) ? dinheiro(c.preco) : 'Definir preço'}</span>
        </button>
      </article>`;
  }

  function html() {
    const grupos = LINHAS.map(([id, nome]) => {
      const cs = caixasOrdenadas().filter(c => c.linha === id);
      return `
        <div class="caixa-grupo">
          <h3 class="item-cat">${nome}</h3>
          ${cs.length ? `<div class="caixa-grid">${cs.map(cartaoCaixa).join('')}</div>` : `<p class="muted">Nenhuma caixa ${nome.toLowerCase()} ainda.</p>`}
        </div>`;
    }).join('');
    const secaoCaixas = `
      <section class="k-sec">
        <div class="k-sec-topo">
          <h2>Caixas</h2>
          ${k.caixas.length ? '<button class="btn btn-sm" data-kacao="nova-caixa">+ Caixa</button>' : ''}
        </div>
        ${k.caixas.length ? `<p class="muted">A caixa define se o kit é Premium ou Padrão, e a foto dela é a imagem principal do kit. Toque na caixa para mudar nome, foto ou preço.</p>${grupos}` : `
        <div class="vazio kits-vazio">
          <p>Cadastre as caixas Premium e Padrão, com a foto do kit montado em cada uma.</p>
          <div class="botoes-centro">
            <button class="btn btn-primary" data-kacao="exemplo-caixas">Criar as 6 caixas para renomear</button>
            <button class="btn" data-kacao="nova-caixa">Cadastrar caixa</button>
          </div>
        </div>`}
      </section>`;

    let produtos;
    if (!k.itens.length) {
      produtos = `
      <div class="vazio kits-vazio">
        <p>Cadastre os produtos que podem entrar nos kits, com foto e preço.</p>
        <div class="botoes-centro">
          <button class="btn btn-primary" data-kacao="exemplo">Começar com lista de exemplo</button>
          <button class="btn" data-kacao="novo-item">Cadastrar produto</button>
        </div>
      </div>`;
    } else {
      let catAtual = null;
      produtos = `<div class="item-lista">${itensOrdenados().map(i => {
        const cat = categoriaDe(i.categoria);
        const cab = cat !== catAtual ? `<h3 class="item-cat">${esc(cat)}</h3>` : '';
        catAtual = cat;
        return `${cab}
        <div class="prod-linha" data-iid="${esc(i.id)}">
          <button class="prod-abrir" data-kacao="editar-item" aria-label="Editar ${esc(i.nome)}">
            ${miniatura(i.foto, i.nome)}
            <span class="item-nome">${esc(i.nome)}</span>
          </button>
          <label class="preco-rapido ${Number(i.preco) ? '' : 'sem'}">
            <span>R$</span><input inputmode="decimal" autocomplete="off" value="${precoCampo(i.preco)}" placeholder="0,00" aria-label="Preço de ${esc(i.nome)}">
          </label>
        </div>`;
      }).join('')}</div>`;
    }

    return `${secaoCaixas}
      <section class="k-sec">
        <div class="k-sec-topo">
          <h2>Produtos e preços</h2>
          ${k.itens.length ? '<button class="btn btn-sm" data-kacao="novo-item">+ Produto</button>' : ''}
        </div>
        ${k.itens.length ? '<p class="muted">Toque no preço para atualizar. Toque no produto para mudar foto, nome ou custo.</p>' : ''}
        ${produtos}
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
    if (!k.caixas.length) falta.push('as caixas');
    if (!k.itens.length) falta.push('os produtos');
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
  }

  function renderCaixas() {
    if (!k.caixas.length) {
      $('#kitCaixas').innerHTML = '<p class="muted">Cadastre as caixas na área Produtos.</p>';
      return;
    }
    $('#kitCaixas').innerHTML = LINHAS.map(([id, nome]) => {
      const cs = caixasOrdenadas().filter(c => c.linha === id);
      if (!cs.length) return '';
      return `<div class="kc-grupo"><span class="kc-linha">${nome}</span><div class="kc-lista">${cs.map(c => `
        <button type="button" class="kc" role="radio" data-kacao="escolher-caixa" data-cid="${esc(c.id)}" aria-checked="${c.id === k.caixaId}">
          ${miniatura(c.foto, c.nome, 'kc-foto')}
          <span class="kc-nome">${esc(c.nome)}</span>
          <span class="kc-preco">${Number(c.preco) ? dinheiro(c.preco) : 'sem preço'}</span>
        </button>`).join('')}</div></div>`;
    }).join('');
  }

  function renderAmostra() {
    const c = caixaAtual();
    if (!c) { $('#kitAmostra').innerHTML = ''; return; }
    $('#kitAmostra').innerHTML = c.foto
      ? `<img src="${esc(c.foto)}" alt="Foto do kit com ${esc(c.nome)}"><span class="selo">Imagem ilustrativa · ${esc(nomeCaixa(c))}</span>`
      : `<button type="button" class="kit-amostra-vazia" data-kacao="editar-caixa-atual">${ICONE_FOTO}<span>Adicionar a foto do kit com ${esc(c.nome)}</span></button>`;
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
    if (!k.itens.length) {
      $('#kitItens').innerHTML = '<p class="muted">Cadastre os produtos na área Produtos para montar.</p>';
      return;
    }
    let catAtual = null;
    $('#kitItens').innerHTML = itensOrdenados().map(i => {
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
    if (t.acrescimo) detalhe.push(`+${t.acrescimo}% por ter só 1 café`);
    if (t.d) detalhe.push(`desconto de ${String(t.d).replace('.', ',')}%`);
    let custo = '';
    if (t.custoCompleto && t.porKit > 0) {
      const m = Math.round(((t.porKit - t.custo) / t.porKit) * 100);
      custo = `<p class="kt-custo">Custo ${dinheiro(t.custo)} por kit · margem <b class="${m < 30 ? 'baixa' : ''}">${m}%</b></p>`;
    }
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

  // Imagem 9:16 (1080×1920) para tela de celular. O layout se ajusta aos itens escolhidos:
  // poucos itens → cartões grandes e foto da caixa maior; muitos itens → mais colunas e cartões menores.
  async function gerarImagem() {
    const t = totais();
    const cx = t.cx;
    const cliente = $('#kitCliente').value.trim();
    const F = 'Archivo, system-ui, sans-serif';
    await Promise.all(['400', '600', '800'].map(w => document.fonts?.load(`${w} 32px Archivo`).catch(() => {})));
    const [logo, foto, ...fotosItens] = await Promise.all([
      carregar('marca/logo-blooming-club.svg'), carregar(cx?.foto), ...t.ls.map(l => carregar(l.foto)),
    ]);

    const C = { fundo: '#F6F1EA', cartao: '#FFFFFF', tinta: '#1A1714', tinta2: '#6B645B', linha: '#E3DCD2', caramelo: '#A8661F' };
    const W = 1080, H = 1920, P = 64, CW = W - P * 2, TOPO = 84, BASE = 84, GAPB = 30, MIN_FOTO = 400;
    const medida = document.createElement('canvas').getContext('2d');
    const n = t.ls.length;

    // blocos de altura fixa
    medida.font = `800 60px ${F}`;
    const tit = quebrar(medida, TITULO_KIT, CW);
    const hLogo = 84;
    const hCab = hLogo + 30;
    const hTitulo = tit.length * 68 + (cx ? 46 : 0) + (cliente ? 42 : 0);
    const linhasValor = [];
    if (t.d) linhasValor.push(['Valor por kit', dinheiro(t.porKit), dinheiro(t.preco)]);
    else linhasValor.push(['Valor por kit', dinheiro(t.porKit)]);
    if (t.d) linhasValor.push(['Desconto', `${String(t.d).replace('.', ',')}%`]);
    if (t.n > 1) linhasValor.push(['Quantidade', `${t.n} kits`]);
    const PC = 34, LV = 48;
    const hValores = PC * 2 + linhasValor.length * LV + (t.n > 1 ? 14 + 2 + 14 + 62 : 0);
    medida.font = `400 24px ${F}`;
    const nota = foto
      ? 'A foto do kit é apenas um modelo da caixa escolhida. O seu kit contém os itens mostrados acima, nas quantidades indicadas.'
      : 'O seu kit contém os itens mostrados acima, nas quantidades indicadas.';
    const linhasNota = quebrar(medida, nota, CW);
    const hNota = linhasNota.length * 34;
    const hTituloItens = 56;

    // grade de itens para um número de colunas
    function grade(cols) {
      const GAP = cols >= 5 ? 14 : 20;
      const CARD = (CW - GAP * (cols - 1)) / cols;
      const PAD = cols >= 4 ? 10 : 14, FOTO = CARD - PAD * 2;
      const fs = cols <= 3 ? 27 : cols === 4 ? 23 : cols === 5 ? 20 : 18, lh = fs + 8, maxL = 3;
      medida.font = `600 ${fs}px ${F}`;
      const textos = t.ls.map(l => {
        const ls = quebrar(medida, l.nome, FOTO);
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
        linhas.push({ ini: i, fim: Math.min(n, i + cols), h: PAD + FOTO + 12 + nl * lh + PAD });
      }
      const hTotal = linhas.reduce((s, l) => s + l.h, 0) + GAP * Math.max(0, linhas.length - 1);
      return { cols, GAP, CARD, PAD, FOTO, fs, lh, textos, linhas, hTotal };
    }

    const fixoSemFoto = TOPO + hCab + hTitulo + GAPB + hTituloItens + GAPB + hValores + GAPB + hNota + BASE;
    let G = null, hFoto = 0, ok = false;
    for (const cols of [3, 4, 5, 6]) {
      G = grade(cols);
      const livre = H - fixoSemFoto - G.hTotal - (foto ? GAPB : 0);
      hFoto = foto ? Math.min(livre, Math.round(CW * 0.85)) : 0;
      if (!foto || livre >= MIN_FOTO) { ok = true; break; }
    }
    // kit enorme: foto mínima e, se ainda passar de 1920, a imagem toda é reduzida para caber
    if (!ok) hFoto = foto ? MIN_FOTO : 0;
    const usado = fixoSemFoto + G.hTotal + (foto ? hFoto + GAPB : 0);
    const altura = Math.max(H, usado);
    const sobra = Math.max(0, H - usado);
    const folga = Math.min(70, sobra / (foto ? 3 : 2));   // espaço extra distribuído entre os blocos

    const tela = document.createElement('canvas');
    tela.width = W; tela.height = altura;
    const g = tela.getContext('2d');
    g.fillStyle = C.fundo; g.fillRect(0, 0, W, altura);
    let y = TOPO;

    // cabeçalho: logo e data
    if (logo) g.drawImage(logo, P, y, hLogo * (logo.naturalWidth / logo.naturalHeight || 1.5), hLogo);
    g.font = `600 25px ${F}`; g.fillStyle = C.tinta2; g.textAlign = 'right';
    g.fillText('Orçamento de kit presente', W - P, y + 38);
    g.font = `400 25px ${F}`;
    g.fillText(new Date().toLocaleDateString('pt-BR'), W - P, y + 72);
    g.textAlign = 'left';
    y += hCab;

    // título, linha e caixa, cliente
    g.font = `800 60px ${F}`; g.fillStyle = C.tinta;
    for (const l of tit) { g.fillText(l, P, y + 52); y += 68; }
    if (cx) { g.font = `700 32px ${F}`; g.fillStyle = C.caramelo; g.fillText(nomeCaixa(cx), P, y + 32); y += 46; }
    if (cliente) { g.font = `400 28px ${F}`; g.fillStyle = C.tinta2; g.fillText(`Preparado para ${cliente}`, P, y + 28); y += 42; }
    y += GAPB + folga;

    // foto do kit com a caixa, com aviso de que é só um modelo
    if (foto) {
      g.save(); retangulo(g, P, y, CW, hFoto, 28); g.clip(); cobrir(g, foto, P, y, CW, hFoto); g.restore();
      const selo = 'Imagem ilustrativa · apenas modelo';
      g.font = `600 24px ${F}`;
      const sw = g.measureText(selo).width + 40;
      g.fillStyle = 'rgba(26,23,20,.82)'; retangulo(g, P + 22, y + hFoto - 22 - 52, sw, 52, 26); g.fill();
      g.fillStyle = '#fff'; g.fillText(selo, P + 42, y + hFoto - 22 - 17);
      y += hFoto + GAPB + folga;
    }

    // itens em grade: foto quadrada, quantidade e descrição embaixo (cada linha centralizada)
    g.font = `800 38px ${F}`; g.fillStyle = C.tinta;
    g.fillText('O seu kit contém', P, y + 36); y += hTituloItens;
    for (const ln of G.linhas) {
      const k = ln.fim - ln.ini;
      const x0 = P + (CW - (k * G.CARD + (k - 1) * G.GAP)) / 2;
      for (let j = 0; j < k; j++) {
        const i = ln.ini + j, l = t.ls[i], img = fotosItens[i];
        const x = x0 + j * (G.CARD + G.GAP);
        g.fillStyle = C.cartao; retangulo(g, x, y, G.CARD, ln.h, 22); g.fill();
        const fx = x + G.PAD, fy = y + G.PAD;
        g.save(); retangulo(g, fx, fy, G.FOTO, G.FOTO, 14); g.clip();
        if (img) cobrir(g, img, fx, fy, G.FOTO, G.FOTO);
        else {
          g.fillStyle = C.linha; g.fillRect(fx, fy, G.FOTO, G.FOTO);
          g.font = `800 ${Math.round(G.FOTO * 0.32)}px ${F}`; g.fillStyle = C.tinta2; g.textAlign = 'center';
          g.fillText(l.nome.trim().charAt(0).toUpperCase(), fx + G.FOTO / 2, fy + G.FOTO / 2 + G.FOTO * 0.11); g.textAlign = 'left';
        }
        g.restore();
        // selo de quantidade no canto da foto
        const q = `${l.qtd}x`, qf = G.cols <= 3 ? 28 : 22, qh = G.cols <= 3 ? 44 : 36;
        g.font = `800 ${qf}px ${F}`;
        const qw = g.measureText(q).width + qh * 0.6;
        g.fillStyle = C.caramelo; retangulo(g, fx + G.FOTO - qw - 8, fy + 8, qw, qh, qh / 2); g.fill();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(q, fx + G.FOTO - 8 - qw / 2, fy + 8 + qh / 2 + qf * 0.35); g.textAlign = 'left';
        g.font = `600 ${G.fs}px ${F}`; g.fillStyle = C.tinta;
        G.textos[i].forEach((tx, k2) => g.fillText(tx, fx, fy + G.FOTO + 12 + G.fs + k2 * G.lh));
      }
      y += ln.h + G.GAP;
    }
    y += -G.GAP + GAPB + folga;

    // valores
    g.fillStyle = C.cartao; retangulo(g, P, y, CW, hValores, 28); g.fill();
    let vy = y + PC;
    for (const [rot, val, antigo] of linhasValor) {
      g.font = `400 30px ${F}`; g.fillStyle = C.tinta2; g.fillText(rot, P + PC, vy + 33);
      g.font = `600 33px ${F}`; g.fillStyle = C.tinta; g.textAlign = 'right';
      g.fillText(val, W - P - PC, vy + 33);
      if (antigo) {
        const vw = g.measureText(val).width;
        g.font = `400 27px ${F}`; g.fillStyle = C.tinta2;
        const ax = W - P - PC - vw - 18; g.fillText(antigo, ax, vy + 33);
        const aw = g.measureText(antigo).width;
        g.fillRect(ax - aw, vy + 23, aw, 2);
      }
      g.textAlign = 'left';
      vy += LV;
    }
    if (t.n > 1) {
      vy += 14; g.fillStyle = C.linha; g.fillRect(P + PC, vy, CW - PC * 2, 2); vy += 14;
      g.font = `800 34px ${F}`; g.fillStyle = C.tinta; g.fillText('Total', P + PC, vy + 46);
      g.font = `800 58px ${F}`; g.fillStyle = C.caramelo; g.textAlign = 'right';
      g.fillText(dinheiro(t.total), W - P - PC, vy + 48); g.textAlign = 'left';
    }
    y += hValores + GAPB;

    // observação, sempre rente ao fim da imagem
    g.font = `400 24px ${F}`; g.fillStyle = C.tinta2;
    let ny = altura - BASE - hNota;
    ny = Math.max(ny, y);
    for (const l of linhasNota) { g.fillText(l, P, ny + 24); ny += 34; }

    // se o kit era grande demais, reduz tudo para caber em 9:16
    let final = tela;
    if (altura > H) {
      final = document.createElement('canvas');
      final.width = W; final.height = H;
      const f = final.getContext('2d');
      f.fillStyle = C.fundo; f.fillRect(0, 0, W, H);
      const esc2 = H / altura;
      f.drawImage(tela, (W - W * esc2) / 2, 0, W * esc2, H);
    }
    const blob = await new Promise(ok2 => final.toBlob(ok2, 'image/jpeg', 0.9));
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
      caixa: t.cx ? { id: t.cx.id, nome: t.cx.nome, linha: t.cx.linha, preco: Number(t.cx.preco) || 0 } : null,
      nome, quantidade: t.n, desconto: t.d, valorPorKit: t.porKit,
      itens: t.ls.map(l => ({ id: l.id, nome: l.nome, qtd: l.qtd, preco: l.preco })),
    };
    const cliente = $('#kitCliente').value.trim();
    limparMontador();
    renderOrcar();
    ctx.abrirPedido({ cliente, descricao, valor: t.total, obs }, { kit });
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
    const agora = new Date().toISOString();
    for (const [nome, categoria] of EXEMPLO_ITENS) {
      await ctx.store().salvarDoc('itens', { id: novoId(), nome, categoria, preco: 0, custo: '', foto: '', criadoEm: agora, atualizadoPor: ctx.quem() });
    }
    ctx.toast('Lista criada. Agora coloque os preços e as fotos.');
  }

  // ---------------- Caixa ----------------
  function abrirCaixa(c) {
    k.editandoCaixa = c ? c.id : null;
    k.fotoCaixa = c?.foto || '';
    formCaixa.reset();
    $('#caixaErro').textContent = '';
    $('#caixaTitulo').textContent = c ? 'Editar caixa' : 'Nova caixa';
    $('#excluirCaixa').hidden = !c;
    formCaixa.nome.value = c?.nome || '';
    $(`input[name=linha][value="${c?.linha === 'padrao' ? 'padrao' : 'premium'}"]`, formCaixa).checked = true;
    formCaixa.preco.value = paraCampo(c?.preco);
    formCaixa.custo.value = paraCampo(c?.custo);
    renderFotoCaixa();
    dlgCaixa.showModal();
    if (!c) formCaixa.nome.focus();
  }
  function renderFotoCaixa() {
    $('#caixaFotoPrevia').innerHTML = k.fotoCaixa ? `<img src="${esc(k.fotoCaixa)}" alt="Foto do kit">` : '<span>Sem foto</span>';
    $('#caixaFotoRemover').hidden = !k.fotoCaixa;
  }
  $('#caixaFotoArquivo').addEventListener('change', async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { k.fotoCaixa = await comprimirFoto(file, 1200, 450000); renderFotoCaixa(); }
    catch { ctx.toast('Não foi possível abrir essa foto'); }
  });
  $('#caixaFotoRemover').addEventListener('click', () => { k.fotoCaixa = ''; renderFotoCaixa(); });

  formCaixa.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = formCaixa.nome.value.trim();
    if (!nome) { $('#caixaErro').textContent = 'Preencha o nome da caixa.'; formCaixa.nome.focus(); return; }
    const existente = acharCaixa(k.editandoCaixa);
    const custoTxt = formCaixa.custo.value.trim();
    const c = {
      ...(existente || {}),
      id: existente?.id || novoId(),
      nome,
      linha: formCaixa.linha.value === 'padrao' ? 'padrao' : 'premium',
      foto: k.fotoCaixa,
      preco: lerNumero(formCaixa.preco.value),
      custo: custoTxt ? lerNumero(custoTxt) : '',
      criadoEm: existente?.criadoEm || new Date().toISOString(),
    };
    if (await salvarDoc('caixas', c, existente ? 'Caixa salva' : 'Caixa cadastrada')) dlgCaixa.close();
  });

  $('#excluirCaixa').addEventListener('click', async () => {
    const c = acharCaixa(k.editandoCaixa); if (!c) return;
    if (!confirm(`Excluir a caixa "${c.nome}"?`)) return;
    dlgCaixa.close();
    await ctx.store().excluirDoc('caixas', c.id);
    ctx.toast('Caixa excluída', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('caixas', c) });
  });

  async function semearCaixas() {
    const base = Date.now();
    let n = 0;
    for (const [nome, linha] of EXEMPLO_CAIXAS) {
      await ctx.store().salvarDoc('caixas', { id: novoId(), nome, linha, foto: '', preco: 0, custo: '', criadoEm: new Date(base + n++).toISOString(), atualizadoPor: ctx.quem() });
    }
    ctx.toast('Caixas criadas. Toque em cada uma para nome, foto e preço.');
  }

  // ---------------- Produto ----------------
  function abrirItem(item) {
    k.editandoItem = item ? item.id : null;
    k.fotoItem = item?.foto || '';
    formItem.reset();
    $('#itemErro').textContent = '';
    $('#itemTitulo').textContent = item ? 'Editar produto' : 'Novo produto';
    $('#excluirItem').hidden = !item;
    formItem.nome.value = item?.nome || '';
    const cat = categoriaDe(item?.categoria);
    $('#itemCategorias').innerHTML = CATEGORIAS.map(c =>
      `<label><input type="radio" name="categoria" value="${esc(c)}" ${c === cat ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('');
    formItem.preco.value = paraCampo(item?.preco);
    formItem.custo.value = paraCampo(item?.custo);
    renderFotoItem();
    dlgItem.showModal();
    if (!item) formItem.nome.focus();
  }
  function renderFotoItem() {
    $('#itemFotoPrevia').innerHTML = k.fotoItem ? `<img src="${esc(k.fotoItem)}" alt="Foto do produto">` : '<span>Sem foto</span>';
    $('#itemFotoRemover').hidden = !k.fotoItem;
  }
  $('#itemFotoArquivo').addEventListener('change', async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    try { k.fotoItem = await comprimirFoto(file, 600, 150000); renderFotoItem(); }
    catch { ctx.toast('Não foi possível abrir essa foto'); }
  });
  $('#itemFotoRemover').addEventListener('click', () => { k.fotoItem = ''; renderFotoItem(); });

  formItem.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = formItem.nome.value.trim();
    if (!nome) { $('#itemErro').textContent = 'Preencha o nome do produto.'; formItem.nome.focus(); return; }
    const existente = acharItem(k.editandoItem);
    const custoTxt = formItem.custo.value.trim();
    const item = {
      ...(existente || {}),
      id: existente?.id || novoId(),
      nome,
      categoria: categoriaDe(formItem.elements.categoria.value),
      preco: lerNumero(formItem.preco.value),
      custo: custoTxt ? lerNumero(custoTxt) : '',
      foto: k.fotoItem,
      criadoEm: existente?.criadoEm || new Date().toISOString(),
    };
    if (await salvarDoc('itens', item, existente ? 'Produto salvo' : 'Produto cadastrado')) dlgItem.close();
  });

  $('#excluirItem').addEventListener('click', async () => {
    const item = acharItem(k.editandoItem); if (!item) return;
    if (!confirm(`Excluir "${item.nome}"?`)) return;
    dlgItem.close();
    delete k.qtd[item.id];
    await ctx.store().excluirDoc('itens', item.id);
    ctx.toast('Produto excluído', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('itens', item) });
  });

  // ---------------- Cliques ----------------
  document.addEventListener('click', e => {
    const alvo = e.target.closest('[data-kacao]');
    if (!alvo) return;
    const acao = alvo.dataset.kacao;
    const cid = alvo.closest('[data-cid]')?.dataset.cid;
    if (acao === 'exemplo') semearExemplo();
    else if (acao === 'exemplo-caixas') semearCaixas();
    else if (acao === 'nova-caixa') abrirCaixa();
    else if (acao === 'editar-caixa') abrirCaixa(acharCaixa(cid));
    else if (acao === 'editar-caixa-atual') abrirCaixa(caixaAtual());
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
        k.caixas = lista;
        if (orcando()) renderOrcar();
        ctx.aoMudar();
      }),
    ];
  }

  $('#kitLimpar').addEventListener('click', () => { limparMontador(); renderOrcar(); window.scrollTo({ top: 0 }); });

  return { html, conectar, renderOrcar };
}
