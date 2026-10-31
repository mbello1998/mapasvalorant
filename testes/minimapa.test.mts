import { test } from "node:test";
import assert from "node:assert/strict";
import { paraMinimapa, calloutsDoMapa, pontosDoMapa, filtrarPorLugar, filtrarPontos, rotuloDoPonto } from "../public/assets/js/minimapa.js";

const ASCENT = { xMultiplier: 0.00007, yMultiplier: -0.00007, xScalarToAdd: 0.813895, yScalarToAdd: 0.573242 };

test("converte coordenada de mundo em fração do minimapa", () => {
  // Callout "Árvore" de Ascent: location {x: 3980.9062, y: -5938.758}
  const p = paraMinimapa({ x: 3980.9062, y: -5938.758 }, ASCENT);
  assert.ok(Math.abs(p.x - 0.398182) < 1e-4, `x veio ${p.x}`);
  assert.ok(Math.abs(p.y - 0.294579) < 1e-4, `y veio ${p.y}`);
});

test("os eixos trocam: y do mundo vira a horizontal", () => {
  const a = paraMinimapa({ x: 0, y: 10000 }, ASCENT);
  const b = paraMinimapa({ x: 10000, y: 0 }, ASCENT);
  assert.ok(a.x > b.x, "y do mundo tem que mexer no eixo horizontal");
  assert.ok(b.y < a.y, "x do mundo tem que mexer no eixo vertical");
});

test("mapa sem callouts devolve lista vazia", () => {
  assert.deepEqual(calloutsDoMapa({ ...ASCENT, callouts: null }), []);
});

test("callout fora do quadro do minimapa é descartada", () => {
  const mapa = { ...ASCENT, callouts: [{ regionName: "Fora", superRegionName: "A", location: { x: 9e6, y: 9e6 } }] };
  assert.deepEqual(calloutsDoMapa(mapa), []);
});

test("callout mapeia regionName para nome, superRegionName para regiao e converte x/y", () => {
  // Mesma callout "Árvore" de Ascent do primeiro teste: a conta já está provada
  // lá, aqui o que se prova é que cada campo da API vai para o campo certo.
  const mapa = {
    ...ASCENT,
    callouts: [{ regionName: "Árvore", superRegionName: "B", location: { x: 3980.9062, y: -5938.758 } }],
  };
  const [c] = calloutsDoMapa(mapa);
  assert.equal(c.nome, "Árvore");
  assert.equal(c.regiao, "B");
  assert.ok(Math.abs(c.x - 0.398182) < 1e-4, `x veio ${c.x}`);
  assert.ok(Math.abs(c.y - 0.294579) < 1e-4, `y veio ${c.y}`);
});

test("pontosDoMapa devolve só os pontos do mapa pedido", () => {
  const pontos = [
    { id: "a", mapa: "ascent" },
    { id: "b", mapa: "split" },
    { id: "c", mapa: "ascent" },
  ];
  assert.deepEqual(pontosDoMapa(pontos, "ascent").map((p) => p.id), ["a", "c"]);
});

test("pontosDoMapa devolve lista vazia quando nenhum ponto bate (mapa que saiu do jogo)", () => {
  assert.deepEqual(pontosDoMapa([{ id: "a", mapa: "ascent" }], "removido"), []);
  assert.deepEqual(pontosDoMapa([], "ascent"), []);
  assert.deepEqual(pontosDoMapa(undefined, "ascent"), []);
});

test("filtrarPorLugar acha o ponto que sai do lugar, o que cai nele, e ignora o longe", () => {
  const sai = { id: "sai", de: { x: 0.5, y: 0.5 }, para: { x: 0.9, y: 0.9 } };
  const cai = { id: "cai", de: { x: 0.1, y: 0.1 }, para: { x: 0.52, y: 0.49 } };
  const longe = { id: "longe", de: { x: 0.1, y: 0.9 }, para: { x: 0.9, y: 0.1 } };
  const posicao = { id: "pos", de: { x: 0.9, y: 0.5 }, para: null };
  const achados = filtrarPorLugar([sai, cai, longe, posicao], { x: 0.5, y: 0.5 });
  assert.deepEqual(achados.map((p) => p.id), ["sai", "cai"]);
});

