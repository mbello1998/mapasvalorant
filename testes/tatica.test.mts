import test from "node:test";
import assert from "node:assert/strict";
import { normalizarPonto, lerPontos, LIMITE_PONTOS, novoId, faltamDoAcervo } from "../netlify/lib/tatica.mts";
import { ACERVO } from "../netlify/lib/acervo-tatica.mts";

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

test("aceita fonte https e a guarda sem espaços nas pontas", () => {
  const r = normalizarPonto({ ...base, fonte: "  https://exemplo.com/pagina?a=1  " }, MAPAS);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.ponto.fonte, "https://exemplo.com/pagina?a=1");
});

test("recusa fonte http e fonte javascript", () => {
  const msg = "A fonte precisa ser um endereço https.";
  assert.equal(erro(normalizarPonto({ ...base, fonte: "http://exemplo.com/a" }, MAPAS)), msg);
  assert.equal(erro(normalizarPonto({ ...base, fonte: "javascript:alert(1)" }, MAPAS)), msg);
});

test("recusa fonte com mais de 200 caracteres, e aceita a de exatamente 200", () => {
  const prefixo = "https://exemplo.com/";
  assert.equal(normalizarPonto({ ...base, fonte: prefixo + "a".repeat(200 - prefixo.length) }, MAPAS).ok, true);
  assert.equal(normalizarPonto({ ...base, fonte: prefixo + "a".repeat(201 - prefixo.length) }, MAPAS).ok, false);
});

test("recusa fonte com marcação ou que não é URL", () => {
  assert.equal(normalizarPonto({ ...base, fonte: "https://exemplo.com/<b>" }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, fonte: "https://" }, MAPAS).ok, false);
  assert.equal(normalizarPonto({ ...base, fonte: 42 }, MAPAS).ok, false);
});

