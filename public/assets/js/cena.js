/**
 * A cena do campo: fundo pela foto, o balcão em primeiro plano e a arma em
 * primeira pessoa.
 *
 * Vive separado de `linha.js` porque lá ficou a regra do jogo — cadência,
 * dano, abate — e aqui fica o que é só desenho. A separação também evita o que
 * aconteceu uma vez: uma troca de trecho larga demais levou junto meia dúzia
 * de funções de desenho que estavam no meio do arquivo.
 *
 * Tudo recebe o contexto e as medidas de quem chama; nada aqui guarda estado
 * do jogo.
 */

/** `#16262E` + alfa, sem depender de color-mix dentro do canvas. */
export function corComAlfa(hex, a) {
  const h = String(hex).replace("#", "");
  if (h.length < 6) return `rgba(22,38,46,${a})`;
  return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
}

/** O recuo da arma, compartilhado entre o tiro e o desenho. */
export const recuo = { forca: 0, em: 0 };

/* ------------------------------------------------------------- o fundo --- */

export function fundoDaFoto(ctx, { arte, enquadre, naFoto, larg, alt, paleta, aceso, yDaDistancia }) {
  ctx.drawImage(arte.fundo, enquadre.x, enquadre.y, enquadre.w, enquadre.h);

  // Véu leve: a foto é bonita mas é cheia de detalhe quente, e alvo vermelho
  // em cima de madeira cor de areia some. Com as luzes acesas o véu clareia,
  // com elas apagadas escurece — nos dois casos o alvo volta a saltar.
  const base = aceso ? "#FFFFFF" : "#0B1419";
  const veu = ctx.createLinearGradient(0, 0, 0, alt);
  veu.addColorStop(0, corComAlfa(base, aceso ? 0.3 : 0.42));
  veu.addColorStop(Math.min(0.99, naFoto(0.6) / alt), corComAlfa(base, aceso ? 0.46 : 0.3));
  veu.addColorStop(1, corComAlfa(base, aceso ? 0.22 : 0.5));
  ctx.fillStyle = veu;
  ctx.fillRect(0, 0, larg, alt);

  // Marcas de distância na faixa de chão onde os alvos pousam.
  ctx.save();
  ctx.font = `600 ${Math.max(9, alt * 0.018)}px Barlow, sans-serif`;
  ctx.textAlign = "left";
  for (const metros of [15, 25, 35, 45]) {
    const y = yDaDistancia(metros);
    ctx.strokeStyle = corComAlfa(paleta.latao, 0.3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(larg * 0.08, y);
    ctx.lineTo(larg * 0.92, y);
    ctx.stroke();
    ctx.fillStyle = corComAlfa(paleta.latao, 0.55);
    ctx.fillText(`${metros} m`, larg * 0.035, y + 3);
  }
  ctx.restore();
}

/**
 * O balcão do estande, redesenhado por cima dos bonecos.
 *
 * É a mesma foto, recortada da linha do balcão para baixo e colocada no mesmo
 * lugar. Como entra depois dos bonecos, quem está perto fica com as pernas
 * escondidas atrás dos sacos de areia — e a cena ganha profundidade de
 * verdade, em vez de bonecos colados na frente de um papel de parede.
 */
export function primeiroPlano(ctx, { arte, enquadre, naFoto, balcao, larg, alt, aceso }) {
  if (!enquadre) return;
  const corte = arte.fundo.height * balcao;
  const destY = naFoto(balcao);
  ctx.drawImage(
    arte.fundo,
    0, corte, arte.fundo.width, arte.fundo.height - corte,
    enquadre.x, destY, enquadre.w, enquadre.y + enquadre.h - destY,
  );

  const base = aceso ? "#FFFFFF" : "#0B1419";
  const veu = ctx.createLinearGradient(0, destY, 0, alt);
  veu.addColorStop(0, corComAlfa(base, aceso ? 0.44 : 0.3));
  veu.addColorStop(1, corComAlfa(base, aceso ? 0.22 : 0.5));
  ctx.fillStyle = veu;
  ctx.fillRect(0, destY, larg, alt - destY);
}

/* ---------------------------------------------------------- viewmodel --- */

/** As duas cores do agente, tiradas do gradiente oficial dele. */
export function coresDoAgente(agente) {
  const cs = agente?.backgroundGradientColors;
  if (!Array.isArray(cs) || !cs.length) return ["#2E5361", "#16262E"];
  const conv = (c) => `#${String(c).padEnd(8, "f").slice(0, 6)}`;
  return [conv(cs[0]), conv(cs[2] ?? cs[1] ?? cs[0])];
}

/**
 * A arma na primeira pessoa.
 *
 * Os braços de verdade do VALORANT são modelos 3D do jogo e não existem em
 * lugar nenhum público. O que está aqui é a arte oficial da skin posicionada
 * como quem segura, com antebraço, luva e punho desenhados por cima — a
 * geometria segue a captura em primeira pessoa que serviu de referência, e as
 * cores saem do próprio agente.
 */
export function desenharViewmodel(ctx, { arte, agora, agente, larg, alt, paleta, recarregando }) {
  if (!arte.arma) return;

  const t = (agora - recuo.em) / 110;
  const chute = recuo.forca * Math.max(0, 1 - t) ** 2;
  const bal = Math.sin(agora / 820) * 4;
  const mergulho = recarregando ? alt * 0.22 : 0;

  // Duas restrições ao mesmo tempo: o cabo precisa estar dentro do quadro (se
  // não, o braço nasce fora da tela) e a coronha precisa parar antes da borda
  // direita, que é onde mora o contador de munição.
  const w = Math.min(larg * 0.66, 740);
  const h = (arte.arma.height / arte.arma.width) * w;
  const x = larg - w * 1.03;
  const y = alt - h * 0.78 + chute * 16 + bal + mergulho;

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((-4 + chute * 5 + (recarregando ? 16 : 0)) * Math.PI / 180);
  ctx.translate(-(x + w / 2), -(y + h / 2));

  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  const bocaY = desenharArmaEmFuga(ctx, arte.arma, { x, y, w, h });
  ctx.shadowColor = "transparent";

  // O braço vem depois: a mão segura a arma, então ela passa por cima da
  // coronha. Desenhado antes, sumia atrás da arte da skin.
  desenharBraco(ctx, { x, y, w, h, agente, larg, alt, paleta });
  ctx.restore();

  // Clarão do cano, no instante do tiro.
  if (chute > 0.45) {
    const fx = x + w * 0.03;
    const fy = bocaY;
    const r = 26 + chute * 30;
    const brilho = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
    brilho.addColorStop(0, `rgba(255,232,180,${0.75 * chute})`);
    brilho.addColorStop(0.45, `rgba(255,150,60,${0.35 * chute})`);
    brilho.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = brilho;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Desenha a arma em fuga, apontada para onde se mira.
 *
 * A arte que a Riot publica é um perfil lateral: a arma inteira de lado, do
 * mesmo tamanho da coronha até a boca. Desenhada assim, ela fica deitada na
 * tela em vez de apontada — que é o que se via antes.
 *
 * A correção é fatiar a imagem em tiras verticais e desenhar cada tira menor
 * que a anterior conforme se afasta da coronha, convergindo para o ponto onde
 * se mira. O olho lê isso como profundidade: a coronha perto é grande, a boca
 * longe é pequena, e o cano aponta para os alvos.
 *
 * Devolve a altura da boca do cano, que o clarão do tiro usa.
 */
function desenharArmaEmFuga(ctx, img, { x, y, w, h }) {
  // Uma tira a cada ~3 px de destino. Com tiras grossas o degrau entre uma e
  // outra aparece e a arma vira uma escada — foi o que aconteceu na primeira
  // tentativa, com trinta tiras.
  const tiras = Math.max(40, Math.min(220, Math.round(w / 3)));
  const MENOR = 0.52;            // a boca fica com 52% da altura da coronha

  const larguraFonte = img.width / tiras;
  const centroCoronha = y + h / 2;
  // A subida da boca é medida na própria arma, não na tela: assim o ângulo
  // não muda quando a janela muda de tamanho.
  const alvoY = centroCoronha - h * 1.05;

  const escalaEm = (t) => MENOR + (1 - MENOR) * t;   // t=0 boca, t=1 coronha
  const centroEm = (t) => alvoY + (centroCoronha - alvoY) * t;

  const larguras = [];
  let somaW = 0;
  for (let i = 0; i < tiras; i++) {
    const lw = (w / tiras) * escalaEm(i / (tiras - 1));
    larguras.push(lw);
    somaW += lw;
  }

  // Encaixa o conjunto de modo que a coronha continue onde estava.
  let destX = x + w - somaW;
  for (let i = 0; i < tiras; i++) {
    const t = i / (tiras - 1);
    const altura = h * escalaEm(t);
    const centro = centroEm(t);
    // A tira é desenhada um pouco mais larga do que avança, para fechar a
    // costura com a vizinha.
    ctx.drawImage(
      img,
      i * larguraFonte, 0, larguraFonte + 0.8, img.height,
      destX, centro - altura / 2, larguras[i] + 1.2, altura,
    );
    destX += larguras[i];
  }

  return centroEm(0);
}

/**
 * Antebraço, luva e punho.
 *
 * A forma veio da captura em primeira pessoa: a manga sobe da borda de baixo
 * em diagonal, tem uma faixa clara de acabamento no punho, e a mão fecha no
 * cabo com os dedos aparecendo por cima. A manga usa a cor do agente; a luva
 * é de couro claro, como a da referência.
 */
function desenharBraco(ctx, { x, y, w, h, agente, larg, alt, paleta }) {
  const [c1, c2] = coresDoAgente(agente);

  const punhoX = x + w * 0.72;
  const punhoY = y + h * 0.62;
  const grossura = h * 0.52;

  const cotoveloX = punhoX + grossura * 1.1;
  const cotoveloY = alt + grossura * 0.8;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Antebraço: traço grosso de ponta redonda, do canto de baixo até o cabo.
  const g = ctx.createLinearGradient(punhoX, punhoY, cotoveloX, cotoveloY);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.strokeStyle = g;
  ctx.lineWidth = grossura * 0.58;
  ctx.beginPath();
  ctx.moveTo(cotoveloX, cotoveloY);
  ctx.lineTo(punhoX, punhoY);
  ctx.stroke();

  // Vinco de luz na borda de cima, para o braço ganhar volume.
  ctx.strokeStyle = corComAlfa(paleta.luz, 0.16);
  ctx.lineWidth = grossura * 0.1;
  ctx.beginPath();
  ctx.moveTo(cotoveloX - grossura * 0.2, cotoveloY - grossura * 0.22);
  ctx.lineTo(punhoX - grossura * 0.12, punhoY - grossura * 0.2);
  ctx.stroke();

  // Faixa de acabamento do punho, como a da captura.
  ctx.strokeStyle = corComAlfa("#7FE3DA", 0.75);
  ctx.lineWidth = grossura * 0.11;
  ctx.beginPath();
  ctx.moveTo(punhoX + grossura * 0.36, punhoY + grossura * 0.2);
  ctx.lineTo(punhoX + grossura * 0.52, punhoY - grossura * 0.18);
  ctx.stroke();

  // A mão fechada no cabo — couro claro, não a cor do agente.
  const luva = ctx.createLinearGradient(
    punhoX - grossura * 0.3, punhoY - grossura * 0.3,
    punhoX + grossura * 0.3, punhoY + grossura * 0.3,
  );
  luva.addColorStop(0, "#C79A78");
  luva.addColorStop(1, "#8A6246");
  ctx.fillStyle = luva;
  ctx.beginPath();
  ctx.ellipse(punhoX, punhoY, grossura * 0.37, grossura * 0.31, -0.35, 0, Math.PI * 2);
  ctx.fill();

  // Dedos: três sulcos curtos sobre a mão.
  ctx.strokeStyle = corComAlfa("#000000", 0.32);
  ctx.lineWidth = Math.max(2, grossura * 0.06);
  for (let i = 0; i < 3; i++) {
    const a = -0.95 + i * 0.44;
    ctx.beginPath();
    ctx.moveTo(punhoX + Math.cos(a) * grossura * 0.08, punhoY + Math.sin(a) * grossura * 0.08);
    ctx.lineTo(punhoX + Math.cos(a) * grossura * 0.33, punhoY + Math.sin(a) * grossura * 0.33);
    ctx.stroke();
  }

  // Polegar por cima da coronha.
  ctx.fillStyle = "#B4885F";
  ctx.beginPath();
  ctx.ellipse(punhoX - grossura * 0.2, punhoY - grossura * 0.22, grossura * 0.17, grossura * 0.1, -0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
