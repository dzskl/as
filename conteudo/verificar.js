#!/usr/bin/env node
/* =========================================================================
   `npm run conteudo` — lista o que ainda está com dado de exemplo.

   Existe para a resposta ser gerada do código, não de memória: enquanto
   houver campo nesta lista, a página não deve receber tráfego.
   ========================================================================= */

import { pendencias, EMPRESA } from './empresa.js';

const { campos, depoimentos } = pendencias();

console.log('\n  Conteúdo da empresa — conteudo/empresa.js\n');

if (!campos.length && !depoimentos.length) {
  console.log('  ✅ Nenhum dado de exemplo. A página pode receber tráfego.\n');
  process.exit(0);
}

if (campos.length) {
  console.log(`  ${campos.length} campo(s) ainda com valor de exemplo:\n`);
  for (const campo of campos) console.log(`    ✗ ${campo.padEnd(20)} ${EMPRESA[campo]}`);
}

if (depoimentos.length) {
  console.log(`\n  ${depoimentos.length} depoimento(s) fictício(s): ${depoimentos.join(', ')}`);
  console.log('    Depoimento inventado é propaganda enganosa (CDC, art. 37).');
}

console.log('\n  Preencha em conteudo/empresa.js — as quatro páginas se atualizam sozinhas.\n');
process.exit(1);