test("fonte ausente, null ou vazia grava null", () => {
  for (const fonte of [undefined, null, "", "   "]) {
    const r = normalizarPonto({ ...base, fonte }, MAPAS);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.ponto.fonte, null);
  }
  const r = normalizarPonto(base, MAPAS);
  assert.equal(r.ok && r.ponto.fonte, null);
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

test("lerPontos descarta registro com id mas com `de` quebrado", () => {
  const semDe = { ...gravado, id: "p_semde001", de: undefined };
  const deTexto = { ...gravado, id: "p_detexto1", de: { x: "0.5", y: 0.5 } };
  const deNulo = { ...gravado, id: "p_denulo01", de: null };
  assert.deepEqual(lerPontos([semDe, deTexto, deNulo, gravado]), [gravado]);
});

test("lerPontos exige `para` numérico só quando o tipo é pixel", () => {
  const pixel = { ...gravado, id: "p_pixel001", tipo: "pixel", para: { x: 0.2, y: 0.3 } };
  const pixelSemPara = { ...pixel, id: "p_pixel002", para: null };
  const pixelParaRuim = { ...pixel, id: "p_pixel003", para: { x: 0.2 } };
  assert.deepEqual(lerPontos([pixel, pixelSemPara, pixelParaRuim]), [pixel]);
  // Posição não usa `para`, então um `para` qualquer não a derruba.
  assert.deepEqual(lerPontos([{ ...gravado, para: undefined }]), [{ ...gravado, para: undefined }]);
});

// O acervo é semeado pela rota; um ponto que a própria validação recusa nunca
// apareceria. O conjunto de mapas aqui é o dos mapas que o acervo cita.
const MAPAS_DO_ACERVO = new Set(ACERVO.map((p) => p.mapa));

test("o acervo não está vazio e cobre os 13 mapas jogáveis", () => {
  assert.ok(ACERVO.length > 0);
  assert.equal(MAPAS_DO_ACERVO.size, 13);
});

/**
 * O que a página precisa é que nenhum mapa do seletor abra vazio. Contar
 * posições, e não pontos, é de propósito: sem agente escolhido a página só
 * mostra posições, então um mapa que só tivesse pixels abriria em branco.
 */
test("todo mapa do acervo tem ao menos uma posição, para não abrir vazio", () => {
  for (const mapa of MAPAS_DO_ACERVO) {
    const posicoes = ACERVO.filter((p) => p.mapa === mapa && p.tipo === "posicao");
    assert.ok(posicoes.length > 0, `mapa ${mapa} não tem posição`);
  }
});

/**
 * O slot é o que casa o ponto com a habilidade na API; um slot inventado
 * ("Smoke", "Q") não casaria com nada e o ponto apareceria sem ícone e fora
 * do filtro, sem erro nenhum para avisar. Esta lista é a de /v1/agents.
 */
test("todo pixel do acervo usa um slot de habilidade que existe na API", () => {
  const SLOTS = new Set(["Ability1", "Ability2", "Grenade", "Ultimate", "Passive"]);
  for (const p of ACERVO) {
    if (p.tipo !== "pixel") continue;
    assert.ok(SLOTS.has(p.habilidade!), `${p.titulo}: slot "${p.habilidade}" não existe`);
  }
});

/** Linha de comprimento zero não se vê no mapa e não ensina de onde jogar. */
test("no acervo, pixel sai de um lugar diferente de onde cai", () => {
  for (const p of ACERVO) {
    if (p.tipo !== "pixel") continue;
    assert.ok(p.de.x !== p.para!.x || p.de.y !== p.para!.y, `${p.titulo}: de e para iguais`);
  }
});

test("todo ponto do acervo passa por normalizarPonto sem erro", () => {
  for (const p of ACERVO) {
    const r = normalizarPonto(p, MAPAS_DO_ACERVO);
    assert.equal(r.ok, true, `${p.titulo}: ${r.ok ? "" : r.erro}`);
  }
});

test("nenhum ponto do acervo vem como conferido", () => {
  for (const p of ACERVO) assert.equal(p.conferido, false, p.titulo);
});

test("o acervo não traz imagem nem vídeo de terceiros", () => {
  for (const p of ACERVO) {
    assert.deepEqual(p.imagens, [], p.titulo);
    assert.equal(p.video, null, p.titulo);
  }
});

test("no acervo, pixel tem destino e posição não tem", () => {
  for (const p of ACERVO) {
    if (p.tipo === "pixel") assert.ok(p.para && p.agente && p.habilidade, p.titulo);
    else assert.equal(p.para, null, p.titulo);
  }
});

/* ------------------------------------------- completar o acervo depois de semeado -- */
// O caminho que acrescenta mapas novos a um depósito que já tem pontos. Errado,
// ele duplica o acervo inteiro ou deixa de trazer o que falta, e isso só
// apareceria em produção: a semeadura comum nunca passa por aqui.

const pt = (mapa: string, titulo: string) => ({ mapa, titulo });

test("faltamDoAcervo: depósito vazio pede o acervo inteiro", () => {
  const acervo = [pt("a", "um"), pt("a", "dois")];
  assert.deepEqual(faltamDoAcervo([], acervo), acervo);
});

test("faltamDoAcervo: depósito que já tem tudo não pede nada", () => {
  const acervo = [pt("a", "um"), pt("b", "dois")];
  assert.deepEqual(faltamDoAcervo([...acervo], acervo), []);
});

test("faltamDoAcervo: pede só o que falta", () => {
  const acervo = [pt("a", "um"), pt("a", "dois"), pt("b", "tres")];
  const guardados = [pt("a", "um")];
  assert.deepEqual(faltamDoAcervo(guardados, acervo).map((p) => p.titulo), ["dois", "tres"]);
});

test("faltamDoAcervo é idempotente: aplicar e repetir não duplica", () => {
  const acervo = [pt("a", "um"), pt("b", "dois")];
  const depois = [...[], ...faltamDoAcervo([], acervo)];
  assert.deepEqual(faltamDoAcervo(depois, acervo), []);
});

test("faltamDoAcervo não se confunde com o que o dono cadastrou", () => {
  // Ponto do dono, que não está no acervo, não impede nem casa com nada.
  const acervo = [pt("a", "um")];
  const doDono = [pt("a", "meu ponto")];
  assert.deepEqual(faltamDoAcervo(doDono, acervo).map((p) => p.titulo), ["um"]);
});

test("faltamDoAcervo trata o mesmo título em mapas diferentes como pontos distintos", () => {
  const acervo = [pt("a", "Entrada do A"), pt("b", "Entrada do A")];
  assert.deepEqual(faltamDoAcervo([pt("a", "Entrada do A")], acervo).map((p) => p.mapa), ["b"]);
});

test("faltamDoAcervo não junta mapa e título ao comparar", () => {
  // Sem separador, "ab" + "c" e "a" + "bc" dariam a mesma chave e um dos dois
  // pontos sumiria sem erro nenhum.
  const acervo = [pt("a", "bc")];
  assert.deepEqual(faltamDoAcervo([pt("ab", "c")], acervo), acervo);
});

test("faltamDoAcervo: o acervo de verdade é idempotente contra ele mesmo", () => {
  assert.deepEqual(faltamDoAcervo(ACERVO, ACERVO), []);
});
