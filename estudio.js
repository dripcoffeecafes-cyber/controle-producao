// Estúdio de preparo: tela cheia com a cara da Blooming, para preparar café guiado pela receita e gravar vídeos.
// Feita para o notebook do Adriano (1920×1080 com escala de 125% = 1536×864 em tela cheia; 1536×695 com o Chrome à
// mostra) e para toque. Tudo é medido em "u" (--u), que acompanha a altura da tela, então cabe nas duas alturas.
// Fluxo: Antes de começar (balança, café, tara) → o tempo começa sozinho com a água → etapas da receita
// (despeje até X g / aguarde / drenagem) → Pronto (resumo, salvar).

import {
  etapasDaReceita, janelaDaEtapa, perfilAlvo, alvoNoTempo, criarGuia, corDaFamilia, METODOS, proporcaoDe, mmss,
} from './receitas.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const g1 = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const g0 = v => Math.round(v).toLocaleString('pt-BR');
const prop = (agua, dose) => (dose > 0 ? `1:${(Math.max(0, agua) / dose).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : '1:0');

const ICONES = {
  cheia: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>',
  sair: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  lapis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg>',
};

export function criarEstudio(ctx) {
  // ctx: { balanca: () => objeto da balança (tara, tipo, colocar, despejar, despejarPerfil) | null,
  //   conexao: () => 'desconectada'|'conectando'|'pareando'|'conectada'|'reconectando', nomeBalanca: () => texto,
  //   bateria: () => número|null, conectar: (simulado) => Promise, tarar: () => void, toast, aoTerminar: (dados) => void }
  const S = {
    montado: false, aberto: false,
    receita: null, etapas: [], perfil: [], guia: null, cor: corDaFamilia(), cafe: '', editandoCafe: false,
    relogio: 'pronto', t0: 0, tFim: 0, amostras: [], vazaoMax: 0, picoAgua: 0,
    peso: 0, vazao: 0, taraEm: 0, armado: false, pesoAntesTara: 0,
    referencia: null, raf: 0, wakeLock: null, saidaPedida: 0, estavelDesde: 0, ultimoToque: 0, cache: {},
  };
  let el;

  // ---------------- Estrutura ----------------
  function montar() {
    if (S.montado) return;
    S.montado = true;
    el = document.createElement('div');
    el.className = 'es';
    el.id = 'estudio';
    el.hidden = true;
    el.innerHTML = `
      <header class="es-topo">
        <img class="es-logo" src="marca/logo-blooming-horizontal-branco.png" alt="Blooming Club Cafés Especiais">
        <div class="es-titulo">
          <span class="es-rotulo" id="esMetodo"></span>
          <button type="button" class="es-cafe" id="esCafe" aria-label="Nome do café (toque para trocar)"></button>
          <input class="es-cafe-campo" id="esCafeCampo" maxlength="60" placeholder="Nome do café" aria-label="Nome do café" hidden>
        </div>
        <ul class="es-fichas" id="esFichas"></ul>
        <div class="es-topo-acoes">
          <span class="es-demo" id="esDemo" hidden>
            <button type="button" class="es-chip" data-demo="cafe">Simular café</button>
            <button type="button" class="es-chip" data-demo="agua">Simular água</button>
          </span>
          <span class="es-bal" id="esBal"><i></i><span></span></span>
          <button type="button" class="es-icone" id="esTelaCheia" aria-label="Tela cheia">${ICONES.cheia}</button>
          <button type="button" class="es-icone" id="esFechar" aria-label="Sair do estúdio">${ICONES.sair}</button>
        </div>
      </header>
      <div class="es-aviso" id="esAviso" role="alert" hidden></div>
      <main class="es-corpo">
        <section class="es-grafico" aria-label="Gráfico do preparo"><canvas id="esCanvas"></canvas></section>
        <section class="es-etapa" id="esEtapa" aria-live="polite"></section>
      </main>
      <section class="es-nums" aria-label="Números do preparo">
        <div class="es-num es-num-peso"><span class="es-rotulo">Peso</span><div><strong id="esPeso">0,0</strong><small>g</small></div><div class="es-agua"><b><i id="esAguaBarra"></i></b><em id="esAgua"></em></div></div>
        <div class="es-num"><span class="es-rotulo">Tempo</span><div><strong id="esTempo">0:00</strong></div><em id="esTempoAlvo"></em></div>
        <div class="es-num"><span class="es-rotulo">Vazão</span><div><strong id="esVazao">0,0</strong><small>g/s</small></div><em id="esVazaoInfo"></em></div>
        <div class="es-num"><span class="es-rotulo">Proporção</span><div><strong id="esProp">1:0</strong></div><em id="esPropAlvo"></em></div>
      </section>
      <nav class="es-linha" id="esLinha" aria-label="Etapas da receita"></nav>
      <footer class="es-controles" id="esControles"></footer>`;
    document.body.appendChild(el);
    ligar();
  }

  // ---------------- Abrir e fechar ----------------
  async function abrir(receita, opcoes = {}) {
    montar();
    S.receita = receita || null;
    S.etapas = receita ? etapasDaReceita(receita) : [];
    S.perfil = receita ? perfilAlvo(receita) : [];
    S.cor = corDaFamilia(receita?.familia);
    S.referencia = opcoes.referencia || null;
    S.cafe = opcoes.cafe || receita?.cafe || '';
    el.style.setProperty('--acento', S.cor);
    el.classList.toggle('es-sem-receita', !receita);
    zerar(true);
    renderTopo();
    renderLinhaEstrutura();
    S.aberto = true;
    el.hidden = false;
    document.body.classList.add('com-estudio');
    if (opcoes.telaCheia !== false) telaCheia(true);
    manterTelaAcesa(true);
    atualizarConexao();
    iniciarLoop();
  }
  function fechar() {
    S.aberto = false;
    el.hidden = true;
    document.body.classList.remove('com-estudio');
    cancelAnimationFrame(S.raf); S.raf = 0;
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    manterTelaAcesa(false);
  }
  function pedirSaida() {
    if (S.relogio !== 'rodando' || Date.now() - S.saidaPedida < 3000) { fechar(); return; }
    S.saidaPedida = Date.now();
    ctx.toast('Toque de novo em sair para encerrar o preparo');
  }
  function telaCheia(ligarTela) {
    try {
      if (ligarTela && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
      if (!ligarTela && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    } catch {}
  }
  async function manterTelaAcesa(sim) {
    try {
      if (sim && 'wakeLock' in navigator && !S.wakeLock) { S.wakeLock = await navigator.wakeLock.request('screen'); S.wakeLock.addEventListener?.('release', () => { S.wakeLock = null; }); }
      if (!sim && S.wakeLock) { await S.wakeLock.release(); S.wakeLock = null; }
    } catch {}
  }

  // ---------------- Balança ----------------
  // chamado pela Extração a cada peso recebido (já com a vazão calculada)
  function receberPeso(g, vazao) {
    S.peso = g; S.vazao = vazao;
    if (!S.aberto) return;
    const agora = performance.now();
    if (S.relogio === 'pronto' && !S.taraEm) S.pesoAntesTara = g;
    if (S.relogio === 'pronto' && S.armado && agora - S.taraEm > 700 && g >= 1) iniciar();
    if (S.relogio === 'rodando') {
      const t = (agora - S.t0) / 1000;
      S.amostras.push([t, g, vazao]);
      S.vazaoMax = Math.max(S.vazaoMax, vazao);
      S.picoAgua = Math.max(S.picoAgua, g);
      S.guia?.atualizar(t, g);
      // terminou o tempo da receita e a água parou de cair: finaliza sozinho
      if (S.guia?.fase === 'fim') {
        if (vazao < 0.15) { S.estavelDesde ||= agora; if (agora - S.estavelDesde > 4000) parar(); } else S.estavelDesde = 0;
      }
    }
  }
  function tarar() {
    if (ctx.conexao() !== 'conectada') return;
    ctx.tarar();
    S.taraEm = performance.now();
    S.armado = S.relogio === 'pronto';
  }
  function atualizarConexao() {
    if (!S.montado) return;
    const st = ctx.conexao(), b = $('#esBal', el);
    b.dataset.estado = st;
    const sim = ctx.balanca()?.tipo === 'simulador';
    const bat = ctx.bateria();
    $('span', b).textContent = {
      desconectada: 'Balança desconectada', conectando: 'Conectando…', pareando: 'Pareando…', reconectando: 'Reconectando…',
      conectada: sim ? 'Demonstração' : `Balança${bat != null ? ` · ${bat}%` : ''}`,
    }[st] || '';
    $('#esDemo', el).hidden = !(sim && st === 'conectada');
    renderControles();
  }
  function aviso(texto) {
    if (!S.montado) return;
    const a = $('#esAviso', el);
    a.textContent = texto || '';
    a.hidden = !texto;
  }

  // ---------------- Relógio ----------------
  function iniciar() {
    if (S.relogio === 'rodando') return;
    S.relogio = 'rodando';
    S.armado = false;
    S.t0 = performance.now();
    S.amostras = [[0, Math.max(0, S.peso), 0]];
    S.vazaoMax = 0; S.picoAgua = 0; S.estavelDesde = 0;
    S.guia = S.etapas.length ? criarGuia(S.etapas) : null;
    renderControles();
  }
  function parar() {
    if (S.relogio !== 'rodando') return;
    S.tFim = (performance.now() - S.t0) / 1000;
    S.relogio = 'fim';
    renderControles();
  }
  function zerar(silencioso) {
    S.relogio = 'pronto'; S.amostras = []; S.tFim = 0; S.vazaoMax = 0; S.picoAgua = 0;
    S.taraEm = 0; S.armado = false; S.guia = null; S.estavelDesde = 0; S.cache = {};
    if (!silencioso) renderControles();
  }
  const tempo = () => S.relogio === 'rodando' ? (performance.now() - S.t0) / 1000 : S.relogio === 'fim' ? S.tFim : 0;
  const aguaFinal = () => S.relogio === 'fim' ? (S.amostras.at(-1)?.[1] ?? S.peso) : S.peso;

  // nome do café na tela: troca rápida para o vídeo, sem mexer na receita (vai junto para o Salvar preparo)
  function editarCafe() {
    if (S.relogio === 'rodando' || S.editandoCafe) return;
    S.editandoCafe = true;
    const bt = $('#esCafe', el), campo = $('#esCafeCampo', el);
    campo.value = S.cafe;
    bt.hidden = true; campo.hidden = false;
    campo.focus(); campo.select();
  }
  function fimEditarCafe(salvar) {
    if (!S.editandoCafe) return;
    S.editandoCafe = false;
    const bt = $('#esCafe', el), campo = $('#esCafeCampo', el);
    if (salvar) S.cafe = campo.value.trim();
    campo.hidden = true; bt.hidden = false;
    renderTopo();
  }

  function terminar() {
    const final = aguaFinal();
    ctx.aoTerminar?.({
      receita: S.receita, cafe: S.cafe, tempo: S.tFim, aguaFinal: final, amostras: S.amostras,
      vazaoMedia: S.tFim ? final / S.tFim : 0,
    });
  }

  // ---------------- Desenho do topo, da linha de etapas e dos controles ----------------
  function renderTopo() {
    const r = S.receita;
    const metodo = METODOS[r?.metodo]?.nome || 'Receita';
    $('#esMetodo', el).textContent = !r ? 'Preparo livre' : metodo.toLowerCase() === String(r.nome).trim().toLowerCase() ? metodo : `${metodo} · ${r.nome}`;
    $('#esCafe', el).innerHTML = `<span>${esc((S.cafe || (r ? 'Café especial' : 'Blooming Club')).toUpperCase())}</span><i>${ICONES.lapis}</i>`;
    // água e proporção já aparecem nos números de baixo (alvo); aqui ficam dose, temperatura e moagem
    const fichas = r ? [
      ['Café', `${g1(r.dose).replace(',0', '')} g`],
      r.temperatura ? ['Temperatura', `${g0(r.temperatura)} °C`] : null, r.moagem ? ['Moagem', r.moagem] : null,
    ].filter(Boolean) : [];
    $('#esFichas', el).innerHTML = fichas.map(([k, v]) => `<li><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join('');
  }

  function renderLinhaEstrutura() {
    const linha = $('#esLinha', el);
    linha.hidden = !S.etapas.length;
    if (!S.etapas.length) { linha.innerHTML = ''; return; }
    linha.innerHTML = S.etapas.map((e, i) => {
      const [a, b] = janelaDaEtapa(S.etapas, i);
      return `<div class="es-seg" data-i="${i}" style="flex-grow:${Math.max(1, b - a)}">
        <span class="es-seg-nome">${esc(e.nome)}</span>
        <b class="es-seg-barra"><i></i></b>
        <span class="es-seg-info">${e.tipo === 'despejo' ? `${g0(e.ate)} g` : mmss(e.fim)}</span>
      </div>`;
    }).join('');
  }

  function renderControles() {
    if (!S.montado) return;
    const c = $('#esControles', el);
    const conectada = ctx.conexao() === 'conectada';
    const st = S.relogio;
    const temGuia = !!S.etapas.length;
    let html = '';
    if (st === 'pronto') {
      html = `
        <button type="button" class="es-btn" data-acao="tara" ${conectada ? '' : 'disabled'}>Tara</button>
        <button type="button" class="es-btn es-btn-forte" data-acao="iniciar">Iniciar</button>
        ${temGuia ? '<button type="button" class="es-btn" data-acao="proxima" disabled>Próxima etapa</button>' : ''}
        <button type="button" class="es-btn" data-acao="zerar">Zerar</button>`;
    } else if (st === 'rodando') {
      html = `
        <button type="button" class="es-btn" data-acao="tara" disabled>Tara</button>
        <button type="button" class="es-btn es-btn-forte es-btn-parar" data-acao="parar">${S.guia?.fase === 'fim' ? 'Finalizar' : 'Parar'}</button>
        ${temGuia ? '<button type="button" class="es-btn" data-acao="proxima">Próxima etapa</button>' : ''}
        <button type="button" class="es-btn" data-acao="zerar" disabled>Zerar</button>`;
    } else {
      html = `
        <button type="button" class="es-btn es-btn-forte" data-acao="salvar">Salvar preparo</button>
        <button type="button" class="es-btn" data-acao="novo">Novo preparo</button>
        <button type="button" class="es-btn" data-acao="sair">Sair</button>`;
    }
    if (S.cache.controles !== html) { c.innerHTML = html; S.cache.controles = html; }
    el.dataset.relogio = st;
  }

  // ---------------- Cartão da etapa ----------------
  function cartao() {
    const r = S.receita, t = tempo(), w = S.relogio === 'fim' ? aguaFinal() : S.peso;
    const conectada = ctx.conexao() === 'conectada';
    if (S.relogio === 'pronto') {
      const dose = r?.dose || 0;
      const cafeOk = S.armado || (dose && Math.abs(S.pesoAntesTara - dose) <= Math.max(0.5, dose * 0.05));
      const primeiro = S.etapas[0];
      const itens = [
        [conectada, 'Balança conectada', conectada ? (ctx.nomeBalanca() || '') : '<button type="button" class="es-chip es-chip-forte" data-acao="conectar">Conectar</button>'],
        r ? [cafeOk, `Café na balança`, `${g1(S.taraEm ? S.pesoAntesTara : S.peso)} g de ${g1(dose).replace(',0', '')} g`] : null,
        [S.armado, 'Tara feita', S.armado ? 'pronto para a água' : 'toque em Tara'],
      ].filter(Boolean);
      return {
        chave: 'pronto', rotulo: r ? 'Antes de começar' : 'Preparo livre',
        nome: r ? (primeiro?.blooming ? 'Hora do blooming' : 'Prepare a receita') : 'No seu ritmo',
        acao: r && primeiro ? `Despeje até ${g0(primeiro.ate)} g: o tempo começa sozinho com a água` : 'O tempo começa sozinho quando a água cair na balança',
        lista: itens,
      };
    }
    if (S.relogio === 'fim') {
      return {
        chave: 'fim', rotulo: r ? r.nome : 'Preparo livre', nome: 'Pronto', grande: mmss(S.tFim),
        resumo: [['Água', `${g0(w)} g`], ['Proporção', prop(w, r?.dose || 0)], ['Vazão média', `${g1(S.tFim ? w / S.tFim : 0)} g/s`]],
        acao: r ? `Alvo da receita: ${g0(r.agua)} g em ${mmss(r.tempoTotal)}` : 'Salve para guardar a curva no histórico',
      };
    }
    // rodando
    if (!S.guia) {
      return { chave: 'livre', rotulo: 'Preparo livre', nome: 'Despeje no seu ritmo', grande: g0(w) + ' g', acao: S.vazao > 0.3 ? `Vazão de ${g1(S.vazao)} g/s` : 'Pare quando chegar na proporção que você quer' };
    }
    const k = S.guia.k, fase = S.guia.fase, e = S.etapas[k], n = S.etapas.length;
    const rotulo = `Etapa ${Math.min(k + 1, n)} de ${n}`;
    if (fase === 'despejo') {
      const falta = e.ate - w;
      const passou = w - e.ate > Math.max(2, (e.ate - e.de) * 0.03);
      const esperado = alvoNoTempo(S.perfil, t);
      const dif = w - esperado, folga = Math.max(4, (e.ate - e.de) * 0.08);
      const ritmo = t < e.inicio ? '' : Math.abs(dif) <= folga ? 'No ritmo' : dif > 0 ? `Adiantado ${g0(dif)} g` : `Atrasado ${g0(-dif)} g`;
      const prox = S.etapas[k + 1];
      return {
        chave: `d${k}`, rotulo, nome: e.nome, ritmo,
        acao: passou ? `Passou ${g0(w - e.ate)} g do alvo` : `Despeje até ${g0(e.ate)} g`,
        grande: falta > 0.5 ? `${g0(falta)} g` : 'Pare',
        grandeLegenda: falta > 0.5 ? 'faltam' : 'alvo atingido',
        progresso: (w - e.de) / Math.max(1, e.ate - e.de), alerta: passou,
        pe: [`De ${mmss(e.inicio)} a ${mmss(e.fim)}`, e.ateTempo != null ? `Depois: aguarde até ${mmss(e.ateTempo)}` : prox ? `Depois: drenagem até ${mmss(prox.fim)}` : ''],
      };
    }
    if (fase === 'espera') {
      const prox = S.etapas[k + 1];
      const desde = S.guia.feitos[k] ?? e.fim;
      const total = Math.max(1, e.ateTempo - Math.min(desde, e.ateTempo - 1));
      return {
        chave: `e${k}`, rotulo, nome: e.blooming ? 'Blooming' : 'Pausa',
        acao: e.blooming ? 'Aguarde o café florescer' : 'Aguarde a água baixar',
        grande: mmss(Math.max(0, e.ateTempo - t)), grandeLegenda: 'próximo despejo em',
        progresso: 1 - Math.max(0, e.ateTempo - t) / total,
        pe: [prox ? `Próximo: ${prox.nome} até ${g0(prox.ate)} g` : '', `Às ${mmss(e.ateTempo)}`],
      };
    }
    if (fase === 'drenagem') {
      return {
        chave: 'dren', rotulo, nome: 'Drenagem', acao: 'Deixe a água passar pelo café',
        grande: mmss(Math.max(0, e.ateTempo - t)), grandeLegenda: 'para o fim da receita',
        progresso: (t - e.inicio) / Math.max(1, e.ateTempo - e.inicio),
        pe: [`Termina às ${mmss(e.ateTempo)}`, ''],
      };
    }
    return {
      chave: 'quase', rotulo: 'Fim da receita', nome: 'Quase pronto', acao: 'Finaliza sozinho quando a água parar de cair',
      grande: mmss(t), grandeLegenda: 'tempo total', progresso: 1, pe: ['', ''],
    };
  }

  function renderEtapa() {
    const c = cartao(), box = $('#esEtapa', el);
    const estrutura = `${c.chave}|${c.lista ? c.lista.map(x => x[0]).join() + (c.lista[0][2] || '').length : ''}`;
    if (S.cache.etapa !== estrutura) {
      S.cache.etapa = estrutura;
      box.innerHTML = `
        <div class="es-etapa-topo"><span class="es-rotulo" data-c="rotulo"></span><span class="es-ritmo" data-c="ritmo"></span></div>
        <h2 class="es-etapa-nome" data-c="nome"></h2>
        <p class="es-etapa-acao" data-c="acao"></p>
        ${c.lista ? `<ul class="es-lista">${c.lista.map(([ok, txt, extra], i) => `<li class="${ok ? 'ok' : ''}"><i>${ok ? ICONES.ok : i + 1}</i><span>${esc(txt)}</span><small data-c="li${i}">${extra && extra.startsWith('<button') ? extra : esc(extra)}</small></li>`).join('')}</ul>` : ''}
        ${c.grande != null ? `<div class="es-grande"><small data-c="grandeLegenda"></small><strong data-c="grande"></strong></div>` : ''}
        ${c.progresso != null ? '<div class="es-barra"><i data-c="barra"></i></div>' : ''}
        ${c.resumo ? `<dl class="es-resumo">${c.resumo.map(([k]) => `<div><dt>${esc(k)}</dt><dd data-c="r-${esc(k)}"></dd></div>`).join('')}</dl>` : ''}
        ${c.pe ? '<div class="es-etapa-pe"><span data-c="pe0"></span><span data-c="pe1"></span></div>' : ''}`;
      box.classList.remove('es-troca'); void box.offsetWidth; box.classList.add('es-troca');
    }
    const put = (k, v) => { const n = box.querySelector(`[data-c="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
    put('rotulo', c.rotulo || ''); put('ritmo', c.ritmo || ''); put('nome', c.nome || ''); put('acao', c.acao || '');
    put('grande', c.grande ?? ''); put('grandeLegenda', c.grandeLegenda || '');
    if (c.lista) c.lista.forEach(([, , extra], i) => { if (!(extra || '').startsWith('<button')) put(`li${i}`, extra || ''); });
    if (c.resumo) c.resumo.forEach(([k, v]) => put(`r-${k}`, v));
    if (c.pe) { put('pe0', c.pe[0] || ''); put('pe1', c.pe[1] || ''); }
    const barra = box.querySelector('[data-c="barra"]');
    if (barra) barra.style.width = `${Math.max(0, Math.min(1, c.progresso || 0)) * 100}%`;
    box.classList.toggle('es-alerta', !!c.alerta);
    const ritmo = box.querySelector('[data-c="ritmo"]');
    if (ritmo) ritmo.dataset.tipo = !c.ritmo ? '' : c.ritmo === 'No ritmo' ? 'ok' : 'fora';
  }

  // ---------------- Números e linha de etapas (a cada quadro) ----------------
  function renderNumeros() {
    const r = S.receita, t = tempo(), w = S.relogio === 'fim' ? aguaFinal() : S.peso;
    const set = (id, v) => { const n = $('#' + id, el); if (n.textContent !== v) n.textContent = v; };
    set('esPeso', g1(w));
    set('esTempo', mmss(t));
    set('esVazao', g1(S.relogio === 'fim' ? (S.tFim ? Math.max(0, w) / S.tFim : 0) : S.relogio === 'rodando' ? S.vazao : 0));
    set('esVazaoInfo', S.relogio === 'fim' ? 'média' : S.vazaoMax > 0.5 ? `máx. ${g1(S.vazaoMax)}` : '');
    set('esProp', prop(S.relogio === 'pronto' ? 0 : w, r?.dose || 0));
    set('esPropAlvo', r ? `alvo ${prop(r.agua, r.dose)}` : '');
    set('esTempoAlvo', r ? `de ${mmss(r.tempoTotal)}` : '');
    set('esAgua', r ? `de ${g0(r.agua)} g` : '');
    $('#esAguaBarra', el).style.width = r ? `${Math.max(0, Math.min(1, (S.relogio === 'pronto' ? 0 : w) / Math.max(1, r.agua))) * 100}%` : '0%';
    if (S.etapas.length) {
      const k = S.guia ? S.guia.k : -1, fim = S.relogio === 'fim' || S.guia?.fase === 'fim';
      el.querySelectorAll('.es-seg').forEach((seg, i) => {
        const [a, b] = janelaDaEtapa(S.etapas, i);
        const feito = fim || i < k;
        const atual = !fim && i === k && S.relogio === 'rodando';
        const p = feito ? 1 : atual ? Math.max(0, Math.min(1, (t - a) / Math.max(1, b - a))) : 0;
        seg.classList.toggle('feito', feito); seg.classList.toggle('atual', atual);
        seg.querySelector('i').style.width = `${p * 100}%`;
      });
    }
  }

  // ---------------- Gráfico ----------------
  function desenhar() {
    const cv = $('#esCanvas', el); if (!cv) return;
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(rect.width * dpr) || cv.height !== Math.round(rect.height * dpr)) { cv.width = Math.round(rect.width * dpr); cv.height = Math.round(rect.height * dpr); }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height;
    c.clearRect(0, 0, W, H);
    // mesma unidade do CSS (--u): textos do gráfico do mesmo tamanho dos rótulos da tela, legíveis no vídeo
    const u = Math.max(5, Math.min(innerHeight / 100, innerWidth / 177.78));
    const pad = { l: u * 5.4, r: u * 2.2, t: u * 4.6, b: u * 3.8 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const r = S.receita, t = tempo(), am = S.amostras;
    const ref = S.referencia?.pesos || [];
    const tFim = Math.max(r ? r.tempoTotal * 1.06 : 0, t + 8, ref.length * 0.5, 60);
    const gMax = Math.max(r ? r.agua * 1.1 : 0, ...am.map(a => a[1] * 1.06), ...ref, 50);
    const vMax = Math.max(8, S.vazaoMax * 1.3);
    const X = s => pad.l + (s / tFim) * pw;
    const Y = g => pad.t + ph - (Math.max(0, g) / gMax) * ph;
    const YV = v => pad.t + ph - (Math.max(0, v) / vMax) * ph * 0.28;
    const acento = S.cor;
    const fonteRot = `650 ${Math.round(u * 1.3)}px "Archivo Marca", Archivo, system-ui, sans-serif`;
    const fonteNum = `500 ${Math.round(u * 1.4)}px "Archivo Marca", Archivo, system-ui, sans-serif`;
    const larga = () => { if ('fontStretch' in c) c.fontStretch = 'expanded'; if ('letterSpacing' in c) c.letterSpacing = `${(u * 0.13).toFixed(1)}px`; };
    const normal = () => { if ('fontStretch' in c) c.fontStretch = 'normal'; if ('letterSpacing' in c) c.letterSpacing = '0px'; };
    c.lineCap = 'round'; c.lineJoin = 'round';

    // faixas dos despejos
    if (S.etapas.length) {
      S.etapas.forEach((e, i) => {
        if (e.tipo !== 'despejo') return;
        const atual = S.guia && S.guia.k === i && S.relogio === 'rodando';
        c.fillStyle = atual ? hexA(acento, 0.13) : 'rgba(255,255,255,0.035)';
        c.fillRect(X(e.inicio), pad.t, Math.max(2, X(e.fim) - X(e.inicio)), ph);
        c.save();
        c.font = fonteRot; c.fillStyle = atual ? acento : 'rgba(255,255,255,0.5)';
        c.textBaseline = 'bottom'; c.textAlign = 'left'; larga();
        c.fillText(e.nome.toUpperCase(), X(e.inicio) + 2, pad.t - u * 0.9);
        normal();
        c.restore();
      });
    }
    // grade
    c.font = fonteNum; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(255,255,255,0.07)'; c.lineWidth = 1; c.fillStyle = 'rgba(255,255,255,0.4)';
    const passoG = gMax > 400 ? 100 : gMax > 150 ? 50 : gMax > 60 ? 20 : 10;
    c.textAlign = 'right';
    for (let g = 0; g <= gMax; g += passoG) {
      const y = Math.round(Y(g)) + 0.5;
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke();
      c.fillText(`${g}`, pad.l - u * 1.2, y);
    }
    const passoT = tFim > 300 ? 60 : 30;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let s = 0; s <= tFim; s += passoT) c.fillText(mmss(s), X(s), pad.t + ph + u * 1.2);
    c.textAlign = 'left'; c.textBaseline = 'bottom'; c.fillStyle = 'rgba(255,255,255,0.4)';
    // alvos de cada despejo (linha fina e o peso na direita)
    if (S.etapas.length) {
      c.setLineDash([u * 0.4, u * 0.8]); c.strokeStyle = 'rgba(255,255,255,0.16)';
      S.etapas.filter(e => e.tipo === 'despejo').forEach(e => {
        const y = Math.round(Y(e.ate)) + 0.5;
        c.beginPath(); c.moveTo(X(e.inicio), y); c.lineTo(W - pad.r, y); c.stroke();
      });
      c.setLineDash([]);
    }
    // referência (preparo salvo que está sendo repetido)
    if (ref.length > 1) {
      c.strokeStyle = 'rgba(169,166,162,0.45)'; c.lineWidth = Math.max(1.5, u * 0.22);
      c.beginPath(); ref.forEach((g, i) => { const x = X(i * 0.5), y = Y(g); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    }
    // curva-alvo da receita
    if (S.perfil.length > 1) {
      c.setLineDash([u * 0.9, u * 0.9]); c.strokeStyle = 'rgba(255,255,255,0.42)'; c.lineWidth = Math.max(1.5, u * 0.26);
      c.beginPath(); S.perfil.forEach(([s, g], i) => { const x = X(s), y = Y(g); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
      c.setLineDash([]);
    }
    legenda();
    if (am.length < 2) {
      if (S.relogio === 'pronto') {
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `italic 500 ${Math.round(u * 2.1)}px Newsreader, Georgia, serif`;
        const txt = r ? 'A linha tracejada é a receita. A sua curva aparece por cima.' : 'A curva aparece quando a água cair na balança.';
        const tw = c.measureText(txt).width, tx = pad.l + pw / 2, ty = pad.t + ph * 0.42;
        c.fillStyle = 'rgba(29,29,27,0.92)'; c.fillRect(tx - tw / 2 - u * 1.6, ty - u * 2, tw + u * 3.2, u * 4);
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillText(txt, tx, ty);
      }
      return;
    }
    // vazão (área baixa e discreta)
    c.beginPath(); c.moveTo(X(am[0][0]), YV(0));
    am.forEach(([s, , v]) => c.lineTo(X(s), YV(v)));
    c.lineTo(X(am.at(-1)[0]), YV(0)); c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
    // peso: área e linha na cor do café
    c.beginPath(); c.moveTo(X(am[0][0]), Y(0));
    am.forEach(([s, g]) => c.lineTo(X(s), Y(g)));
    c.lineTo(X(am.at(-1)[0]), Y(0)); c.closePath();
    const grad = c.createLinearGradient(0, pad.t, 0, pad.t + ph);
    grad.addColorStop(0, hexA(acento, 0.28)); grad.addColorStop(1, hexA(acento, 0));
    c.fillStyle = grad; c.fill();
    c.beginPath(); am.forEach(([s, g], i) => { const x = X(s), y = Y(g); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.strokeStyle = acento; c.lineWidth = Math.max(2.5, u * 0.42); c.stroke();
    // ponto atual e linha do tempo agora
    const [sx, sg] = am.at(-1), x = X(sx), y = Y(sg);
    if (S.relogio === 'rodando') {
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(Math.round(x) + 0.5, pad.t); c.lineTo(Math.round(x) + 0.5, pad.t + ph); c.stroke();
      const pulso = u * (0.9 + 0.5 * (0.5 + 0.5 * Math.sin(performance.now() / 230)));
      c.fillStyle = hexA(acento, 0.3); c.beginPath(); c.arc(x, y, pulso * 1.6, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, Math.max(3.5, u * 0.55), 0, Math.PI * 2); c.fill();

    function legenda() {
      const itens = [['Peso', 'linha']];
      if (S.perfil.length > 1) itens.push(['Receita', 'tracejada']);
      if (ref.length > 1) itens.push(['Anterior', 'referencia']);
      itens.push(['Vazão', 'area']);
      c.save();
      c.font = fonteRot; c.textBaseline = 'middle'; c.textAlign = 'left'; larga();
      let lx = pad.l + u * 1.6;
      const ly = pad.t + u * 1.8, amostra = u * 2.6;
      itens.forEach(([nome, tipo]) => {
        c.lineWidth = Math.max(2, u * 0.32); c.setLineDash([]);
        if (tipo === 'linha') { c.strokeStyle = acento; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + amostra, ly); c.stroke(); }
        else if (tipo === 'tracejada') { c.strokeStyle = 'rgba(255,255,255,0.55)'; c.setLineDash([u * 0.6, u * 0.6]); c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + amostra, ly); c.stroke(); c.setLineDash([]); }
        else if (tipo === 'referencia') { c.strokeStyle = 'rgba(169,166,162,0.6)'; c.beginPath(); c.moveTo(lx, ly); c.lineTo(lx + amostra, ly); c.stroke(); }
        else { c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(lx, ly - u * 0.55, amostra, u * 1.1); }
        lx += amostra + u * 0.9;
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillText(nome.toUpperCase(), lx, ly);
        lx += c.measureText(nome.toUpperCase()).width + u * 2.4;
      });
      normal();
      c.restore();
    }
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ---------------- Laço de desenho ----------------
  function iniciarLoop() {
    cancelAnimationFrame(S.raf);
    const quadro = () => {
      if (!S.aberto) { S.raf = 0; return; }
      if (S.relogio === 'rodando' && S.guia) S.guia.atualizar(tempo(), S.peso); // espera e drenagem andam pelo tempo
      renderEtapa(); renderNumeros(); renderControles(); desenhar();
      // botões discretos durante o preparo (aparecem ao tocar)
      el.classList.toggle('es-quieto', S.relogio === 'rodando' && performance.now() - S.ultimoToque > 4500);
      S.raf = requestAnimationFrame(quadro);
    };
    S.raf = requestAnimationFrame(quadro);
  }

  // ---------------- Eventos ----------------
  function ligar() {
    el.addEventListener('pointerdown', () => { S.ultimoToque = performance.now(); }, { passive: true });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-acao]');
      if (b && !b.disabled) {
        const a = b.dataset.acao;
        if (a === 'tara') tarar();
        else if (a === 'iniciar') iniciar();
        else if (a === 'parar') parar();
        else if (a === 'proxima') { if (S.guia) { S.guia.pular(tempo()); S.ultimoToque = performance.now(); } }
        else if (a === 'zerar' || a === 'novo') zerar();
        else if (a === 'salvar') terminar();
        else if (a === 'sair') fechar();
        else if (a === 'conectar') ctx.conectar(false);
        return;
      }
      const demo = e.target.closest('[data-demo]');
      if (demo) {
        const bal = ctx.balanca();
        if (!bal?.colocar) return;
        if (demo.dataset.demo === 'cafe') bal.colocar(S.receita?.dose || 15);
        else { tarar(); setTimeout(() => { S.receita ? bal.despejarPerfil(S.perfil) : bal.despejar(); }, 900); }
      }
    });
    $('#esFechar', el).onclick = pedirSaida;
    $('#esCafe', el).onclick = editarCafe;
    const campo = $('#esCafeCampo', el);
    campo.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); fimEditarCafe(true); }
      else if (e.key === 'Escape') { e.preventDefault(); fimEditarCafe(false); }
    });
    campo.addEventListener('blur', () => fimEditarCafe(true));
    $('#esTelaCheia', el).onclick = () => telaCheia(!document.fullscreenElement);
    document.addEventListener('fullscreenchange', () => { if (S.montado) el.classList.toggle('es-cheia', !!document.fullscreenElement); });
    document.addEventListener('keydown', e => {
      if (!S.aberto || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.target?.closest?.('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      S.ultimoToque = performance.now();
      if (k === ' ') { e.preventDefault(); S.relogio === 'rodando' ? parar() : S.relogio === 'pronto' ? iniciar() : zerar(); }
      else if (k === 't') tarar();
      else if (k === 'n' || k === 'arrowright') { if (S.guia && S.relogio === 'rodando') S.guia.pular(tempo()); }
      else if (k === 'z' && S.relogio !== 'rodando') zerar();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.aberto) manterTelaAcesa(true); });
    window.addEventListener('resize', () => { S.cache.etapa = ''; });
  }

  return {
    abrir, fechar, receberPeso, atualizarConexao, aviso,
    get aberto() { return S.aberto; },
  };
}
