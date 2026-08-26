/* =========================================================================
   GET /api/produto?id=bot-24h
   O checkout busca daqui o nome, o preço e as parcelas. Assim o valor
   exibido é sempre o mesmo que o servidor vai cobrar — não há como a página
   mostrar um preço e a cobrança sair com outro.
   ========================================================================= */

import { buscarProduto, opcoesParcelamento, formatarBRL, CONFIG } from './_config.js';
import { json, erro } from './_http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return erro(res, 405, 'Método não permitido');

  const url = new URL(req.url, 'http://local');
  const produto = buscarProduto(url.searchParams.get('id') || 'bot-24h');
  if (!produto) return erro(res, 404, 'Produto não encontrado');

  return json(res, 200, {
    ok: true,
    produto: {
      id: produto.id,
      nome: produto.nome,
      descricao: produto.descricao,
      valorCentavos: produto.valorCentavos,
      valorFormatado: formatarBRL(produto.valorCentavos),
      parcelamento: opcoesParcelamento(produto).map(o => ({
        parcelas: o.parcelas,
        valorFormatado: formatarBRL(o.valorParcelaCentavos),
        rotulo: o.parcelas === 1
          ? `À vista — R$ ${formatarBRL(produto.valorCentavos)}`
          : `${o.parcelas}x de R$ ${formatarBRL(o.valorParcelaCentavos)} sem juros`
      }))
    },
    modoSimulado: CONFIG.modoGateway === 'simulado',
    cartao: {
      /* Como o navegador deve tratar o cartão:
         'sdk'      → tokeniza no gateway pelo endpoint informado
         'direto'   → envia os campos para a nossa API (ver aviso no _config)
         'desligado'→ só Pix */
      modo: CONFIG.urlTokenizacao ? 'sdk' : (CONFIG.cartaoDireto ? 'direto' : 'desligado'),
      urlTokenizacao: CONFIG.urlTokenizacao,
      chavePublica: CONFIG.urlTokenizacao ? CONFIG.chavePublica : ''
    }
  });
}
