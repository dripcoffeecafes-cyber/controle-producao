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
  };
}

// ---------------- Modo Firebase ----------------
// Sem login: os dados da equipe ficam em equipes/{chave}/..., e só quem tem a chave
// (que vem no link da equipe) consegue ler ou gravar. A chave nunca fica no código.
export async function criarStoreFirebase(firebaseConfig, chave) {
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-firestore.js`),
  ]);

  const app = initializeApp(firebaseConfig);

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
  };
  return store;
}
