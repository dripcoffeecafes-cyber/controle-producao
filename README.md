# Controle de Produção — Grupo Blooming

App web (PWA) para controlar pedidos e produção: fila por prioridade, prazos, data de entrega, valor, pagamento e observações. Instala na tela inicial do celular e funciona sem internet. Os dados ficam no Firebase e sincronizam na hora entre todos da equipe.

## O que o app faz

- **Fila única** numerada, ordenada pela data de entrega (confirmada ou prevista; sem data vai para o fim) e, no mesmo dia, pela prioridade (Urgente, Alta, Normal, Baixa).
- **Finalizados:** o pedido sai da fila só quando estiver entregue **e** pago. Entregue sem pagamento continua na fila com o botão "Marcar pago".
- **Data de entrega confirmada ou prevista.** Pedidos sem data fechada podem ter uma previsão, que aparece com borda tracejada e não conta como atraso. Pedidos sem nenhuma data aparecem como "Sem data".
- **Botões Produzido, Entregue e Pago** em cada cartão: um toque marca, outro toque desmarca. Ao marcar "Entregue", a data de entrega é preenchida com o dia. A etapa "Em produção" e o cancelamento ficam no formulário do pedido.
- **Pagamento:** Não pago, Sinal pago (com valor recebido) ou Pago.
- **Resumo no topo:** quantos estão a produzir, prontos, atrasados e quanto falta receber.
- **Filtros** por pagamento e busca por cliente/descrição.
- **WhatsApp** do cliente com um toque.
- **Histórico:** cada pedido mostra quem alterou por último e quando.
- **Exportar planilha (CSV)** em Ajustes, para backup ou abrir no Excel/Google Planilhas.

Sem o Firebase configurado, o app roda em **modo de teste**: tudo fica salvo só no aparelho.

---

## 1. Configurar o Firebase (uma vez, ~5 minutos)

O app não tem login: a equipe entra direto por um **link com uma chave secreta** (`.../controle-producao/#k=CHAVE`). Só quem tem esse link consegue ver e editar os pedidos.

1. Acesse **console.firebase.google.com**, clique em **Criar projeto** (ex.: `producao-blooming`). O Google Analytics pode ficar desativado.
2. **Banco de dados:** *Firestore Database → Criar banco de dados*. Edição **Standard**, local **southamerica-east1 (São Paulo)**, modo **produção**.
3. **Regras:** no Firestore, aba **Regras**. Cole o conteúdo de `firestore.rules`, troque `CHAVE_DA_EQUIPE` pela chave do link da equipe e clique em **Publicar**.
   - A chave verdadeira **não** deve ser salva neste repositório, porque ele é público.
4. **Pegar a configuração:** engrenagem ⚙ → *Configurações do projeto* → em "Seus apps", ícone **</>** (Web), apelido `producao`, **Registrar app** (sem Firebase Hosting). Copie o objeto `firebaseConfig` para o arquivo `config.js`, no lugar de `null`.

> Os dados do `firebaseConfig` não são senha; eles só identificam o projeto. Quem protege os pedidos é a chave do link, conferida pelas regras do passo 3.

**Para trocar a chave** (por exemplo, se alguém que saiu da equipe tinha o link): crie uma chave nova, coloque nas regras e publique, e mande o link novo para a equipe. Os pedidos ficam guardados por chave, então avise antes para exportar a planilha ou peça ajuda para migrar os dados.

O plano gratuito (Spark) do Firebase cobre com folga o uso de uma equipe pequena.

## 2. Publicar no GitHub Pages

1. No repositório, vá em **Settings → Pages**.
2. Em *Source*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)** e salve.
3. Em 1 ou 2 minutos o endereço aparece no topo da página (algo como `https://usuario.github.io/controle-producao/`).

No plano gratuito do GitHub, o Pages só funciona com repositório **público**. O código fica visível, mas os pedidos não: eles ficam no Firebase e só abrem com a chave do link da equipe.

## 3. Instalar no celular

Abra sempre pelo **link da equipe** (com `#k=`). Em *Ajustes → Link da equipe* dá para copiar ou compartilhar o link. Em *Ajustes → Seu nome*, cada pessoa coloca o nome para aparecer no histórico.


- **iPhone:** abra o endereço no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**.
- **Android:** abra no **Chrome** → aparece "Instalar app" (ou menu ⋮ → **Instalar app**).

## Atualizar o app

Depois de alterar qualquer arquivo, aumente a versão na primeira linha de `sw.js` (ex.: `producao-v1` → `producao-v2`). Assim os celulares baixam a versão nova na próxima abertura.

## Passar pedidos do modo de teste para a nuvem

Se cadastrou pedidos antes de configurar o Firebase, abra o app no mesmo aparelho pelo link da equipe → **Ajustes → Enviar pedidos deste aparelho para a nuvem**.

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
| `firestore.rules` | Modelo das regras de acesso (a chave real fica só no Firebase) |

## Kits de presente (áreas Orçar kit e Produtos)

- **Produtos e preços:** cada produto tem foto, categoria (Cafés, Acessórios, Xícaras ou Caixas), preço de venda e custo opcional. O preço pode ser trocado direto na lista, para a atualização do mês.
- **Caixas:** são os produtos da categoria Caixas (antiga "Outros"; os documentos salvos não mudam). Cada caixa tem duas fotos: a foto do item (aparece entre os itens do kit) e a foto principal do orçamento (campo `fotoPrincipal`, o kit montado com a caixa). Dá para usar como principal uma foto da coleção antiga `caixas`, que fica só para leitura.
- **Regra dos cafés:** se os produtos da categoria Cafés no kit somam menos de R$ 120, o valor do kit sobe 10%. Com R$ 120 ou mais em cafés, vale o preço cadastrado de cada item. Sem café no kit, não há acréscimo.
- **Montar kit:** escolha a caixa, depois os itens (+ / −), a quantidade de kits e o desconto. O valor soma a caixa e os itens; a margem aparece só para a equipe.
  - **Gerar imagem:** cria a imagem para o cliente ("Kit Blooming Club Cafés", caixa, foto principal 4:3 com a legenda de demonstração, itens em cartões com foto e quantidade, valores). Com até 5 itens a imagem tem 1080×1440 (3:4); com mais itens entra mais uma linha de cartões e a imagem cresce em altura, sem mexer na foto principal. Dá para enviar direto pelo compartilhar do celular, baixar ou copiar o texto.
  - **Criar pedido:** abre o pedido já com cliente, descrição e valor.
- Os dados ficam em `equipes/{chave}/caixas` e `equipes/{chave}/itens`, cobertos pelas mesmas regras do Firestore.
