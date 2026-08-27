/* =========================================================================
   Preenche as páginas com os dados de conteudo/empresa.js.

   Roda no navegador, em cada página que carrega este arquivo. O HTML mantém
   o valor atual escrito no lugar, então a página renderiza igual sem
   JavaScript — o que vem daqui é a garantia de que editar um arquivo só
   atualiza as quatro páginas de uma vez.

   Três ganchos, todos por atributo:
     data-empresa="campo"          → troca o texto do elemento
     data-empresa-href="campo"     → troca o href
     data-empresa-content="campo"  → troca o content (usado nas meta tags)
   ========================================================================= */

import { EMPRESA, DERIVADOS } from './empresa.js';

const TUDO = { ...EMPRESA, ...DERIVADOS };

function valor(caminho) {
  return caminho.split('.').reduce((o, chave) => (o == null ? o : o[chave]), TUDO);
}

export function aplicar(documento = document) {
  let trocas = 0;

  for (const el of documento.querySelectorAll('[data-empresa]')) {
    const v = valor(el.dataset.empresa);
    if (v == null) continue;
    el.textContent = String(v);
    trocas++;
  }
  for (const el of documento.querySelectorAll('[data-empresa-href]')) {
    const v = valor(el.dataset.empresaHref);
    if (v == null) continue;
    el.setAttribute('href', String(v));
    trocas++;
  }
  for (const el of documento.querySelectorAll('[data-empresa-content]')) {
    const v = valor(el.dataset.empresaContent);
    if (v == null) continue;
    el.setAttribute('content', String(v));
    trocas++;
  }

  /* Depoimentos: lista, então o preenchimento é por índice. */
  for (const el of documento.querySelectorAll('[data-depoimento]')) {
    const [indice, campo] = el.dataset.depoimento.split('.');
    const d = EMPRESA.depoimentos?.[Number(indice)];
    if (!d || d[campo] == null) continue;
    el.textContent = String(d[campo]);
    trocas++;
  }

  return trocas;
}

/* Autoexecuta no navegador; em Node (testes) só exporta. */
if (typeof document !== 'undefined') aplicar();
