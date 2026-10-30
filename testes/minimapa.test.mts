import { test } from "node:test";
import assert from "node:assert/strict";
import { paraMinimapa, calloutsDoMapa } from "../public/assets/js/minimapa.js";

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
