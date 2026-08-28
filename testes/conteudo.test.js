/* =========================================================================
   Dados da empresa centralizados.

   Duas garantias:
   1. nenhuma ocorrência de dado de exemplo ficou solta no HTML, sem ligação
      com a fonte única;
   2. editar SÓ conteudo/empresa.js muda as quatro páginas — que é a razão de
      a centralização existir. A segunda parte roda no navegador, porque é
      onde o preenchimento acontece; sem Playwright, é anunciada como pulada.
   ========================================================================= */

import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const PAGINAS = ['index.html', 'obrigado.html', 'termos.html', 'privacidade.html'];
const ler = (arquivo) => readFileSync(new URL('../' + arquivo, import.meta.url), 'utf8');

const { EMPRESA, DERIVADOS, PRODUTO, VALORES_DE_EXEMPLO, pendencias } = await import('../conteudo/empresa.js');

let passou = 0, falhou = 0, pulados = 0;
async function teste(nome, fn) {
  try { await fn(); console.log('  ✅', nome); passou++; }
  catch (e) { console.log('  ❌', nome, '\n     →', e.message); falhou++; }
}

console.log('\nConteúdo da empresa — centralização\n');

await teste('nenhum dado de exemplo ficou solto no HTML', () => {
  const soltos = [];
  for (const pagina of PAGINAS) {
    const html = ler(pagina);
    for (const linha of html.split('\n')) {
      /* O aviso amarelo das páginas legais cita os valores de propósito,
         explicando o que trocar — não é conteúdo a substituir. */
      if (linha.includes('Antes de publicar')) continue;
      for (const exemplo of Object.values(VALORES_DE_EXEMPLO)) {
        if (linha.includes(exemplo) && !linha.includes('data-empresa')) {
          soltos.push(`${pagina}: "${exemplo}" sem ligação com a fonte única`);
        }
      }
    }
  }
  assert.deepEqual(soltos, [], soltos.join('\n     '));
});

await teste('as quatro páginas carregam o preenchedor', () => {
  for (const pagina of PAGINAS) {
    assert.match(ler(pagina), /conteudo\/aplicar\.js/, `${pagina} não carrega conteudo/aplicar.js`);
  }
});

/* Normaliza como o navegador faz ao renderizar: quebra de linha e recuo do
   código-fonte viram um espaço só. Um depoimento escrito em três linhas no
   HTML e em uma linha na fonte é o MESMO texto para quem visita — comparar
   byte a byte acusaria formatação, não divergência de conteúdo. */
const normalizar = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* Mesma união que conteudo/aplicar.js monta para preencher a página. Se as
   duas se separarem, o teste passa a medir algo que o site não usa. */
const TUDO = { ...EMPRESA, ...PRODUTO, ...DERIVADOS };

/* Caminho com ponto, igual ao resolvedor de aplicar.js: "cnpj",
   "passos.1.titulo", "faq.0.resposta". data-depoimento usa a forma curta
   ("0.autor") e por isso resolve a partir da lista de depoimentos. */
const raizDe = (marcador) => (marcador === 'data-depoimento' ? EMPRESA.depoimentos : TUDO);
const fonteDe = (ref, raiz) =>
  ref.split('.').reduce((o, chave) => (o == null ? o : o[chave]), raiz);

await teste('toda marcação aponta para um campo que existe', () => {
  const invalidas = [];
  for (const pagina of PAGINAS) {
    const html = ler(pagina);
    for (const [, ref] of html.matchAll(/data-empresa(?:-href|-content)?="([^"]+)"/g)) {
      if (fonteDe(ref, TUDO) === undefined) invalidas.push(`${pagina}: campo "${ref}" não existe`);
    }
    for (const [, ref] of html.matchAll(/data-depoimento="([^"]+)"/g)) {
      if (fonteDe(ref, EMPRESA.depoimentos) === undefined) {
        invalidas.push(`${pagina}: depoimento "${ref}" não existe`);
      }
    }
  }
  assert.deepEqual(invalidas, [], invalidas.join('\n     '));
});

