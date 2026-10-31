import test from "node:test";
import assert from "node:assert/strict";
import { proximoIndice } from "../public/assets/js/visor.js";

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
