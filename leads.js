// Leads: pessoas e empresas que pediram contato (Meta Ads, Instagram, indicação...).
// Ficam na coleção "leads" do Firebase, ao lado dos pedidos e dos itens: equipes/{chave}/leads.
// Não separa por empresa: Blooming Club e Drip Coffee Label ficam juntas na mesma lista.
// Cada lead guarda "externoId" (vazio por enquanto) para, no futuro, receber leads automáticos do Meta Ads sem duplicar.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function diasAte(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const alvo = new Date(y, m - 1, d);
  const h = new Date(); h.setHours(0, 0, 0, 0);
  return Math.round((alvo - h) / 86400000);
}
function dataCurta(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}${y !== String(new Date().getFullYear()) ? '/' + y.slice(2) : ''}`;
}
function linkWhats(contato) {
  const d = String(contato || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return `https://wa.me/${d.length <= 11 ? '55' + d : d}`;
}
// Máscara de telefone: (11) 99999-9999. Números com "+" ficam livres (internacional).
function formatarTelefone(v) {
  if (/^\s*\+/.test(v)) return v;
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const STATUS = {
  novo: 'Novo',
  conversa: 'Em conversa',
  orcamento: 'Orçamento enviado',
  fechado: 'Fechado',
  perdido: 'Perdido',
};
const ABERTOS = ['novo', 'conversa', 'orcamento'];
const ORIGENS = ['Meta Ads', 'Instagram', 'Indicação', 'Site', 'WhatsApp', 'Outro'];
const INTERESSES = ['Kit de presente', 'Drip personalizado', 'Evento', 'Casamento', 'Outro'];

export function criarLeads(ctx) {
  // ctx: { store: () => store, toast, quem, orcarKit(lead) }
  const L = { leads: [], aba: 'abertos', busca: '', origem: '', editando: null };

  const lista = $('#leadsLista');
  const dlg = $('#dlgLead');
  const form = $('#formLead');

  const aberto = l => ABERTOS.includes(l.status);
  const acharLead = id => L.leads.find(l => l.id === id);
  // retorno vencido ou para hoje: precisa de atenção
  const retornoVencido = l => aberto(l) && l.proximoContato && diasAte(l.proximoContato) < 0;
  const retornoHoje = l => aberto(l) && l.proximoContato && diasAte(l.proximoContato) === 0;

  // Em aberto: primeiro quem tem retorno marcado (data mais próxima primeiro), depois os sem data, mais recentes antes.
  function ordenar(a, b) {
    const da = a.proximoContato || '9999-99-99', db = b.proximoContato || '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    return (b.criadoEm || '').localeCompare(a.criadoEm || '');
  }

  function filtrados() {
    const q = L.busca.trim().toLowerCase();
    return L.leads.filter(l => {
      if (L.aba === 'abertos' && !aberto(l)) return false;
      if (L.aba === 'fechados' && l.status !== 'fechado') return false;
      if (L.aba === 'perdidos' && l.status !== 'perdido') return false;
      if (L.origem && l.origem !== L.origem) return false;
      if (q && !`${l.nome} ${l.contato} ${l.origem} ${l.interesse} ${l.obs}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }

  // ---------------- Tela ----------------
  function renderResumo() {
    const n = st => L.leads.filter(l => l.status === st).length;
    const vencidos = L.leads.filter(retornoVencido).length + L.leads.filter(retornoHoje).length;
    $('#leadsResumo').innerHTML = `
      <div><strong>${n('novo')}</strong><span>Novos</span></div>
      <div><strong>${n('conversa')}</strong><span>Conversa</span></div>
      <div><strong>${n('orcamento')}</strong><span>Orçados</span></div>
      <div class="${vencidos ? 'alerta' : ''}"><strong>${vencidos}</strong><span>Retornar</span></div>`;
  }

  function chipRetorno(l) {
    if (!aberto(l) || !l.proximoContato) return aberto(l) ? '<span class="chip prevista">Sem retorno marcado</span>' : '';
    const d = diasAte(l.proximoContato);
    if (d < 0) return `<span class="chip atrasado">Retorno atrasado ${-d} ${-d === 1 ? 'dia' : 'dias'}</span>`;
    if (d === 0) return '<span class="chip hoje">Retornar hoje</span>';
    if (d === 1) return '<span class="chip hoje">Retornar amanhã</span>';
    return `<span class="chip">Retornar ${dataCurta(l.proximoContato)}, em ${d} dias</span>`;
  }

  function cartao(l) {
    const whats = linkWhats(l.contato);
    // faixa colorida: vermelho = retorno atrasado, caramelo = hoje, cinza = em dia
    const faixa = retornoVencido(l) ? 'p1' : retornoHoje(l) ? 'p2' : l.status === 'novo' ? 'p3' : 'p4';
    const tags = [l.interesse, l.origem].filter(Boolean).map(esc).join(' · ');
    return `
    <article class="comanda lead sem-pos ${faixa} ${l.status === 'perdido' ? 'cancelado' : ''}" data-id="${esc(l.id)}">
      <div class="corpo">
        <div class="abrir" role="button" tabindex="0" data-lacao="editar" aria-label="Abrir lead ${esc(l.nome)}">
          <div class="cab">
            <span class="cliente">${tags || 'Sem origem informada'}</span>
          </div>
          <p class="descricao lead-nome">${esc(l.nome)}</p>
          ${l.obs ? `<p class="lead-obs">${esc(l.obs)}</p>` : ''}
          <div class="chips">${chipRetorno(l)}</div>
        </div>
        <div class="lead-acoes">
          <select class="lead-status s-${esc(l.status)}" data-lacao="status" aria-label="Situação de ${esc(l.nome)}">
            ${Object.entries(STATUS).map(([v, t]) => `<option value="${v}" ${v === l.status ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          ${whats ? `<a class="btn btn-sm" href="${whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
          ${l.status !== 'perdido' && l.status !== 'fechado' ? '<button type="button" class="btn btn-sm" data-lacao="orcar">Orçar kit</button>' : ''}
        </div>
      </div>
    </article>`;
  }

  function vazio() {
    if (!L.leads.length) {
      return `<div class="vazio"><h2>Nenhum lead ainda</h2>
        <p>Cadastre quem pediu contato para acompanhar cada conversa até o fechamento.</p>
        <button class="btn btn-primary" data-lacao="novo">Cadastrar lead</button></div>`;
    }
    return '<div class="vazio"><h2>Nenhum lead aqui</h2><p>Ajuste a busca ou os filtros.</p></div>';
  }

  function render() {
    renderResumo();
    $$('#leadsAbas button').forEach(b => b.setAttribute('aria-selected', b.dataset.aba === L.aba));
    const itens = filtrados();
    if (L.aba === 'abertos') itens.sort(ordenar);
    else itens.sort((a, b) => (b.atualizadoEm || b.criadoEm || '').localeCompare(a.atualizadoEm || a.criadoEm || ''));
    lista.innerHTML = itens.length ? itens.map(cartao).join('') : vazio();
  }

  // ---------------- Salvar ----------------
  async function salvar(l, msg, desfazer) {
    l.atualizadoEm = new Date().toISOString();
    l.atualizadoPor = ctx.quem();
    await ctx.store().salvarDoc('leads', l);
    if (msg) ctx.toast(msg, desfazer ? { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('leads', desfazer) } : null);
  }

  // ---------------- Formulário ----------------
  function preencherOpcoes() {
    form.origem.innerHTML = '<option value="">Escolha</option>' + ORIGENS.map(o => `<option>${o}</option>`).join('');
    form.interesse.innerHTML = '<option value="">Escolha</option>' + INTERESSES.map(o => `<option>${o}</option>`).join('');
    form.status.innerHTML = Object.entries(STATUS).map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
    $('#leadsOrigem').innerHTML = '<option value="">Origem</option>' + ORIGENS.map(o => `<option>${o}</option>`).join('');
  }
  preencherOpcoes();

  function abrirForm(l) {
    L.editando = l ? l.id : null;
    form.reset();
    $('#leadErro').textContent = '';
    $('#leadTitulo').textContent = l ? 'Editar lead' : 'Novo lead';
    $('#excluirLead').hidden = !l;
    const d = l || { status: 'novo' };
    form.nome.value = d.nome || '';
    form.contato.value = formatarTelefone(d.contato || '');
    form.origem.value = d.origem || '';
    form.interesse.value = d.interesse || '';
    form.status.value = d.status || 'novo';
    form.proximoContato.value = d.proximoContato || '';
    form.obs.value = d.obs || '';
    $('#leadMeta').textContent = l?.atualizadoEm
      ? `Atualizado por ${l.atualizadoPor || '—'} em ${new Date(l.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
      : '';
    dlg.showModal();
    if (!l) form.nome.focus();
  }

  form.contato.addEventListener('input', e => {
    const el = e.target;
    const apagando = e.inputType && e.inputType.startsWith('delete');
    const novo = formatarTelefone(el.value);
    if (apagando && novo.length > el.value.length) return;
    el.value = novo;
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    if (!nome) {
      $('#leadErro').textContent = 'Preencha o nome do lead.';
      form.nome.focus();
      return;
    }
    const existente = L.editando ? acharLead(L.editando) : null;
    const l = {
      ...(existente || {}),
      id: existente?.id || novoId(),
      nome,
      contato: form.contato.value.trim(),
      origem: form.origem.value,
      interesse: form.interesse.value,
      status: form.status.value,
      proximoContato: form.proximoContato.value,
      obs: form.obs.value.trim(),
      externoId: existente?.externoId || '',
      criadoEm: existente?.criadoEm || new Date().toISOString(),
      criadoPor: existente?.criadoPor || ctx.quem(),
    };
    dlg.close();
    await salvar(l, existente ? 'Lead salvo' : 'Lead cadastrado');
  });

  $('#excluirLead').addEventListener('click', async () => {
    const l = acharLead(L.editando); if (!l) return;
    if (!confirm(`Excluir o lead ${l.nome}? Para guardar o histórico, prefira marcar como "Perdido".`)) return;
    dlg.close();
    await ctx.store().excluirDoc('leads', l.id);
    ctx.toast('Lead excluído', { texto: 'Desfazer', fn: () => ctx.store().salvarDoc('leads', l) });
  });

  // ---------------- Cliques e filtros ----------------
  $('#areaLeads').addEventListener('click', e => {
    const alvo = e.target.closest('[data-lacao]');
    if (!alvo || alvo.tagName === 'SELECT') return;
    const acao = alvo.dataset.lacao;
    if (acao === 'novo') return abrirForm();
    const l = acharLead(alvo.closest('[data-id]')?.dataset.id);
    if (!l) return;
    if (acao === 'editar') abrirForm(l);
    if (acao === 'orcar') ctx.orcarKit(l);
  });
  $('#areaLeads').addEventListener('keydown', e => {
    const alvo = e.target.closest?.('.abrir');
    if (alvo && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); alvo.click(); }
  });
  // troca rápida da situação direto no cartão
  $('#areaLeads').addEventListener('change', async e => {
    if (e.target.dataset.lacao !== 'status') return;
    const l = acharLead(e.target.closest('[data-id]')?.dataset.id);
    if (!l || l.status === e.target.value) return;
    const antes = { ...l };
    await salvar({ ...l, status: e.target.value }, `Movido para ${STATUS[e.target.value].toLowerCase()}`, antes);
  });
  $('#novoLead').addEventListener('click', () => abrirForm());
  $$('#leadsAbas button').forEach(b => b.addEventListener('click', () => { L.aba = b.dataset.aba; render(); window.scrollTo({ top: 0 }); }));
  $('#leadsBusca').addEventListener('input', e => { L.busca = e.target.value; render(); });
  $('#leadsOrigem').addEventListener('change', e => { L.origem = e.target.value; render(); });

  // ---------------- Dados ----------------
  function conectar() {
    const st = ctx.store();
    if (!st.onColecao) return [];
    return [
      st.onColecao('leads', lista => { L.leads = lista; render(); },
        err => ctx.toast(err?.code === 'permission-denied' ? 'Link da equipe inválido. Abra o app pelo link correto.' : 'Erro ao carregar leads')),
    ];
  }

  return { render, conectar };
}