await teste('elemento marcado não tem markup dentro', () => {
  /* aplicar.js preenche com textContent, que APAGA qualquer filho. Um ícone
     ou um <b> dentro de um elemento marcado some assim que o JavaScript
     roda — e some em silêncio, porque a comparação de divergência pula
     texto vazio. Aconteceu de verdade: um ícone de check dentro do
     data-empresa="heroNota" desaparecia na página renderizada.
     Ícone e ênfase ficam FORA do elemento marcado. */
  const comFilho = [];
  for (const pagina of PAGINAS) {
    const html = ler(pagina);
    const re = /<(\w+)[^>]*\sdata-(?:empresa|depoimento)="([^"]+)"[^>]*>/g;
    for (const m of html.matchAll(re)) {
      const [tagAberta, tag, ref] = m;
      if (/\/>$/.test(tagAberta)) continue;
      const inicio = m.index + tagAberta.length;
      const fim = html.indexOf(`</${tag}>`, inicio);
      if (fim === -1) continue;
      if (html.slice(inicio, fim).includes('<')) {
        comFilho.push(`${pagina}: <${tag} ...="${ref}"> tem markup dentro — o preenchedor vai apagar`);
      }
    }
  }
  assert.deepEqual(comFilho, [], comFilho.join('\n     '));
});

await teste('o HTML mostra hoje exatamente o que a fonte única diz', () => {
  /* Enquanto os dois coincidem, a página renderiza igual com ou sem
     JavaScript. Divergiram, este teste avisa — e é o que impede que, no dia
     em que os dados reais forem preenchidos em conteudo/empresa.js, um
     visitante sem JS ou um crawler continue vendo os valores antigos.

     Cobre os QUATRO marcadores, porque um só não bastaria: os depoimentos
     fictícios vivem em data-depoimento, e og:url/canonical em -content/-href.

     Duas limitações do casamento por regex, e por que seguem sem efeito:
       · o texto para no primeiro "<" interno — o teste acima ('elemento
         marcado não tem markup dentro') garante que não há tag aninhada,
         então não há texto a perder. Ele existe porque essa limitação já
         mordeu: um ícone dentro do marcador sumia na renderização;
       · texto vazio é pulado — nenhum elemento marcado está vazio, e um
         que ficasse vazio seria markup puro, pego pelo teste acima.
     Se um dia for preciso marcar um elemento com filhos, esta comparação
     precisará de um parser de verdade em vez de regex. */
  const divergentes = [];

  /* Mostra o trecho EM VOLTA da primeira diferença, não o começo do texto:
     num depoimento longo que só muda a última frase, imprimir os primeiros
     45 caracteres exibiria os dois lados idênticos e não ajudaria ninguém. */
  const recorte = (a, b) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const de = Math.max(0, i - 12);
    return (de ? '…' : '') + a.slice(de, de + 45) + (de + 45 < a.length ? '…' : '');
  };

  const conferir = (pagina, marcador, ref, achado) => {
    const html = normalizar(achado);
    const fonte = normalizar(fonteDe(ref, raizDe(marcador)));
    if (html !== fonte) {
      divergentes.push(
        `${pagina}: ${marcador}="${ref}" → HTML tem "${recorte(html, fonte)}", ` +
        `fonte tem "${recorte(fonte, html)}"`);
    }
  };

  for (const pagina of PAGINAS) {
    const html = ler(pagina);

    /* --- Marcadores de TEXTO: o conteúdo do elemento ------------------- */
    for (const marcador of ['data-empresa', 'data-depoimento']) {
      const re = new RegExp(`<\\w+[^>]*\\s${marcador}="([^"]+)"[^>]*>([^<]*)<`, 'g');
      for (const [, ref, texto] of html.matchAll(re)) {
        if (!normalizar(texto)) continue;   // limitação documentada acima
        conferir(pagina, marcador, ref, texto);
      }
    }

    /* --- Marcadores de ATRIBUTO: href= e content= da mesma tag ---------
       O espaço antes do nome do atributo é obrigatório no casamento: sem
       ele, `href="` acharia primeiro o próprio `data-empresa-href="` e o
       teste compararia o marcador consigo mesmo, passando sempre. */
    for (const [marcador, alvo] of [['data-empresa-href', 'href'], ['data-empresa-content', 'content']]) {
      const re = new RegExp(`<\\w+[^>]*\\s${marcador}="([^"]+)"[^>]*>`, 'g');
      for (const tag of html.matchAll(re)) {
        const ref = tag[1];
        const achado = new RegExp(`\\s${alvo}="([^"]*)"`).exec(tag[0]);
        if (!achado) {
          divergentes.push(`${pagina}: ${marcador}="${ref}" sem atributo ${alvo}= para preencher`);
          continue;
        }
        conferir(pagina, marcador, ref, achado[1]);
      }
    }
  }
  assert.deepEqual(divergentes, [], divergentes.join('\n     '));
});

