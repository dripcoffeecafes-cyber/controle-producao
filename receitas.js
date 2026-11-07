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
    $('#receitaMetodos').innerHTML = Object.entries(METODOS).map(([k, m]) =>
      `<button type="button" data-metodo="${k}" aria-pressed="${k === r.metodo}">${esc(m.nome)}</button>`).join('');
    $('#receitaFamilias').innerHTML = Object.entries(FAMILIAS).map(([k, fa]) =>
      `<button type="button" data-familia="${k}" aria-pressed="${k === (r.familia || FAMILIA_PADRAO)}" title="${esc(fa.nome)}"><i style="background:${fa.cor}"></i><span>${esc(fa.nome)}</span></button>`).join('');
    renderDespejos();
    $('#excluirReceita').hidden = !(r.id && !r.novo && !r.modelo);
    $('#receitaErro').textContent = '';
  }

  function renderDespejos() {
    const d = atual.despejos;
    $('#receitaDespejos').innerHTML = d.map((x, i) => `
      <div class="rd-linha" data-i="${i}">
        <input class="rd-nome" data-campo="nome" value="${esc(x.nome || nomeDespejo(i))}" aria-label="Nome do despejo ${i + 1}">
        <label class="rd-campo"><span>Até</span><input data-campo="ate" inputmode="decimal" value="${g0(x.ate)}"><em>g</em></label>
        <label class="rd-campo"><span>De</span><input data-campo="inicio" inputmode="numeric" value="${mmss(x.inicio)}"></label>
        <label class="rd-campo"><span>a</span><input data-campo="fim" inputmode="numeric" value="${mmss(x.fim)}"></label>
        <button type="button" class="rd-tirar" data-tirar="${i}" aria-label="Tirar este despejo" ${d.length < 2 ? 'disabled' : ''}>×</button>
      </div>`).join('');
    atualizarResumo();
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

  // Mudar dose ou proporção reescala os despejos (a receita mantém o mesmo desenho)
  function reescalar() {
    const dose = num(f.dose.value), prop = num(f.proporcao.value);
    if (!(dose > 0) || !(prop > 0)) return;
    const novaAgua = Math.round(dose * prop);
    const velha = atual.agua || ordenados(atual).at(-1)?.ate || novaAgua;
    const fator = velha ? novaAgua / velha : 1;
    atual.dose = dose;
    atual.despejos = atual.despejos.map((x, i, arr) => ({ ...x, ate: i === arr.length - 1 ? novaAgua : Math.round(x.ate * fator) }));
    atual.agua = novaAgua;
    renderDespejos();
  }

  f.addEventListener('input', e => {
    const linha = e.target.closest('.rd-linha');
    if (linha) {
      const x = atual.despejos[Number(linha.dataset.i)], campo = e.target.dataset.campo;
      if (campo === 'nome') x.nome = e.target.value;
      if (campo === 'ate') x.ate = num(e.target.value);
      if (campo === 'inicio') x.inicio = lerTempo(e.target.value);
      if (campo === 'fim') x.fim = lerTempo(e.target.value);
      atualizarResumo();
      return;
    }
    if (e.target === f.dose || e.target === f.proporcao) return; // reescala ao sair do campo
    lerCampos();
  });
  f.dose.addEventListener('change', reescalar);
  f.proporcao.addEventListener('change', reescalar);
  f.addEventListener('focusout', e => { // reescreve tempos no formato m:ss
    const c = e.target.dataset?.campo;
    if (c === 'inicio' || c === 'fim') e.target.value = mmss(lerTempo(e.target.value));
    if (e.target === f.tempoTotal && f.tempoTotal.value) f.tempoTotal.value = mmss(lerTempo(f.tempoTotal.value));
  });
  f.addEventListener('click', e => {
    const met = e.target.closest('[data-metodo]');
    if (met) { atual.metodo = met.dataset.metodo; $$('#receitaMetodos button').forEach(b => b.setAttribute('aria-pressed', String(b === met))); return; }
    const fam = e.target.closest('[data-familia]');
    if (fam) { atual.familia = fam.dataset.familia; $$('#receitaFamilias button').forEach(b => b.setAttribute('aria-pressed', String(b === fam))); atualizarResumo(); return; }
    const tirar = e.target.closest('[data-tirar]');
    if (tirar) { atual.despejos.splice(Number(tirar.dataset.tirar), 1); renderDespejos(); return; }
  });
  $('#receitaAddDespejo').onclick = () => {
    const d = ordenados(atual), ult = d.at(-1);
    const novo = ult
      ? { nome: nomeDespejo(d.length), ate: Math.round(ult.ate + Math.max(30, (atual.agua || ult.ate) * 0.2)), inicio: ult.fim + 15, fim: ult.fim + 40 }
      : { nome: 'Blooming', ate: Math.round((atual.dose || 15) * 3), inicio: 0, fim: 10 };
    atual.despejos.push(novo);
    if (atual.tempoTotal && atual.tempoTotal < novo.fim + 30) { atual.tempoTotal = novo.fim + 60; f.tempoTotal.value = mmss(atual.tempoTotal); }
    renderDespejos();
  };
  $('#receitaGerar').onclick = () => {
    const quantos = Number($('#receitaQuantos').value) || 3;
    const dose = num(f.dose.value) || 15, prop = num(f.proporcao.value) || 16;
    const gerado = gerarDespejos(dose, Math.round(dose * prop), quantos);
    atual.dose = dose; atual.despejos = gerado.despejos; atual.tempoTotal = gerado.tempoTotal;
    f.tempoTotal.value = mmss(gerado.tempoTotal);
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
