// Camada de dados: modo local (só este aparelho) ou Firebase (equipe sincronizada).
// O app usa sempre a mesma interface, independente do modo.

const LS_PEDIDOS = 'cp_pedidos_v1';
const LS_CONFIG = 'cp_config_v1';
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export const CONFIG_PADRAO = { empresas: ['Drip Coffee Label', 'Blooming Club'] };

function lerLocal(chave, padrao) {
  try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; }
  catch { return padrao; }
}
function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* armazenamento indisponível */ }
}

export function pedidosLocais() { return lerLocal(LS_PEDIDOS, []); }
export function limparPedidosLocais() { try { localStorage.removeItem(LS_PEDIDOS); } catch {} }

// ---------------- Modo local ----------------
export function criarStoreLocal() {
  const ouvintes = new Set();
  const ouvintesCfg = new Set();
  let pedidos = pedidosLocais();
  let config = lerLocal(LS_CONFIG, CONFIG_PADRAO);
  const emitir = () => ouvintes.forEach(cb => cb([...pedidos]));

  // sincroniza entre abas do mesmo navegador
  window.addEventListener('storage', e => {
    if (e.key === LS_PEDIDOS) { pedidos = pedidosLocais(); emitir(); }
    if (e.key === LS_CONFIG) { config = lerLocal(LS_CONFIG, CONFIG_PADRAO); ouvintesCfg.forEach(cb => cb(config)); }
  });

  return {
    modo: 'local',
    usuario: { email: 'este aparelho' },
    onUsuario(cb) { cb(this.usuario); return () => {}; },
    onPedidos(cb) { ouvintes.add(cb); cb([...pedidos]); return () => ouvintes.delete(cb); },
    async salvarPedido(p) {
      const i = pedidos.findIndex(x => x.id === p.id);
      if (i >= 0) pedidos[i] = p; else pedidos.push(p);
      gravarLocal(LS_PEDIDOS, pedidos); emitir();
    },
    async excluirPedido(id) {
      pedidos = pedidos.filter(x => x.id !== id);
      gravarLocal(LS_PEDIDOS, pedidos); emitir();
    },
    onConfig(cb) { ouvintesCfg.add(cb); cb(config); return () => ouvintesCfg.delete(cb); },
    async salvarConfig(c) { config = c; gravarLocal(LS_CONFIG, c); ouvintesCfg.forEach(cb => cb(c)); },

    // Coleções extras (itens e kits): mesma ideia dos pedidos
    onColecao(nome, cb) { const c = colecaoLocal(nome); c.ouvintes.add(cb); cb([...c.docs]); return () => c.ouvintes.delete(cb); },
    async salvarDoc(nome, d) {
      const c = colecaoLocal(nome);
      const i = c.docs.findIndex(x => x.id === d.id);
      if (i >= 0) c.docs[i] = d; else c.docs.push(d);
      if (!gravarLocalOk(c.chave, c.docs)) throw new Error('sem-espaco');
      c.emitir();
    },
    async excluirDoc(nome, id) {
      const c = colecaoLocal(nome);
      c.docs = c.docs.filter(x => x.id !== id);
      gravarLocal(c.chave, c.docs); c.emitir();
    },

    // Coleções públicas (catálogo e pedidos da página do cliente). No teste, ficam no aparelho
    // com o prefixo "pub_", e a página do cliente (kit/) lê e grava as mesmas chaves.
    onPublico(nome, cb) { return this.onColecao('pub_' + nome, cb); },
    salvarPublico(nome, d) { return this.salvarDoc('pub_' + nome, d); },
    excluirPublico(nome, id) { return this.excluirDoc('pub_' + nome, id); },
  };
}

const colecoesLocais = {};
function colecaoLocal(nome) {
  if (colecoesLocais[nome]) return colecoesLocais[nome];
  const chave = `cp_${nome}_v1`;
  const c = { chave, docs: lerLocal(chave, []), ouvintes: new Set() };
  c.emitir = () => c.ouvintes.forEach(cb => cb([...c.docs]));
  window.addEventListener('storage', e => { if (e.key === chave) { c.docs = lerLocal(chave, []); c.emitir(); } });
  return (colecoesLocais[nome] = c);
}
function gravarLocalOk(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch { return false; }
}

// ---------------- Modo Firebase ----------------
// Os dados da equipe ficam em equipes/{chave}/... A chave nunca fica no código:
// vem da conta de quem entrou (membros/{uid}) ou, na transição, do link da equipe.

// App do Firebase e banco, criados uma vez só e usados pelo login (acesso.js) e pelos dados.
export const SDK_FIREBASE = SDK;
let base = null;
export function baseFirebase(firebaseConfig) {
  if (!base) base = (async () => {
    const [appMod, fs] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    // Cache offline: o app abre e mostra os pedidos mesmo sem internet,
    // e envia as alterações quando a conexão volta.
    let db;
    try {
      db = fs.initializeFirestore(app, {
        localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
      });
    } catch {
      db = fs.getFirestore(app);
    }
    return { app, db, fs, appMod };
  })();
  return base;
}

export async function criarStoreFirebase(firebaseConfig, chave) {
  const { db, fs } = await baseFirebase(firebaseConfig);

  const colPedidos = fs.collection(db, 'equipes', chave, 'pedidos');
  const docConfig = fs.doc(db, 'equipes', chave, 'config', 'geral');

  const store = {
    modo: 'firebase',

    onPedidos(cb, onErro) {
      return fs.onSnapshot(colPedidos,
        snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
        err => onErro && onErro(err));
    },
    async salvarPedido(p) {
      const { id, ...dados } = p;
      // não espera o servidor: com o cache offline a gravação aparece na hora
      fs.setDoc(fs.doc(colPedidos, id), dados).catch(e => store._onErro && store._onErro(e));
    },
    async excluirPedido(id) {
      fs.deleteDoc(fs.doc(colPedidos, id)).catch(e => store._onErro && store._onErro(e));
    },
    onConfig(cb) {
      return fs.onSnapshot(docConfig,
        snap => cb(snap.exists() ? { ...CONFIG_PADRAO, ...snap.data() } : CONFIG_PADRAO),
        () => cb(CONFIG_PADRAO));
    },
    async salvarConfig(c) { await fs.setDoc(docConfig, c, { merge: true }); },

    // Coleções extras (itens e kits) ficam ao lado dos pedidos: equipes/{chave}/{nome}
    onColecao(nome, cb, onErro) {
      return fs.onSnapshot(fs.collection(db, 'equipes', chave, nome),
        snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
        err => onErro && onErro(err));
    },
    async salvarDoc(nome, d) {
      const { id, ...dados } = d;
      fs.setDoc(fs.doc(db, 'equipes', chave, nome, id), dados).catch(e => store._onErro && store._onErro(e));
    },
    async excluirDoc(nome, id) {
      fs.deleteDoc(fs.doc(db, 'equipes', chave, nome, id)).catch(e => store._onErro && store._onErro(e));
    },

    // Coleções públicas, fora da equipe: "catalogo" (a página do cliente lê) e "solicitacoes"
    // (pedidos que a página do cliente envia). Só quem entrou com a conta grava ou lê os pedidos.
    onPublico(nome, cb, onErro) {
      return fs.onSnapshot(fs.collection(db, nome),
        snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
        err => onErro && onErro(err));
    },
    async salvarPublico(nome, d) {
      const { id, ...dados } = d;
      await fs.setDoc(fs.doc(db, nome, id), dados);
    },
    async excluirPublico(nome, id) {
      await fs.deleteDoc(fs.doc(db, nome, id));
    },
  };
  return store;
}
