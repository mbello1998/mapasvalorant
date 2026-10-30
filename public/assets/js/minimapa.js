/**
 * Matemática do minimapa: coordenada de mundo do VALORANT para posição na imagem.
 *
 * Este arquivo é importado pelo Node nos testes, então o topo dele não pode
 * tocar em `document` nem em `window`. Funções que desenham no DOM ficam mais
 * abaixo, separadas, e só mexem na página quando são chamadas.
 */

/**
 * Converte uma posição do mundo em fração (0 a 1) da largura e da altura do
 * minimapa. Os eixos trocam de lugar de propósito: a imagem do minimapa é a
 * vista de cima girada em relação ao mundo, então o `y` do jogo corre na
 * horizontal e o `x` na vertical. Guardamos fração, e não pixel, para a
 * posição valer em qualquer tamanho de tela.
 */
export function paraMinimapa(local, mapa) {
  return {
    x: local.y * mapa.xMultiplier + mapa.xScalarToAdd,
    y: local.x * mapa.yMultiplier + mapa.yScalarToAdd,
  };
}

const dentroDoQuadro = (v) => v >= 0 && v <= 1;

/**
 * Os callouts oficiais de um mapa já na posição do minimapa. Mapa sem callouts
 * (os de modo especial, por exemplo) devolve lista vazia em vez de quebrar a
 * página. O que cai fora do quadro é descartado: a API traz pontos de região
 * que não existem na imagem, e desenhá-los jogaria rótulos para fora do mapa.
 */
export function calloutsDoMapa(mapa) {
  return (mapa.callouts ?? [])
    .map((c) => ({
      nome: c.regionName,
      regiao: c.superRegionName,
      ...paraMinimapa(c.location, mapa),
    }))
    .filter((c) => dentroDoQuadro(c.x) && dentroDoQuadro(c.y));
}
