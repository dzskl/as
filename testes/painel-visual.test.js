/* =========================================================================
   Regressão dos três bugs visuais do painel.

   Nenhum dos três foi pego pelos 76 testes funcionais que existiam: todos
   respondiam "o elemento existe?", e os três bugs eram do tipo "existe, mas
   está errado na tela". Daí duas camadas:

   ESTÁTICA (sem dependência, roda sempre) — vai atrás da CAUSA no CSS. É a
   camada que roda em qualquer máquina e em qualquer CI.

   NAVEGADOR (opcional) — mede a geometria real. Só roda se o Playwright
   estiver disponível no ambiente; se não estiver, é anunciada como pulada e
   não reprova a suíte. O projeto não tem dependências, e não vale trocar
   isso por um teste que a camada estática já cobre na origem.
   ========================================================================= */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAINEL = readFileSync(new URL('../painel.html', import.meta.url), 'utf8');
const CSS = PAINEL.slice(PAINEL.indexOf('<style>') + 7, PAINEL.indexOf('</style>'));

let passou = 0, falhou = 0, pulados = 0;
async function teste(nome, fn) {
  try { await fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}

/* Divide o CSS em { seletor, corpo }, ignorando o interior de @media. */
function regras(css) {
  const limpo = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const saida = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(limpo))) saida.push({ seletor: m[1].trim(), corpo: m[2] });
  return saida;
}
const REGRAS = regras(CSS);
const declara = (corpo, prop) => new RegExp(`(^|[;\\s])${prop}\\s*:`).test(corpo);

console.log('\nPainel — regressão dos bugs visuais\n');
console.log('  · camada estática (CSS)');

/* ── BUG 1 ────────────────────────────────────────────────────────────────
   As colunas do gráfico usavam class="barra", mesmo nome da barra superior
   do layout, que declara height:58px. Em SVG2 a propriedade CSS height vence
   o atributo do elemento: todas as colunas viravam blocos de 58px. */
await teste('classe usada em marca SVG não recebe height/width de outra regra', () => {
  /* Só interessam as classes aplicadas a FORMAS dentro do SVG (rect, circle,
     line...). Definir width/height no elemento <svg> raiz é legítimo — o que
     achata a marca é a propriedade CSS chegar na forma, onde vence o
     atributo geométrico. */
  const classes = new Set();

  for (const [, atributo] of PAINEL.matchAll(
      /<(?:rect|circle|line|polyline|polygon|ellipse)\b[^>]*?class="([^"]*)"/g)) {
    /* class="${expressao}" é resolvido pelo teste seguinte. */
    if (atributo.includes('${')) continue;
    atributo.split(/\s+/).filter(Boolean).forEach(c => classes.add(c));
  }
  /* Classes que a montagem do gráfico decide em tempo de execução. */
  for (const [, a, b] of PAINEL.matchAll(/\?\s*'([\w -]+)'\s*:\s*'([\w -]+)'/g)) {
    if (/col|barra|marca/.test(a + b)) [a, b].forEach(v => v.split(/\s+/).forEach(c => classes.add(c)));
  }

  assert.ok(classes.size > 0, 'esperava encontrar classes aplicadas a formas SVG');

  const colisoes = [];
  for (const classe of classes) {
    for (const r of REGRAS) {
      /* Só a regra que mira a própria classe; ".x svg" mira um descendente. */
      const miraAClasse = new RegExp(`\\.${classe}(?![\\w-])\\s*(?:,|$)`).test(r.seletor.trim());
      if (!miraAClasse) continue;
      if (declara(r.corpo, 'height') || declara(r.corpo, 'width')) {
        colisoes.push(`.${classe} recebe height/width em "${r.seletor.trim().slice(0, 50)}"`);
      }
    }
  }
  assert.deepEqual(colisoes, [],
    'em SVG2 a propriedade CSS vence o atributo geométrico e achata a marca:\n     ' + colisoes.join('\n     '));
});

