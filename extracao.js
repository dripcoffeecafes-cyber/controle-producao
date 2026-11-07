// Extração: tela de acompanhamento do preparo com a balança Timemore por Bluetooth.
// Peso, tempo, vazão (g/s) e proporção ao vivo, gráfico da curva, receita com alvo de água e tempo,
// e histórico das extrações salvas (com "Repetir", que traz a receita e mostra a curva como referência).
// Coleção equipes/{chave}/extracoes: { cafe, metodo, dose, proporcao, aguaAlvo, tempoAlvo, temperatura,
//   moagem, aguaFinal, tempo (s), vazaoMedia, avaliacao (1-5), obs, curva: { passo (s), pesos [g] },
//   balanca, criado/atualizado Em/Por }

import { criarBalanca, criarSimulador, temBluetooth } from './balanca.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const g1 = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const g0 = v => Math.round(v).toLocaleString('pt-BR');
const mmss = s => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const lerTempo = txt => { // "3:30", "3.30", "210" → segundos
  const t = String(txt || '').trim();
  if (!t) return 0;
  const m = t.match(/^(\d+)[:.,](\d{1,2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Math.round(num(t));
};
const quando = iso => {
  const d = new Date(iso); if (isNaN(d)) return '';
  const dias = Math.floor((Date.now() - d) / 86400000);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias <= 0 && d.getDate() === new Date().getDate()) return `hoje, ${hora}`;
  if (dias <= 1) return `ontem, ${hora}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + `, ${hora}`;
};

export const METODOS = {
  v60: { nome: 'V60', dose: 15, prop: 16, tempo: 180, temp: 93 },
  kalita: { nome: 'Kalita / Origami', dose: 15, prop: 16, tempo: 210, temp: 93 },
  drip: { nome: 'Drip (sachê)', dose: 10, prop: 15, tempo: 150, temp: 92 },
  prensa: { nome: 'Prensa francesa', dose: 15, prop: 15, tempo: 240, temp: 94 },
  espresso: { nome: 'Espresso', dose: 18, prop: 2, tempo: 28, temp: 93 },
  outro: { nome: 'Outro', dose: 15, prop: 15, tempo: 180, temp: 93 },
};
const RECEITA_PADRAO = { metodo: 'v60', cafe: '', dose: 15, prop: 16, tempo: 180, temp: 93, moagem: '', auto: true };
const PASSO = 0.5; // a curva salva guarda um peso a cada meio segundo

// Vazão (g/s): inclinação da reta pelos pontos dos últimos 2 segundos
function inclinacao(pts) {
  if (pts.length < 3) return 0;
  const n = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const d = n * sxx - sx * sx;
  return d ? (n * sxy - sx * sy) / d : 0;
}

// Reamostra [[t, g]...] para um peso a cada PASSO segundos (para salvar leve)
function reamostrar(amostras) {
  if (!amostras.length) return [];
  const fim = amostras[amostras.length - 1][0];
  const out = [];
  let j = 0;
  for (let t = 0; t <= fim + 1e-6; t += PASSO) {
    while (j < amostras.length - 1 && amostras[j + 1][0] <= t) j++;
    out.push(Math.round(Math.max(0, amostras[j][1]) * 10) / 10);
  }
  return out;
}

function sparkline(pesos, w = 120, h = 36) {
  if (!pesos?.length) return '';
  const max = Math.max(...pesos, 1);
  const pts = pesos.map((p, i) => `${(i / Math.max(1, pesos.length - 1) * w).toFixed(1)},${(h - 2 - p / max * (h - 4)).toFixed(1)}`);
  return `<svg class="ex-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.join(' L')}"/></svg>`;
}
const estrelas = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';

export function criarExtracao(ctx) {
  // ctx: { store: () => store, toast, quem }
  const E = {
    montado: false, visivel: false,
    lista: [], busca: '',
    receita: carregarReceita(),
    conexao: 'desconectada', nomeBalanca: '', bateria: null, balanca: null,
    peso: 0, ultimoPeso: 0, recebeuPeso: false, vivo: [],  // vivo: [[ms, g]] dos últimos 3 s
    relogio: 'pronto', t0: 0, tFim: 0, amostras: [], armado: false, taraEm: 0,
    vazao: 0, vazaoMax: 0,
    referencia: null, // { nome, pesos }
    bruto: [], wakeLock: null, raf: 0,
  };
  const area = $('#areaExtracao');

  function carregarReceita() {
    try { return { ...RECEITA_PADRAO, ...JSON.parse(localStorage.getItem('cp_extracao_receita') || '{}') }; }
    catch { return { ...RECEITA_PADRAO }; }
  }
  function guardarReceita() { try { localStorage.setItem('cp_extracao_receita', JSON.stringify(E.receita)); } catch {} }
  const aguaAlvo = () => Math.round(E.receita.dose * E.receita.prop * 10) / 10;
  const conectada = () => E.conexao === 'conectada';
  const tempoAtual = () => E.relogio === 'rodando' ? (performance.now() - E.t0) / 1000 : E.relogio === 'fim' ? E.tFim : 0;

  // ---------------- Estrutura da tela (montada uma vez) ----------------
  function montar() {
    if (E.montado) return;
    E.montado = true;
    area.innerHTML = `
      <div class="ex-grid">
        <section class="ex-palco" aria-label="Extração ao vivo">
          <div class="ex-status">
            <span class="ex-pill" id="exPill"><i></i><span id="exStatusTxt">Balança desconectada</span></span>
            <span class="espaco"></span>
            <button type="button" class="ex-btn-claro" id="exDemo">Testar sem balança</button>
            <button type="button" class="ex-btn-claro ex-btn-forte" id="exConectar">Conectar balança</button>
          </div>
          <div class="ex-aviso" id="exAviso" role="alert" hidden></div>
          <div class="ex-numeros">
            <div class="ex-num ex-num-peso"><span>Peso</span><strong id="exPeso">0,0</strong><small>g</small></div>
            <div class="ex-num"><span>Tempo</span><strong id="exTempo">0:00</strong><em id="exTempoAlvo"></em></div>
            <div class="ex-num"><span>Vazão</span><strong id="exVazao">0,0</strong><small>g/s</small><em>&nbsp;</em></div>
            <div class="ex-num"><span>Proporção</span><strong id="exProp">1:0</strong><em id="exPropAlvo"></em></div>
          </div>
          <div class="ex-progresso" aria-hidden="true"><div id="exBarra"></div><span id="exFalta"></span></div>
          <div class="ex-grafico"><canvas id="exCanvas" aria-label="Gráfico de peso e vazão no tempo"></canvas></div>
          <div class="ex-controles">
            <button type="button" class="ex-ctl" id="exTara">Tara</button>
            <button type="button" class="ex-ctl ex-play" id="exPlay">Iniciar</button>
            <button type="button" class="ex-ctl" id="exZerar">Zerar</button>
            <button type="button" class="ex-ctl ex-salvar" id="exSalvar" hidden>Salvar</button>
          </div>
          <div class="ex-demo" id="exDemoBox" hidden>
            <span>Demonstração:</span>
            <button type="button" class="ex-btn-claro" data-demo="cafe">Colocar 15 g de café</button>
            <button type="button" class="ex-btn-claro" data-demo="despejar">Despejar água</button>
          </div>
          <p class="ex-dica" id="exDica"></p>
          <details class="ex-detalhes" id="exDetalhes">
            <summary>Detalhes da conexão</summary>
            <pre id="exBruto"></pre>
            <button type="button" class="ex-btn-claro" id="exCopiarBruto">Copiar</button>
          </details>
        </section>

        <aside class="ex-receita" aria-label="Receita">
          <h3>Receita</h3>
          <div class="ex-metodos" id="exMetodos">
            ${Object.entries(METODOS).map(([k, m]) => `<button type="button" data-metodo="${k}">${esc(m.nome)}</button>`).join('')}
          </div>
          <label>Café<input id="exCafe" autocomplete="off" maxlength="80" placeholder="Ex.: Mantiqueira, lote 12"></label>
          <div class="ex-dupla">
            <label>Dose (g)<input id="exDose" inputmode="decimal"></label>
            <label>Proporção 1:<input id="exPropIn" inputmode="decimal"></label>
          </div>
          <button type="button" class="btn btn-sm ex-usar-peso" id="exUsarPeso">Usar o peso da balança como dose</button>
          <div class="ex-alvo"><span>Água alvo</span><strong id="exAgua">240 g</strong></div>
          <div class="ex-dupla">
            <label>Tempo alvo<input id="exTempoIn" placeholder="3:00" inputmode="numeric"></label>
            <label>Temperatura °C<input id="exTemp" inputmode="decimal"></label>
          </div>
          <label>Moagem<input id="exMoagem" autocomplete="off" maxlength="60" placeholder="Ex.: C40 24 cliques"></label>
          <label class="ex-check"><input type="checkbox" id="exAuto"><span><b>Iniciar sozinho</b><small>O tempo começa quando a água cai na balança (depois da tara).</small></span></label>
          <div class="ex-ref" id="exRef" hidden></div>
          <p class="ex-atalhos so-desktop">Atalhos: <kbd>Espaço</kbd> inicia e para, <kbd>T</kbd> tara, <kbd>Z</kbd> zera.</p>
        </aside>

        <section class="ex-historico">
          <div class="ex-hist-topo">
            <h3>Extrações salvas</h3>
            <input id="exBusca" type="search" placeholder="Buscar café ou método" aria-label="Buscar nas extrações">
          </div>
          <div id="exLista" class="ex-lista" aria-live="polite"></div>
        </section>
      </div>`;
    ligar();
    preencherReceita();
    atualizarConexao();
    desenharEstatico();
  }

  // ---------------- Receita ----------------
  function preencherReceita() {
    const r = E.receita;
    $('#exCafe').value = r.cafe || '';
    $('#exDose').value = String(r.dose).replace('.', ',');
    $('#exPropIn').value = String(r.prop).replace('.', ',');
    $('#exTempoIn').value = r.tempo ? mmss(r.tempo) : '';
    $('#exTemp').value = r.temp || '';
    $('#exMoagem').value = r.moagem || '';
    $('#exAuto').checked = !!r.auto;
    $$('#exMetodos button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metodo === r.metodo)));
    atualizarAlvo();
  }
  function lerReceita() {
    const r = E.receita;
    r.cafe = $('#exCafe').value.trim();
    r.dose = num($('#exDose').value);
    r.prop = num($('#exPropIn').value);
    r.tempo = lerTempo($('#exTempoIn').value);
    r.temp = num($('#exTemp').value);
    r.moagem = $('#exMoagem').value.trim();
    r.auto = $('#exAuto').checked;
    guardarReceita();
    atualizarAlvo();
  }
  function atualizarAlvo() {
    $('#exAgua').textContent = `${g0(aguaAlvo())} g`;
    $('#exTempoAlvo').textContent = E.receita.tempo ? `alvo ${mmss(E.receita.tempo)}` : '';
    $('#exPropAlvo').textContent = E.receita.prop ? `alvo 1:${String(E.receita.prop).replace('.', ',')}` : '';
    pintar();
  }
  function renderReferencia() {
    const box = $('#exRef');
    if (!E.referencia) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `<span><b>Referência no gráfico</b><small>${esc(E.referencia.nome)}</small></span>
      <button type="button" class="btn-link" id="exTirarRef">Tirar</button>`;
    $('#exTirarRef').onclick = () => { E.referencia = null; renderReferencia(); pintar(); };
  }

  // ---------------- Balança ----------------
  const eventos = {
    peso: g => receberPeso(g),
    bateria: n => { E.bateria = n; atualizarConexao(); },
    estado: (st, nome) => {
      const antes = E.conexao;
      E.conexao = st; if (nome) E.nomeBalanca = nome;
      if (st === 'pareando' && antes !== 'pareando') alerta(TEXTO_PAREANDO);
      if (st === 'conectada') { soltarDica(); aguardarPeso(); }
      atualizarConexao();
    },
    bruto: linha => { E.bruto.push(linha); if (E.bruto.length > 150) E.bruto.shift(); if ($('#exDetalhes')?.open) $('#exBruto').textContent = E.bruto.join('\n'); },
  };
  const TEXTO_PAREANDO = 'A balança pediu pareamento (só acontece na primeira vez). Aceite o pedido que aparecer: uma janela do Chrome perto da barra de endereço (clique em Parear) ou um aviso do sistema (no Windows, uma notificação no canto de baixo da tela; no Android, uma janela de pareamento). O app continua conectado esperando, por até 90 segundos.';
  const ENDERECO_OPCAO = 'chrome://flags/#enable-web-bluetooth-confirm-pairing-support';
  const abrirDetalhes = () => { const det = $('#exDetalhes'); if (det) { det.open = true; $('#exBruto').textContent = E.bruto.join('\n'); } };
  let timerSemPeso;
  function aguardarPeso() {
    E.recebeuPeso = false;
    clearTimeout(timerSemPeso);
    timerSemPeso = setTimeout(() => {
      if (conectada() && !E.recebeuPeso) alerta('A balança conectou, mas não mandou o peso. Toque no botão de baixo dela, ou desconecte e conecte de novo. Se continuar, abra "Detalhes da conexão" e me mande o texto.');
    }, 5000);
  }

  async function conectar(simulado) {
    soltarDica();
    if (E.balanca) { await E.balanca.desconectar(); E.balanca = null; }
    if (!simulado && !temBluetooth()) { atualizarConexao(); return; }
    E.balanca = simulado ? criarSimulador(eventos) : criarBalanca(eventos);
    try {
      await E.balanca.conectar();
      iniciarLoop();
    } catch (e) {
      E.balanca = null;
      const n = e?.name;
      if (n === 'CanceladoError') { /* a pessoa clicou em Desconectar */ }
      else if (n === 'NotFoundError') dica('Nenhuma balança escolhida. Ligue a balança (luz branca piscando) e tente de novo.');
      else if (n === 'PareamentoRecusadoError') {
        alerta('O Chrome recusou o pareamento da balança. Ligue a opção "Web Bluetooth confirm pairing support": copie o endereço, cole na barra do Chrome, escolha Enabled e clique em Relaunch. Depois conecte de novo.',
          { texto: 'Copiar endereço da opção', fn: async () => { try { await navigator.clipboard.writeText(ENDERECO_OPCAO); ctx.toast('Endereço copiado: cole na barra do Chrome'); } catch { ctx.toast(ENDERECO_OPCAO); } } });
        abrirDetalhes();
      }
      else if (n === 'PareamentoRejeitadoError') {
        alerta('A balança recusou o pareamento. Segure o botão de baixo dela até a luz piscar rápido (modo de pareamento) e conecte de novo logo em seguida. Deixe o Bluetooth do celular desligado, para ela não se prender a ele.');
        abrirDetalhes();
      }
      else if (n === 'PareamentoPendenteError') {
        alerta('O pareamento ficou pendente e não terminou. Feche o Chrome inteiro, pareie a balança em Configurações do Windows → Bluetooth e dispositivos → Adicionar dispositivo (com a luz piscando rápido) e depois conecte por aqui. Se não der, copie os "Detalhes da conexão" e me mande.');
        abrirDetalhes();
      }
      else if (n === 'PareamentoError') {
        alerta('A balança pediu pareamento e ele não terminou em 90 segundos. Tente de novo e aceite o pedido de pareamento (janela do Chrome ou notificação do Windows). Se continuar, copie os "Detalhes da conexão" e me mande.');
        abrirDetalhes();
      }
      else if (n === 'SecurityError') alerta('O navegador bloqueou o Bluetooth. Abra o app pelo endereço https e tente de novo.');
      else {
        alerta(`Não deu para conectar (${n || 'erro'}: ${e?.message || ''}). Confira se a balança não está conectada no app da Timemore do celular e tente de novo. Se continuar, copie os "Detalhes da conexão" e me mande.`);
        abrirDetalhes();
      }
      E.conexao = 'desconectada'; atualizarConexao();
    }
  }

  function atualizarConexao() {
    if (!E.montado) return;
    const pill = $('#exPill'), txt = $('#exStatusTxt'), btn = $('#exConectar');
    pill.dataset.estado = E.conexao;
    const sim = E.balanca?.tipo === 'simulador';
    const bat = E.bateria != null && conectada() ? ` · bateria ${E.bateria}%` : '';
    txt.textContent = {
      desconectada: 'Balança desconectada',
      conectando: 'Conectando…',
      reconectando: 'A conexão caiu, reconectando…',
      pareando: 'Esperando o pareamento…',
      conectada: `${sim ? 'Demonstração' : (E.nomeBalanca || 'Timemore')} conectada${sim ? '' : bat}`,
    }[E.conexao];
    const ligada = ['conectada', 'conectando', 'reconectando', 'pareando'].includes(E.conexao);
    btn.textContent = ligada ? 'Desconectar' : 'Conectar balança';
    btn.disabled = !ligada && !temBluetooth();
    $('#exDemo').hidden = ligada;
    $('#exDemoBox').hidden = !(sim && conectada());
    $('#exTara').disabled = !conectada();
    $('#exUsarPeso').disabled = !conectada();
    if (!temBluetooth() && !ligada) {
      dica('Este navegador não tem Bluetooth. No computador, abra o app no Chrome ou no Edge. No celular, só no Chrome do Android (no iPhone não funciona).');
    } else if (E.conexao === 'desconectada') {
      dica('Ligue a balança: segure o botão de baixo até a luz branca piscar rápido. Depois toque em "Conectar balança".');
    } else if (E.conexao === 'pareando') {
      dica('Esperando o pareamento terminar…');
    } else if (conectada()) {
      dica(E.relogio === 'pronto' ? 'Coloque o filtro e o café, toque em Tara e comece a despejar.' : '');
    }
    renderControles();
  }

  // Dica: orientação do momento, embaixo dos botões.
  function dica(texto) { const el = $('#exDica'); if (el) el.textContent = texto; }
  // Alerta: aviso importante (pareamento, erro) no topo do painel; fica até a próxima conexão ou até chegar o peso.
  function alerta(texto, acao = null) {
    const el = $('#exAviso'); if (!el) return;
    el.innerHTML = `<p>${esc(texto)}</p>` + (acao ? `<button type="button" class="ex-btn-claro ex-btn-forte">${esc(acao.texto)}</button>` : '');
    if (acao) el.querySelector('button').onclick = acao.fn;
    el.hidden = false;
  }
  const temAlerta = () => !!$('#exAviso') && !$('#exAviso').hidden;
  function soltarDica() { const el = $('#exAviso'); if (el) { el.hidden = true; el.innerHTML = ''; } }

  function receberPeso(g) {
    E.recebeuPeso = true;
    if (temAlerta() && conectada()) { soltarDica(); atualizarConexao(); }
    E.peso = g;
    const agora = performance.now();
    E.vivo.push([agora, g]);
    while (E.vivo.length && agora - E.vivo[0][0] > 3000) E.vivo.shift();
    const ult = E.vivo.filter(([ms]) => agora - ms <= 2000).map(([ms, p]) => [ms / 1000, p]);
    const v = Math.max(0, inclinacao(ult));
    E.vazao = E.vazao * 0.6 + v * 0.4;
    if (E.vazao < 0.05) E.vazao = 0;
    // início automático: só depois da Tara (senão colocar o café já começaria o tempo)
    if (E.relogio === 'pronto' && E.receita.auto && E.armado && E.taraEm && agora - E.taraEm > 700 && g >= 1) iniciar();
    if (E.relogio === 'rodando') {
      const t = (agora - E.t0) / 1000;
      E.amostras.push([t, g, E.vazao]);
      E.vazaoMax = Math.max(E.vazaoMax, E.vazao);
    }
  }

  // ---------------- Relógio ----------------
  async function manterTelaAcesa(sim) {
    try {
      if (sim && 'wakeLock' in navigator && !E.wakeLock) { E.wakeLock = await navigator.wakeLock.request('screen'); E.wakeLock.addEventListener?.('release', () => { E.wakeLock = null; }); }
      if (!sim && E.wakeLock) { await E.wakeLock.release(); E.wakeLock = null; }
    } catch {}
  }
  function iniciar() {
    if (E.relogio === 'rodando') return;
    E.relogio = 'rodando';
    E.armado = false;
    E.t0 = performance.now();
    E.amostras = [[0, Math.max(0, E.peso), 0]];
    E.vazaoMax = 0;
    manterTelaAcesa(true);
    dica('');
    renderControles(); iniciarLoop();
  }
  function parar() {
    if (E.relogio !== 'rodando') return;
    E.tFim = (performance.now() - E.t0) / 1000;
    E.relogio = 'fim';
    manterTelaAcesa(false);
    dica(`Pronto: ${g1(E.peso)} g em ${mmss(E.tFim)}. Salve para guardar a curva no histórico.`);
    renderControles(); pintar();
  }
  function zerar() {
    E.relogio = 'pronto'; E.amostras = []; E.tFim = 0; E.vazaoMax = 0;
    E.armado = false;
    manterTelaAcesa(false);
    renderControles(); atualizarConexao(); pintar();
  }
  function renderControles() {
    if (!E.montado) return;
    const play = $('#exPlay');
    play.textContent = E.relogio === 'rodando' ? 'Parar' : E.relogio === 'fim' ? 'Nova extração' : 'Iniciar';
    play.classList.toggle('rodando', E.relogio === 'rodando');
    $('#exSalvar').hidden = E.relogio !== 'fim' || E.amostras.length < 3;
    $('#exZerar').hidden = E.relogio === 'fim';
    area.querySelector('.ex-palco').dataset.relogio = E.relogio;
  }

  // ---------------- Desenho ----------------
  function iniciarLoop() {
    if (E.raf) return;
    const quadro = () => {
      E.raf = 0;
      if (!E.visivel) return;
      pintar();
      if (conectada() || E.relogio === 'rodando') E.raf = requestAnimationFrame(quadro);
    };
    E.raf = requestAnimationFrame(quadro);
  }

  function pintar() {
    if (!E.montado || !E.visivel) return;
    const t = tempoAtual();
    const p = E.relogio === 'fim' ? (E.amostras.at(-1)?.[1] ?? E.peso) : E.peso;
    const alvo = aguaAlvo();
    $('#exPeso').textContent = g1(p);
    $('#exTempo').textContent = mmss(t);
    $('#exVazao').textContent = g1(E.relogio === 'fim' ? (E.tFim ? Math.max(0, p) / E.tFim : 0) : E.vazao);
    $('#exVazao').previousElementSibling.textContent = E.relogio === 'fim' ? 'Vazão média' : 'Vazão';
    const prop = E.receita.dose > 0 ? Math.max(0, p) / E.receita.dose : 0;
    $('#exProp').textContent = `1:${prop.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}`;
    const pct = alvo > 0 ? Math.min(1, Math.max(0, p) / alvo) : 0;
    $('#exBarra').style.width = (pct * 100).toFixed(1) + '%';
    const falta = alvo - p;
    $('#exFalta').textContent = alvo > 0 && E.relogio !== 'pronto'
      ? (falta > 0.5 ? `faltam ${g0(falta)} g` : falta < -2 ? `${g0(-falta)} g acima do alvo` : 'alvo atingido')
      : alvo > 0 ? `alvo ${g0(alvo)} g` : '';
    area.querySelector('.ex-palco').classList.toggle('ex-passou', E.receita.tempo > 0 && t > E.receita.tempo && E.relogio === 'rodando');
    desenharGrafico(t);
  }
  function desenharEstatico() { E.visivel && pintar(); }

  function desenharGrafico(tAgora) {
    const cv = $('#exCanvas'); if (!cv) return;
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = r.width, H = r.height;
    c.clearRect(0, 0, W, H);
    const pad = { l: 44, r: 40, t: 26, b: 26 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

    const alvo = aguaAlvo(), tAlvo = E.receita.tempo || 0;
    const am = E.amostras;
    const ref = E.referencia?.pesos || [];
    const maxPeso = Math.max(alvo * 1.12, ...am.map(a => a[1]), ...ref, 20);
    const tFim = Math.max(tAlvo * 1.15, tAgora + 10, ref.length * PASSO, 30);
    const maxVaz = Math.max(8, E.vazaoMax * 1.25);
    const X = s => pad.l + (s / tFim) * pw;
    const Y = g => pad.t + ph - (Math.max(0, g) / maxPeso) * ph;
    const YV = v => pad.t + ph - (Math.max(0, v) / maxVaz) * ph * 0.55;
    const fonte = '500 11px Inter, system-ui, sans-serif';

    // grade
    c.font = fonte; c.textBaseline = 'middle';
    c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; c.fillStyle = 'rgba(255,255,255,.42)';
    const passoG = maxPeso > 400 ? 100 : maxPeso > 150 ? 50 : maxPeso > 60 ? 20 : 10;
    c.textAlign = 'right';
    for (let g = 0; g <= maxPeso; g += passoG) {
      const y = Math.round(Y(g)) + .5;
      c.beginPath(); c.moveTo(pad.l, y); c.lineTo(W - pad.r, y); c.stroke();
      c.fillText(`${g}`, pad.l - 8, y);
    }
    const passoT = tFim > 300 ? 60 : tFim > 90 ? 30 : 10;
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let s = 0; s <= tFim; s += passoT) {
      const x = Math.round(X(s)) + .5;
      c.beginPath(); c.moveTo(x, pad.t); c.lineTo(x, pad.t + ph); c.stroke();
      c.fillText(mmss(s), x, pad.t + ph + 8);
    }
    c.textAlign = 'right'; c.textBaseline = 'middle';
    c.fillText('peso (g)', pad.l + 22, 9);
    c.fillStyle = 'rgba(255,255,255,.32)';
    c.fillText('vazão (g/s)', W - 6, 9);
    for (let v = 2; v <= maxVaz; v += maxVaz > 12 ? 4 : 2) c.fillText(`${v}`, W - 8, YV(v));

    // alvos
    c.setLineDash([5, 5]); c.lineWidth = 1.2;
    if (alvo > 0) {
      c.strokeStyle = 'rgba(212,146,74,.55)';
      c.beginPath(); c.moveTo(pad.l, Y(alvo)); c.lineTo(W - pad.r, Y(alvo)); c.stroke();
      c.fillStyle = 'rgba(212,146,74,.9)'; c.textAlign = 'left'; c.textBaseline = 'bottom';
      c.fillText(`alvo ${g0(alvo)} g`, pad.l + 6, Y(alvo) - 4);
    }
    if (tAlvo > 0) {
      c.strokeStyle = 'rgba(255,255,255,.28)';
      c.beginPath(); c.moveTo(X(tAlvo), pad.t); c.lineTo(X(tAlvo), pad.t + ph); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.5)'; c.textAlign = 'right'; c.textBaseline = 'top';
      c.fillText(`tempo alvo ${mmss(tAlvo)}`, X(tAlvo) - 5, pad.t + 2);
    }
    c.setLineDash([]);

    // referência (extração salva escolhida em "Repetir")
    if (ref.length > 1) {
      c.strokeStyle = 'rgba(255,255,255,.34)'; c.lineWidth = 2; c.setLineDash([2, 4]);
      c.beginPath();
      ref.forEach((g, i) => { const x = X(i * PASSO), y = Y(g); i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke(); c.setLineDash([]);
    }

    if (am.length < 2) {
      if (E.relogio === 'pronto') {
        c.fillStyle = 'rgba(255,255,255,.35)'; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.font = '500 14px Inter, system-ui, sans-serif';
        c.fillText(conectada() ? 'A curva aparece aqui quando o tempo começar' : 'Conecte a balança para ver a curva', pad.l + pw / 2, pad.t + ph / 2);
      }
      return;
    }
    // vazão (área suave)
    c.beginPath(); c.moveTo(X(am[0][0]), YV(0));
    am.forEach(([s, , v]) => c.lineTo(X(s), YV(v)));
    c.lineTo(X(am.at(-1)[0]), YV(0)); c.closePath();
    const gv = c.createLinearGradient(0, pad.t + ph * .45, 0, pad.t + ph);
    gv.addColorStop(0, 'rgba(255,255,255,.20)'); gv.addColorStop(1, 'rgba(255,255,255,.02)');
    c.fillStyle = gv; c.fill();

    // peso: área + linha caramelo
    c.beginPath(); c.moveTo(X(am[0][0]), Y(0));
    am.forEach(([s, g]) => c.lineTo(X(s), Y(g)));
    c.lineTo(X(am.at(-1)[0]), Y(0)); c.closePath();
    const gp = c.createLinearGradient(0, pad.t, 0, pad.t + ph);
    gp.addColorStop(0, 'rgba(212,146,74,.32)'); gp.addColorStop(1, 'rgba(212,146,74,0)');
    c.fillStyle = gp; c.fill();
    c.beginPath();
    am.forEach(([s, g], i) => { const x = X(s), y = Y(g); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.strokeStyle = '#E3A566'; c.lineWidth = 2.6; c.lineJoin = 'round'; c.lineCap = 'round';
    c.shadowColor = 'rgba(212,146,74,.6)'; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;

    // ponto atual
    const [sx, sg] = am.at(-1);
    const x = X(sx), y = Y(sg);
    if (E.relogio === 'rodando') {
      const pulso = 6 + 4 * (0.5 + 0.5 * Math.sin(performance.now() / 220));
      c.fillStyle = 'rgba(227,165,102,.25)'; c.beginPath(); c.arc(x, y, pulso, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 3.6, 0, Math.PI * 2); c.fill();
  }

  // ---------------- Salvar e histórico ----------------
  const dlg = $('#dlgExtracao'), f = $('#formExtracao');
  function abrirSalvar() {
    lerReceita();
    const am = E.amostras;
    const final = am.at(-1)?.[1] ?? E.peso;
    $('#extracaoResumo').innerHTML = `
      <div><strong>${g1(final)} g</strong><span>água</span></div>
      <div><strong>${mmss(E.tFim)}</strong><span>tempo</span></div>
      <div><strong>1:${E.receita.dose ? (final / E.receita.dose).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0'}</strong><span>proporção</span></div>`;
    f.cafe.value = E.receita.cafe || '';
    f.obs.value = '';
    $$('input[name=avaliacao]', f).forEach(i => { i.checked = false; });
    dlg.showModal();
  }
  async function salvar(ev) {
    ev.preventDefault();
    const am = E.amostras;
    const final = am.at(-1)?.[1] ?? E.peso;
    const r = E.receita;
    r.cafe = f.cafe.value.trim(); $('#exCafe').value = r.cafe; guardarReceita();
    const agora = new Date().toISOString();
    const doc = {
      id: novoId(),
      cafe: r.cafe, metodo: r.metodo, dose: r.dose, proporcao: r.prop, aguaAlvo: aguaAlvo(),
      tempoAlvo: r.tempo, temperatura: r.temp, moagem: r.moagem,
      aguaFinal: Math.round(final * 10) / 10, tempo: Math.round(E.tFim),
      vazaoMedia: E.tFim ? Math.round(final / E.tFim * 10) / 10 : 0,
      avaliacao: Number(f.querySelector('input[name=avaliacao]:checked')?.value || 0),
      obs: f.obs.value.trim(),
      curva: { passo: PASSO, pesos: reamostrar(am) },
      balanca: E.balanca?.tipo === 'simulador' ? 'Demonstração' : (E.nomeBalanca || 'Timemore'),
      criadoEm: agora, criadoPor: ctx.quem(), atualizadoEm: agora, atualizadoPor: ctx.quem(),
    };
    try {
      await ctx.store().salvarDoc('extracoes', doc);
      dlg.close();
      ctx.toast('Extração salva');
      zerar();
    } catch { ctx.toast('Não deu para salvar. Confira a internet e tente de novo.'); }
  }

  function renderLista() {
    if (!E.montado) return;
    const q = E.busca.trim().toLowerCase();
    const itens = E.lista
      .filter(x => !q || `${x.cafe} ${METODOS[x.metodo]?.nome || ''} ${x.obs} ${x.moagem}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const el = $('#exLista');
    if (!itens.length) {
      el.innerHTML = `<p class="ex-vazio">${E.lista.length ? 'Nada encontrado.' : 'Nenhuma extração salva ainda. Faça um preparo e toque em Salvar no fim.'}</p>`;
      return;
    }
    el.innerHTML = itens.map(x => {
      const prop = x.dose ? (x.aguaFinal / x.dose).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';
      return `<article class="ex-card" data-id="${esc(x.id)}">
        <div class="ex-card-topo">
          <div><h4>${esc(x.cafe || METODOS[x.metodo]?.nome || 'Extração')}</h4>
          <small>${esc(METODOS[x.metodo]?.nome || '')}${x.moagem ? ' · ' + esc(x.moagem) : ''}${x.temperatura ? ` · ${g0(x.temperatura)} °C` : ''}</small></div>
          ${sparkline(x.curva?.pesos)}
        </div>
        <div class="ex-card-nums">
          <span><b>${g1(x.dose)} g</b> café</span><span><b>${g0(x.aguaFinal)} g</b> água</span>
          <span><b>1:${prop}</b></span><span><b>${mmss(x.tempo)}</b></span>
        </div>
        ${x.avaliacao ? `<div class="ex-estrelas" aria-label="Nota ${x.avaliacao} de 5">${estrelas(x.avaliacao)}</div>` : ''}
        ${x.obs ? `<p class="ex-obs">${esc(x.obs)}</p>` : ''}
        <div class="ex-card-rodape">
          <small>${esc(quando(x.criadoEm))}${x.criadoPor ? ' · ' + esc(x.criadoPor) : ''}</small>
          <span class="espaco"></span>
          <button type="button" class="btn-link" data-xacao="excluir">Excluir</button>
          <button type="button" class="btn btn-sm" data-xacao="repetir">Repetir</button>
        </div>
      </article>`;
    }).join('');
  }

  function repetir(x) {
    E.receita = { ...E.receita, metodo: x.metodo || 'outro', cafe: x.cafe || '', dose: x.dose, prop: x.proporcao, tempo: x.tempoAlvo || x.tempo, temp: x.temperatura || '', moagem: x.moagem || '' };
    guardarReceita(); preencherReceita();
    E.referencia = { nome: `${x.cafe || METODOS[x.metodo]?.nome || 'Extração'} · ${quando(x.criadoEm)}`, pesos: x.curva?.pesos || [] };
    renderReferencia();
    if (E.relogio === 'fim') zerar(); else pintar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    ctx.toast('Receita carregada. A curva dela aparece pontilhada no gráfico.');
  }
  async function excluir(x) {
    await ctx.store().excluirDoc('extracoes', x.id);
    ctx.toast('Extração excluída', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('extracoes', x) });
  }

  // Tara: zera a balança e, com "Iniciar sozinho", deixa o tempo pronto para começar com a água
  function tarar() {
    if (!conectada()) return;
    E.balanca?.tara();
    E.taraEm = performance.now();
    E.armado = E.relogio === 'pronto';
    if (E.armado && E.receita.auto) dica('Balança zerada. O tempo começa quando a água cair.');
  }

  // ---------------- Eventos ----------------
  function ligar() {
    $('#exConectar').onclick = () => {
      const ligada = ['conectada', 'conectando', 'reconectando', 'pareando'].includes(E.conexao);
      if (ligada) { E.balanca?.desconectar(); E.balanca = null; } else conectar(false);
    };
    $('#exDemo').onclick = () => conectar(true);
    $('#exDemoBox').addEventListener('click', e => {
      const b = e.target.closest('[data-demo]'); if (!b || !E.balanca?.colocar) return;
      if (b.dataset.demo === 'cafe') { E.balanca.colocar(15); setTimeout(() => { if (num($('#exDose').value) !== 15) { $('#exDose').value = '15'; lerReceita(); } }, 300); }
      else { tarar(); setTimeout(() => E.balanca?.despejar(), 900); }
    });
    $('#exTara').onclick = tarar;
    $('#exPlay').onclick = () => { E.relogio === 'rodando' ? parar() : E.relogio === 'fim' ? zerar() : iniciar(); };
    $('#exZerar').onclick = zerar;
    $('#exSalvar').onclick = abrirSalvar;
    $('#exUsarPeso').onclick = () => {
      if (E.peso <= 0.2) { ctx.toast('Coloque o café na balança primeiro'); return; }
      $('#exDose').value = g1(E.peso); lerReceita();
      ctx.toast(`Dose: ${g1(E.peso)} g. Agora toque em Tara antes de despejar.`);
    };
    $('#exMetodos').addEventListener('click', e => {
      const b = e.target.closest('[data-metodo]'); if (!b) return;
      const m = METODOS[b.dataset.metodo];
      E.receita = { ...E.receita, metodo: b.dataset.metodo, dose: m.dose, prop: m.prop, tempo: m.tempo, temp: m.temp };
      guardarReceita(); preencherReceita();
    });
    ['#exCafe', '#exDose', '#exPropIn', '#exTempoIn', '#exTemp', '#exMoagem'].forEach(s => $(s).addEventListener('input', lerReceita));
    $('#exTempoIn').addEventListener('blur', () => { if (E.receita.tempo) $('#exTempoIn').value = mmss(E.receita.tempo); });
    $('#exAuto').addEventListener('change', lerReceita);
    $('#exBusca').addEventListener('input', e => { E.busca = e.target.value; renderLista(); });
    $('#exLista').addEventListener('click', e => {
      const b = e.target.closest('[data-xacao]'); if (!b) return;
      const x = E.lista.find(i => i.id === b.closest('.ex-card').dataset.id); if (!x) return;
      if (b.dataset.xacao === 'repetir') repetir(x); else excluir(x);
    });
    $('#exDetalhes').addEventListener('toggle', () => { $('#exBruto').textContent = E.bruto.join('\n') || 'Nada recebido ainda.'; });
    $('#exCopiarBruto').onclick = async () => {
      try { await navigator.clipboard.writeText(E.bruto.join('\n')); ctx.toast('Copiado'); } catch { ctx.toast('Não deu para copiar'); }
    };
    f.addEventListener('submit', salvar);
    $$('[data-fechar]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
    window.addEventListener('resize', () => pintar());
    document.addEventListener('keydown', e => {
      if (!E.visivel || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest('input, textarea, select, dialog[open]') || document.querySelector('dialog[open]')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') { e.preventDefault(); $('#exPlay').click(); }
      else if (k === 't' && conectada()) $('#exTara').click();
      else if (k === 'z' && E.relogio !== 'rodando') zerar();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && E.relogio === 'rodando') manterTelaAcesa(true);
    });
  }

  // ---------------- Interface do módulo ----------------
  function render() {
    montar();
    E.visivel = true;
    renderLista(); renderReferencia(); atualizarConexao();
    requestAnimationFrame(() => { pintar(); if (conectada() || E.relogio === 'rodando') iniciarLoop(); });
  }
  function esconder() { E.visivel = false; }
  function conectarDados() {
    const st = ctx.store();
    if (!st?.onColecao) return [];
    return [st.onColecao('extracoes', l => { E.lista = l; renderLista(); }, () => ctx.toast('Erro ao carregar as extrações'))];
  }

  return { render, esconder, conectar: conectarDados };
}
