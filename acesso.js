// Login da equipe: e-mail e senha (Firebase Authentication).
// Cada pessoa tem um documento em membros/{uid} com nome, e-mail, papel (admin ou equipe),
// se está ativa e a chave da equipe (só enquanto estiver ativa).
// Quem cria as contas é o administrador, em Ajustes > Equipe: o app cria a conta com uma
// senha aleatória e manda o e-mail de "redefinir senha", para a pessoa criar a dela.
import { baseFirebase, SDK_FIREBASE } from './store.js';

const LS_MEMBRO = 'cp_membro';

const MENSAGENS = {
  'auth/invalid-email': 'Esse e-mail não parece certo. Confira e tente de novo.',
  'auth/missing-password': 'Digite a senha.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/user-disabled': 'Esta conta foi desativada. Fale com a administração.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com a internet. Tente de novo quando a conexão voltar.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail no Firebase, mas ela não está na lista da equipe.',
  'auth/operation-not-allowed': 'O login por e-mail ainda não foi ativado no Firebase.',
  'permission-denied': 'Sem permissão para essa ação.',
};
export function mensagemErro(err) {
  return MENSAGENS[err?.code] || 'Não deu certo agora. Tente de novo em instantes.';
}

// Último perfil lido, para o app abrir sem internet
export function perfilGuardado(uid) {
  try {
    const p = JSON.parse(localStorage.getItem(LS_MEMBRO) || 'null');
    return p && p.uid === uid ? p : null;
  } catch { return null; }
}
function guardarPerfil(p) {
  try { if (p) localStorage.setItem(LS_MEMBRO, JSON.stringify(p)); else localStorage.removeItem(LS_MEMBRO); } catch {}
}

const senhaAleatoria = () => {
  const a = new Uint8Array(24); crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)) + 'Aa1!';
};

export async function criarAcesso(firebaseConfig) {
  const [{ app, db, fs, appMod }, au] = await Promise.all([
    baseFirebase(firebaseConfig),
    import(`${SDK_FIREBASE}/firebase-auth.js`),
  ]);
  // Sessão guardada no aparelho (o app instalado continua conectado)
  const auth = au.initializeAuth(app, { persistence: [au.indexedDBLocalPersistence, au.browserLocalPersistence] });
  auth.languageCode = 'pt-BR';

  const docMembro = uid => fs.doc(db, 'membros', uid);
  // Depois de criar a senha, o e-mail traz um botão "Continuar" que volta para o app
  const voltarParaApp = () => ({ url: location.origin + location.pathname });

  async function enviarEmailSenha(email) {
    try {
      await au.sendPasswordResetEmail(auth, email, voltarParaApp());
    } catch (err) {
      // endereço do app ainda não autorizado no Firebase: manda sem o botão de voltar
      if (err?.code === 'auth/unauthorized-continue-uri' || err?.code === 'auth/invalid-continue-uri') {
        await au.sendPasswordResetEmail(auth, email);
      } else throw err;
    }
  }

  return {
    onUsuario(cb) { return au.onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, email: u.email } : null)); },

    async entrar(email, senha) { await au.signInWithEmailAndPassword(auth, email.trim(), senha); },

    async sair() {
      guardarPerfil(null);
      try { localStorage.removeItem('cp_chave'); } catch {}
      await au.signOut(auth);
    },

    async esqueciSenha(email) {
      try { await enviarEmailSenha(email.trim()); }
      catch (err) { if (err?.code !== 'auth/user-not-found') throw err; } // não revela se o e-mail existe
    },

    // Perfil de quem entrou. Sem internet, usa o último perfil guardado no aparelho.
    async meuPerfil(uid) {
      try {
        const snap = await fs.getDoc(docMembro(uid));
        const p = snap.exists() ? { ...snap.data(), uid } : null;
        guardarPerfil(p);
        return p;
      } catch (err) {
        if (err?.code === 'permission-denied') { guardarPerfil(null); return null; }
        const salvo = perfilGuardado(uid);
        if (salvo) return salvo;
        throw err;
      }
    },

    // ----- Só para o administrador -----
    onMembros(cb, onErro) {
      return fs.onSnapshot(fs.collection(db, 'membros'),
        snap => cb(snap.docs.map(d => ({ ...d.data(), uid: d.id }))),
        err => onErro && onErro(err));
    },

    async adicionarPessoa({ nome, email, chave, quem }) {
      email = email.trim().toLowerCase();
      // Cria a conta numa instância separada, para quem está cadastrando continuar conectado
      const sec = appMod.initializeApp(firebaseConfig, `cadastro-${Date.now()}`);
      let uid;
      try {
        const authSec = au.initializeAuth(sec, { persistence: au.inMemoryPersistence });
        const cred = await au.createUserWithEmailAndPassword(authSec, email, senhaAleatoria());
        uid = cred.user.uid;
        await au.signOut(authSec);
      } finally {
        appMod.deleteApp(sec).catch(() => {});
      }
      await fs.setDoc(docMembro(uid), {
        nome: nome.trim(), email, papel: 'equipe', ativo: true, chave,
        criadoEm: new Date().toISOString(), criadoPor: quem,
      });
      await enviarEmailSenha(email);
      return uid;
    },

    async bloquear(uid, quem) {
      await fs.updateDoc(docMembro(uid), {
        ativo: false, chave: fs.deleteField(), atualizadoEm: new Date().toISOString(), atualizadoPor: quem,
      });
    },
    async liberar(uid, chave, quem) {
      await fs.updateDoc(docMembro(uid), { ativo: true, chave, atualizadoEm: new Date().toISOString(), atualizadoPor: quem });
    },
    reenviarSenha: email => enviarEmailSenha(email),
  };
}
