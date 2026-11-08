// Moedores manuais da equipe: quantos cliques dar para cada nível de moagem.
// Coleção equipes/{chave}/moedores: { id, nome (apelido), modelo, tabela: { nível: cliques }, padrao, obs, criado/atualizado Em/Por }.
// Os cliques contam a partir do zero (mós fechadas até travar, sem café). Cada moedor tem a sua tabela, que começa
// na tabela de fábrica do modelo e pode ser regulada nível por nível ou calibrada inteira (+1/−1 em todos).
// Receita: o nível vem do campo moagem; a receita pode guardar cliques próprios por moedor em receita.cliques { idMoedor: n }.
// Extração: guarda moedorId, moedorNome e cliques do preparo (servem de sugestão para o mesmo café e método).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Os 6 níveis de moagem do editor de receitas (mesma ordem, do mais fino ao mais grosso)
export const NIVEIS = ['Extra-fina', 'Fina', 'Média-fina', 'Média', 'Média-grossa', 'Grossa'];
export const chaveNivel = txt => {
  const t = String(txt || '').trim().toLowerCase();
  return NIVEIS.find(n => n.toLowerCase() === t) || null;
};
const tab = arr => Object.fromEntries(NIVEIS.map((n, i) => [n, arr[i]]));

// Granulometria alvo de cada nível (µm, tamanho médio da partícula), pelo meio das faixas por método do
// Honest Coffee Guide: espresso 180–380, moka 360–660, V60 400–700, coado 410–930, prensa 690–1300.
export const MICRONS = tab([280, 450, 600, 700, 850, 1000]);
export const USO = tab(['espresso', 'moka, AeroPress fino', 'V60, drip', 'Kalita, Origami, AeroPress', 'Chemex', 'prensa francesa']);

// Calcula a tabela a partir dos níveis que a pessoa informou (âncoras):
// 2 âncoras → reta pelos dois pontos (cliques × µm), as outras saem dela; 1 âncora → a tabela de fábrica deslocada;
// nenhuma → a de fábrica. As âncoras ficam exatamente como foram informadas.
export function calcularTabela(modelo, ancoras = []) {
  const mo = MODELOS_MOEDOR[modelo] || MODELOS_MOEDOR.outro;
  const lim = v => Math.max(0, Math.min(mo.max, Math.round(v)));
  const a = ancoras.filter(x => NIVEIS.includes(x.nivel) && Number.isFinite(x.cliques));
  let t;
  if (a.length >= 2) {
    const [p, q] = a.slice(-2);
    const dm = MICRONS[q.nivel] - MICRONS[p.nivel], dc = q.cliques - p.cliques;
    if (!dm || dc * dm <= 0) return { tabela: null, erro: `${q.nivel} precisa ter ${dm > 0 ? 'mais' : 'menos'} cliques que ${p.nivel} (moagem ${dm > 0 ? 'mais grossa' : 'mais fina'}).` };
    const porClique = dm / dc; // µm por clique deste moedor
    t = tab(NIVEIS.map(n => lim(p.cliques + (MICRONS[n] - MICRONS[p.nivel]) / porClique)));
    t.porClique = porClique;
  } else if (a.length === 1) {
    const d = a[0].cliques - mo.tabela[a[0].nivel];
    t = tab(NIVEIS.map(n => lim(mo.tabela[n] + d)));
  } else t = { ...mo.tabela };
  a.forEach(x => { t[x.nivel] = lim(x.cliques); });
  const porClique = t.porClique; delete t.porClique;
  return { tabela: t, porClique: porClique ? Math.round(porClique) : null, erro: '' };
}

