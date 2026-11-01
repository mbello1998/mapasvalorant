import test from "node:test";
import assert from "node:assert/strict";
import { arte } from "../public/assets/js/imagem.js";

const RIOT = "https://media.valorant-api.com/maps/abc/splash.png";

test("pede ao CDN da Netlify o tamanho certo, em dobro para tela densa", () => {
  const url = new URL(arte(RIOT, { largura: 300 }), "https://estandebr.netlify.app");
  assert.equal(url.pathname, "/.netlify/images");
  assert.equal(url.searchParams.get("url"), RIOT);
  assert.equal(url.searchParams.get("w"), "600");
  assert.equal(url.searchParams.get("fm"), "webp");
  assert.equal(url.searchParams.get("q"), "72");
});

test("endereço de fora da lista do netlify.toml passa direto", () => {
  // O CDN recusa o que não está declarado: reescrever seria quebrar a imagem.
  const outro = "https://exemplo.com/arte.png";
  assert.equal(arte(outro, { largura: 300 }), outro);
});

test("sem largura, ou com largura sem sentido, devolve o original", () => {
  assert.equal(arte(RIOT), RIOT);
  assert.equal(arte(RIOT, { largura: 0 }), RIOT);
  assert.equal(arte(RIOT, { largura: Number.NaN }), RIOT);
});

test("endereço vazio ou torto não quebra", () => {
  assert.equal(arte("", { largura: 300 }), "");
  assert.equal(arte(undefined as unknown as string, { largura: 300 }), "");
  assert.equal(arte("nem é endereço", { largura: 300 }), "nem é endereço");
});
