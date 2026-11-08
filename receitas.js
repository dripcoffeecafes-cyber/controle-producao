// Receitas guiadas da Extração (lógica sem tela + editor).
// Receita: { id, nome, metodo, cafe, familia, dose (g), agua (g), temperatura, moagem, tempoTotal (s),
//   despejos: [{ nome, ate (g acumulado na balança), inicio (s), fim (s) }], obs, criado/atualizado Em/Por }
// Coleção equipes/{chave}/receitas. Os MODELOS aparecem sempre, mesmo sem nada salvo.
// Etapas (o que a tela guia): cada despejo vira uma etapa "despejar até X g" seguida de "aguarde até o próximo
// despejo"; no fim, a drenagem até o tempo total.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
export const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const lerTempo = txt => { // "3:30", "3.30", "210" → segundos
  const t = String(txt ?? '').trim();
  if (!t) return 0;
  const m = t.match(/^(\d+)[:.,](\d{1,2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : Math.round(num(t));
};
const g0 = v => Math.round(v).toLocaleString('pt-BR');

export const METODOS = {
  v60: { nome: 'V60' },
  kalita: { nome: 'Kalita / Origami' },
  drip: { nome: 'Drip Coffee' },
  chemex: { nome: 'Chemex' },
  prensa: { nome: 'Prensa francesa' },
  aeropress: { nome: 'AeroPress' },
  outro: { nome: 'Outro' },
};

// Cores de café do kit da marca (Roda de Sabores da SCA): cor normal e o tom claro, que é o usado no fundo escuro.
export const FAMILIAS = {
  flor: { nome: 'Floral', cor: '#5D5685', claro: '#A39CD4' },
  cereja: { nome: 'Frutas vermelhas', cor: '#A23E35', claro: '#ED8174' },
  jabuticaba: { nome: 'Frutas escuras', cor: '#642F68', claro: '#C88CCB' },
  'fruta-amarela': { nome: 'Frutas amarelas', cor: '#EEBC4A', claro: '#EEBC4A' },
  tangerina: { nome: 'Cítricas', cor: '#A55115', claro: '#E58B55' },
  erva: { nome: 'Verde e vegetal', cor: '#617136', claro: '#9BAE6D' },
  canela: { nome: 'Especiarias', cor: '#854734', claro: '#D6917B' },
  cacau: { nome: 'Cacau e nozes', cor: '#624539', claro: '#C09B8B' },
  mel: { nome: 'Doce', cor: '#8F6213', claro: '#CD9A50' },
};
export const FAMILIA_PADRAO = 'mel';
export const corDaFamilia = f => (FAMILIAS[f] || FAMILIAS[FAMILIA_PADRAO]).claro;

export const MODELOS = [
  {
    id: 'modelo-v60', modelo: true, nome: 'V60 Blooming', metodo: 'v60', cafe: '', familia: 'tangerina',
    dose: 15, agua: 240, temperatura: 93, moagem: 'média-fina', tempoTotal: 180,
    despejos: [
      { nome: 'Blooming', ate: 45, inicio: 0, fim: 10 },
      { nome: '1º despejo', ate: 140, inicio: 45, fim: 75 },
      { nome: '2º despejo', ate: 240, inicio: 90, fim: 120 },
    ],
  },
  {
    id: 'modelo-drip', modelo: true, nome: 'Drip Coffee', metodo: 'drip', cafe: '', familia: 'mel',
    dose: 11, agua: 165, temperatura: 92, moagem: '', tempoTotal: 150,
    despejos: [
      { nome: 'Blooming', ate: 30, inicio: 0, fim: 10 },
      { nome: '1º despejo', ate: 100, inicio: 30, fim: 55 },
      { nome: '2º despejo', ate: 165, inicio: 70, fim: 95 },
    ],
  },
  {
    id: 'modelo-kalita', modelo: true, nome: 'Kalita em 4 despejos', metodo: 'kalita', cafe: '', familia: 'cacau',
    dose: 15, agua: 250, temperatura: 93, moagem: 'média', tempoTotal: 210,
    despejos: [
      { nome: 'Blooming', ate: 40, inicio: 0, fim: 10 },
      { nome: '1º despejo', ate: 110, inicio: 40, fim: 60 },
      { nome: '2º despejo', ate: 180, inicio: 75, fim: 95 },
      { nome: '3º despejo', ate: 250, inicio: 110, fim: 130 },
    ],
  },
];

export const nomeDespejo = i => (i === 0 ? 'Blooming' : `${i}º despejo`);
const ordenados = r => [...(r?.despejos || [])].filter(d => num(d.ate) > 0).sort((a, b) => a.inicio - b.inicio);
export const proporcaoDe = r => (r?.dose > 0 ? (r.agua || 0) / r.dose : 0);

// Etapas que a tela guia
export function etapasDaReceita(r) {
  const d = ordenados(r);
  const etapas = [];
  let antes = 0;
  d.forEach((p, i) => {
    const prox = d[i + 1];
    etapas.push({
      tipo: 'despejo', n: i, nome: p.nome || nomeDespejo(i), blooming: i === 0,
      de: antes, ate: p.ate, inicio: p.inicio, fim: Math.max(p.fim, p.inicio + 1),
      ateTempo: prox ? prox.inicio : null, // fim da espera depois deste despejo (no último, vem a drenagem)
    });
    antes = p.ate;
  });
  if (d.length) {
    const ult = etapas[etapas.length - 1];
    etapas.push({ tipo: 'drenagem', n: d.length, nome: 'Drenagem', de: antes, ate: antes, inicio: ult.fim, fim: Math.max(r.tempoTotal || 0, ult.fim + 1), ateTempo: Math.max(r.tempoTotal || 0, ult.fim + 1) });
  }
  return etapas;
}

// Trecho da linha do tempo de cada etapa (para as barras e as faixas do gráfico)
export function janelaDaEtapa(etapas, i) {
  const e = etapas[i];
  if (!e) return [0, 0];
  if (e.tipo === 'drenagem') return [e.inicio, e.fim];
  const prox = etapas[i + 1];
  return [e.inicio, prox && prox.tipo === 'despejo' ? prox.inicio : e.fim];
}

// Curva-alvo: peso esperado na balança ao longo do tempo
export function perfilAlvo(r) {
  const d = ordenados(r);
  const pts = [[0, 0]];
  let g = 0;
  d.forEach(p => { pts.push([p.inicio, g], [Math.max(p.fim, p.inicio + 1), p.ate]); g = p.ate; });
  pts.push([Math.max(r?.tempoTotal || 0, pts[pts.length - 1][0]), g]);
  return pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
}
export function alvoNoTempo(perfil, t) {
  if (!perfil?.length) return 0;
  if (t <= perfil[0][0]) return perfil[0][1];
  for (let i = 1; i < perfil.length; i++) {
    const [t1, g1] = perfil[i], [t0, g0_] = perfil[i - 1];
    if (t <= t1) return t1 === t0 ? g1 : g0_ + (g1 - g0_) * (t - t0) / (t1 - t0);
  }
  return perfil[perfil.length - 1][1];
}

// Guia: diz em que etapa e fase o preparo está, a partir do tempo e do peso
export function criarGuia(etapas) {
  const G = { k: 0, fase: etapas.length ? (etapas[0].tipo === 'drenagem' ? 'drenagem' : 'despejo') : 'livre', feitos: [] };
  const faseDe = k => (!etapas[k] ? 'fim' : etapas[k].tipo === 'drenagem' ? 'drenagem' : 'despejo');
  const tol = e => Math.max(1, (e.ate - e.de) * 0.02);
  function avancar(t) { G.feitos[G.k] = t; G.k++; G.fase = faseDe(G.k); }
  return {
    get k() { return G.k; }, get fase() { return G.fase; }, get feitos() { return G.feitos; },
    etapa: () => etapas[G.k] || null,
    atualizar(t, w) {
      for (let guarda = 0; guarda < 20; guarda++) {
        const e = etapas[G.k];
        if (!e || G.fase === 'fim' || G.fase === 'livre') return;
        if (G.fase === 'despejo') {
          if (w < e.ate - tol(e)) return;
          if (e.ateTempo != null && t < e.ateTempo) { G.fase = 'espera'; G.chegouEm = t; continue; }
          avancar(t); continue;
        }
        if (G.fase === 'espera') {
          // tempo do próximo despejo, ou a pessoa já começou a despejar de novo
          if (t >= e.ateTempo || w >= e.ate + Math.max(3, tol(e) * 2)) { avancar(t); continue; }
          return;
        }
        if (G.fase === 'drenagem') { if (t >= e.ateTempo) { G.feitos[G.k] = t; G.fase = 'fim'; } return; }
        return;
      }
    },
    pular(t) {
      if (G.fase === 'despejo') { const e = etapas[G.k]; if (e.ateTempo != null && t < e.ateTempo) { G.fase = 'espera'; return; } avancar(t); return; }
      if (G.fase === 'espera') { avancar(t); return; }
      if (G.fase === 'drenagem') { G.feitos[G.k] = t; G.fase = 'fim'; }
    },
  };
}

// Problemas que impedem salvar (vazio = tudo certo)
export function validarReceita(r) {
  const p = [];
  if (!String(r.nome || '').trim()) p.push('Dê um nome à receita.');
  if (!(r.dose > 0)) p.push('Informe a dose de café.');
  const d = ordenados(r);
  if (!d.length) p.push('Inclua pelo menos um despejo.');
  let antes = 0, fimAntes = 0;
  d.forEach((x, i) => {
    const nome = x.nome || nomeDespejo(i);
    if (x.ate <= antes) p.push(`${nome}: o peso alvo precisa ser maior que o do despejo anterior (${g0(antes)} g).`);
    if (i && x.inicio < fimAntes) p.push(`${nome}: começa antes de o despejo anterior terminar (${mmss(fimAntes)}).`);
    if (x.fim <= x.inicio) p.push(`${nome}: o fim precisa vir depois do início.`);
    antes = x.ate; fimAntes = x.fim;
  });
  if (d.length && r.tempoTotal && r.tempoTotal < fimAntes) p.push(`O tempo total (${mmss(r.tempoTotal)}) termina antes do último despejo (${mmss(fimAntes)}).`);
  return p;
}

// Despejos automáticos: blooming com 3x a dose (aguarda até 0:45), o resto da água em partes iguais
export function gerarDespejos(dose, agua, quantos) {
  quantos = Math.max(1, Math.min(8, Math.round(quantos)));
  const bloom = Math.min(Math.round(dose * 3), Math.round(agua * 0.3));
  const lista = [{ nome: 'Blooming', ate: quantos === 1 ? Math.round(agua) : bloom, inicio: 0, fim: 10 }];
  const resto = agua - bloom;
  let t = 45;
  for (let i = 1; i < quantos; i++) {
    const ate = i === quantos - 1 ? Math.round(agua) : Math.round(bloom + resto * i / (quantos - 1));
    const dur = Math.max(10, Math.round((ate - lista[i - 1].ate) / 4 / 5) * 5); // ~4 g/s, de 5 em 5 s
    lista.push({ nome: nomeDespejo(i), ate, inicio: t, fim: t + dur });
    t += dur + 15;
  }
  const ult = lista[lista.length - 1];
  return { despejos: lista, tempoTotal: Math.round((ult.fim + 60) / 15) * 15 };
}

export const descricaoReceita = r => [METODOS[r.metodo]?.nome, `${String(r.dose).replace('.', ',')} g`,
  r.dose ? `1:${(proporcaoDe(r)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : '', `${g0(r.agua)} g`, r.tempoTotal ? mmss(r.tempoTotal) : '']
  .filter(Boolean).join(' · ');

// Miniatura da curva-alvo (SVG)
export function miniPerfil(r, w = 160, h = 44, cor = 'currentColor') {
  const p = perfilAlvo(r);
  const tMax = Math.max(...p.map(x => x[0]), 1), gMax = Math.max(...p.map(x => x[1]), 1);
  const pts = p.map(([t, g]) => `${(t / tMax * (w - 2) + 1).toFixed(1)},${(h - 2 - g / gMax * (h - 6)).toFixed(1)}`).join(' L');
  return `<svg class="rc-mini" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="M${pts}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------------- Despejos que sempre fecham a água da receita ----------------
// No editor, cada despejo é a água daquele despejo (g); a soma é sempre a água da receita (dose × proporção).
export const MIN_DESPEJO = 5;
export const quantidades = despejos => despejos.map((x, i) => Math.round(num(x.ate) - (i ? num(despejos[i - 1].ate) : 0)));
export const acumular = qs => { let s = 0; return qs.map(q => (s += q)); };
// Distribui `delta` (g) entre os índices `ids`: tirando, na proporção da folga de cada um (até o mínimo);
// pondo, na proporção do tamanho de cada um. Devolve o que não coube.
function distribuir(qs, ids, delta) {
  if (!ids.length || !delta) return delta;
  if (delta < 0) {
    const folga = ids.map(j => Math.max(0, qs[j] - MIN_DESPEJO)), total = folga.reduce((a, b) => a + b, 0);
    if (!total) return delta;
    const tira = Math.min(-delta, total);
    ids.forEach((j, k) => { qs[j] -= tira * folga[k] / total; });
    return delta + tira;
  }
  const base = ids.map(j => Math.max(1, qs[j])), total = base.reduce((a, b) => a + b, 0);
  ids.forEach((j, k) => { qs[j] += delta * base[k] / total; });
  return 0;
}
// Muda a água do despejo i para v e acerta os outros (primeiro os seguintes, depois os anteriores),
// para a soma continuar igual à água da receita. Devolve as novas quantidades (inteiros).
export function ajustarQuantidade(qs, i, v, agua) {
  const n = qs.length;
  if (n === 1) return [Math.round(agua)];
  const q = qs.map(Number);
  v = Math.round(Math.min(Math.max(v, MIN_DESPEJO), agua - MIN_DESPEJO * (n - 1)));
  let resto = -(v - q[i]);
  q[i] = v;
  const depois = [], antes = [];
  for (let j = i + 1; j < n; j++) depois.push(j);
  for (let j = i - 1; j >= 0; j--) antes.push(j);
  resto = distribuir(q, depois, resto);
  distribuir(q, antes, resto);
  return fecharSoma(q, agua, i);
}
// Arredonda e corrige a sobra de arredondamento num despejo que não seja o que está sendo mexido
export function fecharSoma(q, agua, fixo = -1) {
  const r = q.map(x => Math.max(MIN_DESPEJO, Math.round(x)));
  let dif = Math.round(agua) - r.reduce((a, b) => a + b, 0);
  const ordem = r.map((x, j) => j).filter(j => j !== fixo).sort((a, b) => r[b] - r[a]);
  if (!ordem.length) ordem.push(fixo);
  for (let k = 0; dif && k < 1000; k++) {
    const j = ordem[k % ordem.length];
    if (dif > 0) { r[j]++; dif--; } else if (r[j] > MIN_DESPEJO) { r[j]--; dif++; }
    else if (ordem.every(x => r[x] <= MIN_DESPEJO)) break;
  }
  return r;
}
// Reescala as quantidades para uma água nova, mantendo o desenho da receita
export const reescalarQuantidades = (qs, agua) => {
  const soma = qs.reduce((a, b) => a + b, 0) || 1;
  return fecharSoma(qs.map(q => q * agua / soma), agua);
};
// Empurra os despejos seguintes para não começarem antes de o anterior terminar
export function empurrarTempos(despejos, desde = 0) {
  for (let j = Math.max(1, desde + 1); j < despejos.length; j++) {
    const ant = despejos[j - 1], x = despejos[j];
    if (x.inicio < ant.fim) { const dur = x.fim - x.inicio; x.inicio = ant.fim; x.fim = x.inicio + dur; }
  }
  return despejos;
}

// ---------------- Editor de receita (janela #dlgReceita) ----------------
export function criarEditorReceitas(ctx) {
  // ctx: { store: () => store, toast, quem, aoSalvar(receita) }
  const dlg = $('#dlgReceita'), f = $('#formReceita');
  let atual = null; // receita em edição (cópia)

  function preencher() {
    const r = atual;
    $('#receitaTitulo').textContent = r.modelo ? 'Nova receita a partir do modelo' : r.id && !r.novo ? 'Editar receita' : 'Nova receita';
    f.nome.value = r.nome || '';
    f.cafe.value = r.cafe || '';
    f.notas.value = r.notas || '';
    f.pontuacao.value = r.pontuacao ? String(r.pontuacao).replace('.', ',') : '';
    f.dose.value = String(r.dose ?? '').replace('.', ',');
    f.proporcao.value = r.dose ? String(Math.round(proporcaoDe(r) * 10) / 10).replace('.', ',') : '';
    f.temperatura.value = r.temperatura || '';
    f.moagem.value = r.moagem || '';
    f.tempoTotal.value = r.tempoTotal ? mmss(r.tempoTotal) : '';
    f.obs.value = r.obs || '';
    $('#receitaMoagens').innerHTML = MOAGENS.map(m => `<button type="button" data-moagem="${esc(m)}">${esc(m)}</button>`).join('');
    marcarMoagem();
    sincBarras();
    $('#receitaMetodos').innerHTML = Object.entries(METODOS).map(([k, m]) =>
      `<button type="button" data-metodo="${k}" aria-pressed="${k === r.metodo}">${esc(m.nome)}</button>`).join('');
    $('#receitaFamilias').innerHTML = Object.entries(FAMILIAS).map(([k, fa]) =>
      `<button type="button" data-familia="${k}" aria-pressed="${k === (r.familia || FAMILIA_PADRAO)}" title="${esc(fa.nome)}"><i style="background:${fa.cor}"></i><span>${esc(fa.nome)}</span></button>`).join('');
    renderDespejos();
    $('#excluirReceita').hidden = !(r.id && !r.novo && !r.modelo);
    $('#receitaErro').textContent = '';
  }

  const pct = (v, lo, hi) => `${((v - lo) / (hi - lo || 1)) * 100}%`;
  const aguaReceita = () => Math.round(ordenados(atual).at(-1)?.ate || atual.agua || 0);
  function renderDespejos() {
    atual.despejos = ordenados(atual);
    const d = atual.despejos;
    $('#receitaDespejos').innerHTML = d.map((x, i) => `
      <div class="rd-linha" data-i="${i}">
        <div class="rd-topo">
          <span class="rd-num">${i + 1}</span>
          <input class="rd-nome" data-campo="nome" value="${esc(x.nome || nomeDespejo(i))}" aria-label="Nome do despejo ${i + 1}">
          <button type="button" class="rd-tirar" data-tirar="${i}" aria-label="Tirar este despejo" ${d.length < 2 ? 'disabled' : ''}>×</button>
        </div>
        <div class="rd-barra rd-barra-agua">
          <div class="rd-barra-topo"><span>Água deste despejo</span>
            <span class="rc-barra-valor"><input data-campo="qtd" inputmode="numeric" aria-label="Água do despejo ${i + 1} (g)"><em>g</em></span></div>
          <input type="range" data-barra="qtd" step="1" aria-label="Água do despejo ${i + 1}">
          <small class="rd-info" data-info="ate"></small>
        </div>
        <div class="rd-tempos">
          <div class="rd-barra">
            <div class="rd-barra-topo"><span>Início</span><span class="rc-barra-valor"><input data-campo="inicio" inputmode="numeric" aria-label="Começo do despejo ${i + 1}"></span></div>
            <input type="range" data-barra="inicio" min="0" max="360" step="5" aria-label="Começo do despejo ${i + 1}">
          </div>
          <div class="rd-barra">
            <div class="rd-barra-topo"><span>Duração</span><span class="rc-barra-valor"><input data-campo="dur" inputmode="numeric" aria-label="Duração do despejo ${i + 1}"></span></div>
            <input type="range" data-barra="dur" min="5" max="90" step="5" aria-label="Duração do despejo ${i + 1}">
          </div>
        </div>
      </div>`).join('');
    atualizarLinhas();
  }

  // Põe os números de todos os despejos nas barras e nos campos, sem redesenhar (não atrapalha quem está arrastando)
  function atualizarLinhas(exceto) {
    const d = atual.despejos, agua = aguaReceita(), qs = quantidades(d), n = d.length;
    const max = Math.max(MIN_DESPEJO, agua - MIN_DESPEJO * (n - 1));
    $$('#receitaDespejos .rd-linha').forEach(l => {
      const i = Number(l.dataset.i), x = d[i];
      if (!x) return;
      const dur = x.fim - x.inicio;
      const valores = { qtd: qs[i], inicio: x.inicio, dur };
      $$('input[type=range]', l).forEach(r => {
        const k = r.dataset.barra;
        if (k === 'qtd') { r.min = MIN_DESPEJO; r.max = max; r.disabled = n < 2; }
        r.value = valores[k];
        r.style.setProperty('--p', pct(Number(r.value), Number(r.min), Number(r.max)));
      });
      $$('input[data-campo]', l).forEach(c => {
        if (c === exceto) return;
        const k = c.dataset.campo;
        if (k === 'qtd') c.value = g0(qs[i]);
        if (k === 'inicio') c.value = mmss(x.inicio);
        if (k === 'dur') c.value = mmss(dur);
      });
      $('[data-info="ate"]', l).textContent = `${Math.round(qs[i] / (agua || 1) * 100)}% da água · a balança chega a ${g0(x.ate)} g`;
    });
    atualizarResumo();
  }

  // A água de um despejo mudou: os outros se ajustam e a soma continua sendo a água da receita
  function mudarQuantidade(i, v) {
    const agua = aguaReceita();
    const qs = ajustarQuantidade(quantidades(atual.despejos), i, v, agua);
    acumular(qs).forEach((a, j) => { atual.despejos[j].ate = a; });
  }
  function mudarTempo(i, campo, v) {
    const d = atual.despejos, x = d[i], dur = x.fim - x.inicio;
    if (campo === 'inicio') {
      const min = i ? d[i - 1].fim : 0;
      x.inicio = Math.max(min, Math.round(v)); x.fim = x.inicio + dur;
    } else {
      x.fim = x.inicio + Math.max(5, Math.round(v));
    }
    empurrarTempos(d, i);
    garantirTempoTotal();
  }
  function garantirTempoTotal() {
    const ult = atual.despejos.at(-1);
    if (ult && atual.tempoTotal && atual.tempoTotal < ult.fim + 30) {
      atual.tempoTotal = Math.round((ult.fim + 60) / 5) * 5; f.tempoTotal.value = mmss(atual.tempoTotal); sincBarras();
    }
  }

  function atualizarResumo() {
    const ult = ordenados(atual).at(-1);
    atual.agua = ult ? ult.ate : atual.agua;
    $('#receitaAgua').textContent = `${g0(atual.agua || 0)} g de água`;
    const prop = proporcaoDe(atual);
    $('#receitaProporcaoReal').textContent = prop ? `1:${prop.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}` : '';
    $('#receitaPrevia').innerHTML = miniPerfil(atual, 420, 70, corDaFamilia(atual.familia));
  }

  function lerCampos() {
    atual.nome = f.nome.value.trim();
    atual.cafe = f.cafe.value.trim();
    atual.notas = f.notas.value.trim();
    const pont = num(f.pontuacao.value);
    atual.pontuacao = pont > 0 && pont <= 100 ? pont : null;
    atual.temperatura = num(f.temperatura.value);
    atual.moagem = f.moagem.value.trim();
    atual.tempoTotal = lerTempo(f.tempoTotal.value);
    atual.obs = f.obs.value.trim();
  }

  // Barras de arrastar: cada uma anda junto com o campo de número (dá para arrastar ou digitar)
  const virgula = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const BARRAS = {
    dose: { ler: num, escrever: virgula },
    proporcao: { ler: num, escrever: virgula },
    temperatura: { ler: num, escrever: v => String(v) },
    tempoTotal: { ler: lerTempo, escrever: mmss },
  };
  const pintar = r => r.style.setProperty('--p', `${((r.value - r.min) / (r.max - r.min)) * 100}%`);
  function sincBarras() {
    $$('.rc-barra', f).forEach(b => {
      const k = b.dataset.barra, r = $('input[type=range]', b), v = BARRAS[k].ler(f[k].value);
      if (v > 0) r.value = v;
      pintar(r);
    });
  }
  const MOAGENS = ['Extra-fina', 'Fina', 'Média-fina', 'Média', 'Média-grossa', 'Grossa'];
  function marcarMoagem() {
    const v = f.moagem.value.trim().toLowerCase();
    $$('#receitaMoagens button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.moagem.toLowerCase() === v)));
  }
  f.addEventListener('input', e => {
    const b = e.target.closest('.rc-barra');
    if (!b) { if (e.target === f.moagem) marcarMoagem(); return; }
    const k = b.dataset.barra, r = $('input[type=range]', b);
    if (e.target === r) {
      f[k].value = BARRAS[k].escrever(Number(r.value));
      pintar(r);
      if (k === 'dose' || k === 'proporcao') reescalar(); else lerCampos();
    } else {
      const v = BARRAS[k].ler(e.target.value);
      if (v > 0) { r.value = v; pintar(r); }
    }
  });

  // Mudar dose ou proporção reescala os despejos (a receita mantém o mesmo desenho)
  function reescalar() {
    const dose = num(f.dose.value), prop = num(f.proporcao.value);
    if (!(dose > 0) || !(prop > 0)) return;
    const novaAgua = Math.round(dose * prop);
    atual.dose = dose;
    atual.despejos = ordenados(atual);
    const qs = reescalarQuantidades(quantidades(atual.despejos), novaAgua);
    acumular(qs).forEach((a, j) => { atual.despejos[j].ate = a; });
    atual.agua = novaAgua;
    atualizarLinhas();
  }

  f.addEventListener('input', e => {
    const linha = e.target.closest('.rd-linha');
    if (linha) {
      const i = Number(linha.dataset.i), x = atual.despejos[i];
      if (e.target.dataset.campo === 'nome') { x.nome = e.target.value; return; }
      const barra = e.target.dataset.barra;
      if (!barra) return; // campos de número: aplicados ao sair do campo (change)
      const v = Number(e.target.value);
      if (barra === 'qtd') mudarQuantidade(i, v); else mudarTempo(i, barra, v);
      atualizarLinhas();
      return;
    }
    if (e.target === f.dose || e.target === f.proporcao) return; // reescala ao sair do campo
    lerCampos();
  });
  f.dose.addEventListener('change', reescalar);
  f.proporcao.addEventListener('change', reescalar);
  f.addEventListener('change', e => { // número digitado num despejo: aplica com as mesmas regras da barra
    const linha = e.target.closest('.rd-linha'), c = e.target.dataset?.campo;
    if (!linha || !c || c === 'nome') return;
    const i = Number(linha.dataset.i);
    if (c === 'qtd') { const v = num(e.target.value); if (v > 0) mudarQuantidade(i, v); }
    else { const v = lerTempo(e.target.value); if (v >= 0) mudarTempo(i, c, v); }
    atualizarLinhas();
  });
  f.addEventListener('focusout', e => { // reescreve tempos no formato m:ss
    if (e.target === f.tempoTotal && f.tempoTotal.value) f.tempoTotal.value = mmss(lerTempo(f.tempoTotal.value));
  });
  f.addEventListener('click', e => {
    const moa = e.target.closest('[data-moagem]');
    if (moa) { f.moagem.value = moa.dataset.moagem.toLowerCase(); marcarMoagem(); lerCampos(); return; }
    const met = e.target.closest('[data-metodo]');
    if (met) { atual.metodo = met.dataset.metodo; $$('#receitaMetodos button').forEach(b => b.setAttribute('aria-pressed', String(b === met))); return; }
    const fam = e.target.closest('[data-familia]');
    if (fam) { atual.familia = fam.dataset.familia; $$('#receitaFamilias button').forEach(b => b.setAttribute('aria-pressed', String(b === fam))); atualizarResumo(); return; }
    const tirar = e.target.closest('[data-tirar]');
    if (tirar) { // a água do despejo tirado passa para o seguinte (ou o anterior, se era o último)
      const i = Number(tirar.dataset.tirar), qs = quantidades(atual.despejos), agua = aguaReceita();
      const alvo = i < qs.length - 1 ? i + 1 : i - 1;
      qs[alvo] += qs[i]; qs.splice(i, 1); atual.despejos.splice(i, 1);
      acumular(fecharSoma(qs, agua)).forEach((a, j) => { atual.despejos[j].ate = a; });
      renderDespejos(); return;
    }
  });
  $('#receitaAddDespejo').onclick = () => { // o novo despejo pega água dos anteriores; a soma continua a da receita
    const d = ordenados(atual), ult = d.at(-1), agua = aguaReceita();
    if (!ult) { atual.despejos = gerarDespejos(atual.dose || 15, agua || 240, 1).despejos; renderDespejos(); return; }
    if (agua < MIN_DESPEJO * (d.length + 1)) return;
    const qs = ajustarQuantidade([...quantidades(d), 0], d.length, Math.round(agua / (d.length + 1)), agua);
    atual.despejos = [...d, { nome: nomeDespejo(d.length), ate: 0, inicio: ult.fim + 15, fim: ult.fim + 35 }];
    acumular(qs).forEach((a, j) => { atual.despejos[j].ate = a; });
    garantirTempoTotal();
    renderDespejos();
  };
  $('#receitaGerar').onclick = () => {
    const quantos = Number($('#receitaQuantos').value) || 3;
    const dose = num(f.dose.value) || 15, prop = num(f.proporcao.value) || 16;
    const gerado = gerarDespejos(dose, Math.round(dose * prop), quantos);
    atual.dose = dose; atual.despejos = gerado.despejos; atual.tempoTotal = gerado.tempoTotal;
    f.tempoTotal.value = mmss(gerado.tempoTotal);
    sincBarras();
    renderDespejos();
  };
  $$('[data-fechar]', dlg).forEach(b => b.addEventListener('click', () => dlg.close()));
  $('#excluirReceita').onclick = async () => {
    const r = atual;
    await ctx.store().excluirDoc('receitas', r.id);
    dlg.close();
    ctx.toast('Receita excluída', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('receitas', limpa(r)) });
  };
  const limpa = r => { const c = { ...r }; delete c.novo; delete c.modelo; return c; };

  f.addEventListener('submit', async e => {
    e.preventDefault();
    lerCampos();
    atual.dose = num(f.dose.value);
    atual.despejos = ordenados(atual).map((x, i) => ({ nome: (x.nome || '').trim() || nomeDespejo(i), ate: Math.round(num(x.ate) * 10) / 10, inicio: x.inicio, fim: x.fim }));
    atual.agua = atual.despejos.at(-1)?.ate || 0;
    if (!atual.tempoTotal) atual.tempoTotal = (atual.despejos.at(-1)?.fim || 0) + 60;
    const prob = validarReceita(atual);
    if (prob.length) { $('#receitaErro').textContent = prob[0]; return; }
    const agora = new Date().toISOString();
    const doc = limpa(atual);
    if (atual.novo || atual.modelo) { doc.id = novoId(); doc.criadoEm = agora; doc.criadoPor = ctx.quem(); }
    doc.atualizadoEm = agora; doc.atualizadoPor = ctx.quem();
    try {
      await ctx.store().salvarDoc('receitas', doc);
      dlg.close();
      ctx.toast('Receita salva');
      ctx.aoSalvar?.(doc);
    } catch { $('#receitaErro').textContent = 'Não deu para salvar. Confira a internet e tente de novo.'; }
  });

  return {
    abrir(r) {
      atual = r ? JSON.parse(JSON.stringify(r)) : { novo: true, nome: '', metodo: 'v60', cafe: '', familia: FAMILIA_PADRAO, dose: 15, agua: 240, temperatura: 93, moagem: '', ...gerarDespejos(15, 240, 3) };
      if (r?.modelo) { atual.nome = r.nome; }
      if (!atual.despejos?.length) atual.despejos = gerarDespejos(atual.dose || 15, atual.agua || 240, 3).despejos;
      preencher();
      dlg.showModal();
    },
    duplicar(r) {
      const c = JSON.parse(JSON.stringify(r));
      delete c.id; c.novo = true; c.nome = `${r.nome} (cópia)`;
      atual = c; preencher(); dlg.showModal();
    },
  };
}
