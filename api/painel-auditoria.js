/* GET /api/painel-auditoria?pagina=0 — histórico de ações da equipe */

import { protegido } from './_painel.js';
import { json } from './_http.js';
import { listar, total } from './_auditoria.js';

async function handler(req, res) {
  const url = new URL(req.url, 'http://local');
  const pagina = Math.max(0, Number(url.searchParams.get('pagina')) || 0);
  const [eventos, quantos] = await Promise.all([listar({ pagina, limite: 60 }), total()]);
  return json(res, 200, { ok: true, eventos, total: quantos, pagina });
}

export default protegido('ver_auditoria', handler);
