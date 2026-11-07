// Estúdio de preparo: tela cheia para preparar café guiado pela receita e gravar vídeos.
// Visual no conceito que o Adriano escolheu: painel escuro com números em degradê, gráfico com brilho,
// cartões de fluxo, proporção, progresso e status à direita, etapas embaixo e os controles numa coluna à
// esquerda, com a marca Blooming no topo.
// Feita para o notebook do Adriano (1920×1080 com escala de 125% = 1536×864 em tela cheia; 1536×695 com o
// Chrome à mostra) e para toque. Tudo é medido em "u" (--u), que acompanha a altura da tela.
// Fluxo: Antes de começar (balança, café, tara) → o tempo começa sozinho com a água → etapas da receita
// (despeje até X g / aguarde / drenagem) → Pronto (resumo, salvar).

import { etapasDaReceita, perfilAlvo, alvoNoTempo, criarGuia, corDaFamilia, METODOS, mmss } from './receitas.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const g1 = v => { const r = Math.round(v * 10) / 10; return (Math.abs(r) < 0.05 ? 0 : r).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
const g0 = v => Math.round(v).toLocaleString('pt-BR');
const prop = (agua, dose) => (dose > 0 ? `1:${(Math.max(0, agua) / dose).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : '1:0');
const mm = s => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
// mesma unidade do CSS (--u)
const unidade = () => (innerWidth <= innerHeight ? innerWidth / 64 : Math.max(4, Math.min(innerHeight / 100, innerWidth / 177.78)));
const FONTE = '"Archivo Marca", Archivo, system-ui, sans-serif';

const SVG = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONES = {
  cheia: SVG('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  sair: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
  ok: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  lapis: SVG('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>'),
  bt: SVG('<path d="M7 7l10 10-5 4V3l5 4L7 17"/>'),
  tara: SVG('<path d="M4 19.5h16l-2.2-11H6.2L4 19.5Z"/><rect x="9" y="12" width="6" height="3.6" rx=".8"/><path d="M9.5 5.5h5"/>'),
  play: SVG('<path d="M8.5 5.8v12.4L18.5 12 8.5 5.8Z"/>'),
  stop: SVG('<rect x="7" y="7" width="10" height="10" rx="1.8"/>'),
  proxima: SVG('<path d="M6.5 6.5l7.5 5.5-7.5 5.5v-11Z"/><path d="M17.5 6.5v11"/>'),
  zerar: SVG('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4.5H9"/>'),
  salvar: SVG('<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>'),
  novo: SVG('<path d="M12 5v14M5 12h14"/>'),
  gota: SVG('<path d="M12 3.5c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0c0-3.3 3-6.5 6-10.5Z"/>'),
  ampulheta: SVG('<path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5V6a4 4 0 0 0 1.6 3.2L12 11l2.4-1.8A4 4 0 0 0 16 6V3.5M8 20.5V18a4 4 0 0 1 1.6-3.2L12 13l2.4 1.8A4 4 0 0 1 16 18v2.5"/>'),
  xicara: SVG('<path d="M4.5 9.5h11v3.5a5.5 5.5 0 0 1-11 0V9.5Z"/><path d="M15.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-2"/><path d="M8 3.5c0 1.3 1 1.5 1 3M12 3.5c0 1.3 1 1.5 1 3"/>'),
  gira: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/></svg>',
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
    marcos: [], faseAnt: '',
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
        <div class="es-meta" id="esMeta"></div>
        <div class="es-topo-acoes">
          <span class="es-demo" id="esDemo" hidden>
            <button type="button" class="es-chip" data-demo="cafe">Simular café</button>
            <button type="button" class="es-chip" data-demo="agua">Simular água</button>
          </span>
          <button type="button" class="es-icone" id="esTelaCheia" aria-label="Tela cheia">${ICONES.cheia}</button>
          <button type="button" class="es-icone" id="esFechar" aria-label="Sair do estúdio">${ICONES.sair}</button>
        </div>
      </header>
      <div class="es-aviso" id="esAviso" role="alert" hidden></div>
      <div class="es-palco">
        <nav class="es-trilho" id="esTrilho" aria-label="Controles do preparo"></nav>
        <section class="es-heroi" aria-label="Peso e tempo">
          <div class="es-h"><span class="es-rot">Peso atual</span><strong class="es-grande es-peso"><span id="esPeso">0,0</span><small>g</small></strong></div>
          <div class="es-h es-h-tempo"><span class="es-rot">Tempo de extração</span><strong class="es-grande es-tempo" id="esTempo">00:00</strong></div>
          <div class="es-h es-guia" id="esGuia" aria-live="polite">
            <i class="es-guia-icone" data-g="icone"></i>
            <div class="es-guia-txt"><span class="es-rot" data-g="rot"></span><strong data-g="valor"></strong><small data-g="info"></small></div>
          </div>
        </section>
        <section class="es-grafico" aria-label="Gráfico do preparo"><canvas id="esCanvas"></canvas></section>
        <aside class="es-lado">
          <div class="es-card es-c-fluxo"><span class="es-rot" id="esFluxoRot">Fluxo atual</span><strong><span id="esVazao">0,0</span><small>g/s</small></strong><canvas class="es-mini" id="esBarras"></canvas></div>
          <div class="es-card es-c-prop"><div class="es-card-linha"><span class="es-rot" id="esPropRot">Proporção</span><small id="esPropAlvo"></small></div><strong id="esProp">1:0</strong><canvas class="es-mini" id="esPropLinha"></canvas></div>
          <div class="es-card es-c-prog">
            <div class="es-c-prog-txt"><span class="es-rot" id="esProgRot">Progresso</span><strong id="esProg">0%</strong><small id="esProgInfo"></small></div>
            <svg class="es-anel" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="esAnelCor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2FF9A"/><stop offset="1" stop-color="#2FCF6E"/></linearGradient></defs><circle class="es-anel-fundo" cx="50" cy="50" r="40"/><circle class="es-anel-valor" id="esAnel" cx="50" cy="50" r="40" pathLength="100"/></svg>
          </div>
          <div class="es-card es-c-status" id="esStatus"></div>
        </aside>
        <section class="es-etapas" id="esEtapas" aria-label="Etapas da receita"></section>
      </div>`;
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
    el.classList.toggle('es-sem-receita', !receita);
    zerar(true);
    renderTopo();
    renderEtapasEstrutura();
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
      if (S.guia) { S.guia.atualizar(t, g); acompanharFase(t, g); }
      // terminou o tempo da receita e a água parou de cair: finaliza sozinho
      if (S.guia?.fase === 'fim') {
        if (vazao < 0.15) { S.estavelDesde ||= agora; if (agora - S.estavelDesde > 4000) parar(); } else S.estavelDesde = 0;
      }
    }
  }
  // guarda onde cada despejo terminou (os pontos "45s / 45g" do gráfico)
  function acompanharFase(t, g) {
    if (!S.guia) return;
    const chave = `${S.guia.k}:${S.guia.fase}`;
    if (chave === S.faseAnt) return;
    const [k0, f0] = S.faseAnt.split(':');
    if (f0 === 'despejo' && S.etapas[+k0]?.tipo === 'despejo') S.marcos[+k0] = { t, g };
    S.faseAnt = chave;
  }
  function tarar() {
    if (ctx.conexao() !== 'conectada') return;
    ctx.tarar();
    S.taraEm = performance.now();
    S.armado = S.relogio === 'pronto';
  }
  function atualizarConexao() {
    if (!S.montado) return;
    const sim = ctx.balanca()?.tipo === 'simulador';
    $('#esDemo', el).hidden = !(sim && ctx.conexao() === 'conectada');
    renderTrilho();
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
    S.vazaoMax = 0; S.picoAgua = 0; S.estavelDesde = 0; S.marcos = []; S.faseAnt = '';
    S.guia = S.etapas.length ? criarGuia(S.etapas) : null;
    if (S.guia) S.faseAnt = `${S.guia.k}:${S.guia.fase}`;
    renderTrilho();
  }
  function parar() {
    if (S.relogio !== 'rodando') return;
    S.tFim = (performance.now() - S.t0) / 1000;
    S.relogio = 'fim';
    renderTrilho();
  }
  function zerar(silencioso) {
    S.relogio = 'pronto'; S.amostras = []; S.tFim = 0; S.vazaoMax = 0; S.picoAgua = 0; S.marcos = []; S.faseAnt = '';
    S.taraEm = 0; S.armado = false; S.guia = null; S.estavelDesde = 0; S.cache = {};
    if (!silencioso) renderTrilho();
  }
  function pular() {
    if (!S.guia || S.relogio !== 'rodando') return;
    const t = tempo();
    S.guia.pular(t);
    acompanharFase(t, S.peso);
    S.ultimoToque = performance.now();
  }
  const tempo = () => S.relogio === 'rodando' ? (performance.now() - S.t0) / 1000 : S.relogio === 'fim' ? S.tFim : 0;
  const aguaFinal = () => S.relogio === 'fim' ? (S.amostras.at(-1)?.[1] ?? S.peso) : S.peso;
  const pesoMostrado = () => S.relogio === 'fim' ? aguaFinal() : S.peso;

  // nome do café na tela: troca rápida para o vídeo, sem mexer na receita (vai junto para o Salvar preparo)
  function editarCafe() {
    if (S.relogio === 'rodando' || S.editandoCafe) return;
    S.editandoCafe = true;
    const bt = $('#esCafe', el), campo = $('#esCafeCampo', el);
    campo.value = S.cafe;
    bt.hidden = true; campo.hidden = false;
    campo.closest('.es-m')?.classList.add('editando');
    campo.focus(); campo.select();
  }
  function fimEditarCafe(salvar) {
    if (!S.editandoCafe) return;
    S.editandoCafe = false;
    if (salvar) S.cafe = $('#esCafeCampo', el).value.trim();
    renderTopo();
  }

  function terminar() {
    const final = aguaFinal();
    ctx.aoTerminar?.({
      receita: S.receita, cafe: S.cafe, tempo: S.tFim, aguaFinal: final, amostras: S.amostras,
      vazaoMedia: S.tFim ? final / S.tFim : 0,
    });
  }

  // ---------------- Topo (dados da receita numa linha) ----------------
  function renderTopo() {
    const r = S.receita;
    const item = (k, v, cls = '') => `<span class="es-m${cls}"><em>${esc(k)}</em><b>${esc(v)}</b></span>`;
    const metodo = METODOS[r?.metodo]?.nome || '';
    const nomeTemMetodo = r && metodo && String(r.nome).toLowerCase().includes(metodo.split(/[ /]/)[0].toLowerCase());
    const cafe = `<span class="es-m es-m-cafe${S.cafe ? '' : ' es-m-vazio'}"><em>Café</em>`
      + `<button type="button" class="es-cafe" id="esCafe" aria-label="Nome do café (toque para trocar)"><i class="es-grao"></i><span>${S.cafe ? esc(S.cafe) : 'toque para informar'}</span><i class="es-lapis">${ICONES.lapis}</i></button>`
      + '<input class="es-cafe-campo" id="esCafeCampo" maxlength="60" placeholder="Nome do café" aria-label="Nome do café" hidden></span>';
    const partes = r ? [
      item('Receita', r.nome, ' es-m-encolhe'),
      !nomeTemMetodo && metodo ? item('Método', metodo) : '',
      cafe,
      item('Proporção', prop(r.agua, r.dose)), item('Alvo', `${g0(r.agua)} g`), item('Pó', `${g1(r.dose).replace(',0', '')} g`),
      r.moagem ? item('Moagem', r.moagem) : '', r.temperatura ? item('Temperatura', `${g0(r.temperatura)} °C`) : '',
    ] : [item('Preparo', 'Livre'), cafe];
    $('#esMeta', el).innerHTML = partes.join('');
    el.style.setProperty('--grao', S.cor);
  }

  // ---------------- Controles (coluna da esquerda) ----------------
  function renderTrilho() {
    if (!S.montado) return;
    const st = S.relogio, estado = ctx.conexao(), conectada = estado === 'conectada';
    const sim = ctx.balanca()?.tipo === 'simulador', bat = ctx.bateria();
    const temGuia = !!S.etapas.length;
    const sub = {
      desconectada: 'Conectar', conectando: 'Conectando', pareando: 'Pareando', reconectando: 'Reconectando',
      conectada: sim ? 'Demonstração' : bat != null ? `Bateria ${bat}%` : 'Conectada',
    }[estado] || '';
    const bt = (acao, icone, rotulo, o = {}) => `<button type="button" class="es-tr${o.forte ? ' es-tr-forte' : ''}${o.parar ? ' es-tr-parar' : ''}" data-acao="${acao}"${o.desab ? ' disabled' : ''}><i>${ICONES[icone]}</i><span>${rotulo}</span></button>`;
    let html = `<button type="button" class="es-tr es-tr-bal" data-acao="${estado === 'desconectada' ? 'conectar' : 'nada'}" data-estado="${estado}"><i>${ICONES.bt}</i><span>Balança</span><small>${sub}</small></button><span class="es-trilho-sep"></span>`;
    if (st === 'pronto') {
      html += bt('tara', 'tara', 'Tara', { desab: !conectada }) + bt('iniciar', 'play', 'Iniciar', { forte: true })
        + (temGuia ? bt('proxima', 'proxima', 'Próxima', { desab: true }) : '') + bt('zerar', 'zerar', 'Zerar');
    } else if (st === 'rodando') {
      html += bt('tara', 'tara', 'Tara', { desab: true }) + bt('parar', 'stop', S.guia?.fase === 'fim' ? 'Finalizar' : 'Parar', { parar: true })
        + (temGuia ? bt('proxima', 'proxima', 'Próxima') : '') + bt('zerar', 'zerar', 'Zerar', { desab: true });
    } else {
      html += bt('salvar', 'salvar', 'Salvar', { forte: true }) + bt('novo', 'novo', 'Novo') + bt('sair', 'sair', 'Sair');
    }
    if (S.cache.trilho !== html) { $('#esTrilho', el).innerHTML = html; S.cache.trilho = html; }
    el.dataset.relogio = st;
  }

  // ---------------- Bloco da etapa (à direita do peso e do tempo) ----------------
  function guiaInfo() {
    const r = S.receita, t = tempo(), w = pesoMostrado();
    if (S.relogio === 'pronto') {
      const p = S.etapas[0];
      return r && p
        ? { icone: 'gota', rot: `${p.nome} até`, valor: `${g0(p.ate)} g`, info: 'O tempo começa sozinho com a água' }
        : { icone: 'xicara', rot: 'Preparo livre', valor: 'Livre', info: 'O tempo começa sozinho com a água' };
    }
    if (S.relogio === 'fim') {
      return { icone: 'ok', rot: 'Preparo concluído', valor: 'Pronto', info: r ? `Alvo: ${g0(r.agua)} g em ${mm(r.tempoTotal)}` : 'Salve para guardar no histórico', tipo: 'ok' };
    }
    if (!S.guia) return { icone: 'gota', rot: 'Preparo livre', valor: 'Livre', info: 'Pare quando chegar na proporção que quer' };
    const k = S.guia.k, fase = S.guia.fase, e = S.etapas[k];
    if (fase === 'despejo') {
      const falta = e.ate - w;
      if (w - e.ate > Math.max(2, (e.ate - e.de) * 0.03)) return { icone: 'gota', rot: 'Passou do alvo', valor: `+${g0(w - e.ate)} g`, info: `${e.nome} até ${g0(e.ate)} g`, tipo: 'alerta' };
      if (falta <= 0.5) return { icone: 'gota', rot: 'Alvo atingido', valor: 'Pare', info: `${e.nome} até ${g0(e.ate)} g`, tipo: 'ok' };
      return { icone: 'gota', rot: 'Faltam', valor: `${g0(falta)} g`, info: `${e.nome} até ${g0(e.ate)} g` };
    }
    if (fase === 'espera') {
      const prox = S.etapas[k + 1];
      return { icone: 'ampulheta', rot: 'Próximo despejo em', valor: mm(e.ateTempo - t), info: prox ? `${prox.nome} até ${g0(prox.ate)} g` : '', tipo: 'espera' };
    }
    if (fase === 'drenagem') return { icone: 'ampulheta', rot: 'Fim da receita em', valor: mm(e.ateTempo - t), info: 'Deixe a água passar pelo café', tipo: 'espera' };
    return { icone: 'ok', rot: 'Quase pronto', valor: 'Aguarde', info: 'Finaliza sozinho quando a água parar', tipo: 'ok' };
  }
  function renderGuia() {
    const g = guiaInfo(), box = $('#esGuia', el);
    const put = (k, v) => { const n = box.querySelector(`[data-g="${k}"]`); if (n.textContent !== v) n.textContent = v; };
    put('rot', g.rot); put('valor', g.valor); put('info', g.info || '');
    if (S.cache.icone !== g.icone) { box.querySelector('[data-g="icone"]').innerHTML = ICONES[g.icone] || ''; S.cache.icone = g.icone; }
    if ((box.dataset.tipo || '') !== (g.tipo || '')) box.dataset.tipo = g.tipo || '';
  }

  // ---------------- Cartão de status ----------------
  function statusInfo() {
    const r = S.receita, t = tempo(), w = pesoMostrado();
    if (S.relogio === 'pronto') {
      const conectada = ctx.conexao() === 'conectada', dose = r?.dose || 0;
      const cafeOk = S.armado || (dose && Math.abs(S.pesoAntesTara - dose) <= Math.max(0.5, dose * 0.05));
      return {
        rot: 'Antes de começar',
        lista: [
          [conectada, 'Balança conectada', conectada ? '' : '<button type="button" class="es-chip es-chip-forte" data-acao="conectar">Conectar</button>'],
          r ? [cafeOk, 'Café na balança', `${g1(S.taraEm ? S.pesoAntesTara : S.peso)} de ${g1(dose).replace(',0', '')} g`] : null,
          [S.armado, 'Tara feita', S.armado ? 'pronto' : 'toque em Tara'],
        ].filter(Boolean),
      };
    }
    if (S.relogio === 'fim') return { rot: 'Status', icone: 'ok', titulo: 'Preparo concluído', info: 'Salve para guardar a curva no histórico', tipo: 'ok' };
    if (!S.guia) return { rot: 'Status', icone: 'gira', titulo: 'Preparo livre', info: S.vazao > 0.3 ? `Despejando a ${g1(S.vazao)} g/s` : 'Pare quando quiser' };
    const k = S.guia.k, fase = S.guia.fase, e = S.etapas[k];
    if (fase === 'despejo') {
      if (w - e.ate > Math.max(2, (e.ate - e.de) * 0.03)) return { rot: 'Status', icone: 'gira', titulo: `${e.nome} ativo`, info: `Passou ${g0(w - e.ate)} g do alvo`, tipo: 'alerta' };
      if (t < e.inicio) return { rot: 'Status', icone: 'gira', titulo: `${e.nome} ativo`, info: `Começa às ${mmss(e.inicio)}` };
      const dif = w - alvoNoTempo(S.perfil, t), folga = Math.max(4, (e.ate - e.de) * 0.08);
      const ritmo = Math.abs(dif) <= folga ? ['No ritmo', 'ok'] : dif > 0 ? [`Adiantado ${g0(dif)} g`, 'aviso'] : [`Atrasado ${g0(-dif)} g`, 'aviso'];
      return { rot: 'Status', icone: 'gira', titulo: `${e.nome} ativo`, info: ritmo[0], tipo: ritmo[1] };
    }
    if (fase === 'espera') {
      const prox = S.etapas[k + 1];
      return { rot: 'Status', icone: 'gira', titulo: e.blooming ? 'Blooming: aguarde' : 'Pausa: aguarde', info: prox ? `${prox.nome} às ${mmss(e.ateTempo)}` : '' };
    }
    if (fase === 'drenagem') return { rot: 'Status', icone: 'gira', titulo: 'Drenagem', info: `Termina às ${mmss(e.ateTempo)}` };
    return { rot: 'Status', icone: 'gira', titulo: 'Quase pronto', info: 'Esperando a água parar' };
  }
  function renderStatus() {
    const s = statusInfo(), box = $('#esStatus', el);
    const estrutura = s.lista ? `l:${s.lista.map(x => `${x[0] ? 1 : 0}${(x[2] || '').startsWith('<') ? 'b' : ''}`).join()}` : `s:${s.icone}`;
    if (S.cache.status !== estrutura) {
      S.cache.status = estrutura;
      box.innerHTML = s.lista
        ? `<span class="es-rot" data-s="rot"></span><ul class="es-chk">${s.lista.map(([ok, txt, extra], i) => `<li class="${ok ? 'ok' : ''}"><i>${ok ? ICONES.ok : i + 1}</i><span>${esc(txt)}</span><small data-s="li${i}">${(extra || '').startsWith('<') ? extra : ''}</small></li>`).join('')}</ul>`
        : `<span class="es-rot" data-s="rot"></span><i class="es-status-icone es-status-${s.icone}">${ICONES[s.icone] || ''}</i><strong data-s="titulo"></strong><small data-s="info"></small>`;
    }
    const put = (k, v) => { const n = box.querySelector(`[data-s="${k}"]`); if (n && n.textContent !== v) n.textContent = v; };
    put('rot', s.rot);
    if (s.lista) s.lista.forEach(([, , extra], i) => { if (!(extra || '').startsWith('<')) put(`li${i}`, extra || ''); });
    else {
      put('titulo', s.titulo || ''); put('info', s.info || '');
      const info = box.querySelector('[data-s="info"]');
      if (info && (info.dataset.tipo || '') !== (s.tipo || '')) info.dataset.tipo = s.tipo || '';
    }
  }

  // ---------------- Números e cartões da direita ----------------
  function renderNumeros() {
    const r = S.receita, w = pesoMostrado();
    const set = (id, v) => { const n = $('#' + id, el); if (n.textContent !== v) n.textContent = v; };
    set('esPeso', g1(w));
    set('esTempo', mm(tempo()));
    const fim = S.relogio === 'fim';
    set('esFluxoRot', fim ? 'Fluxo médio' : 'Fluxo atual');
    set('esVazao', g1(fim ? (S.tFim ? Math.max(0, w) / S.tFim : 0) : S.relogio === 'rodando' ? S.vazao : 0));
    const agua = S.relogio === 'pronto' ? 0 : w;
    set('esPropRot', r ? 'Proporção' : 'Vazão máxima');
    set('esProp', r ? prop(agua, r.dose) : `${g1(S.vazaoMax)} g/s`);
    set('esPropAlvo', r ? `alvo ${prop(r.agua, r.dose)}` : 'no preparo');
    const p = r ? Math.max(0, Math.min(1, agua / Math.max(1, r.agua))) : 0;
    set('esProgRot', r ? 'Progresso' : 'Água');
    set('esProg', r ? `${Math.round(p * 100)}%` : `${g0(Math.max(0, agua))} g`);
    set('esProgInfo', r ? `de ${g0(r.agua)} g de água` : 'na balança');
    const anel = $('#esAnel', el);
    const dash = `${(p * 100).toFixed(2)} 100`;
    if (anel.style.strokeDasharray !== dash) anel.style.strokeDasharray = dash;
    anel.classList.toggle('vazio', p <= 0.002);
  }

  // ---------------- Etapas (cartões de baixo) ----------------
  function renderEtapasEstrutura() {
    const box = $('#esEtapas', el);
    box.innerHTML = S.etapas.map((e, i) => `<div class="es-et" data-i="${i}">
        <b class="es-et-n">${String(i + 1).padStart(2, '0')}.</b><i class="es-et-ok">${ICONES.ok}</i>
        <span class="es-et-nome">${esc(e.nome)}</span>
        <small class="es-et-info">(${Math.round(e.inicio)}–${Math.round(e.fim)}s) [${g0(e.ate)} g]</small>
        <span class="es-et-barra"><i></i></span>
      </div>`).join('');
  }
  function renderEtapas() {
    if (!S.etapas.length) return;
    const t = tempo(), w = pesoMostrado();
    const k = S.guia ? S.guia.k : -1, fase = S.guia?.fase, fim = S.relogio === 'fim' || fase === 'fim';
    el.querySelectorAll('.es-et').forEach((card, i) => {
      const e = S.etapas[i];
      const feito = fim || i < k, atual = !fim && i === k && S.relogio === 'rodando';
      let p = feito ? 1 : 0, espera = false;
      if (atual) {
        if (fase === 'despejo') p = (w - e.de) / Math.max(1, e.ate - e.de);
        else if (fase === 'espera') { espera = true; p = (t - (S.marcos[i]?.t ?? e.fim)) / Math.max(1, e.ateTempo - (S.marcos[i]?.t ?? e.fim)); }
        else if (fase === 'drenagem') { espera = true; p = (t - e.inicio) / Math.max(1, e.ateTempo - e.inicio); }
      }
      card.classList.toggle('feito', feito); card.classList.toggle('atual', atual); card.classList.toggle('espera', espera);
      const largura = `${(Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%`;
      const barra = card.querySelector('.es-et-barra i');
      if (barra.style.width !== largura) barra.style.width = largura;
    });
  }

  // ---------------- Gráfico principal ----------------
  function prepararCanvas(cv) {
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, rect.width, rect.height);
    return { c, W: rect.width, H: rect.height };
  }
  // linha que passa pelos pontos com os cantos arredondados
  function caminhoSuave(c, pts, raio) {
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const r = Math.min(raio, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
      c.arcTo(x1, y1, x2, y2, r);
    }
    c.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }
  function desenhar() {
    const cv = $('#esCanvas', el); if (!cv) return;
    const pr = prepararCanvas(cv); if (!pr) return;
    const { c, W, H } = pr;
    const u = unidade();
    const pad = { l: u * 6.4, r: u * 2.8, t: u * 3.2, b: u * 4.4 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const r = S.receita, t = tempo(), am = S.amostras;
    const ref = S.referencia?.pesos || [];
    const tFim = Math.max(r ? r.tempoTotal * 1.04 : 0, t + 6, ref.length * 0.5, 60);
    const maior = Math.max(r ? r.agua : 0, S.picoAgua, ref.length ? Math.max(...ref) : 0, 50);
    const passoG = [10, 20, 25, 50, 100, 200, 250, 500].find(p => maior / p <= 7) || 1000;
    const gMax = Math.ceil(maior / 1.04 / passoG) * passoG; // a curva pode passar até 4% da última linha
    const passoT = tFim > 420 ? 60 : 30;
    const X = s => pad.l + (s / tFim) * pw;
    const Y = g => pad.t + ph - (Math.max(0, g) / gMax) * ph;
    c.lineCap = 'round'; c.lineJoin = 'round';

    // grade e eixos
    c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,0.055)';
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = `500 ${Math.round(u * 1.45)}px ${FONTE}`;
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let g = 0; g <= gMax; g += passoG) {
      const y = Math.round(Y(g)) + 0.5;
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke();
      c.fillText(g ? `${g}g` : '0', pad.l - u * 1.3, y);
    }
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let s = passoT; s <= tFim; s += passoT) {
      const x = Math.round(X(s)) + 0.5;
      c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, pad.t + ph); c.stroke();
      c.fillText(`${s}s`, x, pad.t + ph + u * 1.3);
    }

    // etapa atual: coluna clara bem suave
    if (S.relogio === 'rodando' && S.guia && S.etapas[S.guia.k]) {
      const e = S.etapas[S.guia.k];
      const a = e.inicio, b = e.tipo === 'despejo' ? (e.ateTempo ?? e.fim) : e.fim;
      const col = c.createLinearGradient(0, pad.t, 0, pad.t + ph);
      col.addColorStop(0, 'rgba(255,255,255,0)'); col.addColorStop(1, 'rgba(255,255,255,0.06)');
      c.fillStyle = col; c.fillRect(X(a), pad.t, Math.max(2, X(b) - X(a)), ph);
    }
    // preparo anterior (quando repete um preparo salvo)
    if (ref.length > 1) {
      c.strokeStyle = 'rgba(200,198,194,0.38)'; c.lineWidth = Math.max(1.5, u * 0.3);
      c.beginPath(); ref.forEach((g, i) => { const x = X(i * 0.5), y = Y(g); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    }
    // receita: linha pontilhada amarela
    if (S.perfil.length > 1) {
      c.save();
      c.setLineDash([0.01, u * 1.15]); c.lineWidth = u * 0.45; c.strokeStyle = 'rgba(255,216,77,0.9)';
      caminhoSuave(c, S.perfil.map(([s, g]) => [X(s), Y(g)]), u * 3.5); c.stroke();
      c.restore();
    }

    if (am.length < 2) {
      if (S.relogio === 'pronto') {
        const txt = r ? 'A linha pontilhada é a receita. A sua curva aparece por cima.' : 'A curva aparece quando a água cair na balança.';
        c.font = `500 ${Math.round(u * 1.8)}px ${FONTE}`; c.textAlign = 'center'; c.textBaseline = 'middle';
        const tw = c.measureText(txt).width, tx = pad.l + pw / 2, ty = pad.t + ph * 0.42;
        c.fillStyle = 'rgba(30,30,28,0.9)';
        c.beginPath(); c.roundRect?.(tx - tw / 2 - u * 2, ty - u * 2.2, tw + u * 4, u * 4.4, u * 2.2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.62)'; c.fillText(txt, tx, ty);
      }
      return;
    }

    // curva do preparo: um ponto a cada ~2 px
    const pts = [];
    let ultX = -Infinity;
    for (let i = 0; i < am.length; i++) {
      const x = X(am[i][0]);
      if (x - ultX >= 2 || i === am.length - 1) { pts.push([x, Y(am[i][1])]); ultX = x; }
    }
    const [xH, yH] = pts[pts.length - 1];
    const x0 = pts[0][0];
    const cor = c.createLinearGradient(x0, 0, Math.max(x0 + 1, xH), 0);
    cor.addColorStop(0, '#3BD9F6'); cor.addColorStop(0.32, '#45EFA0'); cor.addColorStop(0.7, '#EAF24C');
    cor.addColorStop(0.9, '#C2F65A'); cor.addColorStop(1, '#5EF2E4');
    // área embaixo: cor da linha que escurece em direção ao zero
    c.save();
    c.beginPath(); c.moveTo(x0, Y(0)); pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(xH, Y(0)); c.closePath();
    c.globalAlpha = 0.4; c.fillStyle = cor; c.fill();
    c.globalAlpha = 1;
    const fundo = c.createLinearGradient(0, pad.t, 0, Y(0));
    fundo.addColorStop(0, 'rgba(31,31,29,0)'); fundo.addColorStop(1, 'rgba(31,31,29,0.82)');
    c.fillStyle = fundo; c.fill();
    c.restore();
    // corte na ponta, com brilho
    const corte = c.createLinearGradient(0, yH, 0, Y(0));
    corte.addColorStop(0, 'rgba(94,242,228,0.75)'); corte.addColorStop(1, 'rgba(94,242,228,0)');
    c.fillStyle = corte; c.fillRect(xH - 1, yH, 2, Y(0) - yH);
    // linha com brilho (duas passadas: halo largo e linha fina)
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = cor; c.globalAlpha = 0.22; c.lineWidth = u * 1.7; c.stroke();
    c.globalAlpha = 1; c.lineWidth = Math.max(2.5, u * 0.42); c.stroke();
    // onde cada despejo terminou
    c.font = `600 ${Math.round(u * 1.45)}px ${FONTE}`; c.textAlign = 'left'; c.textBaseline = 'top';
    S.marcos.forEach(m => {
      if (!m) return;
      const x = X(m.t), y = Y(m.g);
      c.fillStyle = '#1F1F1D'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, u * 0.7, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.fillText(`${Math.round(m.t)}s / ${g0(m.g)}g`, x + u * 1.2, y + u * 1.2);
    });
    // ponto atual
    if (S.relogio === 'rodando') {
      const raio = u * (2 + 0.6 * (0.5 + 0.5 * Math.sin(performance.now() / 260)));
      const halo = c.createRadialGradient(xH, yH, 0, xH, yH, raio);
      halo.addColorStop(0, 'rgba(94,242,228,0.55)'); halo.addColorStop(1, 'rgba(94,242,228,0)');
      c.fillStyle = halo; c.beginPath(); c.arc(xH, yH, raio, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(xH, yH, Math.max(3, u * 0.55), 0, Math.PI * 2); c.fill();
  }

  // ---------------- Mini gráficos dos cartões ----------------
  function desenharBarras() {
    const pr = prepararCanvas($('#esBarras', el)); if (!pr) return;
    const { c, W, H } = pr;
    const N = 26, vals = new Array(N).fill(0), cont = new Array(N).fill(0);
    if (S.relogio === 'rodando' && S.amostras.length) {
      // últimos N segundos, uma barra por segundo
      const fim = Math.floor(tempo());
      for (let i = S.amostras.length - 1; i >= 0; i--) {
        const [s, , v] = S.amostras[i];
        const b = N - 1 - (fim - Math.floor(s));
        if (b < 0) break;
        if (b < N) { vals[b] += v; cont[b]++; }
      }
    } else if (S.relogio === 'fim' && S.amostras.length && S.tFim > 0) {
      // no fim, o preparo inteiro em N barras
      S.amostras.forEach(([s, , v]) => { const b = Math.min(N - 1, Math.floor((s / S.tFim) * N)); vals[b] += v; cont[b]++; });
    }
    vals.forEach((_, i) => { if (cont[i]) vals[i] /= cont[i]; });
    const vMax = Math.max(4, ...vals) * 1.08;
    const gap = Math.max(2, W * 0.014), bw = (W - gap * (N - 1)) / N;
    const cor = c.createLinearGradient(0, H, 0, 0);
    cor.addColorStop(0, '#2CBF57'); cor.addColorStop(1, '#C8FF5C');
    vals.forEach((v, i) => {
      const h = Math.max(2, (v / vMax) * H);
      c.globalAlpha = 0.3 + 0.7 * (i / (N - 1));
      c.fillStyle = i === N - 1 && v > 0.2 ? '#EFFFA6' : cor;
      c.fillRect(i * (bw + gap), H - h, bw, h);
    });
    c.globalAlpha = 1;
  }
  function desenharProp() {
    const pr = prepararCanvas($('#esPropLinha', el)); if (!pr) return;
    const { c, W, H } = pr;
    const r = S.receita, am = S.amostras;
    const alvo = r?.dose ? r.agua / r.dose : 16;
    const vMax = Math.max(alvo * 1.12, ...(r?.dose && am.length ? [S.picoAgua / r.dose * 1.05] : []));
    const tMax = Math.max(r ? r.tempoTotal : 60, tempo(), 1);
    const X = s => (s / tMax) * W, Y = v => H - 1 - (v / vMax) * (H - 3);
    // linha do alvo
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1; c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(0, Math.round(Y(alvo)) + 0.5); c.lineTo(W, Math.round(Y(alvo)) + 0.5); c.stroke(); c.setLineDash([]);
    if (!r?.dose || am.length < 2 || S.relogio === 'pronto') return;
    const pts = [];
    let ultX = -Infinity;
    am.forEach(([s, g], i) => { const x = X(s); if (x - ultX >= 2 || i === am.length - 1) { pts.push([x, Y(Math.max(0, g) / r.dose)]); ultX = x; } });
    const cor = c.createLinearGradient(0, 0, W, 0);
    cor.addColorStop(0, '#FF5A4E'); cor.addColorStop(1, '#FFA43C');
    c.beginPath(); c.moveTo(pts[0][0], H); pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(pts[pts.length - 1][0], H); c.closePath();
    const area = c.createLinearGradient(0, 0, 0, H);
    area.addColorStop(0, 'rgba(255,120,70,0.45)'); area.addColorStop(1, 'rgba(255,90,78,0.02)');
    c.fillStyle = area; c.fill();
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.strokeStyle = cor; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
  }

  // ---------------- Laço de desenho ----------------
  function iniciarLoop() {
    cancelAnimationFrame(S.raf);
    const quadro = () => {
      if (!S.aberto) { S.raf = 0; return; }
      if (S.relogio === 'rodando' && S.guia) { const t = tempo(); S.guia.atualizar(t, S.peso); acompanharFase(t, S.peso); }
      // primeiro os desenhos (leem o tamanho da tela), depois os textos
      desenhar(); desenharBarras(); desenharProp();
      renderGuia(); renderNumeros(); renderStatus(); renderEtapas(); renderTrilho();
      // controles discretos durante o preparo (voltam ao tocar)
      el.classList.toggle('es-quieto', S.relogio === 'rodando' && performance.now() - S.ultimoToque > 4500);
      S.raf = requestAnimationFrame(quadro);
    };
    S.raf = requestAnimationFrame(quadro);
  }

  // ---------------- Eventos ----------------
  function ligar() {
    el.addEventListener('pointerdown', () => { S.ultimoToque = performance.now(); }, { passive: true });
    el.addEventListener('click', e => {
      if (e.target.closest('#esCafe')) { editarCafe(); return; }
      const b = e.target.closest('[data-acao]');
      if (b && !b.disabled) {
        const a = b.dataset.acao;
        if (a === 'tara') tarar();
        else if (a === 'iniciar') iniciar();
        else if (a === 'parar') parar();
        else if (a === 'proxima') pular();
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
    el.addEventListener('keydown', e => {
      if (e.target.id !== 'esCafeCampo') return;
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); fimEditarCafe(true); }
      else if (e.key === 'Escape') { e.preventDefault(); fimEditarCafe(false); }
    });
    el.addEventListener('focusout', e => { if (e.target.id === 'esCafeCampo') fimEditarCafe(true); });
    $('#esFechar', el).onclick = pedirSaida;
    $('#esTelaCheia', el).onclick = () => telaCheia(!document.fullscreenElement);
    document.addEventListener('fullscreenchange', () => { if (S.montado) el.classList.toggle('es-cheia', !!document.fullscreenElement); });
    document.addEventListener('keydown', e => {
      if (!S.aberto || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.target?.closest?.('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      S.ultimoToque = performance.now();
      if (k === ' ') { e.preventDefault(); S.relogio === 'rodando' ? parar() : S.relogio === 'pronto' ? iniciar() : zerar(); }
      else if (k === 't') tarar();
      else if (k === 'n' || k === 'arrowright') pular();
      else if (k === 'z' && S.relogio !== 'rodando') zerar();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.aberto) manterTelaAcesa(true); });
  }

  return {
    abrir, fechar, receberPeso, atualizarConexao, aviso,
    get aberto() { return S.aberto; },
  };
}
