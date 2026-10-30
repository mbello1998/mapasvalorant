import test from "node:test";
import assert from "node:assert/strict";
import { normalizarPonto, lerPontos, LIMITE_PONTOS, novoId } from "../netlify/lib/tatica.mts";

const MAPAS = new Set(["uuid-ascent"]);
const base = {
  mapa: "uuid-ascent", agente: "uuid-clove", habilidade: "Grenade",
  lado: "defesa", tipo: "pixel", de: { x: 0.4, y: 0.6 }, para: { x: 0.3, y: 0.2 },
  titulo: "Smoke do meio", texto: "Encoste na caixa e solte.",
};

const erro = (r: ReturnType<typeof normalizarPonto>) => (r.ok ? null : r.erro);

test("aceita um ponto completo e devolve conferido false por padrão", () => {
  const r = normalizarPonto(base, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.ponto.conferido, false);
    assert.equal(r.ponto.titulo, "Smoke do meio");
    assert.deepEqual(r.ponto.para, { x: 0.3, y: 0.2 });
  }
});

test("recusa mapa que não está em mapasValidos", () => {
  assert.equal(erro(normalizarPonto({ ...base, mapa: "uuid-bind" }, MAPAS)), "Mapa desconhecido.");
});

test("recusa lado e tipo fora da lista", () => {
  assert.equal(normalizarPonto({ ...base, lado: "meio" }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, tipo: "linha" }, MAPAS).ok, false);
});

test("recusa coordenada fora de 0 a 1", () => {
  assert.equal(erro(normalizarPonto({ ...base, de: { x: 1.4, y: 0.5 } }, MAPAS)), "Coordenada fora do mapa.");
  assert.equal(erro(normalizarPonto({ ...base, de: { x: 0.5, y: -0.1 } }, MAPAS)), "Coordenada fora do mapa.");
});

test("recusa pixel sem para", () => {
  const { para, ...semPara } = base;
  assert.equal(erro(normalizarPonto(semPara, MAPAS)), "Um pixel precisa de onde a util cai.");
});

test("aceita posição sem para e grava null", () => {
  const { para, ...semPara } = base;
  const r = normalizarPonto({ ...semPara, tipo: "posicao" }, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.ponto.para, null);
});

test("recusa título com 81 caracteres e texto com 601", () => {
  assert.equal(normalizarPonto({ ...base, titulo: "a".repeat(80) }, MAPAS).ok, true);
  assert.equal(normalizarPonto({ ...base, titulo: "a".repeat(81) }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, texto: "a".repeat(600) }, MAPAS).ok, true);
  assert.equal(normalizarPonto({ ...base, texto: "a".repeat(601) }, MAPAS).ok, false);
});

test("recusa marcação no título e no texto", () => {
  assert.equal(erro(normalizarPonto({ ...base, titulo: "<script>alert(1)</script>" }, MAPAS)), "Nada de marcação no texto.");
  assert.equal(erro(normalizarPonto({ ...base, texto: "veja <b>isto</b>" }, MAPAS)), "Nada de marcação no texto.");
});

test("video só aceita link do YouTube", () => {
  assert.equal(normalizarPonto({ ...base, video: "https://exemplo.com/v" }, MAPAS).ok, false);
  const r = normalizarPonto({ ...base, video: "https://www.youtube.com/watch?v=abc123" }, MAPAS);
  assert.equal(r.ok, true);
  assert.equal(normalizarPonto({ ...base, video: "https://www.youtube.com/watch?v=abc" }, MAPAS).ok, false);
});

test("imagens só aceita caminho de /api/media/", () => {
  assert.equal(normalizarPonto({ ...base, imagens: ["https://outrosite.com/a.png"] }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, imagens: ["/api/media/x.webp"] }, MAPAS).ok, true);
});

test("recusa mais de três imagens", () => {
  const quatro = ["/api/media/a.webp", "/api/media/b.webp", "/api/media/c.webp", "/api/media/d.webp"];
  assert.equal(erro(normalizarPonto({ ...base, imagens: quatro }, MAPAS)), "No máximo três imagens por ponto.");
});

test("imagens ausente vira lista vazia", () => {
  const r = normalizarPonto(base, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.ponto.imagens, []);
});

test("novoId e LIMITE_PONTOS", () => {
  assert.match(novoId(), /^p_[0-9a-f]{8}$/);
  assert.equal(LIMITE_PONTOS, 2000);
});

