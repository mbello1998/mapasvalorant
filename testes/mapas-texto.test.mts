import test from "node:test";
import assert from "node:assert/strict";
import {
  MAPAS_TEXTO, DUELO, UUIDS_DUELO, descricaoDoMapa, lugarDoMapa, metaDoMapa, juntarDuelos,
} from "../public/assets/js/mapas-texto.js";

/** Os mapas jogáveis em partida — os que a base da Riot marca com
 *  `tacticalDescription`, que é o mesmo filtro da Sala de Mapas. */
const JOGAVEIS = [
  ["7eaecc1b-4337-bbf6-6ab9-04b8f06b3319", "Ascent"],
  ["d960549e-485c-e861-8d71-aa9d1aed12a2", "Split"],
  ["b529448b-4d60-346e-e89e-00a4c527a405", "Fracture"],
  ["2c9d57ec-4431-9c5e-2939-8f9ef6dd5cba", "Bind"],
  ["2fb9a4fd-47b8-4e7d-a969-74b4046ebd53", "Breeze"],
  ["224b0a95-48b9-f703-1bd8-67aca101a61f", "Abyss"],
  ["2fe4ed3a-450a-948b-6d6b-e89a78e680a9", "Lotus"],
  ["92584fbe-486a-b1b2-9faa-39b0f486b498", "Sunset"],
  ["fd267378-4d1d-484f-ff52-77821ed10dc2", "Pearl"],
  ["756da597-416b-c0f2-f47b-afbdf28670bc", "Summit"],
  ["e2ad5c54-4114-a870-9641-8ea21279579a", "Icebox"],
  ["1c18ab1f-420d-0d8b-71d0-77ad3c439115", "Corrode"],
  ["2bee0dc9-4ffe-519b-1cbd-7fbe763a6047", "Haven"],
];

test("todo mapa jogável tem descrição escrita", () => {
  for (const [uuid, nome] of JOGAVEIS) {
    const ficha = MAPAS_TEXTO[uuid];
    assert.ok(ficha, `falta o texto de ${nome}`);
    assert.equal(ficha.nome, nome, uuid);
    assert.ok(ficha.lugar.length > 3, `${nome} sem lugar`);
    assert.ok(ficha.texto.length > 120, `${nome} com texto curto demais`);
  }
});

/** O resto da grade da home: fora da fila competitiva, sem site de spike. */
const FORA_DA_FILA = [
  ["690b3ed2-4dff-945b-8223-6da834e30d24", "District"],
  ["12452a9d-48c3-0b02-e7eb-0381c3520404", "Kasbah"],
  ["de28aa9b-4cbe-1003-320e-6cb3ec309557", "Piazza"],
  ["2c09d728-42d5-30d8-43dc-96a05cc7ee9d", "Drift"],
  ["d6336a5a-428f-c591-98db-c8a291159134", "Glitch"],
  ["dd3a1cd9-41b1-50ea-3bd6-a7bb3c5978bd", "Contenda"],
  ["1f10dab3-4294-3827-fa35-c2aa00213cf3", "Treinamento Básico"],
  [DUELO, "Duelo A/B/C/D/E"],
];

test("todo mapa da grade tem descrição, inclusive os de fora da fila", () => {
  for (const [uuid, nome] of FORA_DA_FILA) {
    const ficha = MAPAS_TEXTO[uuid];
    assert.ok(ficha, `falta o texto de ${nome}`);
    assert.equal(ficha.nome, nome, uuid);
    assert.ok(ficha.modo, `${nome} sem modo`);
    assert.ok(ficha.texto.length > 120, `${nome} com texto curto demais`);
  }
});

test("não sobra texto de mapa que não existe mais", () => {
  assert.equal(Object.keys(MAPAS_TEXTO).length, JOGAVEIS.length + FORA_DA_FILA.length);
});

test("a linha fina mostra os sites, e o modo quando não há sites", () => {
  const ascent = { uuid: JOGAVEIS[0][0], tacticalDescription: "Pontos A/B" };
  assert.equal(metaDoMapa(ascent), "Veneza, Itália · Pontos A/B");
  // Mapa fora da fila não tem site: a Riot deixa o campo vazio.
  assert.equal(metaDoMapa({ uuid: "2c09d728-42d5-30d8-43dc-96a05cc7ee9d" }),
    "Mediterrâneo · Mata-mata por Equipes");
  assert.equal(metaDoMapa(null), "");
});

test("as cinco arenas de duelo viram um cartão só, no lugar da primeira", () => {
  const mapas = [
    { uuid: "antes", displayName: "Ascent" },
    ...UUIDS_DUELO.map((uuid, i) => ({ uuid, displayName: `Duelo ${"ABCDE"[i]}`, splash: `s${i}` })),
    { uuid: "depois", displayName: "Haven" },
  ];
  const junto = juntarDuelos(mapas);
  assert.deepEqual(junto.map((m) => m.uuid), ["antes", DUELO, "depois"]);
  assert.equal(junto[1].displayName, "Duelo A/B/C/D/E");
  assert.equal(junto[1].splash, "s0", "leva a arte da primeira arena");
  assert.equal(junto[1].coordinates, "", "nenhuma das cinco é a coordenada do conjunto");
});

test("juntar duelos não mexe na lista quando não há duelos", () => {
  const mapas = [{ uuid: "a" }, { uuid: "b" }];
  assert.deepEqual(juntarDuelos(mapas), mapas);
  assert.notEqual(juntarDuelos(mapas), mapas, "devolve uma lista nova");
  assert.deepEqual(juntarDuelos([]), []);
  assert.deepEqual(juntarDuelos(), []);
});

test("a nossa descrição ganha da da Riot", () => {
  const ascent = {
    uuid: "7eaecc1b-4337-bbf6-6ab9-04b8f06b3319",
    tacticalDescription: "Pontos A/B",
    narrativeDescription: "",
  };
  assert.equal(descricaoDoMapa(ascent), MAPAS_TEXTO[ascent.uuid].texto);
  assert.equal(lugarDoMapa(ascent), "Veneza, Itália");
});

test("mapa sem texto nosso cai no que a Riot tiver, e sem nada não quebra", () => {
  // Um mapa novo entra na base da Riot antes de nós escrevermos sobre ele.
  assert.equal(descricaoDoMapa({ uuid: "novo", tacticalDescription: "Pontos A/B" }), "Pontos A/B");
  assert.equal(descricaoDoMapa({ uuid: "novo", narrativeDescription: "Conta a história." }), "Conta a história.");
  assert.equal(descricaoDoMapa({ uuid: "novo" }), "");
  assert.equal(descricaoDoMapa(null), "");
  assert.equal(lugarDoMapa(null), "");
  assert.equal(lugarDoMapa({ uuid: "novo" }), "");
});