await teste('as colunas do gráfico têm nome próprio, distinto da barra do layout', () => {
  const classeDasColunas = PAINEL.match(/const classe = d\.receitaCentavos > 0 \? '([\w-]+)'/);
  assert.ok(classeDasColunas, 'não encontrei a atribuição de classe das colunas');
  const nome = classeDasColunas[1];
  const regraLayout = REGRAS.find(r => r.seletor === '.' + nome && declara(r.corpo, 'height'));
  assert.equal(regraLayout, undefined, `a classe .${nome} das colunas também define height no layout`);
});

/* ── BUG 2 ────────────────────────────────────────────────────────────────
   thead th era position:sticky com top:58px, dentro de um invólucro .tabela
   com overflow-x. O overflow torna o invólucro contexto de rolagem, então o
   cabeçalho grudava a 58px do topo DELE — cobrindo as primeiras linhas. */
await teste('cabeçalho de tabela não é sticky dentro de invólucro com overflow', () => {
  const thSticky = REGRAS.filter(r => /\bth\b/.test(r.seletor) && /position\s*:\s*sticky/.test(r.corpo));
  const involucroComOverflow = REGRAS.filter(r => /\.tabela|\.rolagem/.test(r.seletor) && declara(r.corpo, 'overflow-x'));
  assert.ok(involucroComOverflow.length > 0, 'esperava o invólucro de rolagem das tabelas');
  assert.deepEqual(thSticky.map(r => r.seletor), [],
    'sticky dentro de invólucro com overflow gruda no topo do invólucro, não da janela');
});

/* ── BUG 3 ────────────────────────────────────────────────────────────────
   No celular o menu saía da tela por translateX, mas continuava no fluxo de
   foco: o Tab levava para botões invisíveis. Deslocar não é esconder. */
await teste('menu lateral fechado sai do fluxo de foco, não só da vista', () => {
  const fechado = REGRAS.find(r => /^aside$/.test(r.seletor.trim()) && /translateX\(-100%\)/.test(r.corpo));
  assert.ok(fechado, 'não encontrei a regra que tira o menu da tela no celular');
  assert.ok(
    declara(fechado.corpo, 'visibility') || declara(fechado.corpo, 'display'),
    'translateX tira da vista mas mantém o foco alcançável pelo Tab; falta visibility/display'
  );
  const aberto = REGRAS.find(r => /aside\[data-aberto="true"\]/.test(r.seletor));
  assert.ok(aberto && /visibility\s*:\s*visible/.test(aberto.corpo),
    'o estado aberto precisa devolver a visibilidade, senão o menu abre invisível');
});

/* ── Camada de navegador ───────────────────────────────────────────────── */
console.log('\n  · camada de navegador (geometria real)');

let chromium = null;
for (const caminho of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(caminho)); break; } catch { /* tenta o próximo */ }
}

