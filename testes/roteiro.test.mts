import test from "node:test";
import assert from "node:assert/strict";
import {
  TELAS, telaDoHref, podeTrocar, telaInicial, precisaDesviar, telaDoEstado, lerMarca, enderecoLimpo,
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

test("a marca de tela é lida e apagada, e some sem sessionStorage", () => {
  const cofre = new Map<string, string>([["rota.tela", "mapas"]]);
  const fingido = {
    getItem: (k: string) => cofre.get(k) ?? null,
    removeItem: (k: string) => { cofre.delete(k); },
  };
  assert.equal(lerMarca(fingido), "mapas");
  assert.equal(lerMarca(fingido), null, "a marca é de uma viagem só");

  const quebrado = { getItem() { throw new Error("bloqueado"); }, removeItem() {} };
  assert.equal(lerMarca(quebrado), null);
});

test("a barra de endereço fica só com a raiz: sem index.html e sem âncora", () => {
  assert.equal(enderecoLimpo("/", ""), null, "já está limpo, nada a trocar");
  assert.equal(enderecoLimpo("/index.html", ""), "/");
  assert.equal(enderecoLimpo("/", "#estande"), "/");
  assert.equal(enderecoLimpo("/index.html", "#agentes"), "/");
});

test("âncora escrita como #lugar é da tela atual, seja qual for a tela", () => {
  // Dentro da casca o endereço é sempre "/", então um href "#catalogo" resolve
  // para a raiz e parecia um link para o Estande: o link de pular levava para
  // fora da tela em que a pessoa estava.
  for (const tela of ["arsenal", "linha", "mapas", "ranking", "estande"]) {
    assert.equal(
      podeTrocar(clique({ hrefCru: "#catalogo", href: `${ORIGEM}/#catalogo`, telaAtual: tela })),
      false,
      tela,
    );
  }
});

test("link escrito com arquivo continua trocando de tela", () => {
  // O trilho escreve "index.html#estande" quando não se está no Estande.
  assert.equal(
    podeTrocar(clique({ hrefCru: "index.html#estande", href: `${ORIGEM}/index.html#estande`, telaAtual: "arsenal" })),
    true,
  );
});

test("endereço limpo é a mesma tela que o arquivo .html", () => {
  // A Netlify reescreve os links do HTML publicado: `linha.html` chega no
  // navegador como `/linha`. Sem reconhecer essa forma, os três portais da
  // página inicial saíam da página em vez de trocar de tela.
  assert.equal(telaDoHref(`${ORIGEM}/linha`, ORIGEM), "linha");
  assert.equal(telaDoHref(`${ORIGEM}/arsenal`, ORIGEM), "arsenal");
  assert.equal(telaDoHref(`${ORIGEM}/mapas/`, ORIGEM), "mapas");
  assert.equal(telaDoHref(`${ORIGEM}/ranking#tabela`, ORIGEM), "ranking");
  assert.equal(telaDoHref(`${ORIGEM}/index`, ORIGEM), "estande");
  assert.equal(telaDoHref(`${ORIGEM}/admin`, ORIGEM), null, "o Painel não é tela");
});

test("clique em portal de endereço limpo troca de tela", () => {
  assert.equal(podeTrocar(clique({ hrefCru: "/linha", href: `${ORIGEM}/linha` })), true);
});

test("a marca do trilho volta para o Estande de qualquer tela", () => {
  // O trilho é da casca e não é trocado: o link da marca vale em toda tela.
  for (const cru of ["index.html", "/"]) {
    for (const tela of ["linha", "arsenal", "mapas", "ranking"]) {
      assert.equal(
        podeTrocar(clique({ hrefCru: cru, href: new URL(cru, ORIGEM).href, telaAtual: tela })),
        true,
        `${cru} em ${tela}`,
      );
    }
    // No próprio Estande não há troca: quem cuida da rolagem até o topo é o
    // roteiro, no segundo ramo do clique.
    assert.equal(
      podeTrocar(clique({ hrefCru: cru, href: new URL(cru, ORIGEM).href, telaAtual: "estande" })),
      false,
      cru,
    );
  }
});

test("desvia para a raiz também quem chegou por endereço limpo", () => {
  assert.equal(precisaDesviar("/linha"), true);
  assert.equal(precisaDesviar("/mapas/"), true);
  assert.equal(precisaDesviar("/index"), false);
  assert.equal(precisaDesviar("/admin"), false);
});