test("posição sem agente nem habilidade é aceita e grava os dois como null", () => {
  const { para, ...semPara } = base;
  for (const vazio of [null, "", undefined]) {
    const r = normalizarPonto({ ...semPara, tipo: "posicao", agente: vazio, habilidade: vazio }, MAPAS);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.ponto.agente, null);
      assert.equal(r.ponto.habilidade, null);
    }
  }
  const ausentes = { ...semPara, tipo: "posicao" } as Record<string, unknown>;
  delete ausentes.agente;
  delete ausentes.habilidade;
  const r = normalizarPonto(ausentes, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.ponto.agente, null);
});

test("ponto com agente e sem habilidade é aceito", () => {
  const r = normalizarPonto({ ...base, habilidade: null }, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.ponto.agente, "uuid-clove");
    assert.equal(r.ponto.habilidade, null);
  }
});

test("agente e habilidade com marcação continuam recusados", () => {
  assert.equal(normalizarPonto({ ...base, agente: "<b>x</b>" }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, habilidade: "<i>" }, MAPAS).ok, false);
});

test("video com lixo depois do id é recusado e com &t=30s é aceito", () => {
  const lixo = "https://youtu.be/abcdef\"><img src=x onerror=alert(1)>";
  assert.equal(normalizarPonto({ ...base, video: lixo }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, video: "https://www.youtube.com/watch?v=abcdef123&x\"y" }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, video: "https://www.youtube.com/watch?v=abcdef12345&t=30s" }, MAPAS).ok, true);
  assert.equal(normalizarPonto({ ...base, video: "https://youtu.be/abcdef12345?t=30" }, MAPAS).ok, true);
});

test("recusa para fora da faixa", () => {
  assert.equal(erro(normalizarPonto({ ...base, para: { x: 1.4, y: 0.5 } }, MAPAS)), "Coordenada fora do mapa.");
});

test("posição ignora o para enviado e grava null", () => {
  const r = normalizarPonto({ ...base, tipo: "posicao" }, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.ponto.para, null);
});

test("agente e habilidade longos demais são recusados, não cortados", () => {
  assert.equal(normalizarPonto({ ...base, agente: "a".repeat(64) }, MAPAS).ok, true);
  assert.equal(normalizarPonto({ ...base, agente: "a".repeat(65) }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, habilidade: "a".repeat(60) }, MAPAS).ok, true);
  assert.equal(normalizarPonto({ ...base, habilidade: "a".repeat(61) }, MAPAS).ok, false);
});

test("imagens com .. no caminho são recusadas", () => {
  assert.equal(normalizarPonto({ ...base, imagens: ["/api/media/.."] }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, imagens: ["/api/media/a..b.webp"] }, MAPAS).ok, false);
});

test("imagens gravadas são cópia do array de quem chamou", () => {
  const entrada = ["/api/media/x.webp"];
  const r = normalizarPonto({ ...base, imagens: entrada }, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.notEqual(r.ponto.imagens, entrada);
    entrada.push("/api/media/y.webp");
    assert.equal(r.ponto.imagens.length, 1);
  }
});

// lerPontos: o depósito pode estar vazio, corrompido ou ter mudado de formato.
// Nada disso pode virar 500 na página pública.
const gravado = {
  id: "p_abc12345", mapa: "uuid-ascent", agente: null, habilidade: null,
  lado: "defesa", tipo: "posicao", de: { x: 0.5, y: 0.5 }, para: null,
  titulo: "Spawn", texto: "", imagens: [], video: null, conferido: false,
  criadoEm: "2026-10-30T12:00:00.000Z",
};

test("lerPontos devolve lista vazia para null, objeto e texto", () => {
  assert.deepEqual(lerPontos(null), []);
  assert.deepEqual(lerPontos(undefined), []);
  assert.deepEqual(lerPontos({}), []);
  assert.deepEqual(lerPontos("texto"), []);
});

test("lerPontos devolve lista vazia quando os itens não são objetos", () => {
  assert.deepEqual(lerPontos([1, "a", null, [], true]), []);
});

test("lerPontos devolve os pontos de um array válido", () => {
  assert.deepEqual(lerPontos([gravado]), [gravado]);
});

test("lerPontos descarta só os itens quebrados e sem id", () => {
  assert.deepEqual(lerPontos([null, gravado, { titulo: "sem id" }, 7]), [gravado]);
});
