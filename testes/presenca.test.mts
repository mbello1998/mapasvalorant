import test from "node:test";
import assert from "node:assert/strict";
import { guardarPresenca, lembrarPresenca, JANELA_AGORA_MS } from "../public/assets/js/presenca.js";

/** Um cofre de mentira, com o mesmo contrato do localStorage. */
function cofre(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => { dados.set(k, v); },
    removeItem: (k: string) => { dados.delete(k); },
  };
}

const MEIO_DIA = new Date("2026-11-01T12:00:00").getTime();

test("o número lido volta inteiro quando acabou de ser guardado", () => {
  const c = cofre();
  guardarPresenca(c, { online: 7, hoje: 42 }, MEIO_DIA);
  assert.deepEqual(lembrarPresenca(c, MEIO_DIA + 1000), { online: 7, hoje: 42 });
});

test("passados dois minutos, 'agora no site' não vale mais, mas 'hoje' vale", () => {
  // "Agora" é a janela de dois minutos que o servidor conta; mostrar o número
  // de cinco minutos atrás como se fosse agora seria mentir.
  const c = cofre();
  guardarPresenca(c, { online: 7, hoje: 42 }, MEIO_DIA);
  assert.deepEqual(lembrarPresenca(c, MEIO_DIA + JANELA_AGORA_MS + 1), { hoje: 42 });
});

test("no dia seguinte não sobra nada: 'hoje' são as últimas 24 horas", () => {
  const c = cofre();
  guardarPresenca(c, { online: 7, hoje: 42 }, MEIO_DIA);
  const amanha = new Date("2026-11-02T09:00:00").getTime();
  assert.equal(lembrarPresenca(c, amanha), null);
});

test("cofre vazio, sujo ou bloqueado não derruba a abertura", () => {
  assert.equal(lembrarPresenca(cofre(), MEIO_DIA), null);
  assert.equal(lembrarPresenca(cofre({ "estande.presenca.v1": "{{{" }), MEIO_DIA), null);

  const bloqueado = {
    getItem() { throw new Error("bloqueado"); },
    setItem() { throw new Error("bloqueado"); },
    removeItem() {},
  };
  assert.equal(lembrarPresenca(bloqueado, MEIO_DIA), null);
  assert.doesNotThrow(() => guardarPresenca(bloqueado, { online: 1, hoje: 1 }, MEIO_DIA));
});

test("número que não é número não é guardado nem lembrado", () => {
  const c = cofre();
  guardarPresenca(c, { online: null, hoje: undefined }, MEIO_DIA);
  assert.equal(lembrarPresenca(c, MEIO_DIA), null);
});
