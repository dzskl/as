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

const { EMPRESA, DERIVADOS, VALORES_DE_EXEMPLO, pendencias } = await import('../conteudo/empresa.js');

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

await teste('toda marcação aponta para um campo que existe', () => {
  const disponiveis = { ...EMPRESA, ...DERIVADOS };
  const invalidas = [];
  for (const pagina of PAGINAS) {
    const html = ler(pagina);
    for (const [, campo] of html.matchAll(/data-empresa(?:-href|-content)?="([^"]+)"/g)) {
      if (disponiveis[campo] === undefined) invalidas.push(`${pagina}: campo "${campo}" não existe`);
    }
    for (const [, ref] of html.matchAll(/data-depoimento="([^"]+)"/g)) {
      const [i, campo] = ref.split('.');
      if (EMPRESA.depoimentos[Number(i)]?.[campo] === undefined) {
        invalidas.push(`${pagina}: depoimento "${ref}" não existe`);
      }
    }
  }
  assert.deepEqual(invalidas, [], invalidas.join('\n     '));
});

await teste('o HTML mostra hoje exatamente o que a fonte única diz', () => {
  /* Enquanto os dois coincidem, a página renderiza igual com ou sem
     JavaScript. Divergiram, este teste avisa. */
  const divergentes = [];
  for (const pagina of PAGINAS) {
    const html = ler(pagina);
    for (const [trecho, campo] of html.matchAll(/data-empresa="([^"]+)"[^>]*>([^<]*)</g)) {
      void trecho;
    }
    for (const m of html.matchAll(/data-empresa="([^"]+)"[^>]*>([^<]*)</g)) {
      const [, campo, texto] = m;
      const esperado = String({ ...EMPRESA, ...DERIVADOS }[campo] ?? '');
      if (texto.trim() && texto.trim() !== esperado.trim()) {
        divergentes.push(`${pagina}: ${campo} → HTML tem "${texto.trim().slice(0, 40)}", fonte tem "${esperado.slice(0, 40)}"`);
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
