import test from "node:test";
import assert from "node:assert/strict";
import { proximoIndice, limitarArraste } from "../public/assets/js/visor.js";

test("anda para frente e para trás dentro da lista", () => {
  assert.equal(proximoIndice(0, 3, 1), 1);
  assert.equal(proximoIndice(1, 3, 1), 2);
  assert.equal(proximoIndice(2, 3, -1), 1);
});

test("dá a volta nas duas pontas", () => {
  // Quem está no último passo e aperta "próxima" quer o primeiro, não um
  // botão que não faz nada.
  assert.equal(proximoIndice(2, 3, 1), 0);
  assert.equal(proximoIndice(0, 3, -1), 2);
});

test("índice negativo não escapa: o resto de negativo em JS é negativo", () => {
  // (-1 % 3) é -1 em JavaScript, e um índice -1 deixaria a imagem em branco.
  assert.equal(proximoIndice(0, 3, -4), 2);
  assert.equal(proximoIndice(0, 3, -3), 0);
});

test("passo maior que a lista dá a volta quantas vezes precisar", () => {
  assert.equal(proximoIndice(0, 3, 7), 1);
  assert.equal(proximoIndice(1, 3, 300), 1);
});

test("lista de uma imagem só fica sempre no zero", () => {
  assert.equal(proximoIndice(0, 1, 1), 0);
  assert.equal(proximoIndice(0, 1, -1), 0);
});

test("lista vazia ou total inválido devolve zero em vez de NaN", () => {
  // NaN viraria `fotos[NaN]`, que é undefined, e o visor abriria em branco
  // sem nenhum erro para indicar o motivo.
  for (const total of [0, -1, NaN, undefined, null]) {
    assert.equal(proximoIndice(0, total as number, 1), 0, `total ${total}`);
  }
});

test("abrir num índice qualquer é normalizado pela mesma conta", () => {
  // `abrir` usa proximoIndice(0, total, indice) para aceitar o índice da
  // miniatura clicada sem confiar que ele esteja na faixa.
  assert.equal(proximoIndice(0, 3, 2), 2);
  assert.equal(proximoIndice(0, 3, 5), 2);
});

/* ------------------------------------------------- o limite do arraste -- */

test("sem zoom não há para onde arrastar", () => {
  // Em 1x a imagem cabe inteira na moldura: qualquer deslocamento deixaria
  // uma faixa vazia de um lado.
  assert.equal(limitarArraste(120, 600, 1), 0);
  assert.equal(limitarArraste(-120, 600, 0.5), 0);
});

test("o arraste para na borda da imagem ampliada", () => {
  // Em 2x sobra meia largura para cada lado: 600 * (2 - 1) / 2 = 300.
  assert.equal(limitarArraste(1000, 600, 2), 300);
  assert.equal(limitarArraste(-1000, 600, 2), -300);
  assert.equal(limitarArraste(50, 600, 2), 50);
});

test("medida inválida devolve zero em vez de NaN", () => {
  // Um NaN no transform não move nada e não acusa o motivo.
  for (const medida of [0, -10, NaN, undefined, null]) {
    assert.equal(limitarArraste(100, medida as number, 2.5), 0, `medida ${medida}`);
  }
  assert.equal(limitarArraste(NaN, 600, 2), 0);
});