await teste('a lista de pendências reflete o estado real do arquivo', () => {
  const { campos, depoimentos } = pendencias();
  assert.equal(campos.length, 8, 'esperava os 8 campos ainda em exemplo');
  assert.equal(depoimentos.length, 3, 'esperava os 3 depoimentos fictícios');
});

/* --- Navegador: a centralização de fato alcança as páginas -------------- */
console.log('\n  · camada de navegador (preenchimento real)');

let chromium = null;
for (const caminho of ['playwright', '/opt/node22/lib/node_modules/playwright/index.mjs']) {
  try { ({ chromium } = await import(caminho)); break; } catch { /* tenta o próximo */ }
}

if (!chromium) {
  console.log('  ⤼ pulada: Playwright não disponível (a camada estática cobre a ligação)');
  pulados = 2;
} else {
  process.env.GATEWAY_MODO = 'simulado';
  const { criarServidor } = await import('./servidor-local.js');
  const servidor = criarServidor();
  await new Promise(r => servidor.listen(0, r));
  const base = `http://127.0.0.1:${servidor.address().port}`;

  const navegador = await chromium.launch();
  const abrir = async (pagina) => {
    const p = await navegador.newPage({ reducedMotion: 'reduce' });
    await p.route('**fonts.g*', r => r.abort());
    await p.goto(base + '/' + pagina, { waitUntil: 'networkidle' });
    return p;
  };

  await teste('a página renderiza os valores da fonte única', async () => {
    const p = await abrir('termos.html');
    const texto = await p.textContent('body');
    assert.ok(texto.includes(EMPRESA.razaoSocial), 'razão social não apareceu');
    assert.ok(texto.includes(EMPRESA.cnpj), 'CNPJ não apareceu');
    assert.ok(texto.includes(EMPRESA.cidadeUF), 'cidade/UF não apareceu');
    const href = await p.getAttribute('a[data-empresa-href="telegramUrl"]', 'href');
    assert.equal(href, DERIVADOS.telegramUrl);
    await p.close();
  });

  await teste('editar só conteudo/empresa.js muda as quatro páginas', async () => {
    const caminho = new URL('../conteudo/empresa.js', import.meta.url);
    const original = readFileSync(caminho, 'utf8');
    try {
      writeFileSync(caminho, original
        .replace("razaoSocial: 'SUA EMPRESA LTDA'", "razaoSocial: 'ACME COMERCIO DIGITAL LTDA'")
        .replace("telegramUsuario: 'seuusuario'", "telegramUsuario: 'acmesuporte'"));

      for (const pagina of PAGINAS) {
        const p = await abrir(pagina);
        /* Conferimos os ELEMENTOS marcados, não o texto da página inteira:
           o aviso das páginas legais cita "SUA EMPRESA LTDA" como instrução
           do que trocar, e essa citação deve mesmo continuar ali. */
        const marcados = await p.$$eval('[data-empresa]', els =>
          els.map(el => ({ campo: el.dataset.empresa, texto: el.textContent.trim() })));
        assert.ok(marcados.length > 0, `${pagina} não tem elemento marcado`);

        for (const { campo, texto } of marcados) {
          if (campo === 'razaoSocial') {
            assert.equal(texto, 'ACME COMERCIO DIGITAL LTDA', `${pagina}: razão social não acompanhou`);
          }
          if (campo === 'rodapeLegal') {
            assert.match(texto, /^ACME COMERCIO DIGITAL LTDA/, `${pagina}: rodapé derivado não acompanhou`);
          }
          assert.ok(!texto.includes('SUA EMPRESA LTDA'),
            `${pagina}: elemento marcado "${campo}" ainda mostra o valor antigo`);
        }

        const links = await p.$$eval('[data-empresa-href="telegramUrl"]', els => els.map(e => e.href));
        for (const href of links) {
          assert.match(href, /acmesuporte/, `${pagina}: link do Telegram não acompanhou`);
        }
        await p.close();
      }
    } finally {
      writeFileSync(caminho, original);
    }
  });

  await navegador.close();
  servidor.close();
}

console.log(`\n  ${passou} passaram, ${falhou} falharam${pulados ? `, ${pulados} puladas` : ''}\n`);
process.exit(falhou ? 1 : 0);
