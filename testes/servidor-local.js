/* =========================================================================
   Servidor de desenvolvimento.
   Reproduz localmente o que a Vercel faz em produção: arquivos estáticos na
   raiz e cada arquivo de /api virando um endpoint.

   Uso:  npm run dev     →  http://localhost:3000/checkout.html
   ========================================================================= */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = Number(process.env.PORT) || 3000;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};

export function criarServidor() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://local');

    if (url.pathname.startsWith('/api/')) {
      const nome = url.pathname.slice(5).replace(/\.js$/, '');
      if (!/^[a-z0-9-]+$/i.test(nome)) { res.statusCode = 404; return res.end('não encontrado'); }
      try {
        const modulo = await import(new URL(`../api/${nome}.js`, import.meta.url).href);
        return modulo.default(req, res);
      } catch (e) {
        if (e.code === 'ERR_MODULE_NOT_FOUND') { res.statusCode = 404; return res.end('endpoint não existe'); }
        console.error('[api]', e);
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, erro: 'erro interno' }));
      }
    }

    /* Estático, com proteção contra path traversal (../../etc/passwd) */
    let caminho = normalize(decodeURIComponent(url.pathname));
    if (caminho === '/' || caminho === '') caminho = '/index.html';
    const arquivo = join(RAIZ, caminho);
    if (!arquivo.startsWith(RAIZ)) { res.statusCode = 403; return res.end('proibido'); }

    try {
      const conteudo = await readFile(arquivo);
      res.setHeader('Content-Type', TIPOS[extname(arquivo)] || 'application/octet-stream');
      res.end(conteudo);
    } catch {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<h1>404</h1><p>Arquivo não encontrado.</p>');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  criarServidor().listen(PORTA, () => {
    console.log(`\n  Bot 24h rodando em http://localhost:${PORTA}`);
    console.log(`  Checkout:  http://localhost:${PORTA}/checkout.html`);
    console.log(`  Gateway:   ${process.env.GATEWAY_MODO || 'simulado'}\n`);
  });
}
