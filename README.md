# Controle de Produção — Grupo Blooming

App web (PWA) para controlar pedidos e produção: fila por prioridade, prazos, data de entrega, valor, pagamento e observações. Instala na tela inicial do celular e funciona sem internet. Os dados ficam no Firebase e sincronizam na hora entre todos da equipe.

## O que o app faz

- **Fila de produção** numerada, ordenada por prioridade (Urgente, Alta, Normal, Baixa) e, dentro de cada prioridade, pela data de entrega mais próxima.
- **Data de entrega confirmada ou prevista.** Pedidos sem data fechada podem ter uma previsão, que aparece com borda tracejada e não conta como atraso. Pedidos sem nenhuma data aparecem como "Sem data".
- **Etapas:** A produzir → Em produção → Pronto → Entregue (ou Cancelado). Um toque no cartão avança a etapa; ao marcar "Entregue", a data de entrega é preenchida com o dia.
- **Pagamento:** Não pago, Sinal pago (com valor recebido) ou Pago.
- **Resumo no topo:** quantos estão a produzir, prontos, atrasados e quanto falta receber.
- **Filtros** por pagamento e busca por cliente/descrição.
- **WhatsApp** do cliente com um toque.
- **Histórico:** cada pedido mostra quem alterou por último e quando.
- **Exportar planilha (CSV)** em Ajustes, para backup ou abrir no Excel/Google Planilhas.

Sem o Firebase configurado, o app roda em **modo de teste**: tudo fica salvo só no aparelho.

---

## 1. Configurar o Firebase (uma vez, ~10 minutos)

1. Acesse **console.firebase.google.com** com sua conta Google e clique em **Criar projeto**. Nome sugerido: `producao-blooming`. O Google Analytics pode ficar desativado.
2. **Banco de dados:** no menu, *Criação → Firestore Database → Criar banco de dados*.
   - Local: **southamerica-east1 (São Paulo)**.
   - Modo: **produção**.
3. **Regras de segurança:** ainda no Firestore, aba **Regras**. Apague o conteúdo, cole o arquivo `firestore.rules` deste repositório e clique em **Publicar**.
   - Já vem com o e-mail `az.adrianozanin@gmail.com`. Para cada pessoa da equipe, adicione o e-mail na lista (em minúsculas) e publique de novo.
4. **Login:** *Criação → Authentication → Vamos começar → E-mail/senha → Ativar → Salvar*.
   - Na aba **Usuários**, clique em **Adicionar usuário** para você e para cada pessoa da equipe (e-mail + senha provisória). A pessoa pode trocar a senha depois pelo "Esqueci minha senha" no app.
5. **Liberar o domínio do GitHub:** *Authentication → Configurações → Domínios autorizados → Adicionar domínio* → `dripcoffeecafes-cyber.github.io` (ou o domínio onde o app ficar publicado).
6. **Pegar a configuração:** clique na engrenagem ⚙ → *Configurações do projeto* → em "Seus apps", clique no ícone **</>** (Web), dê um apelido (ex.: `producao`) e registre. **Não** marque Firebase Hosting.
   - Copie o objeto `firebaseConfig` que aparece e cole no arquivo `config.js`, no lugar de `null`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "AIza...",
  authDomain: "producao-blooming.firebaseapp.com",
  projectId: "producao-blooming",
  storageBucket: "producao-blooming.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

> Esses dados não são senha: eles só identificam o projeto. Quem protege os pedidos são o login e as regras do passo 3, que só deixam entrar os e-mails da lista.

O plano gratuito (Spark) do Firebase cobre com folga o uso de uma equipe pequena.

## 2. Publicar no GitHub Pages

1. No repositório, vá em **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e salve.
3. Em 1 ou 2 minutos o endereço aparece no topo da página (algo como `https://usuario.github.io/controle-producao/`).

No plano gratuito do GitHub, o Pages só funciona com repositório **público**. O código fica visível, mas os pedidos não: eles ficam no Firebase, protegidos por login.

## 3. Instalar no celular

- **iPhone:** abra o endereço no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**.
- **Android:** abra no **Chrome** → aparece "Instalar app" (ou menu ⋮ → **Instalar app**).

## Atualizar o app

Depois de alterar qualquer arquivo, aumente a versão na primeira linha de `sw.js` (ex.: `producao-v1` → `producao-v2`). Assim os celulares baixam a versão nova na próxima abertura.

## Passar pedidos do modo de teste para a nuvem

Se cadastrou pedidos antes de configurar o Firebase, abra o app no mesmo aparelho já com login feito → **Ajustes → Enviar pedidos deste aparelho para a nuvem**.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html` | Telas do app |
| `styles.css` | Visual |
| `app.js` | Lógica: fila, formulário, filtros, resumo, exportação |
| `store.js` | Onde os dados são salvos (aparelho ou Firebase) |
| `config.js` | Configuração do Firebase |
| `sw.js` | Funcionamento offline e instalação |
| `manifest.webmanifest`, `icons/` | Nome e ícone do app instalado |
| `firestore.rules` | Quem pode acessar os pedidos |
