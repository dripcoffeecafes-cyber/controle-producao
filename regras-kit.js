// Regras do kit, usadas pelo app da equipe (kits.js) e pela página do cliente (kit/kit.js).
// Um lugar só para o preço nunca sair diferente nas duas telas.

export const TITULO_KIT = 'Kit Blooming Club Cafés';

// Categorias fixas. Um produto na categoria Caixas é a caixa do kit.
export const CAIXAS = 'Caixas';
export const CATEGORIAS = ['Cafés', 'Acessórios', 'Xícaras', CAIXAS];
// "Outros" passou a se chamar Caixas. Só muda o nome mostrado: o documento salvo continua igual até alguém editá-lo.
// Drip vira Cafés; qualquer outra categoria antiga (Outros, Embalagem…) aparece em Caixas.
export const categoriaDe = c => CATEGORIAS.includes(c) ? c : (c === 'Drip' ? 'Cafés' : CAIXAS);
export const ehCaixa = i => categoriaDe(i?.categoria) === CAIXAS;
export const ordemCategoria = c => CATEGORIAS.indexOf(categoriaDe(c));

// Regra dos cafés: se os cafés do kit somam menos de R$ 120, o valor do kit sobe 10%.
// Com R$ 120 ou mais em cafés, vale o preço cadastrado de cada item. Kit sem café também leva o acréscimo.
export const LIMITE_CAFES = 120;
export const ACRESCIMO_CAFES = 10;

export const arred = n => Math.round(n * 100) / 100;

// linhas: [{ preco, qtd, categoria }]; precoCaixa: número
// Devolve o valor de um kit (antes de desconto) e o detalhe da regra dos cafés.
export function precoDoKit(linhas, precoCaixa) {
  const base = arred(linhas.reduce((s, l) => s + (Number(l.preco) || 0) * l.qtd, 0) + (Number(precoCaixa) || 0));
  const cafes = arred(linhas.filter(l => categoriaDe(l.categoria) === 'Cafés').reduce((s, l) => s + (Number(l.preco) || 0) * l.qtd, 0));
  const acrescimo = cafes < LIMITE_CAFES ? ACRESCIMO_CAFES : 0;
  return { base, cafes, acrescimo, preco: arred(base * (1 + acrescimo / 100)) };
}

// Página do cliente
export const WHATSAPP_EQUIPE = '5554999683444';
export const WHATSAPP_EQUIPE_TEXTO = '(54) 99968-3444';