// Tabelas de fábrica (pontos de partida; cada moedor e cada café pedem ajuste).
// faixas: referência por método, para mostrar na regulagem.
export const MODELOS_MOEDOR = {
  'timemore-c2': {
    nome: 'Timemore C2', unidade: 'cliques', max: 36,
    tabela: tab([8, 11, 14, 16, 19, 22]),
    faixas: 'Espresso 6–12 · AeroPress 10–14 · Coado 14–18 · Prensa 20–24',
  },
  'timemore-c3': {
    nome: 'Timemore C3 / C3S', unidade: 'cliques', max: 36,
    tabela: tab([7, 10, 13, 15, 17, 19]),
    faixas: 'Espresso 7–8 · Moka 9–11 · AeroPress 13–14 · Coado 13–16 · Prensa 17–20 (fabricante)',
  },
  'comandante-c40': {
    nome: 'Comandante C40', unidade: 'cliques', max: 50,
    tabela: tab([8, 14, 20, 24, 28, 32]),
    faixas: 'Espresso 7–12 · Moka 12–15 · AeroPress 16–20 · Coado 18–28 · Prensa 28–34',
  },
  'icoffee-m6-max': {
    nome: 'iCoffee M6-MAX', unidade: 'no disco', max: 12,
    tabela: tab([3, 6, 8, 9, 10, 12]),
    faixas: 'Disco de 1 a 12: Espresso 1–6 · Coado 7–10 · Prensa 11–12 (fabricante)',
  },
  outro: {
    nome: 'Outro moedor', unidade: 'cliques', max: 60,
    tabela: tab([6, 10, 14, 18, 22, 26]),
    faixas: 'Monte a tabela com os cliques do seu moedor.',
  },
};
export const modeloDe = m => MODELOS_MOEDOR[m?.modelo] || MODELOS_MOEDOR.outro;
export const unidadeDe = m => modeloDe(m).unidade;
export const textoCliques = (m, n) => n == null ? '' : unidadeDe(m) === 'no disco' ? `${n} no disco` : `${n} ${n === 1 ? 'clique' : 'cliques'}`;

// Cliques para um nível (com a tabela do moedor; nível fora da lista = null)
export function cliquesDoNivel(m, moagem) {
  const k = chaveNivel(moagem);
  if (!m || !k) return null;
  const v = m.tabela?.[k];
  return Number.isFinite(v) ? v : modeloDe(m).tabela[k];
}
// Cliques para a receita: os próprios da receita para este moedor, senão os da tabela
export const cliquesDaReceita = (r, m) => (m && Number.isFinite(r?.cliques?.[m.id]) ? r.cliques[m.id] : cliquesDoNivel(m, r?.moagem));

// Sugestão pelo histórico: o último preparo do mesmo café e método neste moedor (os bem avaliados primeiro)
export function sugestaoDoHistorico(extracoes, { cafe, metodo, moedorId }) {
  const c = String(cafe || '').trim().toLowerCase();
  if (!c || !moedorId) return null;
  const xs = extracoes
    .filter(x => x.moedorId === moedorId && Number.isFinite(x.cliques) && String(x.cafe || '').trim().toLowerCase() === c && (!metodo || x.metodo === metodo))
    .sort((a, b) => ((b.avaliacao >= 4) - (a.avaliacao >= 4)) || String(b.criadoEm).localeCompare(String(a.criadoEm)));
  return xs[0] ? { cliques: xs[0].cliques, avaliacao: xs[0].avaliacao || 0, quando: xs[0].criadoEm } : null;
}

const ICONE_MOEDOR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10M12 4v3M8 7h8l-1 13H9L8 7Z"/><path d="M12 7c3 0 5-1 6-3"/></svg>';

