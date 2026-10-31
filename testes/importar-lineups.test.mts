import test from "node:test";
import assert from "node:assert/strict";
import {
  chaveDeNome, indexarMapa, indexarAgente, resolverLugar, comCredito, converter, converterTodos,
} from "../scripts/importar-lineups.mjs";

// Os multiplicadores são os do Ascent; o que importa aqui é que a conversão
// seja a mesma da página, não o mapa em si.
const BASE = { xMultiplier: 0.00007, yMultiplier: -0.00007, xScalarToAdd: 0.813895, yScalarToAdd: 0.573242 };

const MAPA_FALSO = indexarMapa({
  ...BASE,
  uuid: "uuid-mapa",
  displayName: "Ascent",
  callouts: [
    { regionName: "Árvore", superRegionName: "A", location: { x: 3980.9062, y: -5938.758 } },
    // "Ponto" nos dois lados: o nome sozinho fica ambíguo de propósito.
    { regionName: "Ponto", superRegionName: "A", location: { x: 1000, y: -1000 } },
    { regionName: "Ponto", superRegionName: "B", location: { x: 2000, y: -2000 } },
    { regionName: "Longe", superRegionName: "C", location: { x: 9e6, y: 9e6 } },
  ],
});

const AGENTE_FALSO = indexarAgente({
  uuid: "uuid-brim",
  displayName: "Brimstone",
  abilities: [
    { slot: "Ability1", displayName: "Incendiário" },
    { slot: "Ability2", displayName: "Fumaça Celeste" },
  ],
});

const CATALOGO = {
  mapas: new Map([[chaveDeNome("Ascent"), MAPA_FALSO]]),
  agentes: new Map([[chaveDeNome("Brimstone"), AGENTE_FALSO]]),
};

const linhaBase = {
  mapa: "Ascent", agente: "Brimstone", habilidade: "Fumaça Celeste",
  lado: "ataque", tipo: "pixel", de: "A Ponto", para: "A Árvore",
  titulo: "Fumaça na Árvore", texto: "Fecha a Árvore.",
  fonte: "https://exemplo.com/?id=1", credito: "fulano",
};

/* -------------------------------------------------------------------- nomes -- */

test("chaveDeNome ignora acento, caixa e pontuação", () => {
  assert.equal(chaveDeNome("Fumaça Celeste"), chaveDeNome("fumaca celeste"));
  assert.equal(chaveDeNome("PONTO/zero"), "ponto zero");
  assert.equal(chaveDeNome("  Árvore  "), "arvore");
});

/* ----------------------------------------------------------------- callouts -- */

test("callout fora do quadro do minimapa não entra no índice", () => {
  assert.equal(MAPA_FALSO.callouts.has(chaveDeNome("C Longe")), false);
});

test("callout com nome único pode ser chamado sem a região", () => {
  const r = resolverLugar("Árvore", MAPA_FALSO);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.lugar.x - 0.398182) < 1e-4, `x veio ${r.lugar.x}`);
});

test("nome repetido em duas regiões é recusado, e a forma com região resolve", () => {
  // Escolher um dos dois no escuro poria o ponto no lado errado do mapa, sem
  // erro nenhum para avisar.
  const ambiguo = resolverLugar("Ponto", MAPA_FALSO);
  assert.equal(ambiguo.ok, false);
  assert.match(ambiguo.erro, /mais de uma região/);

  assert.equal(resolverLugar("A Ponto", MAPA_FALSO).ok, true);
  assert.equal(resolverLugar("B Ponto", MAPA_FALSO).ok, true);
  assert.notDeepEqual(resolverLugar("A Ponto", MAPA_FALSO).lugar, resolverLugar("B Ponto", MAPA_FALSO).lugar);
});

test("callout que não existe diz o nome do mapa", () => {
  const r = resolverLugar("Cozinha", MAPA_FALSO);
  assert.equal(r.ok, false);
  assert.match(r.erro, /Ascent/);
});