if (!chromium) {
  console.log('  ⤼ pulada: Playwright não disponível neste ambiente (a camada estática cobre a causa)');
  pulados = 3;
} else {
  process.env.GATEWAY_MODO = 'simulado';
  process.env.SEGREDO_APP = 'segredo-visual';
  process.env.PAINEL_ADMIN_EMAIL = 'visual@teste.com';
  process.env.PAINEL_ADMIN_SENHA = 'senhavisual1';

  const { criarServidor } = await import('./servidor-local.js');
  const servidor = criarServidor();
  await new Promise(r => servidor.listen(0, r));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  /* Um pedido pago dá altura real a uma coluna do gráfico. */
  const cliente = { nome:'Teste Visual', email:'t@v.com', cpf:'52998224725', telefone:'11999998888' };
  const pedido = await (await fetch(base + '/api/criar-pagamento', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ produtoId:'bot-24h', metodo:'pix', cliente })
  })).json();
  await fetch(base + '/api/webhook', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ reference_id: pedido.pedidoId, status:'paid' })
  });

  const navegador = await chromium.launch();
  const abrirPainel = async (viewport, extras = {}) => {
    const pagina = await navegador.newPage({ viewport, reducedMotion:'reduce', ...extras });
    await pagina.route('**fonts.g*', r => r.abort());
    await pagina.goto(base + '/painel.html', { waitUntil:'domcontentloaded' });
    await pagina.fill('#email', 'visual@teste.com');
    await pagina.fill('#senha', 'senhavisual1');
    await pagina.click('#btn-entrar');
    await pagina.waitForSelector('#kpis .kpi .val', { timeout: 10000 });
    return pagina;
  };

  const p = await abrirPainel({ width: 1440, height: 1000 });

  await teste('coluna do gráfico tem na tela a altura que o dado manda', async () => {
    await p.waitForSelector('#grafico rect', { timeout: 8000 });
    const medida = await p.evaluate(() => {
      const svg = document.querySelector('#grafico svg');
      const escala = svg.getBoundingClientRect().height / svg.viewBox.baseVal.height;
      const cheia = [...document.querySelectorAll('#grafico rect')]
        .sort((a, b) => Number(b.getAttribute('height')) - Number(a.getAttribute('height')))[0];
      return {
        atributo: Number(cheia.getAttribute('height')),
        naTela: cheia.getBoundingClientRect().height,
        escala
      };
    });
    const esperado = medida.atributo * medida.escala;
    assert.ok(Math.abs(medida.naTela - esperado) < 4,
      `altura na tela (${medida.naTela.toFixed(1)}px) não corresponde ao atributo ` +
      `(${medida.atributo} × escala ${medida.escala.toFixed(2)} = ${esperado.toFixed(1)}px) — ` +
      'sinal de regra CSS sobrescrevendo a geometria');
  });

  await teste('cabeçalho de tabela não cobre a primeira linha', async () => {
    await p.click('[data-aba="pedidos"]');
    await p.waitForSelector('#tabela-pedidos tbody tr', { timeout: 8000 });
    const r = await p.evaluate(() => {
      const th = document.querySelector('#tabela-pedidos thead th');
      const td = document.querySelector('#tabela-pedidos tbody td');
      return { fimDoCabecalho: th.getBoundingClientRect().bottom, inicioDaLinha: td.getBoundingClientRect().top };
    });
    assert.ok(r.fimDoCabecalho <= r.inicioDaLinha + 1,
      `o cabeçalho termina em ${r.fimDoCabecalho.toFixed(0)}px e a primeira linha começa em ` +
      `${r.inicioDaLinha.toFixed(0)}px — está por cima`);
  });

  await teste('menu fechado no celular não recebe foco pelo teclado', async () => {
    const m = await abrirPainel({ width: 390, height: 844 }, { isMobile: true, hasTouch: true });
    const alcancavel = await m.evaluate(() => {
      /* Um elemento com visibility:hidden ou display:none sai do fluxo de
         foco; translateX sozinho, não. */
      const botoes = [...document.querySelectorAll('#menu button')];
      return botoes.some(b => {
        const est = getComputedStyle(b);
        const pai = getComputedStyle(document.querySelector('#lateral'));
        return est.visibility !== 'hidden' && pai.visibility !== 'hidden'
            && est.display !== 'none' && pai.display !== 'none';
      });
    });
    assert.equal(alcancavel, false, 'com o menu fechado, os botões continuam focáveis pelo Tab');

    await m.click('#btn-menu');
    await m.waitForTimeout(350);
    assert.equal(await m.isVisible('#menu button'), true, 'o menu precisa aparecer ao ser aberto');
    await m.close();
  });

  await navegador.close();
  servidor.close();
}

console.log(`\n  ${passou} passaram, ${falhou} falharam${pulados ? `, ${pulados} puladas` : ''}\n`);
process.exit(falhou ? 1 : 0);
