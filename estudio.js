// Estúdio de preparo: tela cheia para preparar café guiado pela receita e gravar vídeos.
// Visual no conceito que o Adriano escolheu (painel escuro com brilho, números grandes, gráfico, cartões à direita,
// etapas embaixo, controles numa coluna à esquerda), com o kit da marca Blooming: preto e branco, a cor vem do café
// (tom claro da família de sabor), Newsreader nos títulos e no nome do café, Archivo larga nos rótulos, ficha do café
// com a pontuação no círculo e a faixa de notas na cor do café.
// Dois modos: "Com balança" (o peso guia as etapas) e "Só o método" (sem balança: o relógio guia, a tela mostra a água
// que a receita pede a cada momento).
// Feita para o notebook do Adriano (1920×1080 com escala de 125% = 1536×864 em tela cheia; 1536×695 com o Chrome à
// mostra) e para toque. Tudo é medido em "u" (--u), que acompanha a altura da tela.

import {
  etapasDaReceita, perfilAlvo, alvoNoTempo, criarGuia, FAMILIAS, FAMILIA_PADRAO, METODOS, mmss,
} from './receitas.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const g1 = v => { const r = Math.round(v * 10) / 10; return (Math.abs(r) < 0.05 ? 0 : r).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
const g0 = v => Math.round(v).toLocaleString('pt-BR');
const gs = v => g1(v).replace(/,0$/, '');
const prop = (agua, dose) => (dose > 0 ? `1:${(Math.max(0, agua) / dose).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : '1:0');
const mm = s => { s = Math.max(0, Math.round(s)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
const notasEmFaixa = t => String(t || '').split(/[,;·]+/).map(x => x.trim()).filter(Boolean).join(' · ');
// mesma unidade do CSS (--u)
const unidade = () => (innerWidth <= innerHeight ? innerWidth / 64 : Math.max(4, Math.min(innerHeight / 100, innerWidth / 177.78)));
const FONTE = '"Archivo Marca", Archivo, system-ui, sans-serif';
const SERIFA = 'Newsreader, Georgia, serif';
const LIGADA = ['conectada', 'conectando', 'pareando', 'reconectando'];

// Brilho para a tela e o vídeo: a mesma cor do café, mais viva (mais luz e mais croma no OKLCH, dentro do sRGB).
// O tom oficial continua na faixa de notas.
function vivo(hex, dl = 0.06, fc = 1.45, cmin = 0.045) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const R = lin(((n >> 16) & 255) / 255), G = lin(((n >> 8) & 255) / 255), B = lin((n & 255) / 255);
  const l_ = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m_ = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s_ = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  const C = Math.hypot(a, b), h = Math.atan2(b, a);
  const L2 = Math.min(0.93, L + dl);
  let C2 = Math.max(C * fc, C + cmin);
  const gama = v => { v = Math.min(1, Math.max(0, v)); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
  for (let i = 0; i < 60; i++) {
    const A = C2 * Math.cos(h), Bv = C2 * Math.sin(h);
    const l3 = (L2 + 0.3963377774 * A + 0.2158037573 * Bv) ** 3;
    const m3 = (L2 - 0.1055613458 * A - 0.0638541728 * Bv) ** 3;
    const s3 = (L2 - 0.0894841775 * A - 1.2914855480 * Bv) ** 3;
    const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
    const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
    const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
    if ([r, g, bl].every(v => v >= -0.001 && v <= 1.001)) {
      return '#' + [r, g, bl].map(v => Math.round(gama(v) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    C2 *= 0.96;
  }
  return hex;
}
const corViva = h => vivo(h, 0.03, 1.75, 0.07); // o acento da tela: bem mais croma, um pouco mais de luz


const SVG = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONES = {
  cheia: SVG('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>'),
  sair: SVG('<path d="M6 6l12 12M18 6L6 18"/>'),
  ok: SVG('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  lapis: SVG('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>'),
  bt: SVG('<path d="M7 7l10 10-5 4V3l5 4L7 17"/>'),
  relogio: SVG('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.8 1.8"/><path d="M9.5 2.8h5"/>'),
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
    receita: null, etapas: [], perfil: [], guia: null,
    modo: 'balanca', modoEscolhido: false,
    cafe: '', notas: '', pontuacao: null, familia: FAMILIA_PADRAO, familiaAntes: null,
    relogio: 'pronto', t0: 0, tFim: 0, amostras: [], vazaoMax: 0, picoAgua: 0,
    peso: 0, vazao: 0, taraEm: 0, armado: false, pesoAntesTara: 0,
    referencia: null, raf: 0, wakeLock: null, saidaPedida: 0, estavelDesde: 0, ultimoToque: 0, cache: {},
    marcos: [], faseAnt: '',
  };
  let el;
  const ehMetodo = () => S.modo === 'metodo';

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
        <div class="es-id">
          <div class="es-id-cafe">
            <button type="button" class="es-cafe" id="esCafe" aria-label="Café do preparo (toque para trocar)"></button>
            <span class="es-nota" id="esNota" title="Pontuação SCA" hidden></span>
            <span class="es-faixa" id="esFaixa" hidden></span>
          </div>
          <div class="es-meta" id="esMeta"></div>
        </div>
        <div class="es-topo-acoes">
          <div class="es-modo" id="esModo" role="group" aria-label="Como preparar">
            <button type="button" data-emodo="balanca">Com balança</button>
            <button type="button" data-emodo="metodo">Só o método</button>
          </div>
          <span class="es-demo" id="esDemo" hidden>
            <button type="button" class="es-chip" data-demo="cafe">Simular café</button>
            <button type="button" class="es-chip" data-demo="agua">Simular água</button>
          </span>
          <button type="button" class="es-icone" id="esTelaCheia" aria-label="Tela cheia">${ICONES.cheia}</button>
          <button type="button" class="es-icone" id="esFechar" aria-label="Sair do estúdio">${ICONES.sair}</button>
        </div>
      </header>
      <div class="es-cafe-painel" id="esCafePainel" role="dialog" aria-label="Café do preparo" hidden>
        <div class="es-cp-campos">
          <label><span class="es-rot">Café</span><input id="esCpNome" maxlength="60" autocomplete="off" placeholder="Ex.: Arara"></label>
          <label><span class="es-rot">Notas</span><input id="esCpNotas" maxlength="80" autocomplete="off" placeholder="Ex.: tangerina, mel, chá preto"></label>
          <label class="es-cp-curto"><span class="es-rot">Pontuação</span><input id="esCpPont" maxlength="5" inputmode="decimal" autocomplete="off" placeholder="Ex.: 87"></label>
        </div>
        <span class="es-rot">Cor do café: a família da nota que mais se destaca</span>
        <div class="es-cp-familias" id="esCpFamilias"></div>
        <div class="es-cp-acoes">
          <button type="button" class="es-chip" data-eacao="cafe-cancelar">Cancelar</button>
          <button type="button" class="es-chip es-chip-forte" data-eacao="cafe-ok">Pronto</button>
        </div>
      </div>
      <div class="es-aviso" id="esAviso" role="alert" hidden></div>
      <div class="es-palco">
        <nav class="es-trilho" id="esTrilho" aria-label="Controles do preparo"></nav>
        <section class="es-heroi" aria-label="Peso e tempo">
          <div class="es-h"><span class="es-rot" id="esPesoRot">Peso atual</span><strong class="es-grande es-peso"><span id="esPeso">0,0</span><small>g</small></strong></div>
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
            <svg class="es-anel" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="esAnelCor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="var(--acento)" style="stop-color: var(--acento)"/></linearGradient></defs><circle class="es-anel-fundo" cx="50" cy="50" r="40"/><circle class="es-anel-valor" id="esAnel" cx="50" cy="50" r="40" pathLength="100"/></svg>
          </div>
          <div class="es-card es-c-status" id="esStatus"></div>
        </aside>
        <section class="es-etapas" id="esEtapas" aria-label="Etapas da receita"></section>
      </div>`;
    document.body.appendChild(el);
    ligar();
  }

  // ---------------- Abrir e fechar ----------------
  // opcoes: { referencia, cafe, notas, pontuacao, familia, modo: 'balanca'|'metodo', telaCheia }
  async function abrir(receita, opcoes = {}) {
    montar();
    S.receita = receita || null;
    S.etapas = receita ? etapasDaReceita(receita) : [];
    S.perfil = receita ? perfilAlvo(receita) : [];
    S.referencia = opcoes.referencia || null;
    S.cafe = opcoes.cafe ?? receita?.cafe ?? '';
    S.notas = opcoes.notas ?? receita?.notas ?? '';
    S.pontuacao = opcoes.pontuacao ?? receita?.pontuacao ?? null;
    S.familia = FAMILIAS[opcoes.familia] ? opcoes.familia : FAMILIAS[receita?.familia] ? receita.familia : FAMILIA_PADRAO;
    S.modoEscolhido = !!opcoes.modo;
    S.modo = opcoes.modo || (LIGADA.includes(ctx.conexao()) ? 'balanca' : 'metodo');
    $('#esCafePainel', el).hidden = true;
    el.classList.toggle('es-sem-receita', !receita);
    aplicarModo();
    aplicarCor();
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

  // A cor vem do café: o tom claro da família de sabor é o destaque no fundo escuro; a cor normal vai na faixa de notas
  function aplicarCor() {
    const f = FAMILIAS[S.familia] || FAMILIAS[FAMILIA_PADRAO];
    const luz = corViva(f.claro), fundo = vivo(f.claro, -0.12, 1.6, 0.05);
    el.style.setProperty('--acento', luz);
    el.style.setProperty('--acento-fundo', fundo);
    el.style.setProperty('--cafe', f.cor);
    el.style.setProperty('--sobre-cafe', S.familia === 'fruta-amarela' ? '#1D1D1B' : '#FFFFFF');
    S.cor = luz; S.corBase = fundo;
  }
  function aplicarModo() {
    el.classList.toggle('es-metodo', ehMetodo());
    $$('#esModo button', el).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.emodo === S.modo)));
  }
  function definirModo(m, escolhido) {
    if (S.relogio !== 'pronto' || (m !== 'balanca' && m !== 'metodo')) return;
    if (escolhido) S.modoEscolhido = true;
    if (S.modo === m) return;
    S.modo = m;
    zerar(true);
    aplicarModo();
    atualizarConexao();
  }

  // ---------------- Balança ----------------
  // chamado pela Extração a cada peso recebido (já com a vazão calculada)
  function receberPeso(g, vazao) {
    S.peso = g; S.vazao = vazao;
    if (!S.aberto || ehMetodo()) return; // no modo "só o método" o peso não guia nada
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
    if (ehMetodo() || ctx.conexao() !== 'conectada') return;
    ctx.tarar();
    S.taraEm = performance.now();
    S.armado = S.relogio === 'pronto';
  }
  function atualizarConexao() {
    if (!S.montado) return;
    const estado = ctx.conexao();
    // abriu sem balança e ela conectou antes de começar: passa para "com balança", se a pessoa não escolheu o modo
    if (S.aberto && S.relogio === 'pronto' && !S.modoEscolhido && ehMetodo() && estado === 'conectada') definirModo('balanca');
    const sim = ctx.balanca()?.tipo === 'simulador';
    $('#esDemo', el).hidden = !(sim && estado === 'conectada' && !ehMetodo());
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
    fecharPainelCafe(true);
    S.relogio = 'rodando';
    S.armado = false;
    S.t0 = performance.now();
    S.amostras = ehMetodo() ? [] : [[0, Math.max(0, S.peso), 0]];
    S.vazaoMax = 0; S.picoAgua = 0; S.estavelDesde = 0; S.marcos = []; S.faseAnt = '';
    S.guia = !S.etapas.length ? null : ehMetodo() ? { k: 0, fase: 'despejo' } : criarGuia(S.etapas);
    if (S.guia && !ehMetodo()) S.faseAnt = `${S.guia.k}:${S.guia.fase}`;
    renderTopo();
    renderTrilho();
  }
  function parar() {
    if (S.relogio !== 'rodando') return;
    S.tFim = (performance.now() - S.t0) / 1000;
    S.relogio = 'fim';
    renderTopo();
    renderTrilho();
  }
  function zerar(silencioso) {
    S.relogio = 'pronto'; S.amostras = []; S.tFim = 0; S.vazaoMax = 0; S.picoAgua = 0; S.marcos = []; S.faseAnt = '';
    S.taraEm = 0; S.armado = false; S.guia = null; S.estavelDesde = 0; S.cache = {};
    if (!silencioso) { renderTopo(); renderTrilho(); }
  }
  function pular() {
    if (ehMetodo() || !S.guia || S.relogio !== 'rodando') return;
    const t = tempo();
    S.guia.pular(t);
    acompanharFase(t, S.peso);
    S.ultimoToque = performance.now();
  }
  // "Só o método": a etapa sai do relógio
  function faseNoTempo(t) {
    for (let i = 0; i < S.etapas.length; i++) {
      const e = S.etapas[i];
      if (e.tipo === 'despejo') {
        if (t < e.inicio) return { k: i, fase: 'antes' };
        if (t < e.fim) return { k: i, fase: 'despejo' };
        if (e.ateTempo != null && t < e.ateTempo) return { k: i, fase: 'espera' };
      } else if (t < e.ateTempo) return { k: i, fase: 'drenagem' };
    }
    return { k: S.etapas.length, fase: 'fim' };
  }
  const tempo = () => S.relogio === 'rodando' ? (performance.now() - S.t0) / 1000 : S.relogio === 'fim' ? S.tFim : 0;
  const aguaFinal = () => S.relogio === 'fim' ? (S.amostras.at(-1)?.[1] ?? S.peso) : S.peso;
  const aguaReceita = t => (S.perfil.length ? alvoNoTempo(S.perfil, t) : 0);
  // no "só o método", o número grande é a água que a receita pede até aquele momento
  const pesoMostrado = () => {
    if (!ehMetodo()) return S.relogio === 'fim' ? aguaFinal() : S.peso;
    if (S.relogio === 'pronto') return 0;
    return aguaReceita(tempo());
  };
  const ritmoDoDespejo = e => (e && e.tipo === 'despejo' ? (e.ate - e.de) / Math.max(1, e.fim - e.inicio) : 0);

  // ---------------- Café do preparo (ficha: nome, notas, pontuação, cor) ----------------
  // troca rápida para o vídeo, sem mexer na receita; vai junto para o Salvar preparo
  function abrirPainelCafe() {
    if (S.relogio === 'rodando') return;
    const p = $('#esCafePainel', el);
    if (!p.hidden) { fecharPainelCafe(true); return; }
    S.familiaAntes = S.familia;
    $('#esCpNome', el).value = S.cafe;
    $('#esCpNotas', el).value = S.notas;
    $('#esCpPont', el).value = S.pontuacao ? String(S.pontuacao).replace('.', ',') : '';
    renderFamiliasPainel();
    p.hidden = false;
    $('#esCpNome', el).focus();
  }
  function renderFamiliasPainel() {
    $('#esCpFamilias', el).innerHTML = Object.entries(FAMILIAS).map(([k, f]) =>
      `<button type="button" data-efam="${k}" aria-pressed="${k === S.familia}"><i style="background:${corViva(f.claro)}"></i><span>${esc(f.nome)}</span></button>`).join('');
  }
  function fecharPainelCafe(salvar) {
    const p = $('#esCafePainel', el);
    if (!p || p.hidden) return;
    if (salvar) {
      S.cafe = $('#esCpNome', el).value.trim();
      S.notas = $('#esCpNotas', el).value.trim();
      const n = parseFloat($('#esCpPont', el).value.replace(',', '.'));
      S.pontuacao = n > 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
    } else if (S.familiaAntes) { S.familia = S.familiaAntes; aplicarCor(); }
    p.hidden = true;
    renderTopo();
  }

  function terminar() {
    const metodo = ehMetodo();
    const final = metodo ? (S.receita?.agua || 0) : aguaFinal();
    ctx.aoTerminar?.({
      receita: S.receita, cafe: S.cafe, notas: S.notas, pontuacao: S.pontuacao, familia: S.familia, semBalanca: metodo,
      tempo: S.tFim, aguaFinal: final, amostras: metodo ? [] : S.amostras, vazaoMedia: S.tFim ? final / S.tFim : 0,
    });
  }

  // ---------------- Topo: ficha do café e dados da receita ----------------
  function renderTopo() {
    if (!S.montado) return;
    const r = S.receita;
    const bt = $('#esCafe', el);
    const vazio = !S.cafe;
    const nome = !vazio ? esc(S.cafe.toUpperCase())
      : S.relogio === 'rodando' ? esc(r ? r.nome : 'Preparo livre') : 'Toque para informar o café';
    bt.innerHTML = `<span>${nome}</span><i class="es-lapis">${ICONES.lapis}</i>`;
    bt.classList.toggle('vazio', vazio && S.relogio !== 'rodando');
    bt.classList.toggle('receita', vazio && S.relogio === 'rodando');
    const nota = $('#esNota', el);
    nota.hidden = !S.pontuacao;
    nota.textContent = S.pontuacao ? String(S.pontuacao).replace('.', ',') : '';
    const faixa = $('#esFaixa', el);
    const notas = notasEmFaixa(S.notas);
    faixa.hidden = !notas;
    faixa.textContent = notas;
    const item = (k, v, cls = '') => `<span class="es-m${cls}"><em>${esc(k)}</em><b>${esc(v)}</b></span>`;
    const metodo = METODOS[r?.metodo]?.nome || '';
    const nomeTemMetodo = r && metodo && String(r.nome).toLowerCase().includes(metodo.split(/[ /]/)[0].toLowerCase());
    $('#esMeta', el).innerHTML = (r ? [
      item('Receita', r.nome, ' es-m-encolhe'),
      !nomeTemMetodo && metodo ? item('Método', metodo) : '',
      item('Proporção', prop(r.agua, r.dose)), item('Alvo', `${g0(r.agua)} g`), item('Pó', `${gs(r.dose)} g`),
      r.moagem ? item('Moagem', r.moagem) : '', r.temperatura ? item('Temperatura', `${g0(r.temperatura)} °C`) : '',
    ] : [item('Preparo', 'Livre')]).join('');
  }

  // ---------------- Controles (coluna da esquerda) ----------------
  function renderTrilho() {
    if (!S.montado) return;
    const st = S.relogio, estado = ctx.conexao(), conectada = estado === 'conectada';
    const sim = ctx.balanca()?.tipo === 'simulador', bat = ctx.bateria();
    const temGuia = !!S.etapas.length;
    const bt = (acao, icone, rotulo, o = {}) => `<button type="button" class="es-tr${o.forte ? ' es-tr-forte' : ''}${o.parar ? ' es-tr-parar' : ''}" data-eacao="${acao}"${o.desab ? ' disabled' : ''}><i>${ICONES[icone]}</i><span>${rotulo}</span></button>`;
    let html;
    if (ehMetodo()) {
      html = `<button type="button" class="es-tr es-tr-bal" data-eacao="nada" data-estado="metodo"><i>${ICONES.relogio}</i><span>Relógio</span><small>Sem balança</small></button><span class="es-trilho-sep"></span>`;
      if (st === 'pronto') html += bt('iniciar', 'play', 'Iniciar', { forte: true }) + bt('zerar', 'zerar', 'Zerar');
      else if (st === 'rodando') html += bt('parar', 'stop', 'Parar', { parar: true }) + bt('zerar', 'zerar', 'Zerar', { desab: true });
      else html += bt('salvar', 'salvar', 'Salvar', { forte: true }) + bt('novo', 'novo', 'Novo') + bt('sair', 'sair', 'Sair');
    } else {
      const sub = {
        desconectada: 'Conectar', conectando: 'Conectando', pareando: 'Pareando', reconectando: 'Reconectando',
        conectada: sim ? 'Demonstração' : bat != null ? `Bateria ${bat}%` : 'Conectada',
      }[estado] || '';
      html = `<button type="button" class="es-tr es-tr-bal" data-eacao="${estado === 'desconectada' ? 'conectar' : 'nada'}" data-estado="${estado}"><i>${ICONES.bt}</i><span>Balança</span><small>${sub}</small></button><span class="es-trilho-sep"></span>`;
      if (st === 'pronto') {
        html += bt('tara', 'tara', 'Tara', { desab: !conectada }) + bt('iniciar', 'play', 'Iniciar', { forte: true })
          + (temGuia ? bt('proxima', 'proxima', 'Próxima', { desab: true }) : '') + bt('zerar', 'zerar', 'Zerar');
      } else if (st === 'rodando') {
        html += bt('tara', 'tara', 'Tara', { desab: true }) + bt('parar', 'stop', S.guia?.fase === 'fim' ? 'Finalizar' : 'Parar', { parar: true })
          + (temGuia ? bt('proxima', 'proxima', 'Próxima') : '') + bt('zerar', 'zerar', 'Zerar', { desab: true });
      } else {
        html += bt('salvar', 'salvar', 'Salvar', { forte: true }) + bt('novo', 'novo', 'Novo') + bt('sair', 'sair', 'Sair');
      }
    }
    if (S.cache.trilho !== html) { $('#esTrilho', el).innerHTML = html; S.cache.trilho = html; }
    el.dataset.relogio = st;
  }

  // ---------------- Bloco do que fazer agora (ao lado do peso e do tempo) ----------------
  function guiaInfo() {
    const r = S.receita, t = tempo(), w = pesoMostrado();
    const metodo = ehMetodo();
    if (S.relogio === 'pronto') {
      const p = S.etapas[0];
      return r && p
        ? { icone: 'gota', rot: `${p.nome} até`, valor: `${g0(p.ate)} g`, info: metodo ? 'Toque em Iniciar e comece a despejar' : 'O tempo começa sozinho com a água' }
        : { icone: 'xicara', rot: 'Preparo livre', valor: 'Livre', info: 'O seu café, no seu ritmo.' };
    }
    if (S.relogio === 'fim') {
      return { icone: 'ok', rot: 'Preparo concluído', valor: 'Pronto', info: r ? `Receita: ${g0(r.agua)} g em ${mm(r.tempoTotal)}` : 'O seu café, no seu ritmo.', tipo: 'ok' };
    }
    if (!S.guia) return { icone: 'xicara', rot: 'Preparo livre', valor: 'Livre', info: 'O seu café, no seu ritmo.' };
    const k = S.guia.k, fase = S.guia.fase, e = S.etapas[k];
    if (fase === 'despejo') {
      if (metodo) return { icone: 'gota', rot: `Despeje até ${g0(e.ate)} g`, valor: mm(e.fim - t), info: `${e.nome}: até ${mmss(e.fim)}` };
      const falta = e.ate - w;
      if (w - e.ate > Math.max(2, (e.ate - e.de) * 0.03)) return { icone: 'gota', rot: 'Passou do alvo', valor: `+${g0(w - e.ate)} g`, info: `${e.nome} até ${g0(e.ate)} g`, tipo: 'alerta' };
      if (falta <= 0.5) return { icone: 'gota', rot: 'Alvo atingido', valor: 'Pare', info: `${e.nome} até ${g0(e.ate)} g`, tipo: 'ok' };
      return { icone: 'gota', rot: 'Faltam', valor: `${g0(falta)} g`, info: `${e.nome} até ${g0(e.ate)} g` };
    }
    if (fase === 'antes') return { icone: 'ampulheta', rot: 'Comece a despejar em', valor: mm(e.inicio - t), info: `${e.nome} até ${g0(e.ate)} g`, tipo: 'espera' };
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
    box.querySelector('[data-g="valor"]').classList.toggle('es-palavra', !/\d/.test(g.valor));
    if (S.cache.icone !== g.icone) { box.querySelector('[data-g="icone"]').innerHTML = ICONES[g.icone] || ''; S.cache.icone = g.icone; }
    if ((box.dataset.tipo || '') !== (g.tipo || '')) box.dataset.tipo = g.tipo || '';
  }

  // ---------------- Cartão de status ----------------
  function statusInfo() {
    const r = S.receita, t = tempo(), w = pesoMostrado();
    const metodo = ehMetodo();
    if (S.relogio === 'pronto') {
      if (metodo) {
        return r ? {
          rot: 'Antes de começar',
          lista: [
            [false, `Café moído: ${gs(r.dose)} g`, r.moagem || ''],
            [false, 'Água quente', r.temperatura ? `${g0(r.temperatura)} °C` : ''],
            [false, 'Toque em Iniciar', 'e siga o relógio'],
          ],
        } : { rot: 'Sem balança', icone: 'xicara', titulo: 'Só o cronômetro', info: 'O seu café, no seu ritmo.' };
      }
      const conectada = ctx.conexao() === 'conectada', dose = r?.dose || 0;
      const cafeOk = S.armado || (dose && Math.abs(S.pesoAntesTara - dose) <= Math.max(0.5, dose * 0.05));
      return {
        rot: 'Antes de começar',
        lista: [
          [conectada, 'Balança conectada', conectada ? '' : '<button type="button" class="es-chip es-chip-forte" data-eacao="conectar">Conectar</button>'],
          r ? [cafeOk, 'Café na balança', `${g1(S.taraEm ? S.pesoAntesTara : S.peso)} de ${gs(dose)} g`] : null,
          [S.armado, 'Tara feita', S.armado ? 'pronto' : 'toque em Tara'],
        ].filter(Boolean),
      };
    }
    if (S.relogio === 'fim') return { rot: 'Status', icone: 'ok', titulo: 'Preparo concluído', info: 'Salve para guardar no histórico', tipo: 'ok' };
    if (!S.guia) return { rot: 'Status', icone: 'gira', titulo: 'Preparo livre', info: !metodo && S.vazao > 0.3 ? `Despejando a ${g1(S.vazao)} g/s` : 'O seu café, no seu ritmo.' };
    const k = S.guia.k, fase = S.guia.fase, e = S.etapas[k];
    if (fase === 'despejo') {
      if (metodo) return { rot: 'Status', icone: 'gira', titulo: `${e.nome} ativo`, info: `Ritmo da receita: ${g1(ritmoDoDespejo(e))} g/s`, tipo: 'ok' };
      if (w - e.ate > Math.max(2, (e.ate - e.de) * 0.03)) return { rot: 'Status', icone: 'gira', titulo: `${e.nome} ativo`, info: `Passou ${g0(w - e.ate)} g do alvo`, tipo: 'alerta' };
      if (t < e.inicio) return { rot: 'Status', icone: 'gira', titulo: `${e.nome} ativo`, info: `Começa às ${mmss(e.inicio)}` };
      const dif = w - alvoNoTempo(S.perfil, t), folga = Math.max(4, (e.ate - e.de) * 0.08);
      const ritmo = Math.abs(dif) <= folga ? ['No ritmo', 'ok'] : dif > 0 ? [`Adiantado ${g0(dif)} g`, 'aviso'] : [`Atrasado ${g0(-dif)} g`, 'aviso'];
      return { rot: 'Status', icone: 'gira', titulo: `${e.nome} ativo`, info: ritmo[0], tipo: ritmo[1] };
    }
    if (fase === 'antes') return { rot: 'Status', icone: 'gira', titulo: 'Prepare a chaleira', info: `${e.nome} às ${mmss(e.inicio)}` };
    if (fase === 'espera') {
      const prox = S.etapas[k + 1];
      // o nome da marca vem daqui: o blooming é o florescer do café fresco quando a água quente encontra o pó
      return e.blooming
        ? { rot: 'Status', icone: 'gira', titulo: 'Blooming: aguarde', info: 'As bolhinhas provam a torra recente' }
        : { rot: 'Status', icone: 'gira', titulo: 'Pausa: aguarde', info: prox ? `${prox.nome} às ${mmss(e.ateTempo)}` : '' };
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
    const r = S.receita, w = pesoMostrado(), metodo = ehMetodo(), t = tempo();
    const set = (id, v) => { const n = $('#' + id, el); if (n.textContent !== v) n.textContent = v; };
    const fim = S.relogio === 'fim';
    set('esPesoRot', metodo ? (r ? 'Água pela receita' : 'Água') : 'Peso atual');
    set('esPeso', metodo ? (r ? g0(w) : '—') : g1(w)); // a água da receita vai em gramas inteiros
    set('esTempo', mm(t));
    if (metodo) {
      const e = S.guia && S.guia.fase === 'despejo' ? S.etapas[S.guia.k] : null;
      set('esFluxoRot', fim ? 'Fluxo médio' : 'Ritmo do despejo');
      set('esVazao', r ? g1(fim ? (S.tFim ? w / S.tFim : 0) : S.relogio === 'rodando' ? ritmoDoDespejo(e) : 0) : '—');
    } else {
      set('esFluxoRot', fim ? 'Fluxo médio' : 'Fluxo atual');
      set('esVazao', g1(fim ? (S.tFim ? Math.max(0, w) / S.tFim : 0) : S.relogio === 'rodando' ? S.vazao : 0));
    }
    const agua = S.relogio === 'pronto' ? 0 : w;
    set('esPropRot', r ? 'Proporção' : metodo ? 'Proporção' : 'Vazão máxima');
    set('esProp', r ? prop(agua, r.dose) : metodo ? '—' : `${g1(S.vazaoMax)} g/s`);
    set('esPropAlvo', r ? `alvo ${prop(r.agua, r.dose)}` : metodo ? 'sem receita' : 'no preparo');
    const p = r ? Math.max(0, Math.min(1, agua / Math.max(1, r.agua))) : 0;
    set('esProgRot', r ? 'Progresso' : 'Água');
    set('esProg', r ? `${Math.round(p * 100)}%` : metodo ? '—' : `${g0(Math.max(0, agua))} g`);
    set('esProgInfo', r ? `de ${g0(r.agua)} g de água` : metodo ? 'sem balança' : 'na balança');
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
    const t = tempo(), w = pesoMostrado(), metodo = ehMetodo();
    const k = S.guia ? S.guia.k : -1, fase = S.guia?.fase, fim = S.relogio === 'fim' || fase === 'fim';
    $$('.es-et', el).forEach((card, i) => {
      const e = S.etapas[i];
      const feito = fim || i < k, atual = !fim && i === k && S.relogio === 'rodando';
      let p = feito ? 1 : 0, espera = false;
      if (atual) {
        if (fase === 'despejo') p = metodo ? (t - e.inicio) / Math.max(1, e.fim - e.inicio) : (w - e.de) / Math.max(1, e.ate - e.de);
        else if (fase === 'antes') { espera = true; p = 0; }
        else if (fase === 'espera') {
          espera = true;
          const desde = metodo ? e.fim : (S.marcos[i]?.t ?? e.fim);
          p = (t - desde) / Math.max(1, e.ateTempo - desde);
        } else if (fase === 'drenagem') { espera = true; p = (t - e.inicio) / Math.max(1, e.ateTempo - e.inicio); }
      }
      card.classList.toggle('feito', feito); card.classList.toggle('atual', atual); card.classList.toggle('espera', espera);
      const largura = `${(Math.max(0, Math.min(1, p)) * 100).toFixed(1)}%`;
      const barra = card.querySelector('.es-et-barra i');
      if (barra.style.width !== largura) barra.style.width = largura;
    });
  }

  // ---------------- Gráfico principal ----------------
  function prepararCanvas(cv) {
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.shadowBlur = 0; c.shadowColor = 'rgba(0,0,0,0)';
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
  function hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  // série [tempo, gramas] da curva: a balança no modo com balança; a água da receita no "só o método"
  function serieDoPreparo() {
    if (!ehMetodo()) return S.amostras;
    if (!S.perfil.length || S.relogio === 'pronto') return [];
    const tAte = tempo(), passo = 0.25, out = [];
    for (let s = 0; s < tAte; s += passo) out.push([s, aguaReceita(s)]);
    out.push([tAte, aguaReceita(tAte)]);
    return out;
  }
  function desenhar() {
    const pr = prepararCanvas($('#esCanvas', el)); if (!pr) return;
    const { c, W, H } = pr;
    const u = unidade();
    const pad = { l: u * 6.4, r: u * 2.8, t: u * 3.2, b: u * 4.4 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    const r = S.receita, t = tempo(), metodo = ehMetodo();
    const am = serieDoPreparo();
    const ref = S.referencia?.pesos || [];
    const acento = S.cor || '#CD9A50', base = S.corBase || '#8F6213';
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
    // receita: linha pontilhada clara
    if (S.perfil.length > 1) {
      c.save();
      c.setLineDash([0.01, u * 1.15]); c.lineWidth = u * 0.45; c.strokeStyle = 'rgba(249,246,244,0.72)';
      caminhoSuave(c, S.perfil.map(([s, g]) => [X(s), Y(g)]), u * 3.5); c.stroke();
      c.restore();
    }

    if (am.length < 2) {
      if (S.relogio === 'pronto' || (metodo && !r)) {
        const l1 = 'Floresça seus sentidos.';
        const l2 = metodo
          ? (r ? 'A linha pontilhada é a receita. Toque em Iniciar e siga o relógio.' : 'Sem balança e sem receita: só o cronômetro.')
          : (r ? 'A linha pontilhada é a receita. A sua curva aparece por cima.' : 'A curva aparece quando a água cair na balança.');
        const tx = pad.l + pw / 2, ty = pad.t + ph * 0.4;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = `italic 500 ${Math.round(u * 3.4)}px ${SERIFA}`;
        const w1 = c.measureText(l1).width;
        c.font = `500 ${Math.round(u * 1.6)}px ${FONTE}`;
        const w2 = c.measureText(l2).width, larg = Math.max(w1, w2) + u * 5;
        c.fillStyle = 'rgba(29,29,27,0.9)';
        c.beginPath(); c.roundRect?.(tx - larg / 2, ty - u * 4.4, larg, u * 8.6, u * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.92)'; c.font = `italic 500 ${Math.round(u * 3.4)}px ${SERIFA}`;
        c.fillText(l1, tx, ty - u * 1.3);
        c.fillStyle = 'rgba(255,255,255,0.58)'; c.font = `500 ${Math.round(u * 1.6)}px ${FONTE}`;
        c.fillText(l2, tx, ty + u * 2.3);
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
    // a cor do café, viva: começa no tom fundo, logo acende e termina quase branca na ponta
    const cor = c.createLinearGradient(x0, 0, Math.max(x0 + 1, xH), 0);
    cor.addColorStop(0, base); cor.addColorStop(0.22, acento); cor.addColorStop(0.9, acento); cor.addColorStop(1, '#FFFFFF');
    // área embaixo: a mesma cor acesa perto da linha, sumindo em direção ao zero (sem escurecer para o marrom)
    const yTopo = Math.min(...pts.map(p => p[1]));
    const area = c.createLinearGradient(0, yTopo, 0, Y(0));
    area.addColorStop(0, hexA(acento, 0.5)); area.addColorStop(0.45, hexA(acento, 0.24)); area.addColorStop(1, hexA(acento, 0.05));
    c.beginPath(); c.moveTo(x0, Y(0)); pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(xH, Y(0)); c.closePath();
    c.fillStyle = area; c.fill();
    // corte na ponta, com brilho
    const corte = c.createLinearGradient(0, yH, 0, Y(0));
    corte.addColorStop(0, hexA(acento, 0.95)); corte.addColorStop(1, hexA(acento, 0));
    c.fillStyle = corte; c.fillRect(xH - 1, yH, 2, Y(0) - yH);
    // linha de luz: halos que somam brilho (modo "lighter"), a linha na cor e um fio branco no meio
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = cor; c.globalAlpha = 0.13; c.lineWidth = u * 4.4; c.stroke();
    c.globalAlpha = 0.34; c.lineWidth = u * 2.1; c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1; c.lineWidth = Math.max(2.5, u * 0.5); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = Math.max(1, u * 0.15); c.stroke();
    // onde cada despejo terminou
    const marcos = metodo
      ? S.etapas.filter(e => e.tipo === 'despejo' && e.fim <= tempo()).map(e => ({ t: e.fim, g: e.ate }))
      : S.marcos;
    c.font = `600 ${Math.round(u * 1.45)}px ${FONTE}`; c.textAlign = 'left'; c.textBaseline = 'top';
    marcos.forEach(m => {
      if (!m) return;
      const x = X(m.t), y = Y(m.g);
      c.fillStyle = '#232220'; c.strokeStyle = '#fff'; c.lineWidth = 2;
      c.beginPath(); c.arc(x, y, u * 0.7, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.fillText(`${Math.round(m.t)}s / ${g0(m.g)}g`, x + u * 1.2, y + u * 1.2);
    });
    // ponto atual
    if (S.relogio === 'rodando') {
      const raio = u * (2.6 + 0.8 * (0.5 + 0.5 * Math.sin(performance.now() / 260)));
      const halo = c.createRadialGradient(xH, yH, 0, xH, yH, raio);
      halo.addColorStop(0, hexA(acento, 0.9)); halo.addColorStop(0.4, hexA(acento, 0.38)); halo.addColorStop(1, hexA(acento, 0));
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = halo; c.beginPath(); c.arc(xH, yH, raio, 0, Math.PI * 2); c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(xH, yH, Math.max(3, u * 0.55), 0, Math.PI * 2); c.fill();
  }

  // ---------------- Mini gráficos dos cartões ----------------
  // vazão por segundo: a medida da balança, ou o ritmo que a receita pede no "só o método"
  function vazaoNoSegundo(s) { return Math.max(0, aguaReceita(s + 1) - aguaReceita(s)); }
  function desenharBarras() {
    const pr = prepararCanvas($('#esBarras', el)); if (!pr) return;
    const { c, W, H } = pr;
    const N = 26, vals = new Array(N).fill(0), cont = new Array(N).fill(0);
    const metodo = ehMetodo();
    if (S.relogio === 'rodando') {
      const fim = Math.floor(tempo());
      if (metodo) {
        if (S.perfil.length) for (let i = 0; i < N; i++) { const s = fim - (N - 1 - i); if (s >= 0) { vals[i] = vazaoNoSegundo(s); cont[i] = 1; } }
      } else {
        // últimos N segundos, uma barra por segundo
        for (let i = S.amostras.length - 1; i >= 0; i--) {
          const [s, , v] = S.amostras[i];
          const b = N - 1 - (fim - Math.floor(s));
          if (b < 0) break;
          if (b < N) { vals[b] += v; cont[b]++; }
        }
      }
    } else if (S.relogio === 'fim' && S.tFim > 0) {
      // no fim, o preparo inteiro em N barras
      if (metodo) {
        if (S.perfil.length) for (let i = 0; i < N; i++) { const a = (i / N) * S.tFim, b = ((i + 1) / N) * S.tFim; vals[i] = Math.max(0, aguaReceita(b) - aguaReceita(a)) / Math.max(0.1, b - a); cont[i] = 1; }
      } else S.amostras.forEach(([s, , v]) => { const b = Math.min(N - 1, Math.floor((s / S.tFim) * N)); vals[b] += v; cont[b]++; });
    }
    if (!metodo) vals.forEach((_, i) => { if (cont[i]) vals[i] /= cont[i]; });
    const vMax = Math.max(4, ...vals) * 1.08;
    const gap = Math.max(2, W * 0.014), bw = (W - gap * (N - 1)) / N;
    const acento = S.cor || '#CD9A50';
    const cor = c.createLinearGradient(0, H, 0, 0);
    cor.addColorStop(0, hexA(acento, 0.6)); cor.addColorStop(1, acento);
    c.shadowColor = hexA(acento, 0.75); c.shadowBlur = 9;
    vals.forEach((v, i) => {
      const h = Math.max(2, (v / vMax) * H);
      c.globalAlpha = 0.4 + 0.6 * (i / (N - 1));
      c.fillStyle = i === N - 1 && v > 0.2 && S.relogio === 'rodando' ? '#FFFFFF' : cor;
      c.fillRect(i * (bw + gap), H - h, bw, h);
    });
    c.globalAlpha = 1;
  }
  function desenharProp() {
    const pr = prepararCanvas($('#esPropLinha', el)); if (!pr) return;
    const { c, W, H } = pr;
    const r = S.receita;
    const am = serieDoPreparo();
    const alvo = r?.dose ? r.agua / r.dose : 16;
    const vMax = Math.max(alvo * 1.12, ...(r?.dose && S.picoAgua ? [S.picoAgua / r.dose * 1.05] : []));
    const tMax = Math.max(r ? r.tempoTotal : 60, tempo(), 1);
    const X = s => (s / tMax) * W, Y = v => H - 1 - (v / vMax) * (H - 3);
    // linha do alvo
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1; c.setLineDash([3, 4]);
    c.beginPath(); c.moveTo(0, Math.round(Y(alvo)) + 0.5); c.lineTo(W, Math.round(Y(alvo)) + 0.5); c.stroke(); c.setLineDash([]);
    if (!r?.dose || am.length < 2 || S.relogio === 'pronto') return;
    const pts = [];
    let ultX = -Infinity;
    am.forEach(([s, g], i) => { const x = X(s); if (x - ultX >= 2 || i === am.length - 1) { pts.push([x, Y(Math.max(0, g) / r.dose)]); ultX = x; } });
    const acento = S.cor || '#CD9A50';
    c.beginPath(); c.moveTo(pts[0][0], H); pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(pts[pts.length - 1][0], H); c.closePath();
    const area = c.createLinearGradient(0, 0, 0, H);
    area.addColorStop(0, hexA(acento, 0.45)); area.addColorStop(1, hexA(acento, 0.02));
    c.fillStyle = area; c.fill();
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.shadowColor = hexA(acento, 0.8); c.shadowBlur = 8;
    c.strokeStyle = acento; c.lineWidth = 2.2; c.lineJoin = 'round'; c.stroke();
    c.shadowBlur = 0;
  }

  // ---------------- Laço de desenho ----------------
  function iniciarLoop() {
    cancelAnimationFrame(S.raf);
    const quadro = () => {
      if (!S.aberto) { S.raf = 0; return; }
      if (S.relogio === 'rodando' && S.guia) {
        const t = tempo();
        if (ehMetodo()) {
          const f = faseNoTempo(t);
          S.guia.k = f.k; S.guia.fase = f.fase;
          if (f.fase === 'fim') parar(); // a receita terminou: pronto
        } else { S.guia.atualizar(t, S.peso); acompanharFase(t, S.peso); } // espera e drenagem andam pelo tempo
      }
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
  // os botões usam data-eacao (o app.js escuta data-acao no documento inteiro para os pedidos: "novo" abriria o Novo pedido)
  function ligar() {
    el.addEventListener('pointerdown', () => { S.ultimoToque = performance.now(); }, { passive: true });
    el.addEventListener('click', e => {
      if (e.target.closest('#esCafe')) { abrirPainelCafe(); return; }
      const fam = e.target.closest('[data-efam]');
      if (fam) {
        S.familia = fam.dataset.efam; aplicarCor();
        $$('#esCpFamilias button', el).forEach(b => b.setAttribute('aria-pressed', String(b === fam)));
        return;
      }
      const modo = e.target.closest('[data-emodo]');
      if (modo) { definirModo(modo.dataset.emodo, true); return; }
      const b = e.target.closest('[data-eacao]');
      if (b && !b.disabled) {
        const a = b.dataset.eacao;
        if (a === 'tara') tarar();
        else if (a === 'iniciar') iniciar();
        else if (a === 'parar') parar();
        else if (a === 'proxima') pular();
        else if (a === 'zerar' || a === 'novo') zerar();
        else if (a === 'salvar') terminar();
        else if (a === 'sair') fechar();
        else if (a === 'conectar') ctx.conectar(false);
        else if (a === 'cafe-ok') fecharPainelCafe(true);
        else if (a === 'cafe-cancelar') fecharPainelCafe(false);
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
      if (!e.target.closest?.('#esCafePainel')) return;
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); fecharPainelCafe(true); }
      else if (e.key === 'Escape') { e.preventDefault(); fecharPainelCafe(false); }
    });
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
