// Kits de presente: itens com preço, kits base com foto e montador de orçamento.
// Os preços ficam só nos itens; o valor de cada kit é sempre calculado na hora,
// então mudar o preço de um item atualiza todos os kits que usam ele.

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

const ORDEM_CATEGORIAS = ['Cafés', 'Drip', 'Acessórios', 'Xícaras', 'Embalagem'];
function ordemCategoria(c) {
  const i = ORDEM_CATEGORIAS.indexOf(c);
  return i < 0 ? 100 : i;
}

// Lista de partida: só nomes e categorias. Os preços ficam zerados para a equipe preencher.
const EXEMPLO_ITENS = [
  ['cafe', 'Café especial 250g', 'Cafés'],
  ['drip', 'Drip coffee (unidade)', 'Drip'],
  ['moedor', 'Moedor manual', 'Acessórios'],
  ['v60', 'Coador V60', 'Acessórios'],
  ['xic-ceramica', 'Xícara de cerâmica', 'Xícaras'],
  ['xic-blooming', 'Xícara artesanal Blooming', 'Xícaras'],
  ['caixa-premium', 'Caixa premium', 'Embalagem'],
  ['caixa-simples', 'Caixa simples', 'Embalagem'],
];
const EXEMPLO_KITS = [
  ['Kit Café', { cafe: 1, 'caixa-simples': 1 }],
  ['Kit Drip & Xícara', { drip: 5, 'xic-ceramica': 1, 'caixa-simples': 1 }],
  ['Kit Barista', { cafe: 2, moedor: 1, v60: 1, 'xic-blooming': 1, 'caixa-premium': 1 }],
];

