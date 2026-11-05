// Notas: anotações (como fiz tal coisa: configuração da impressora, temperatura da seladora...)
// e pendências (o que precisa ser feito: cobrar fornecedor, renovar a internet...) numa área só.
// Coleção equipes/{chave}/notas: { tipo: 'anotacao'|'pendencia', titulo, texto, etiqueta,
//   prazo ('AAAA-MM-DD', só pendência), feito, feitoEm, feitoPor, fixada (só anotação), criado/atualizado Em/Por }

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const ETIQUETAS_PADRAO = ['Impressão', 'Seladora / calor', 'Fornecedor', 'Produção', 'Administrativo', 'Pessoal'];

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function diasAte(iso) {
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1, d);
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((alvo - h) / 86400000);
}
const dataCurta = iso => { if (!iso) return ''; const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; };
const quando = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const dias = Math.floor((Date.now() - d) / 86400000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

export function criarNotas(ctx) {
  // ctx: { store: () => store, toast, quem }
  const N = { notas: [], aba: 'pendencias', busca: '', etiqueta: '' };
  const area = $('#areaNotas');
  const lista = $('#notasLista');

  const pendencia = n => n.tipo === 'pendencia';
  const aberta = n => pendencia(n) && !n.feito;
  const atrasada = n => aberta(n) && n.prazo && diasAte(n.prazo) < 0;
  const paraHoje = n => aberta(n) && n.prazo && diasAte(n.prazo) === 0;

  function etiquetas() {
    const usadas = N.notas.map(n => n.etiqueta).filter(Boolean);
    return [...new Set([...ETIQUETAS_PADRAO, ...usadas])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  // ---------------- Tela ----------------
  function renderResumo() {
    const abertas = N.notas.filter(aberta).length;
    const atr = N.notas.filter(atrasada).length;
    const hoje = N.notas.filter(paraHoje).length;
    const anot = N.notas.filter(n => !pendencia(n)).length;
    $('#notasResumo').innerHTML = `
      <div><strong>${abertas}</strong><span>Pendentes</span></div>
      <div class="${atr ? 'alerta' : ''}"><strong>${atr}</strong><span>Atrasadas</span></div>
      <div><strong>${hoje}</strong><span>Para hoje</span></div>
      <div><strong>${anot}</strong><span>Anotações</span></div>`;
  }

  function renderFiltroEtiqueta() {
    const sel = $('#notasEtiqueta');
    const usadas = [...new Set(N.notas.map(n => n.etiqueta).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    if (N.etiqueta && !usadas.includes(N.etiqueta)) N.etiqueta = '';
    sel.innerHTML = `<option value="">Etiquetas</option>` +
      usadas.map(e => `<option ${e === N.etiqueta ? 'selected' : ''}>${esc(e)}</option>`).join('');
  }

  function filtradas() {
    const q = N.busca.trim().toLowerCase();
    return N.notas.filter(n => {
      if (N.aba === 'pendencias' && !aberta(n)) return false;
      if (N.aba === 'anotacoes' && pendencia(n)) return false;
      if (N.aba === 'concluidas' && !(pendencia(n) && n.feito)) return false;
      if (N.etiqueta && n.etiqueta !== N.etiqueta) return false;
      if (q && !`${n.titulo} ${n.texto} ${n.etiqueta}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // pendências abertas: atrasadas e com prazo mais perto primeiro, sem prazo por último
  function ordenar(a, b) {
    if (N.aba === 'concluidas') return (b.feitoEm || '').localeCompare(a.feitoEm || '');
    const ap = aberta(a), bp = aberta(b);
    if (ap !== bp) return ap ? -1 : 1;
    if (ap && bp) {
      if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
      if (a.prazo || b.prazo) return a.prazo ? -1 : 1;
      return (b.criadoEm || '').localeCompare(a.criadoEm || '');
    }
    if (!!a.fixada !== !!b.fixada) return a.fixada ? -1 : 1;
    return (b.atualizadoEm || b.criadoEm || '').localeCompare(a.atualizadoEm || a.criadoEm || '');
  }

  function chipPrazo(n) {
    if (!pendencia(n)) return '';
    if (n.feito) return `<span class="chip pago">Feito ${quando(n.feitoEm)}${n.feitoPor ? ` por ${esc(n.feitoPor)}` : ''}</span>`;
    if (!n.prazo) return '<span class="chip prevista">Sem prazo</span>';
    const d = diasAte(n.prazo);
    if (d < 0) return `<span class="chip atrasado">Atrasada ${-d} ${-d === 1 ? 'dia' : 'dias'}</span>`;
    if (d === 0) return '<span class="chip hoje">Para hoje</span>';
    if (d === 1) return '<span class="chip hoje">Para amanhã</span>';
    return `<span class="chip">Até ${dataCurta(n.prazo)}, em ${d} dias</span>`;
  }

  function cartao(n) {
    const pend = pendencia(n);
    const faixa = atrasada(n) ? 'p1' : paraHoje(n) ? 'p2' : n.fixada ? 'p3' : 'p4';
    const chips = [];
    if (n.etiqueta) chips.push(`<span class="chip chip-site">${esc(n.etiqueta)}</span>`);
    if (n.fixada && !pend) chips.push('<span class="chip">Fixada</span>');
    chips.push(chipPrazo(n));
    const rodape = !pend ? `<p class="nota-quando">Atualizada ${quando(n.atualizadoEm || n.criadoEm)}${n.atualizadoPor ? ` por ${esc(n.atualizadoPor)}` : ''}</p>` : '';
    return `
    <article class="comanda nota sem-pos ${faixa} ${pend ? 'nota-pend' : 'nota-anot'} ${n.feito ? 'nota-feita' : ''}" data-id="${esc(n.id)}">
      <div class="corpo">
        ${pend ? `<button type="button" class="nota-check ${n.feito ? 'on' : ''}" data-nacao="feito" aria-pressed="${!!n.feito}" aria-label="${n.feito ? 'Reabrir' : 'Marcar como feita'}: ${esc(n.titulo)}">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </button>` : ''}
        <div class="abrir" role="button" tabindex="0" data-nacao="editar" aria-label="Abrir ${esc(n.titulo)}">
          <p class="descricao nota-titulo">${esc(n.titulo)}</p>
          ${n.texto ? `<p class="nota-texto">${esc(n.texto)}</p>` : ''}
          <div class="chips">${chips.join('')}</div>
          ${rodape}
        </div>
      </div>
    </article>`;
  }

  function vazio() {
    if (!N.notas.length) {
      return `<div class="vazio"><h2>Nada anotado ainda</h2>
        <p>Use <b>pendências</b> para o que precisa ser feito (cobrar um fornecedor, renovar a internet) e <b>anotações</b> para guardar como você fez algo (configuração da impressora, temperatura da seladora).</p>
        <button class="btn btn-primary" data-nacao="novo">Criar a primeira nota</button></div>`;
    }
    const txt = { pendencias: 'Nenhuma pendência em aberto.', anotacoes: 'Nenhuma anotação aqui.', concluidas: 'Nenhuma pendência concluída.', todas: 'Nada encontrado.' }[N.aba];
    return `<div class="vazio"><h2>${txt}</h2><p>${N.busca || N.etiqueta ? 'Ajuste a busca ou a etiqueta.' : ''}</p></div>`;
  }

  function render() {
    renderResumo();
    renderFiltroEtiqueta();
    $$('#notasAbas button').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === N.aba));
    const itens = filtradas().sort(ordenar);
    lista.innerHTML = itens.length ? itens.map(cartao).join('') : vazio();
  }

  // ---------------- Salvar ----------------
  async function salvar(n, msg, desfazer) {
    n.atualizadoEm = new Date().toISOString();
    n.atualizadoPor = ctx.quem();
    await ctx.store().salvarDoc('notas', n);
    if (msg) ctx.toast(msg, desfazer ? { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('notas', desfazer) } : null);
  }

  async function alternarFeito(n) {
    const antes = { ...n };
    const d = { ...n, feito: !n.feito };
    if (d.feito) { d.feitoEm = new Date().toISOString(); d.feitoPor = ctx.quem(); }
    else { delete d.feitoEm; delete d.feitoPor; }
    // na aba Pendências o cartão some ao concluir: dá um instante para ver o check
    const card = lista.querySelector(`[data-id="${CSS.escape(n.id)}"]`);
    if (card && d.feito) { card.classList.add('nota-feita'); card.querySelector('.nota-check')?.classList.add('on'); await new Promise(r => setTimeout(r, 280)); }
    await salvar(d, d.feito ? 'Pendência concluída' : 'Pendência reaberta', antes);
  }

  // ---------------- Formulário ----------------
  const dlg = $('#dlgNota'), f = $('#formNota');
  let editando = null;

  function tipoAtual() { return f.querySelector('input[name="tipo"]:checked')?.value || 'pendencia'; }
  function modoTipo() {
    const pend = tipoAtual() === 'pendencia';
    $('#notaCampoPrazo').hidden = !pend;
    $('#notaCampoFeito').hidden = !pend || !editando;
    $('#notaCampoFixada').hidden = pend;
    f.titulo.placeholder = pend ? 'Ex.: Verificar entrega do fornecedor de caixas' : 'Ex.: Configuração da impressora para etiqueta do drip';
    f.texto.placeholder = pend ? 'Detalhes, contato, número do pedido' : 'Ex.: Papel couché 90 g, qualidade alta, margem 0, escala 100%. Seladora no 6, 2 segundos.';
    f.texto.rows = pend ? 3 : 6;
    $('#notaTitulo').textContent = editando ? (pend ? 'Editar pendência' : 'Editar anotação') : (pend ? 'Nova pendência' : 'Nova anotação');
    $('#salvarNota').textContent = pend ? 'Salvar pendência' : 'Salvar anotação';
  }
  f.addEventListener('change', e => { if (e.target.name === 'tipo') modoTipo(); });

  function abrir(n) {
    editando = n || null;
    f.reset();
    $('#notaErro').textContent = '';
    $('#excluirNota').hidden = !n;
    const tipo = n?.tipo || (N.aba === 'anotacoes' ? 'anotacao' : 'pendencia');
    f.querySelector(`input[name="tipo"][value="${tipo}"]`).checked = true;
    f.titulo.value = n?.titulo || '';
    f.texto.value = n?.texto || '';
    f.etiqueta.value = n?.etiqueta || (N.etiqueta || '');
    f.prazo.value = n?.prazo || '';
    f.feito.checked = !!n?.feito;
    f.fixada.checked = !!n?.fixada;
    $('#notaEtiquetas').innerHTML = etiquetas().map(e => `<option value="${esc(e)}">`).join('');
    $('#notaInfo').textContent = n ? `Criada ${quando(n.criadoEm)}${n.criadoPor ? ` por ${n.criadoPor}` : ''}${n.atualizadoEm && n.atualizadoEm !== n.criadoEm ? ` · atualizada ${quando(n.atualizadoEm)}${n.atualizadoPor ? ` por ${n.atualizadoPor}` : ''}` : ''}` : '';
    modoTipo();
    dlg.showModal();
    if (!n) f.titulo.focus();
  }

  // atalhos de prazo
  $('#notaAtalhos').addEventListener('click', e => {
    const b = e.target.closest('[data-dias]'); if (!b) return;
    const dias = Number(b.dataset.dias);
    if (dias < 0) { f.prazo.value = ''; return; }
    const d = new Date(); d.setDate(d.getDate() + dias);
    f.prazo.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  f.addEventListener('submit', async e => {
    e.preventDefault();
    const titulo = f.titulo.value.trim();
    const texto = f.texto.value.trim();
    if (!titulo && !texto) { $('#notaErro').textContent = 'Escreva pelo menos o título.'; f.titulo.focus(); return; }
    const tipo = tipoAtual();
    const agora = new Date().toISOString();
    const d = {
      ...(editando || {}),
      id: editando?.id || novoId(),
      tipo,
      // sem título: usa o começo do texto
      titulo: titulo || texto.split('\n')[0].slice(0, 80),
      texto,
      etiqueta: f.etiqueta.value.trim(),
      criadoEm: editando?.criadoEm || agora,
      criadoPor: editando?.criadoPor || ctx.quem(),
    };
    if (tipo === 'pendencia') {
      d.prazo = f.prazo.value || '';
      const feito = editando ? f.feito.checked : false;
      if (feito && !d.feito) { d.feitoEm = agora; d.feitoPor = ctx.quem(); }
      if (!feito) { delete d.feitoEm; delete d.feitoPor; }
      d.feito = feito;
      delete d.fixada;
    } else {
      d.fixada = f.fixada.checked;
      delete d.prazo; delete d.feito; delete d.feitoEm; delete d.feitoPor;
    }
    dlg.close();
    await salvar(d, editando ? 'Nota salva' : (tipo === 'pendencia' ? 'Pendência criada' : 'Anotação criada'));
  });

  $('#excluirNota').addEventListener('click', async () => {
    if (!editando || !confirm(`Excluir "${editando.titulo}"?`)) return;
    const n = editando;
    dlg.close();
    await ctx.store().excluirDoc('notas', n.id);
    ctx.toast('Nota excluída', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('notas', n) });
  });

  // ---------------- Cliques ----------------
  area.addEventListener('click', e => {
    const alvo = e.target.closest('[data-nacao]');
    if (!alvo) return;
    if (alvo.dataset.nacao === 'novo') return abrir();
    const n = N.notas.find(x => x.id === alvo.closest('[data-id]')?.dataset.id);
    if (!n) return;
    if (alvo.dataset.nacao === 'feito') return alternarFeito(n);
    if (alvo.dataset.nacao === 'editar') return abrir(n);
  });
  area.addEventListener('keydown', e => {
    const alvo = e.target.closest?.('.abrir');
    if (alvo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alvo.click(); }
  });
  $('#novaNota').addEventListener('click', () => abrir());
  $$('#notasAbas button').forEach(b => b.addEventListener('click', () => { N.aba = b.dataset.aba; render(); window.scrollTo({ top: 0 }); }));
  $('#notasBusca').addEventListener('input', e => { N.busca = e.target.value; render(); });
  $('#notasEtiqueta').addEventListener('change', e => { N.etiqueta = e.target.value; render(); });

  // ---------------- Dados ----------------
  function conectar() {
    const st = ctx.store();
    if (!st.onColecao) return [];
    return [st.onColecao('notas', l => { N.notas = l; render(); }, () => ctx.toast('Erro ao carregar as notas'))];
  }

  return { render, conectar };
}
