// Músicas guardadas no próprio aparelho (IndexedDB, sem nuvem) e o tocador com o gráfico do som.
// Cada aparelho tem a sua lista: as músicas não vão para o Firebase nem para o repositório.

const BANCO = 'blooming-musica', LOJA = 'faixas';
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function abrirBanco() {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}
async function pedido(modo, fn) {
  const db = await abrirBanco();
  return new Promise((ok, erro) => {
    const t = db.transaction(LOJA, modo);
    const req = fn(t.objectStore(LOJA));
    t.oncomplete = () => ok(req?.result);
    t.onerror = () => erro(t.error);
    t.onabort = () => erro(t.error);
  });
}
const nomeDoArquivo = n => String(n || 'Música').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim();
const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
export const ICONES_MUSICA = {
  tocar: svg('<path d="M8.5 5.8v12.4L18.5 12 8.5 5.8Z"/>'),
  pausar: svg('<path d="M8 5.5v13M16 5.5v13"/>'),
  proxima: svg('<path d="M6.5 6.5l7.5 5.5-7.5 5.5v-11Z"/><path d="M17.5 6.5v11"/>'),
  anterior: svg('<path d="M17.5 6.5L10 12l7.5 5.5v-11Z"/><path d="M6.5 6.5v11"/>'),
  nota: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
};
export const tamanhoMB = b => `${(b / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;

export function criarMusica({ toast } = {}) {
  const M = { lista: [], atual: -1, tocando: false, url: null, ouvintes: new Set(), ctx: null, analisador: null, dados: null };
  const audio = new Audio();
  audio.preload = 'auto';

  const avisar = () => M.ouvintes.forEach(fn => { try { fn(); } catch {} });

  async function carregar() {
    try {
      const todas = await pedido('readonly', s => s.getAll());
      M.lista = (todas || []).map(({ blob, ...resto }) => resto).sort((a, b) => a.ordem - b.ordem);
    } catch { M.lista = []; }
    avisar();
  }

  async function adicionar(arquivos) {
    const audios = [...arquivos].filter(f => f.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac|opus)$/i.test(f.name));
    if (!audios.length) { toast?.('Escolha arquivos de música (mp3, m4a, wav…)'); return; }
    navigator.storage?.persist?.().catch(() => {}); // pede ao navegador para não apagar as músicas sozinho
    let ordem = M.lista.reduce((m, f) => Math.max(m, f.ordem), 0);
    try {
      for (const f of audios) {
        const faixa = { id: novoId(), nome: nomeDoArquivo(f.name), tipo: f.type, tamanho: f.size, ordem: ++ordem, criadoEm: new Date().toISOString(), blob: f };
        await pedido('readwrite', s => s.put(faixa));
      }
      toast?.(audios.length === 1 ? 'Música guardada neste aparelho' : `${audios.length} músicas guardadas neste aparelho`);
    } catch (e) {
      toast?.(/quota/i.test(String(e)) ? 'Sem espaço no aparelho para mais músicas' : 'Não deu para guardar a música');
    }
    await carregar();
  }

  async function remover(id) {
    const i = M.lista.findIndex(f => f.id === id);
    if (i === M.atual) parar();
    await pedido('readwrite', s => s.delete(id));
    await carregar();
    if (M.atual > i) M.atual--;
    avisar();
  }

  function ligarAnalisador() {
    if (M.ctx) { if (M.ctx.state === 'suspended') M.ctx.resume().catch(() => {}); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      M.ctx = new C();
      const fonte = M.ctx.createMediaElementSource(audio);
      M.analisador = M.ctx.createAnalyser();
      M.analisador.fftSize = 256;
      M.analisador.smoothingTimeConstant = 0.78;
      fonte.connect(M.analisador);
      M.analisador.connect(M.ctx.destination);
      M.dados = new Uint8Array(M.analisador.frequencyBinCount);
    } catch { M.ctx = null; }
  }

  async function tocar(i) {
    if (!M.lista.length) return;
    i = ((i % M.lista.length) + M.lista.length) % M.lista.length;
    const faixa = M.lista[i];
    const salvo = await pedido('readonly', s => s.get(faixa.id)).catch(() => null);
    if (!salvo?.blob) { toast?.('Não achei essa música neste aparelho'); return; }
    if (M.url) URL.revokeObjectURL(M.url);
    M.url = URL.createObjectURL(salvo.blob);
    audio.src = M.url;
    M.atual = i;
    ligarAnalisador();
    try { await audio.play(); } catch { toast?.('Toque de novo para tocar'); }
    avisar();
  }
  function alternar() {
    if (M.atual < 0) return tocar(0);
    if (audio.paused) { ligarAnalisador(); audio.play().catch(() => {}); } else audio.pause();
  }
  function parar() { audio.pause(); audio.removeAttribute('src'); audio.load(); M.atual = -1; M.tocando = false; avisar(); }
  const proxima = () => tocar(M.atual + 1);
  const anterior = () => (audio.currentTime > 3 ? (audio.currentTime = 0) : tocar(M.atual - 1));

  audio.addEventListener('play', () => { M.tocando = true; avisar(); });
  audio.addEventListener('pause', () => { M.tocando = false; avisar(); });
  audio.addEventListener('ended', () => proxima());

  // n barras de 0 a 1, dos graves aos agudos (só as faixas onde a música tem energia)
  function espectro(n) {
    const out = new Array(n).fill(0);
    if (!M.analisador || !M.tocando) return out;
    M.analisador.getByteFrequencyData(M.dados);
    const uteis = Math.floor(M.dados.length * 0.72);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(Math.pow(i / n, 1.6) * uteis), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.6) * uteis));
      let s = 0; for (let k = a; k < b; k++) s += M.dados[k];
      out[i] = Math.min(1, s / (b - a) / 255 * 1.15);
    }
    return out;
  }

  carregar();
  return {
    get lista() { return M.lista; },
    get atual() { return M.atual; },
    get faixa() { return M.lista[M.atual] || null; },
    get tocando() { return M.tocando; },
    adicionar, remover, tocar, alternar, proxima, anterior, parar, espectro,
    ouvir(fn) { M.ouvintes.add(fn); return () => M.ouvintes.delete(fn); },
    espacoUsado: () => M.lista.reduce((s, f) => s + (f.tamanho || 0), 0),
  };
}
