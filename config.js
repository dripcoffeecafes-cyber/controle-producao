// Configuração do Firebase.
// Enquanto estiver null, o app funciona em "modo de teste": os pedidos ficam só no aparelho.
// Para a equipe compartilhar os pedidos, cole aqui o objeto firebaseConfig do seu projeto
// (Firebase > Configurações do projeto > Seus apps > App da Web). Veja o README.
//
// Exemplo:
// window.FIREBASE_CONFIG = {
//   apiKey: "AIza...",
//   authDomain: "seu-projeto.firebaseapp.com",
//   projectId: "seu-projeto",
//   storageBucket: "seu-projeto.appspot.com",
//   messagingSenderId: "123456789",
//   appId: "1:123456789:web:abc123"
// };

window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyATqzHH30ySDKr7I0IYd5erCEUpKPscVjI",
  authDomain: "producao-blooming-app.firebaseapp.com",
  projectId: "producao-blooming-app",
  storageBucket: "producao-blooming-app.firebasestorage.app",
  messagingSenderId: "409421556320",
  appId: "1:409421556320:web:cf6de6c7036a01384b7105"
};
// No app instalado no iPhone (navigator.standalone), o login do Google passa pelos arquivos de apoio
// copiados para /__/auth/ no próprio endereço: é o que faz o "Entrar com Google" funcionar ali.
// No navegador e no computador continua como sempre (janela do Google pelo endereço do Firebase).
if (location.hostname === 'cafes.bloomingclub.com.br' && navigator.standalone === true) {
  window.FIREBASE_CONFIG.authDomain = location.hostname;
}
