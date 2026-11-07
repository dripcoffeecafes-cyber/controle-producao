// Extração: a balança Timemore por Bluetooth, as receitas guiadas e o histórico dos preparos.
// A área tem: cartão da balança (conectar, peso agora, avisos e registro da conexão), biblioteca de receitas
// (modelos + as da equipe; Preparar abre o Estúdio em tela cheia) e as extrações salvas.
// O preparo acontece no Estúdio (estudio.js); aqui ficam a conexão, a vazão e o salvar.
// Coleções equipes/{chave}/extracoes e equipes/{chave}/receitas (ver receitas.js).

import { criarBalanca, criarSimulador, temBluetooth } from './balanca.js';
import { criarEstudio } from './estudio.js';
import {
  METODOS, MODELOS, FAMILIAS, FAMILIA_PADRAO, corDaFamilia, criarEditorReceitas, descricaoReceita, miniPerfil, etapasDaReceita, mmss,
} from './receitas.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const g1 = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const g0 = v => Math.round(v).toLocaleString('pt-BR');
const quando = iso => {
  const d = new Date(iso); if (isNaN(d)) return '';
  const dias = Math.floor((Date.now() - d) / 86400000);
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (dias <= 0 && d.getDate() === new Date().getDate()) return `hoje, ${hora}`;
  if (dias <= 1) return `ontem, ${hora}`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + `, ${hora}`;
};
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
function sparkline(pesos, cor = 'currentColor', w = 120, h = 36) {
  if (!pesos?.length) return '';
  const max = Math.max(...pesos, 1);
  const pts = pesos.map((p, i) => `${(i / Math.max(1, pesos.length - 1) * w).toFixed(1)},${(h - 2 - p / max * (h - 4)).toFixed(1)}`);
  return `<svg class="ex-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts.join(' L')}" style="stroke:${cor}"/></svg>`;
}
const estrelas = n => n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '';
// faixa de notas: "tangerina, mel" vira "tangerina · mel" (em maiúsculas pelo CSS), na cor normal do café
const notasEmFaixa = t => String(t || '').split(/[,;·]+/).map(x => x.trim()).filter(Boolean).join(' · ');
const estiloCor = f => {
  const fa = FAMILIAS[f] || FAMILIAS[FAMILIA_PADRAO];
  return `--cor:${fa.claro};--cor-base:${fa.cor};--sobre-cor:${f === 'fruta-amarela' ? '#1D1D1B' : '#FFFFFF'}`;
};

const ICONE_EDITAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg>';
const ICONE_DUPLICAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';