// ---------------- Área: bloco "Moedores" e a janela de regulagem ----------------
export function criarMoedores(ctx) {
  // ctx: { store: () => store, toast, quem, aoMudar() }
  const M = { lista: [], editando: null, container: null };
  const lista = () => [...M.lista].sort((a, b) => (b.padrao - a.padrao) || String(a.nome).localeCompare(String(b.nome)));
  const padrao = () => lista()[0] || null;
  const achar = id => M.lista.find(m => m.id === id) || null;

  // janela de regulagem (criada uma vez)
  const dlg = document.createElement('dialog');
  dlg.id = 'dlgMoedor';
  dlg.className = 'sheet sheet-ficha';
  dlg.innerHTML = `
    <form id="formMoedor" method="dialog" novalidate>
      <div class="sheet-topo">
        <h2 id="moedorTitulo">Moedor</h2>
        <button type="button" class="icon-btn" data-fechar aria-label="Fechar"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M6.7 5.3a1 1 0 0 0-1.4 1.4L10.6 12l-5.3 5.3a1 1 0 1 0 1.4 1.4l5.3-5.3 5.3 5.3a1 1 0 0 0 1.4-1.4L13.4 12l5.3-5.3a1 1 0 0 0-1.4-1.4L12 10.6 6.7 5.3Z"/></svg></button>
      </div>
      <div class="sheet-corpo">
        <fieldset class="campo-categoria"><legend>Modelo</legend><div class="rc-escolhas" id="moedorModelos"></div></fieldset>
        <label>Apelido<input name="nome" maxlength="40" autocomplete="off" placeholder="Ex.: Comandante da loja"></label>
        <div class="md-regulagem">
          <div class="md-reg-cab">
            <h3>Regulagem</h3>
            <p class="muted" id="moedorFaixas"></p>
            <p class="md-passo" id="moedorPasso"></p>
          </div>
          <div class="md-tabela" id="moedorTabela"></div>
          <div class="md-calibrar">
            <span>Mover a tabela inteira (calibração do zero)</span>
            <button type="button" class="btn btn-sm" data-mcal="-1">− 1</button>
            <button type="button" class="btn btn-sm" data-mcal="1">+ 1</button>
            <button type="button" class="btn-link" data-mcal="fabrica">Voltar à sugestão do fabricante</button>
          </div>
          <p class="muted md-dica">Como usar: acerte duas moagens que você já conhece no seu moedor (ex.: a do seu V60 e a da sua prensa) e o app calcula as outras pela granulometria de cada uma; ao salvar, vira a tabela padrão deste moedor. O zero é com as mós fechadas: sem café, gire o regulador no sentido de apertar até travar e conte os cliques a partir daí. Se o café sai mais grosso que o esperado no mesmo número, calibre com − 1; se sai mais fino, + 1.</p>
        </div>
        <label class="md-check"><input type="checkbox" name="padrao"> Usar este moedor por padrão nas receitas e no estúdio</label>
        <label>Observações<textarea name="obs" rows="2" placeholder="Ex.: troquei as mós em 11/2026"></textarea></label>
        <p class="erro" id="moedorErro" role="alert"></p>
      </div>
      <div class="sheet-rodape">
        <button type="button" class="btn btn-perigo" id="excluirMoedor">Excluir</button>
        <span class="espaco"></span>
        <button type="button" class="btn" data-fechar>Cancelar</button>
        <button type="submit" class="btn btn-primary">Salvar moedor</button>
      </div>
    </form>`;
  document.body.appendChild(dlg);
  const f = $('#formMoedor', dlg);

  function abrir(m) {
    const novo = !m;
    M.editando = m ? JSON.parse(JSON.stringify(m)) : { novo: true, modelo: 'comandante-c40', nome: '', tabela: { ...MODELOS_MOEDOR['comandante-c40'].tabela }, padrao: !M.lista.length, obs: '' };
    if (!M.editando.tabela) M.editando.tabela = { ...modeloDe(M.editando).tabela };
    M.editando.ancoras = [...(M.editando.ancoras || [])];
    M.erro = '';
    $('#moedorTitulo', dlg).textContent = novo ? 'Novo moedor' : 'Regular moedor';
    f.nome.value = M.editando.nome || '';
    f.padrao.checked = !!M.editando.padrao;
    f.obs.value = M.editando.obs || '';
    $('#excluirMoedor', dlg).hidden = novo;
    $('#moedorErro', dlg).textContent = '';
    renderModelos(); renderTabela();
    dlg.showModal();
  }
  function renderModelos() {
    $('#moedorModelos', dlg).innerHTML = Object.entries(MODELOS_MOEDOR).map(([k, mo]) =>
      `<button type="button" data-mmodelo="${k}" aria-pressed="${k === M.editando.modelo}">${esc(mo.nome)}</button>`).join('');
    $('#moedorFaixas', dlg).textContent = `Sugestão do fabricante: ${modeloDe(M.editando).faixas}`;
  }
  function renderTabela() {
    const m = M.editando, mo = modeloDe(m), anc = m.ancoras.map(x => x.nivel);
    const calc = anc.length >= 2 ? 'calculado' : anc.length === 1 ? 'ajustado' : 'fábrica';
    const r = calcularTabela(m.modelo, m.ancoras);
    $('#moedorPasso', dlg).textContent = M.erro || (anc.length >= 2 && r.porClique
      ? `Com ${anc.join(' e ')} informados: cerca de ${r.porClique} µm por clique neste moedor. As outras moagens foram calculadas.`
      : anc.length === 1 ? `Informe mais uma moagem para o app calcular as outras pela granulometria.` : 'Tabela sugerida pelo fabricante. Informe duas moagens que você já conhece e o app calcula o resto.');
    $('#moedorPasso', dlg).classList.toggle('erro', !!M.erro);
    $('#moedorTabela', dlg).innerHTML = NIVEIS.map(n => {
      const v = m.tabela[n], fab = mo.tabela[n], eh = anc.includes(n);
      return `<div class="md-linha${eh ? ' md-ancora' : ''}" data-nivel="${esc(n)}">
        <div class="md-nivel"><b>${esc(n)}</b><small>${esc(USO[n])} · ≈${MICRONS[n]} µm</small></div>
        <span class="md-selo">${eh ? 'você informou' : esc(calc)}${!eh && v !== fab ? ` · fábrica ${fab}` : ''}</span>
        <div class="md-stepper">
          <button type="button" data-mpasso="-1" aria-label="Menos um em ${esc(n)}">−</button>
          <input inputmode="numeric" value="${v}" aria-label="${esc(mo.unidade)} para ${esc(n)}">
          <button type="button" data-mpasso="1" aria-label="Mais um em ${esc(n)}">+</button>
        </div>
      </div>`;
    }).join('');
  }
  // a pessoa informou os cliques de um nível: vira âncora (ficam as duas últimas) e o resto é recalculado
  function informar(nivel, cliques) {
    const m = M.editando;
    m.ancoras = [...m.ancoras.filter(x => x.nivel !== nivel), { nivel, cliques: limitar(cliques) }].slice(-2);
    const r = calcularTabela(m.modelo, m.ancoras);
    if (r.erro) { M.erro = r.erro; m.tabela[nivel] = limitar(cliques); }
    else { M.erro = ''; m.tabela = r.tabela; }
    renderTabela();
  }
  const limitar = v => Math.max(0, Math.min(modeloDe(M.editando).max, Math.round(v)));

  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-fechar]')) { dlg.close(); return; }
    const mod = e.target.closest('[data-mmodelo]');
    if (mod) {
      const mudou = mod.dataset.mmodelo !== M.editando.modelo;
      M.editando.modelo = mod.dataset.mmodelo;
      if (mudou) { M.editando.tabela = { ...modeloDe(M.editando).tabela }; M.editando.ancoras = []; M.erro = ''; }
      if (!f.nome.value.trim() || Object.values(MODELOS_MOEDOR).some(x => x.nome === f.nome.value.trim())) f.nome.value = modeloDe(M.editando).nome;
      renderModelos(); renderTabela(); return;
    }
    const passo = e.target.closest('[data-mpasso]');
    if (passo) {
      const n = passo.closest('.md-linha').dataset.nivel;
      informar(n, (M.editando.tabela[n] || 0) + Number(passo.dataset.mpasso));
      return;
    }
    const cal = e.target.closest('[data-mcal]');
    if (cal) {
      if (cal.dataset.mcal === 'fabrica') { M.editando.tabela = { ...modeloDe(M.editando).tabela }; M.editando.ancoras = []; M.erro = ''; }
      else {
        const d = Number(cal.dataset.mcal);
        NIVEIS.forEach(n => { M.editando.tabela[n] = limitar(M.editando.tabela[n] + d); });
        M.editando.ancoras = M.editando.ancoras.map(x => ({ ...x, cliques: limitar(x.cliques + d) }));
      }
      renderTabela();
    }
  });
  dlg.addEventListener('change', e => {
    const l = e.target.closest('.md-linha');
    if (!l) return;
    const v = parseFloat(String(e.target.value).replace(',', '.'));
    if (Number.isFinite(v)) informar(l.dataset.nivel, v); else renderTabela();
  });
  $('#excluirMoedor', dlg).onclick = async () => {
    const m = M.editando;
    await ctx.store().excluirDoc('moedores', m.id);
    dlg.close();
    ctx.toast('Moedor excluído', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('moedores', limpar(m)) });
  };
  const limpar = m => { const c = { ...m }; delete c.novo; return c; };
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const m = M.editando;
    if (M.erro) { $('#moedorErro', dlg).textContent = M.erro; return; }
    m.nome = f.nome.value.trim() || modeloDe(m).nome;
    m.padrao = f.padrao.checked;
    m.obs = f.obs.value.trim();
    const agora = new Date().toISOString();
    const doc = limpar(m);
    if (m.novo) { doc.id = novoId(); doc.criadoEm = agora; doc.criadoPor = ctx.quem(); }
    doc.atualizadoEm = agora; doc.atualizadoPor = ctx.quem();
    try {
      // só um padrão: tira a marca dos outros
      if (doc.padrao) for (const o of M.lista.filter(o => o.padrao && o.id !== doc.id)) await ctx.store().salvarDoc('moedores', { ...o, padrao: false });
      await ctx.store().salvarDoc('moedores', doc);
      dlg.close();
      ctx.toast('Moedor salvo');
    } catch { $('#moedorErro', dlg).textContent = 'Não deu para salvar. Confira a internet e tente de novo.'; }
  });

  // ---------------- Bloco na área Extração ----------------
  function render(container) {
    if (container) M.container = container;
    const el = M.container;
    if (!el) return;
    const ls = lista();
    el.innerHTML = `
      <div class="ex2-cab">
        <div><h3>Moedores</h3><p>Quantos cliques dar em cada moagem. A receita e o estúdio mostram os cliques do moedor escolhido.</p></div>
        <button type="button" class="btn btn-primary" data-mdacao="novo">Adicionar moedor</button>
      </div>
      ${ls.length ? `<div class="md-grade">${ls.map(m => `
        <article class="md-card" data-moid="${esc(m.id)}">
          <div class="md-card-topo">
            <i class="md-ic">${ICONE_MOEDOR}</i>
            <div><h4>${esc(m.nome)}</h4><small>${esc(modeloDe(m).nome)}${m.padrao ? ' · <b>padrão</b>' : ''}</small></div>
          </div>
          <ol class="md-mini">${NIVEIS.map(n => `<li><span>${esc(n)}</span><b>${cliquesDoNivel(m, n)}</b></li>`).join('')}</ol>
          <div class="md-card-acoes">
            ${m.padrao ? '' : '<button type="button" class="btn-link" data-mdacao="padrao">Tornar padrão</button>'}
            <span class="espaco"></span>
            <button type="button" class="btn btn-sm" data-mdacao="regular">Regular</button>
          </div>
        </article>`).join('')}</div>`
      : '<p class="ex-vazio">Nenhum moedor ainda. Adicione o seu (Timemore, Comandante, iCoffee…) para ver os cliques nas receitas.</p>'}`;
  }
  function ligarBloco(container) {
    container.addEventListener('click', async e => {
      const b = e.target.closest('[data-mdacao]'); if (!b) return;
      const a = b.dataset.mdacao, m = achar(b.closest("[data-moid]")?.dataset.moid);
      if (a === 'novo') abrir(null);
      else if (a === 'regular' && m) abrir(m);
      else if (a === 'padrao' && m) {
        for (const o of M.lista.filter(o => o.padrao)) await ctx.store().salvarDoc('moedores', { ...o, padrao: false });
        await ctx.store().salvarDoc('moedores', { ...m, padrao: true, atualizadoEm: new Date().toISOString(), atualizadoPor: ctx.quem() });
      }
    });
  }

  function conectar() {
    const st = ctx.store();
    if (!st?.onColecao) return [];
    return [st.onColecao('moedores', l => { M.lista = l; render(); ctx.aoMudar?.(); }, () => ctx.toast('Erro ao carregar os moedores'))];
  }

  return { lista, padrao, achar, abrir, render, ligarBloco, conectar };
}
