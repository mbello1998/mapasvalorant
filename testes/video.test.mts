import test from "node:test";
import assert from "node:assert/strict";
import { enderecoDoPlayer, creditoDoVideo } from "../public/assets/js/video.js";

test("monta o endereço do player do YouTube sem cookie", () => {
  const e = enderecoDoPlayer({ plataforma: "youtube", id: "cPzn6HIrf9g" });
  assert.equal(e, "https://www.youtube-nocookie.com/embed/cPzn6HIrf9g?rel=0");
});

test("monta o endereço do player do TikTok", () => {
  const e = enderecoDoPlayer({ plataforma: "tiktok", id: "7697944201367014657" });
  assert.equal(e, "https://www.tiktok.com/player/v1/7697944201367014657");
});

test("plataforma desconhecida não vira endereço", () => {
  // Sem esta trava, um registro com plataforma errada viraria um <iframe>
  // apontando para sabe-se lá onde.
  for (const p of ["vimeo", "", null, undefined, "javascript"]) {
    assert.equal(enderecoDoPlayer({ plataforma: p as string, id: "cPzn6HIrf9g" }), null, `plataforma ${p}`);
  }
});

test("id fora do formato da plataforma é recusado", () => {
  // O id entra num endereço: aspas, barras e dois-pontos sairiam do caminho
  // previsto. O formato de cada plataforma é estreito, e é o que se exige.
  const ruins = [
    "../../mal", 'x" onload="', "cPzn6HIrf9g/extra", "https://outro.site/v",
    "curto", "", null, undefined,
  ];
  for (const id of ruins) {
    assert.equal(enderecoDoPlayer({ plataforma: "youtube", id: id as string }), null, `youtube ${id}`);
    assert.equal(enderecoDoPlayer({ plataforma: "tiktok", id: id as string }), null, `tiktok ${id}`);
  }
});

test("id do TikTok é só dígito; o do YouTube tem onze caracteres", () => {
  assert.equal(enderecoDoPlayer({ plataforma: "tiktok", id: "cPzn6HIrf9g" }), null);
  assert.equal(enderecoDoPlayer({ plataforma: "youtube", id: "7697944201367014657" }), null);
});

test("sem registro nenhum não há endereço", () => {
  assert.equal(enderecoDoPlayer(), null);
  assert.equal(enderecoDoPlayer(null as unknown as undefined), null);
  assert.equal(enderecoDoPlayer({} as { plataforma: string; id: string }), null);
});

test("o crédito diz o autor e a casa do vídeo", () => {
  assert.equal(
    creditoDoVideo({ plataforma: "youtube", autor: "VALORANT // Brasil" }),
    "VALORANT // Brasil no YouTube",
  );
  assert.equal(
    creditoDoVideo({ plataforma: "tiktok", autor: "@valorantbrasil" }),
    "@valorantbrasil no TikTok",
  );
});

test("crédito sem autor não inventa nome", () => {
  assert.equal(creditoDoVideo({ plataforma: "youtube", autor: "" }), "No YouTube");
  assert.equal(creditoDoVideo({ plataforma: "tiktok" }), "No TikTok");
  assert.equal(creditoDoVideo({ plataforma: "vimeo", autor: "alguém" }), "alguém");
});
