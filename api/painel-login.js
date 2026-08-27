/* POST /api/painel-login  { senha } → cookie de sessão
   DELETE /api/painel-login → encerra a sessão */

import { senhaCorreta, senhaConfigurada, criarCookie, cookieExpirado, sessaoValida } from './_painel.js';
import { json, erro, lerJson, ipDoCliente, limiteExcedido } from './_http.js';

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieExpirado());
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    return json(res, 200, { ok: true, autenticado: sessaoValida(req), configurado: senhaConfigurada() });
  }

  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido');

  if (!senhaConfigurada()) {
    return erro(res, 503, 'Defina PAINEL_SENHA nas variáveis de ambiente para usar o painel.');
  }

  /* Limite apertado: cinco tentativas por minuto por IP. Painel de admin é
     alvo de força bruta assim que a URL vaza. */
  if (limiteExcedido('login:' + ipDoCliente(req), 5, 60_000)) {
    return erro(res, 429, 'Muitas tentativas. Espere um minuto.');
  }

  let corpo;
  try { corpo = await lerJson(req); }
  catch { return erro(res, 400, 'Requisição inválida'); }

  if (!senhaCorreta(corpo.senha)) {
    console.warn('[painel] senha incorreta de', ipDoCliente(req));
    return erro(res, 401, 'Senha incorreta');
  }

  res.setHeader('Set-Cookie', criarCookie());
  return json(res, 200, { ok: true });
}