test("fração crua também vale, e fora de 0-1 é recusada", () => {
  assert.deepEqual(resolverLugar("0.4, 0.3", MAPA_FALSO), { ok: true, lugar: { x: 0.4, y: 0.3 } });
  assert.equal(resolverLugar("1.5, 0.3", MAPA_FALSO).ok, false);
  assert.equal(resolverLugar("-0.1, 0.3", MAPA_FALSO).ok, false);
});

/* ------------------------------------------------------------------ crédito -- */

test("o crédito entra no fim do texto, em frase", () => {
  assert.match(comCredito("Fecha a Árvore.", "fulano"), /^Fecha a Árvore\. Lineup de fulano/);
});

test("sem crédito o texto fica como veio", () => {
  assert.equal(comCredito("Fecha a Árvore.", null), "Fecha a Árvore.");
  assert.equal(comCredito("Fecha a Árvore.", ""), "Fecha a Árvore.");
});

/* ---------------------------------------------------------------- conversão -- */

test("converte uma linha completa em ponto", () => {
  const r = converter(linhaBase, CATALOGO);
  assert.equal(r.ok, true, r.ok ? "" : r.erro);
  assert.equal(r.ponto.mapa, "uuid-mapa");
  assert.equal(r.ponto.agente, "uuid-brim");
  assert.equal(r.ponto.habilidade, "Ability2");
  assert.equal(r.ponto.tipo, "pixel");
  assert.equal(r.ponto.fonte, "https://exemplo.com/?id=1");
  assert.match(r.ponto.texto, /Lineup de fulano/);
});

test("o importado nunca entra conferido nem traz imagem de terceiro", () => {
  // Quem importou não testou em jogo, e a imagem continua sendo de quem a fez.
  const r = converter({ ...linhaBase, imagens: ["https://cdn.exemplo.com/1.webp"] }, CATALOGO);
  assert.equal(r.ponto.conferido, false);
  assert.deepEqual(r.ponto.imagens, []);
});

test("o nome da habilidade é traduzido para o slot, e o slot cru também vale", () => {
  assert.equal(converter({ ...linhaBase, habilidade: "Incendiário" }, CATALOGO).ponto.habilidade, "Ability1");
  assert.equal(converter({ ...linhaBase, habilidade: "Ability1" }, CATALOGO).ponto.habilidade, "Ability1");
});

test("pixel sem agente ou com habilidade que não é dele é recusado", () => {
  assert.match(converter({ ...linhaBase, agente: "" }, CATALOGO).erro, /precisa de agente/);
  assert.match(converter({ ...linhaBase, habilidade: "Nebulosa" }, CATALOGO).erro, /não é habilidade de Brimstone/);
});

test("posição não ganha habilidade, mesmo se a linha mandar uma", () => {
  const r = converter({ ...linhaBase, tipo: "posicao", habilidade: "Fumaça Celeste" }, CATALOGO);
  assert.equal(r.ok, true);
  assert.equal(r.ponto.habilidade, null);
  assert.equal(r.ponto.para, null);
});

test("de igual a para é recusado", () => {
  const r = converter({ ...linhaBase, de: "A Árvore", para: "A Árvore" }, CATALOGO);
  assert.equal(r.ok, false);
  assert.match(r.erro, /comprimento zero/);
});

test("fonte que não é https é recusada", () => {
  assert.match(converter({ ...linhaBase, fonte: "http://exemplo.com" }, CATALOGO).erro, /https/);
});

test("texto que estoura o limite do servidor é recusado aqui, não lá", () => {
  const r = converter({ ...linhaBase, texto: "a".repeat(600) }, CATALOGO);
  assert.equal(r.ok, false);
  assert.match(r.erro, /600/);
});

test("lado inválido é recusado", () => {
  assert.match(converter({ ...linhaBase, lado: "meio" }, CATALOGO).erro, /ataque.*defesa/);
});

test("converterTodos importa as boas e lista as ruins, sem parar na primeira", () => {
  const { pontos, erros } = converterTodos(
    [linhaBase, { ...linhaBase, mapa: "Inexistente", titulo: "ruim" }, { ...linhaBase, titulo: "outra boa" }],
    CATALOGO,
  );
  assert.equal(pontos.length, 2);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].linha, 2);
  assert.equal(erros[0].titulo, "ruim");
});