test("filtrarPorLugar respeita o raio dado e inclui posicao (para nulo) pelo de", () => {
  const pos = { id: "pos", de: { x: 0.5, y: 0.5 }, para: null };
  assert.equal(filtrarPorLugar([pos], { x: 0.58, y: 0.5 }).length, 0);
  assert.equal(filtrarPorLugar([pos], { x: 0.58, y: 0.5 }, 0.1).length, 1);
});

test("filtrarPontos sem agente deixa só as posições", () => {
  const pontos = [
    { id: "a", tipo: "posicao", agente: null, habilidade: null, lado: "defesa" },
    { id: "b", tipo: "pixel", agente: "sova", habilidade: "Ability2", lado: "ataque" },
    { id: "c", tipo: "posicao", agente: "sova", habilidade: null, lado: "ataque" },
  ];
  assert.deepEqual(filtrarPontos(pontos, {}).map((p) => p.id), ["a", "c"]);
});

test("filtrarPontos recorta por agente, depois habilidade, e o lado vale sempre", () => {
  const pontos = [
    { id: "a", tipo: "pixel", agente: "sova", habilidade: "Ability2", lado: "ataque" },
    { id: "b", tipo: "pixel", agente: "sova", habilidade: "Ultimate", lado: "defesa" },
    { id: "c", tipo: "pixel", agente: "viper", habilidade: "Ability2", lado: "ataque" },
  ];
  assert.deepEqual(filtrarPontos(pontos, { agente: "sova" }).map((p) => p.id), ["a", "b"]);
  assert.deepEqual(filtrarPontos(pontos, { agente: "sova", habilidade: "Ultimate" }).map((p) => p.id), ["b"]);
  assert.deepEqual(filtrarPontos(pontos, { agente: "sova", lado: "ataque" }).map((p) => p.id), ["a"]);
});

test("rotuloDoPonto sobrevive a agente e habilidade desconhecidos", () => {
  const agentes = [{ uuid: "sova", displayName: "Sova", abilities: [{ slot: "Ability2", displayName: "Dardo Hacker" }] }];
  const p = { titulo: "Cai na A", agente: "sova", habilidade: "Ability2", lado: "ataque", tipo: "pixel" };
  assert.equal(rotuloDoPonto(p, agentes), "Cai na A (Sova, Dardo Hacker, ataque, pixel)");
  assert.equal(rotuloDoPonto({ ...p, agente: "sumiu" }, agentes), "Cai na A (ataque, pixel)");
});

test("com agente escolhido, entram as utils dele e as posições sem agente", () => {
  const pontos = [
    { id: "util", tipo: "pixel", agente: "sova", habilidade: "Ability2", lado: "ataque" },
    { id: "dele", tipo: "posicao", agente: "sova", habilidade: null, lado: "ataque" },
    { id: "generica", tipo: "posicao", agente: null, habilidade: null, lado: "defesa" },
    { id: "outro", tipo: "pixel", agente: "viper", habilidade: "Ability2", lado: "ataque" },
    { id: "posOutro", tipo: "posicao", agente: "viper", habilidade: null, lado: "ataque" },
  ];
  assert.deepEqual(filtrarPontos(pontos, { agente: "sova" }).map((p) => p.id), ["util", "dele", "generica"]);
});

test("a habilidade recorta o agente mas a posição sem agente continua", () => {
  const pontos = [
    { id: "a", tipo: "pixel", agente: "sova", habilidade: "Ability2", lado: "ataque" },
    { id: "b", tipo: "pixel", agente: "sova", habilidade: "Ultimate", lado: "ataque" },
    { id: "generica", tipo: "posicao", agente: null, habilidade: null, lado: "ataque" },
  ];
  assert.deepEqual(filtrarPontos(pontos, { agente: "sova", habilidade: "Ultimate" }).map((p) => p.id), ["b", "generica"]);
});

test("o lado também recorta as posições sem agente", () => {
  const pontos = [{ id: "g", tipo: "posicao", agente: null, habilidade: null, lado: "defesa" }];
  assert.deepEqual(filtrarPontos(pontos, { agente: "sova", lado: "ataque" }), []);
});