export function criarExtracao(ctx) {
  // ctx: { store: () => store, toast, quem }
  const E = {
    montado: false, visivel: false,
    lista: [], busca: '', receitas: [],
    conexao: 'desconectada', nomeBalanca: '', bateria: null, balanca: null,
    peso: 0, vazao: 0, recebeuPeso: false, vivo: [],
    bruto: [],
  };
  const area = $('#areaExtracao');
  const conectada = () => E.conexao === 'conectada';
  const TEXTO_PAREANDO = 'A balança pediu pareamento (só acontece na primeira vez). Aceite o pedido que aparecer: uma janela do Chrome perto da barra de endereço (clique em Parear) ou um aviso do sistema (no Windows, uma notificação no canto de baixo da tela; no Android, uma janela de pareamento). O app continua conectado esperando, por até 90 segundos.';
  const ENDERECO_OPCAO = 'chrome://flags/#enable-web-bluetooth-confirm-pairing-support';

  // ---------------- Estúdio ----------------
  const estudio = criarEstudio({
    balanca: () => E.balanca,
    conexao: () => E.conexao,
    nomeBalanca: () => (E.balanca?.tipo === 'simulador' ? 'Demonstração' : E.nomeBalanca),
    bateria: () => E.bateria,
    conectar: simulado => conectar(simulado),
    tarar: () => E.balanca?.tara(),
    toast: (...a) => ctx.toast(...a),
    aoTerminar: dados => abrirSalvar(dados),
  });

  // ---------------- Estrutura da área (montada uma vez) ----------------
  function montar() {
    if (E.montado) return;
    E.montado = true;
    area.innerHTML = `
      <div class="ex2">
        <section class="ex2-balanca" aria-label="Balança">
          <div class="ex2-bal-topo">
            <span class="ex-pill" id="exPill"><i></i><span id="exStatusTxt">Balança desconectada</span></span>
            <span class="espaco"></span>
            <button type="button" class="ex-btn-claro" id="exDemo">Testar sem balança</button>
            <button type="button" class="ex-btn-claro ex-btn-forte" id="exConectar">Conectar balança</button>
          </div>
          <div class="ex-aviso" id="exAviso" role="alert" hidden></div>
          <div class="ex2-bal-corpo">
            <div class="ex2-peso"><span class="ex2-rot">Peso agora</span><div><strong id="exPeso">0,0</strong><small>g</small></div></div>
            <p class="ex-dica" id="exDica"></p>
            <button type="button" class="ex-btn-claro" id="exTara">Tara</button>
          </div>
          <details class="ex-detalhes" id="exDetalhes">
            <summary>Detalhes da conexão</summary>
            <pre id="exBruto"></pre>
            <button type="button" class="ex-btn-claro" id="exCopiarBruto">Copiar</button>
          </details>
        </section>

        <section class="ex2-receitas" aria-label="Receitas">
          <div class="ex2-cab">
            <div><h3>Receitas</h3><p>Toque em Preparar: a receita abre no estúdio, em tela cheia. Com a balança, o peso guia as etapas; sem ela, o relógio guia.</p></div>
            <button type="button" class="btn btn-primary" id="exNovaReceita">Nova receita</button>
          </div>
          <div class="ex2-grade" id="exReceitas"></div>
        </section>

        <section class="ex-historico">
          <div class="ex-hist-topo">
            <h3>Extrações salvas</h3>
            <input id="exBusca" type="search" placeholder="Buscar café, receita ou método" aria-label="Buscar nas extrações">
          </div>
          <div id="exLista" class="ex-lista" aria-live="polite"></div>
        </section>
      </div>`;
    ligar();
    atualizarConexao();
    renderReceitas();
  }

  // ---------------- Receitas ----------------
  const editor = criarEditorReceitas({ store: ctx.store, toast: (...a) => ctx.toast(...a), quem: ctx.quem });
  const todasReceitas = () => [
    ...[...E.receitas].sort((a, b) => String(b.atualizadoEm || '').localeCompare(String(a.atualizadoEm || ''))),
    ...MODELOS,
  ];
  const acharReceita = id => todasReceitas().find(r => r.id === id);

  function renderReceitas() {
    if (!E.montado) return;
    const livre = `
      <article class="rc rc-livre" style="--cor:#A9A6A2">
        <div class="rc-topo"><span class="rc-metodo">Sem receita</span></div>
        <h4>Preparo livre</h4>
        <p class="rc-desc">O seu café, no seu ritmo: peso, tempo, vazão e a curva ao vivo (ou só o cronômetro, sem balança).</p>
        <div class="rc-acoes"><button type="button" class="rc-preparar" data-racao="livre">Preparar</button></div>
      </article>`;
    $('#exReceitas').innerHTML = livre + todasReceitas().map(r => {
      const cor = corDaFamilia(r.familia);
      const et = etapasDaReceita(r).filter(e => e.tipo === 'despejo');
      return `<article class="rc" data-id="${esc(r.id)}" style="${estiloCor(r.familia)}">
        <div class="rc-topo"><span class="rc-metodo">${esc(METODOS[r.metodo]?.nome || 'Receita')}</span>${r.modelo ? '<span class="rc-tag">Modelo</span>' : ''}<span class="rc-familia" title="${esc(FAMILIAS[r.familia]?.nome || '')}"><i></i></span></div>
        <h4>${esc(r.nome)}</h4>
        ${r.cafe || r.pontuacao ? `<p class="rc-cafe">${r.cafe ? `<span>${esc(r.cafe.toUpperCase())}</span>` : ''}${r.pontuacao ? `<i class="rc-nota">${esc(String(r.pontuacao).replace('.', ','))}</i>` : ''}</p>` : ''}
        ${r.notas ? `<p class="rc-notas">${esc(notasEmFaixa(r.notas))}</p>` : ''}
        <p class="rc-desc">${esc(descricaoReceita(r))}</p>
        ${miniPerfil(r, 240, 48, cor)}
        <p class="rc-etapas">${et.length} ${et.length === 1 ? 'despejo' : 'despejos'}${et[0] ? ` · ${esc(et[0].nome)} até ${g0(et[0].ate)} g` : ''}</p>
        <div class="rc-acoes">
          <button type="button" class="rc-preparar" data-racao="preparar">Preparar</button>
          <button type="button" class="rc-sec" data-racao="editar" aria-label="${r.modelo ? 'Personalizar (cria uma receita sua a partir do modelo)' : 'Editar receita'}" title="${r.modelo ? 'Personalizar' : 'Editar'}">${ICONE_EDITAR}</button>
          ${r.modelo ? '' : `<button type="button" class="rc-sec" data-racao="duplicar" aria-label="Duplicar receita" title="Duplicar">${ICONE_DUPLICAR}</button>`}
        </div>
      </article>`;
    }).join('');
  }

  // ---------------- Balança ----------------
  const eventos = {
    peso: g => receberPeso(g),
    bateria: n => { E.bateria = n; atualizarConexao(); },
    estado: (st, nome) => {
      const antes = E.conexao;
      E.conexao = st; if (nome) E.nomeBalanca = nome;
      if (st === 'pareando' && antes !== 'pareando') alerta(TEXTO_PAREANDO);
      if (st === 'conectada') { soltarAlerta(); aguardarPeso(); }
      atualizarConexao();
    },
    bruto: linha => { E.bruto.push(linha); if (E.bruto.length > 150) E.bruto.shift(); if ($('#exDetalhes')?.open) $('#exBruto').textContent = E.bruto.join('\n'); },
  };
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
    soltarAlerta();
    if (E.balanca) { await E.balanca.desconectar(); E.balanca = null; }
    if (!simulado && !temBluetooth()) { atualizarConexao(); return; }
    E.balanca = simulado ? criarSimulador(eventos) : criarBalanca(eventos);
    try {
      await E.balanca.conectar();
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
        alerta('O pareamento ficou preso e não terminou. Reinicie o computador e conecte de novo por aqui (não use o "Adicionar dispositivo" do Windows para a balança). Se não der, copie os "Detalhes da conexão" e me mande.');
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
    estudio.atualizarConexao();
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
    $('#exTara').disabled = !conectada();
    $('.ex2-balanca').dataset.estado = E.conexao;
    if (!temBluetooth() && !ligada) {
      dica('Este navegador não tem Bluetooth. No computador, abra o app no Chrome ou no Edge. No celular, só no Chrome do Android (no iPhone não funciona).');
    } else if (E.conexao === 'desconectada') {
      dica('Ligue a balança (segure o botão de baixo até a luz branca piscar) e toque em "Conectar balança". Sem balança? Toque em Preparar numa receita e siga só o método, pelo relógio.');
    } else if (E.conexao === 'pareando') {
      dica('Esperando o pareamento terminar…');
    } else if (conectada()) {
      dica('Balança pronta. Escolha uma receita e toque em Preparar.');
    }
  }

  // Dica: orientação do momento. Alerta: aviso importante (pareamento, erro), fica até a próxima conexão ou até chegar o peso.
  function dica(texto) { const el = $('#exDica'); if (el) el.textContent = texto; }
  function alerta(texto, acao = null) {
    estudio.aviso(texto);
    const el = $('#exAviso'); if (!el) return;
    el.innerHTML = `<p>${esc(texto)}</p>` + (acao ? `<button type="button" class="ex-btn-claro ex-btn-forte">${esc(acao.texto)}</button>` : '');
    if (acao) el.querySelector('button').onclick = acao.fn;
    el.hidden = false;
  }
  const temAlerta = () => !!$('#exAviso') && !$('#exAviso').hidden;
  function soltarAlerta() {
    estudio.aviso('');
    const el = $('#exAviso'); if (el) { el.hidden = true; el.innerHTML = ''; }
  }

  function receberPeso(g) {
    E.recebeuPeso = true;
    if (temAlerta() && conectada()) { soltarAlerta(); atualizarConexao(); }
    E.peso = g;
    const agora = performance.now();
    E.vivo.push([agora, g]);
    while (E.vivo.length && agora - E.vivo[0][0] > 3000) E.vivo.shift();
    const ult = E.vivo.filter(([ms]) => agora - ms <= 2000).map(([ms, p]) => [ms / 1000, p]);
    const v = Math.max(0, inclinacao(ult));
    E.vazao = E.vazao * 0.6 + v * 0.4;
    if (E.vazao < 0.05) E.vazao = 0;
    estudio.receberPeso(g, E.vazao);
    if (E.visivel) { const n = $('#exPeso'); if (n) n.textContent = g1(g); }
  }

  // ---------------- Salvar o preparo (chamado pelo Estúdio no fim) ----------------
  const dlg = $('#dlgExtracao'), f = $('#formExtracao');
  let preparo = null;
  function abrirSalvar(dados) {
    preparo = dados;
    const r = dados.receita;
    const prop = r?.dose ? (dados.aguaFinal / r.dose).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '';
    $('#extracaoResumo').innerHTML = `
      <div><strong>${g1(dados.aguaFinal)} g</strong><span>${dados.semBalanca ? 'água (receita)' : 'água'}</span></div>
      <div><strong>${mmss(dados.tempo)}</strong><span>tempo</span></div>
      <div><strong>${prop ? `1:${prop}` : g1(dados.vazaoMedia) + ' g/s'}</strong><span>${prop ? 'proporção' : 'vazão média'}</span></div>`;
    f.cafe.value = dados.cafe || r?.cafe || '';
    f.obs.value = '';
    $$('input[name=avaliacao]', f).forEach(i => { i.checked = false; });
    dlg.showModal();
  }
  async function salvar(ev) {
    ev.preventDefault();
    if (!preparo) return;
    const r = preparo.receita;
    const agora = new Date().toISOString();
    const doc = {
      id: novoId(),
      cafe: f.cafe.value.trim(), receitaId: r?.id || '', receitaNome: r?.nome || '', familia: preparo.familia || r?.familia || '',
      notas: preparo.notas || '', pontuacao: preparo.pontuacao || null,
      metodo: r?.metodo || 'outro', dose: r?.dose || 0, proporcao: r?.dose ? Math.round(r.agua / r.dose * 10) / 10 : 0,
      aguaAlvo: r?.agua || 0, tempoAlvo: r?.tempoTotal || 0, temperatura: r?.temperatura || 0, moagem: r?.moagem || '',
      aguaFinal: Math.round(preparo.aguaFinal * 10) / 10, tempo: Math.round(preparo.tempo),
      vazaoMedia: Math.round(preparo.vazaoMedia * 10) / 10,
      avaliacao: Number(f.querySelector('input[name=avaliacao]:checked')?.value || 0),
      obs: f.obs.value.trim(),
      curva: { passo: PASSO, pesos: preparo.semBalanca ? [] : reamostrar(preparo.amostras) },
      balanca: preparo.semBalanca ? 'Sem balança' : E.balanca?.tipo === 'simulador' ? 'Demonstração' : (E.nomeBalanca || 'Timemore'),
      criadoEm: agora, criadoPor: ctx.quem(), atualizadoEm: agora, atualizadoPor: ctx.quem(),
    };
    try {
      await ctx.store().salvarDoc('extracoes', doc);
      dlg.close();
      ctx.toast('Preparo salvo no histórico');
    } catch { ctx.toast('Não deu para salvar. Confira a internet e tente de novo.'); }
  }

  // ---------------- Histórico ----------------
  function renderLista() {
    if (!E.montado) return;
    const q = E.busca.trim().toLowerCase();
    const itens = E.lista
      .filter(x => !q || `${x.cafe} ${x.receitaNome || ''} ${METODOS[x.metodo]?.nome || ''} ${x.obs} ${x.moagem}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)));
    const el = $('#exLista');
    if (!itens.length) {
      el.innerHTML = `<p class="ex-vazio">${E.lista.length ? 'Nada encontrado.' : 'Nenhum preparo salvo ainda. No fim de um preparo no estúdio, toque em Salvar preparo.'}</p>`;
      return;
    }
    el.innerHTML = itens.map(x => {
      const prop = x.dose ? (x.aguaFinal / x.dose).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '';
      const cor = x.familia ? corDaFamilia(x.familia) : '#D4924A';
      return `<article class="ex-card" data-id="${esc(x.id)}" style="--cor:${cor}">
        <div class="ex-card-topo">
          <div><h4>${esc(x.cafe || x.receitaNome || METODOS[x.metodo]?.nome || 'Preparo')}</h4>
          <small>${esc([x.receitaNome && x.cafe ? x.receitaNome : '', METODOS[x.metodo]?.nome, x.moagem, x.temperatura ? `${g0(x.temperatura)}\u00a0°C` : ''].filter(Boolean).join(' · '))}</small></div>
          ${x.curva?.pesos?.length ? sparkline(x.curva.pesos, cor) : x.balanca === 'Sem balança' ? '<span class="ex-sem-balanca">Sem balança</span>' : ''}
        </div>
        ${x.notas ? `<p class="rc-notas ex-notas" style="${estiloCor(x.familia)}">${esc(notasEmFaixa(x.notas))}</p>` : ''}
        <div class="ex-card-nums">
          ${x.dose ? `<span><b>${g1(x.dose)} g</b> café</span>` : ''}<span><b>${g0(x.aguaFinal)} g</b> água</span>
          ${prop ? `<span><b>1:${prop}</b></span>` : ''}<span><b>${mmss(x.tempo)}</b></span>
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

  // Repetir: abre o estúdio com a mesma receita e a curva desse preparo como referência
  function repetir(x) {
    const r = (x.receitaId && acharReceita(x.receitaId)) || null;
    estudio.abrir(r, {
      cafe: x.cafe || '', notas: x.notas || '', pontuacao: x.pontuacao || null, familia: x.familia || undefined,
      modo: x.balanca === 'Sem balança' ? 'metodo' : undefined,
      referencia: { nome: `${x.cafe || x.receitaNome || 'Preparo'} · ${quando(x.criadoEm)}`, pesos: x.curva?.pesos || [] },
    });
  }
  async function excluir(x) {
    await ctx.store().excluirDoc('extracoes', x.id);
    ctx.toast('Preparo excluído', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('extracoes', x) });
  }

  // ---------------- Eventos ----------------
  function ligar() {
    $('#exConectar').onclick = () => {
      const ligada = ['conectada', 'conectando', 'reconectando', 'pareando'].includes(E.conexao);
      if (ligada) { E.balanca?.desconectar(); E.balanca = null; } else conectar(false);
    };
    $('#exDemo').onclick = () => conectar(true);
    $('#exTara').onclick = () => E.balanca?.tara();
    $('#exNovaReceita').onclick = () => editor.abrir(null);
    $('#exReceitas').addEventListener('click', e => {
      const b = e.target.closest('[data-racao]'); if (!b) return;
      const acao = b.dataset.racao;
      if (acao === 'livre') { estudio.abrir(null); return; }
      const r = acharReceita(b.closest('.rc')?.dataset.id); if (!r) return;
      if (acao === 'preparar') estudio.abrir(r);
      else if (acao === 'editar') editor.abrir(r);
      else if (acao === 'duplicar') editor.duplicar(r);
    });
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
  }

  // ---------------- Interface do módulo ----------------
  function render() {
    montar();
    E.visivel = true;
    renderReceitas(); renderLista(); atualizarConexao();
    $('#exPeso').textContent = g1(E.peso);
  }
  function esconder() { E.visivel = false; }
  function conectarDados() {
    const st = ctx.store();
    if (!st?.onColecao) return [];
    return [
      st.onColecao('extracoes', l => { E.lista = l; renderLista(); }, () => ctx.toast('Erro ao carregar as extrações')),
      st.onColecao('receitas', l => { E.receitas = l; renderReceitas(); }, () => ctx.toast('Erro ao carregar as receitas')),
    ];
  }

  return { render, esconder, conectar: conectarDados };
}