export function criarKits(ctx) {
  // ctx: { store: () => store, toast, quem, abrirPedido(prefill, extra), aoMudar() }
  const k = {
    itens: [],
    kits: [],
    modo: 'montar',        // 'montar' (orçamento) ou 'base' (editar kit base)
    baseId: null,          // kit base usado como ponto de partida
    editandoBase: null,    // id do kit base em edição (null = novo)
    qtd: {},               // itemId -> quantidade
    foto: '',              // foto do kit base em edição
    editandoItem: null,
  };

  const dlgKit = $('#dlgKit');
  const dlgItem = $('#dlgItem');
  const formItem = $('#formItem');

  // ---------------- Cálculos ----------------
  const acharItem = id => k.itens.find(i => i.id === id);
  const acharKit = id => k.kits.find(x => x.id === id);

  function itensOrdenados() {
    return [...k.itens].sort((a, b) =>
      ordemCategoria(a.categoria || 'Outros') - ordemCategoria(b.categoria || 'Outros') ||
      (a.categoria || 'Outros').localeCompare(b.categoria || 'Outros', 'pt-BR') ||
      (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }

  // Linhas de um kit (só itens que ainda existem), na ordem do catálogo
  function linhas(qtd) {
    return itensOrdenados()
      .filter(i => (qtd[i.id] || 0) > 0)
      .map(i => ({ id: i.id, nome: i.nome, qtd: qtd[i.id], preco: Number(i.preco) || 0, custo: Number(i.custo) || 0, temCusto: i.custo != null && i.custo !== '' && Number(i.custo) > 0 }));
  }

  function calcular(qtd) {
    const ls = linhas(qtd);
    const preco = arred(ls.reduce((s, l) => s + l.preco * l.qtd, 0));
    const custo = arred(ls.reduce((s, l) => s + l.custo * l.qtd, 0));
    const semPreco = ls.filter(l => !l.preco).length;
    const custoCompleto = ls.length > 0 && ls.every(l => l.temCusto);
    return { ls, preco, custo, semPreco, custoCompleto };
  }

  const resumoItens = qtd => linhas(qtd).map(l => `${l.qtd > 1 ? l.qtd + ' ' : ''}${l.nome}`).join(' · ');

  function qtdKits() { return Math.max(1, Math.round(lerNumero($('#kitQtd').value)) || 1); }
  function desconto() { return Math.min(100, Math.max(0, lerNumero($('#kitDesconto').value))); }

  function mesmasQtd(a, b) {
    const ka = Object.keys(a).filter(x => a[x] > 0), kb = Object.keys(b || {}).filter(x => b[x] > 0);
    return ka.length === kb.length && ka.every(x => a[x] === b[x]);
  }
  function nomeMontagem() {
    const base = acharKit(k.baseId);
    if (!base) return 'Kit personalizado';
    return mesmasQtd(k.qtd, base.itens) ? base.nome : `${base.nome} (personalizado)`;
  }

  function totais() {
    const c = calcular(k.qtd);
    const n = qtdKits();
    const d = desconto();
    const porKit = arred(c.preco * (1 - d / 100));
    const total = arred(porKit * n);
    return { ...c, n, d, porKit, total, bruto: arred(c.preco * n) };
  }

  // ---------------- Tela "Kits" ----------------
  function html() {
    if (!k.itens.length) {
      return `
      <div class="vazio kits-vazio">
        <h2>Monte kits em segundos</h2>
        <p>Cadastre os itens que entram nos kits, como cafés, moedor, V60, xícaras e caixas, com o preço de cada um. Depois é só somar no montador.</p>
        <div class="botoes-centro">
          <button class="btn btn-primary" data-kacao="exemplo">Começar com lista de exemplo</button>
          <button class="btn" data-kacao="novo-item">Cadastrar item</button>
        </div>
      </div>`;
    }

    const kitsOrd = [...k.kits].sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''));
    const cards = kitsOrd.map(kit => {
      const c = calcular(kit.itens || {});
      const foto = kit.foto
        ? `<img src="${esc(kit.foto)}" alt="" loading="lazy">`
        : `<span class="kit-foto-vazia" aria-hidden="true"><svg viewBox="0 0 24 24" width="40" height="40"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M3.5 9h17v3.5h-17zM5 12.5h14V20H5zM12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9Zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9Z"/></svg></span>`;
      return `
      <article class="kit-card" data-kid="${esc(kit.id)}">
        <button class="kit-card-abrir" data-kacao="montar" aria-label="Montar a partir do ${esc(kit.nome)}">
          <div class="kit-card-foto">${foto}</div>
          <div class="kit-card-txt">
            <strong>${esc(kit.nome)}</strong>
            <span class="kit-card-preco">${dinheiro(c.preco)}${c.semPreco ? ' <em>· item sem preço</em>' : ''}</span>
            <span class="kit-card-itens">${esc(resumoItens(kit.itens || {})) || 'Sem itens'}</span>
          </div>
        </button>
        <button class="kit-card-editar" data-kacao="editar-base">Editar</button>
      </article>`;
    }).join('');

    // itens agrupados por categoria
    let catAtual = null;
    const listaItens = itensOrdenados().map(i => {
      const cat = i.categoria || 'Outros';
      const cab = cat !== catAtual ? `<h3 class="item-cat">${esc(cat)}</h3>` : '';
      catAtual = cat;
      const preco = Number(i.preco) || 0;
      return `${cab}
      <button class="item-linha" data-kacao="editar-item" data-iid="${esc(i.id)}">
        <span class="item-nome">${esc(i.nome)}</span>
        <span class="item-preco ${preco ? '' : 'sem'}">${preco ? dinheiro(preco) : 'Definir preço'}</span>
      </button>`;
    }).join('');

    return `
      <section class="k-sec">
        <div class="k-sec-topo">
          <h2>Kits base</h2>
          <button class="btn btn-sm" data-kacao="novo-base">+ Kit base</button>
        </div>
        ${cards ? `<div class="kit-grid">${cards}</div>` : `<p class="muted k-vazio">Nenhum kit base ainda. Toque em "+ Kit base" ou monte um kit e salve como base.</p>`}
      </section>
      <section class="k-sec">
        <div class="k-sec-topo">
          <h2>Itens e preços</h2>
          <button class="btn btn-sm" data-kacao="novo-item">+ Item</button>
        </div>
        <p class="muted">Mudou um preço aqui, todos os kits já usam o valor novo.</p>
        <div class="item-lista">${listaItens}</div>
      </section>`;
  }

  // ---------------- Montador / editor de kit base ----------------
  function abrirMontador(baseId) {
    k.modo = 'montar';
    k.baseId = baseId || null;
    k.qtd = { ...(acharKit(baseId)?.itens || {}) };
    $('#kitQtd').value = '1';
    $('#kitDesconto').value = '';
    prepararDialogo();
    dlgKit.showModal();
    $('.sheet-corpo', dlgKit).scrollTop = 0;
  }

  function abrirBase(kit, qtdInicial) {
    k.modo = 'base';
    k.editandoBase = kit ? kit.id : null;
    k.baseId = null;
    k.qtd = { ...(qtdInicial || kit?.itens || {}) };
    k.foto = kit?.foto || '';
    $('#kitNome').value = kit?.nome || '';
    prepararDialogo();
    dlgKit.showModal();
    $('.sheet-corpo', dlgKit).scrollTop = 0;
    if (!kit && !qtdInicial) $('#kitNome').focus();
  }

  function prepararDialogo() {
    const base = k.modo === 'base';
    $('#kitTitulo').textContent = base ? (k.editandoBase ? 'Editar kit base' : 'Novo kit base') : 'Montar kit';
    $('#kitCamposBase').hidden = !base;
    $('#kitBases').hidden = base;
    $('#kitCamposMontar').hidden = base;
    $('#kitSalvarComoBase').hidden = base;
    $('#kitRodapeMontar').hidden = base;
    $('#kitRodapeBase').hidden = !base;
    $('#kitExcluir').hidden = !k.editandoBase;
    renderBases();
    renderFoto();
    renderItensDialogo();
    renderTotal();
  }

  function renderBases() {
    if (k.modo !== 'montar') return;
    const chips = [...k.kits].sort((a, b) => (a.criadoEm || '').localeCompare(b.criadoEm || ''))
      .map(kit => `<button class="kit-chip" data-kacao="trocar-base" data-kid="${esc(kit.id)}" aria-pressed="${kit.id === k.baseId}">${esc(kit.nome)}</button>`)
      .join('');
    const base = acharKit(k.baseId);
    const sel = base?.foto ? `
      <div class="kit-base-sel">
        <img src="${esc(base.foto)}" alt="Foto do ${esc(base.nome)}">
        <div>
          <strong>Foto de exemplo</strong>
          <button class="btn btn-sm" data-kacao="enviar-foto">Enviar foto</button>
        </div>
      </div>` : '';
    $('#kitBases').innerHTML = k.kits.length
      ? `<p class="kit-rotulo">Começar de um kit base</p>
         <div class="kit-chips"><button class="kit-chip" data-kacao="trocar-base" data-kid="" aria-pressed="${!k.baseId}">Do zero</button>${chips}</div>${sel}`
      : '';
  }

  function renderFoto() {
    if (k.modo !== 'base') return;
    $('#kitFotoPrevia').innerHTML = k.foto ? `<img src="${esc(k.foto)}" alt="Foto do kit">` : '<span>Sem foto</span>';
    $('#kitFotoRemover').hidden = !k.foto;
  }

  function linhaItem(i) {
    const q = k.qtd[i.id] || 0;
    const preco = Number(i.preco) || 0;
    const detalhe = preco
      ? `${dinheiro(preco)}${q > 1 ? ` · ${q} = ${dinheiro(preco * q)}` : ''}`
      : '<em>sem preço</em>';
    return `
      <div class="kit-linha ${q ? 'on' : ''}" data-iid="${esc(i.id)}">
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
      $('#kitItens').innerHTML = `<p class="muted">Cadastre os itens na aba Kits para montar.</p>`;
      return;
    }
    let catAtual = null;
    $('#kitItens').innerHTML = itensOrdenados().map(i => {
      const cat = i.categoria || 'Outros';
      const cab = cat !== catAtual ? `<h3 class="item-cat">${esc(cat)}</h3>` : '';
      catAtual = cat;
      return cab + linhaItem(i);
    }).join('');
  }

  function atualizarLinha(id) {
    const el = $(`.kit-linha[data-iid="${CSS.escape(id)}"]`, dlgKit);
    const item = acharItem(id);
    if (!el || !item) return renderItensDialogo();
    const novo = document.createElement('div');
    novo.innerHTML = linhaItem(item);
    el.replaceWith(novo.firstElementChild);
  }

  function renderTotal() {
    const t = totais();
    const margem = (preco, custo) => (preco > 0 ? Math.round(((preco - custo) / preco) * 100) : 0);
    const avisoPreco = t.semPreco ? `<p class="kt-aviso">${t.semPreco} ${t.semPreco === 1 ? 'item está' : 'itens estão'} sem preço</p>` : '';
    let custo = '';
    if (t.custoCompleto) {
      const m = margem(t.porKit, t.custo);
      custo = `<p class="kt-custo">Custo ${dinheiro(t.custo)} por kit · margem <b class="${m < 30 ? 'baixa' : ''}">${m}%</b></p>`;
    }

    if (k.modo === 'base') {
      $('#kitTotal').innerHTML = `
        <div class="kt-linha"><span>Valor do kit</span><strong class="kt-grande">${dinheiro(t.preco)}</strong></div>${custo}${avisoPreco}`;
      return;
    }
    const detalhe = [];
    if (t.n > 1) detalhe.push(`${t.n} kits × ${dinheiro(t.porKit)}`);
    if (t.d) detalhe.push(`desconto de ${String(t.d).replace('.', ',')}%`);
    $('#kitTotal').innerHTML = `
      <div class="kt-linha">
        <span>${t.n > 1 || t.d ? esc(detalhe.join(' · ')) : 'Valor do kit'}</span>
        <strong class="kt-grande">${dinheiro(t.total)}</strong>
      </div>${custo}${avisoPreco}`;
  }

  function mudarQtd(id, q) {
    q = Math.max(0, Math.min(9999, Math.round(q) || 0));
    if (q) k.qtd[id] = q; else delete k.qtd[id];
    atualizarLinha(id);
    renderTotal();
    if (k.modo === 'montar') renderBases(); // o nome muda para "(personalizado)"
  }

  // ---------------- Mensagem para o WhatsApp ----------------
  function mensagem() {
    const t = totais();
    const linhasTxt = t.ls.map(l => `• ${l.qtd}x ${l.nome}`).join('\n');
    const partes = [`*${nomeMontagem()}*`, linhasTxt, ''];
    if (t.d) partes.push(`Valor por kit: ~${dinheiro(t.preco)}~ ${dinheiro(t.porKit)} (${String(t.d).replace('.', ',')}% de desconto)`);
    else partes.push(`Valor por kit: ${dinheiro(t.porKit)}`);
    if (t.n > 1) partes.push(`Quantidade: ${t.n} kits`, `*Total: ${dinheiro(t.total)}*`);
    return partes.join('\n');
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      dlgKit.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      return ok;
    }
  }

  async function enviarFoto() {
    const base = acharKit(k.baseId);
    if (!base?.foto) return;
    const blob = await (await fetch(base.foto)).blob();
    const nome = `${(base.nome || 'kit').normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase()}.jpg`;
    const arquivo = new File([blob], nome, { type: 'image/jpeg' });
    try {
      if (navigator.canShare?.({ files: [arquivo] })) { await navigator.share({ files: [arquivo] }); return; }
    } catch (err) { if (err?.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    ctx.toast('Foto baixada');
  }

  // ---------------- Foto: reduz para caber no banco ----------------
  async function comprimirFoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = url; });
      let lado = 1100, qualidade = 0.8, dataUrl = '';
      for (let t = 0; t < 6; t++) {
        const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * escala);
        c.height = Math.round(img.naturalHeight * escala);
        const g = c.getContext('2d');
        g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        dataUrl = c.toDataURL('image/jpeg', qualidade);
        if (dataUrl.length < 450000) break; // bem abaixo do limite de 1 MB por registro
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

  async function salvarBase() {
    const nome = $('#kitNome').value.trim();
    if (!nome) { ctx.toast('Dê um nome ao kit'); $('#kitNome').focus(); return; }
    const itens = Object.fromEntries(Object.entries(k.qtd).filter(([id, q]) => q > 0 && acharItem(id)));
    if (!Object.keys(itens).length) { ctx.toast('Escolha pelo menos um item'); return; }
    const existente = acharKit(k.editandoBase);
    const kit = {
      ...(existente || {}),
      id: existente?.id || novoId(),
      nome, itens, foto: k.foto || '',
      criadoEm: existente?.criadoEm || new Date().toISOString(),
    };
    if (await salvarDoc('kits', kit, existente ? 'Kit salvo' : 'Kit base criado')) dlgKit.close();
  }

  async function semearExemplo() {
    const agora = Date.now();
    const ids = {};
    for (const [chave, nome, categoria] of EXEMPLO_ITENS) {
      const id = novoId(); ids[chave] = id;
      await ctx.store().salvarDoc('itens', { id, nome, categoria, preco: 0, custo: '', criadoEm: new Date(agora).toISOString(), atualizadoPor: ctx.quem() });
    }
    let n = 0;
    for (const [nome, itensChave] of EXEMPLO_KITS) {
      const itens = Object.fromEntries(Object.entries(itensChave).map(([c, q]) => [ids[c], q]));
      await ctx.store().salvarDoc('kits', { id: novoId(), nome, itens, foto: '', criadoEm: new Date(agora + ++n).toISOString(), atualizadoPor: ctx.quem() });
    }
    ctx.toast('Lista criada. Agora defina os preços.');
  }

  // ---------------- Item ----------------
  function abrirItem(item) {
    k.editandoItem = item ? item.id : null;
    formItem.reset();
    $('#itemErro').textContent = '';
    $('#itemTitulo').textContent = item ? 'Editar item' : 'Novo item';
    $('#excluirItem').hidden = !item;
    formItem.nome.value = item?.nome || '';
    formItem.categoria.value = item?.categoria || '';
    formItem.preco.value = paraCampo(item?.preco);
    formItem.custo.value = paraCampo(item?.custo);
    const cats = [...new Set([...ORDEM_CATEGORIAS, ...k.itens.map(i => i.categoria).filter(Boolean)])];
    $('#listaCategorias').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
    dlgItem.showModal();
    if (!item) formItem.nome.focus();
    else if (!Number(item.preco)) formItem.preco.focus();
  }

  formItem.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = formItem.nome.value.trim();
    if (!nome) { $('#itemErro').textContent = 'Preencha o nome do item.'; formItem.nome.focus(); return; }
    const existente = acharItem(k.editandoItem);
    const custoTxt = formItem.custo.value.trim();
    const item = {
      ...(existente || {}),
      id: existente?.id || novoId(),
      nome,
      categoria: formItem.categoria.value.trim() || 'Outros',
      preco: lerNumero(formItem.preco.value),
      custo: custoTxt ? lerNumero(custoTxt) : '',
      criadoEm: existente?.criadoEm || new Date().toISOString(),
    };
    if (await salvarDoc('itens', item, existente ? 'Item salvo' : 'Item cadastrado')) dlgItem.close();
  });

  $('#excluirItem').addEventListener('click', async () => {
    const item = acharItem(k.editandoItem); if (!item) return;
    const usados = k.kits.filter(x => (x.itens || {})[item.id] > 0).map(x => x.nome);
    const aviso = usados.length ? `\n\nEle sai também de: ${usados.join(', ')}.` : '';
    if (!confirm(`Excluir "${item.nome}"?${aviso}`)) return;
    dlgItem.close();
    await ctx.store().excluirDoc('itens', item.id);
    ctx.toast('Item excluído', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('itens', item) });
  });

  // ---------------- Eventos do diálogo de kit ----------------
  $('#kitItens').addEventListener('change', e => {
    if (!e.target.classList.contains('stepper-qtd')) return;
    const id = e.target.closest('.kit-linha')?.dataset.iid;
    if (id) mudarQtd(id, lerNumero(e.target.value));
  });
  $('#kitItens').addEventListener('focusin', e => { if (e.target.classList.contains('stepper-qtd')) e.target.select(); });
  $('#kitQtd').addEventListener('input', renderTotal);
  $('#kitDesconto').addEventListener('input', renderTotal);

  $('#kitFotoArquivo').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      k.foto = await comprimirFoto(file);
      renderFoto();
    } catch {
      ctx.toast('Não foi possível abrir essa foto');
    }
  });
  $('#kitFotoRemover').addEventListener('click', () => { k.foto = ''; renderFoto(); });

  $('#kitSalvar').addEventListener('click', salvarBase);
  $('#kitExcluir').addEventListener('click', async () => {
    const kit = acharKit(k.editandoBase); if (!kit) return;
    if (!confirm(`Excluir o kit base "${kit.nome}"? Os itens e preços continuam cadastrados.`)) return;
    dlgKit.close();
    await ctx.store().excluirDoc('kits', kit.id);
    ctx.toast('Kit excluído', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('kits', kit) });
  });

  $('#kitSalvarComoBase').addEventListener('click', () => {
    if (!linhas(k.qtd).length) { ctx.toast('Escolha pelo menos um item'); return; }
    const qtd = { ...k.qtd };
    dlgKit.close();
    abrirBase(null, qtd);
    $('#kitNome').focus();
  });

  $('#kitCopiar').addEventListener('click', async () => {
    if (!linhas(k.qtd).length) { ctx.toast('Escolha os itens do kit'); return; }
    ctx.toast(await copiar(mensagem()) ? 'Mensagem copiada. Cole na conversa do cliente.' : 'Não foi possível copiar');
  });

  $('#kitCriarPedido').addEventListener('click', () => {
    const t = totais();
    if (!t.ls.length) { ctx.toast('Escolha os itens do kit'); return; }
    const nome = nomeMontagem();
    const itensTxt = t.ls.map(l => `• ${l.qtd}x ${l.nome}`).join('\n');
    const descricao = `${t.n}x ${/^kit\b/i.test(nome) ? nome : 'Kit ' + nome}\n${itensTxt}`;
    const obs = t.d ? `Desconto de ${String(t.d).replace('.', ',')}% (${dinheiro(t.preco)} → ${dinheiro(t.porKit)} por kit)` : '';
    const kit = {
      nome, baseId: k.baseId || '', quantidade: t.n, desconto: t.d,
      valorPorKit: t.porKit,
      itens: t.ls.map(l => ({ id: l.id, nome: l.nome, qtd: l.qtd, preco: l.preco })),
    };
    dlgKit.close();
    ctx.abrirPedido({ descricao, valor: t.total, obs }, { kit });
  });

  // ---------------- Cliques (tela e diálogos) ----------------
  document.addEventListener('click', e => {
    const alvo = e.target.closest('[data-kacao]');
    if (!alvo) return;
    const acao = alvo.dataset.kacao;
    const kid = alvo.closest('[data-kid]')?.dataset.kid;
    if (acao === 'exemplo') semearExemplo();
    else if (acao === 'novo-item') abrirItem();
    else if (acao === 'editar-item') abrirItem(acharItem(alvo.dataset.iid));
    else if (acao === 'novo-base') abrirBase();
    else if (acao === 'editar-base') abrirBase(acharKit(kid));
    else if (acao === 'montar') abrirMontador(kid);
    else if (acao === 'trocar-base') {
      k.baseId = kid || null;
      k.qtd = { ...(acharKit(kid)?.itens || {}) };
      renderBases(); renderItensDialogo(); renderTotal();
    } else if (acao === 'enviar-foto') enviarFoto();
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
        if (dlgKit.open) { renderItensDialogo(); renderTotal(); }
        ctx.aoMudar();
      }),
      st.onColecao('kits', lista => {
        k.kits = lista;
        if (dlgKit.open && k.modo === 'montar') renderBases();
        ctx.aoMudar();
      }),
    ];
  }

  return { html, conectar, abrirMontador };
}
