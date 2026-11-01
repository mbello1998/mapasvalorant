import test from "node:test";
import assert from "node:assert/strict";
import {
  TELAS, telaDoHref, podeTrocar, telaInicial, precisaDesviar, telaDoEstado,
} from "../public/assets/js/roteiro.js";

const ORIGEM = "https://estandebr.netlify.app";
const clique = (extra = {}) => ({
  botao: 0, meta: false, ctrl: false, shift: false, alt: false,
  jaTratado: false, alvo: "", baixar: false,
  href: `${ORIGEM}/arsenal.html`, origem: ORIGEM, telaAtual: "estande",
  ...extra,
});

test("as cinco telas estão na tabela, e só elas", () => {
  assert.deepEqual(Object.keys(TELAS).sort(), ["arsenal", "estande", "linha", "mapas", "ranking"]);
});

test("reconhece a tela pelo arquivo, com ou sem âncora", () => {
  assert.equal(telaDoHref(`${ORIGEM}/arsenal.html`, ORIGEM), "arsenal");
  assert.equal(telaDoHref(`${ORIGEM}/index.html#estande`, ORIGEM), "estande");
  assert.equal(telaDoHref(`${ORIGEM}/`, ORIGEM), "estande");
});

test("não reconhece o que não é tela", () => {
  assert.equal(telaDoHref(`${ORIGEM}/admin.html`, ORIGEM), null);
  assert.equal(telaDoHref("https://www.instagram.com/matheus.b.p", ORIGEM), null);
  assert.equal(telaDoHref("mailto:oi@exemplo.com", ORIGEM), null);
});

test("assume o clique simples num link de tela", () => {
  assert.equal(podeTrocar(clique()), true);
});

test("não assume clique com tecla, botão do meio ou já tratado", () => {
  for (const extra of [{ meta: true }, { ctrl: true }, { shift: true }, { alt: true },
                       { botao: 1 }, { jaTratado: true }]) {
    assert.equal(podeTrocar(clique(extra)), false, JSON.stringify(extra));
  }
});

test("não assume link de baixar, de outra aba ou de fora", () => {
  assert.equal(podeTrocar(clique({ baixar: true })), false);
  assert.equal(podeTrocar(clique({ alvo: "_blank" })), false);
  assert.equal(podeTrocar(clique({ href: "https://www.instagram.com/matheus.b.p" })), false);
});

test("âncora da tela em que já se está fica com o navegador", () => {
  // Quem clica em "Estande" estando no Estande quer rolar até a seção.
  assert.equal(podeTrocar(clique({ href: `${ORIGEM}/index.html#estande`, telaAtual: "estande" })), false);
  assert.equal(podeTrocar(clique({ href: `${ORIGEM}/index.html#estande`, telaAtual: "arsenal" })), true);
});

test("a tela de abertura vem da marca, e sem marca vem do caminho", () => {
  assert.equal(telaInicial("/", "arsenal"), "arsenal");
  assert.equal(telaInicial("/", null), "estande");
  assert.equal(telaInicial("/mapas.html", null), "mapas");
  assert.equal(telaInicial("/", "painel"), "estande");
});

test("só desvia para a raiz quem não está nela", () => {
  assert.equal(precisaDesviar("/"), false);
  assert.equal(precisaDesviar("/index.html"), false);
  assert.equal(precisaDesviar("/arsenal.html"), true);
});

test("estado de histórico de antes da casca não vira tela", () => {
  assert.equal(telaDoEstado({ tela: "mapas" }), "mapas");
  assert.equal(telaDoEstado(null), null);
  assert.equal(telaDoEstado({ tela: "painel" }), null);
});
