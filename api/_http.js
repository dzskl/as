/* Utilitários compartilhados pelos endpoints. */

export function json(res, status, dados) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(dados));
}

export function erro(res, status, mensagem, extras = {}) {
  return json(res, status, { ok: false, erro: mensagem, ...extras });
}

/* Lê o corpo cru da requisição. O webhook precisa do texto exato recebido:
   reserializar o JSON muda espaços e ordem de chaves e quebra a conferência
   da assinatura. */
export async function lerCorpoBruto(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);

  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > 1_000_000) throw new Error('Corpo da requisição grande demais');
    partes.push(parte);
  }
  return Buffer.concat(partes).toString('utf8');
}

export async function lerJson(req) {
  const bruto = await lerCorpoBruto(req);
  if (!bruto) return {};
  try { return JSON.parse(bruto); }
  catch { throw new Error('JSON inválido'); }
}

export function ipDoCliente(req) {
  const encaminhado = req.headers['x-forwarded-for'];
  if (typeof encaminhado === 'string' && encaminhado) return encaminhado.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconhecido';
}

/* Limite de requisições por IP, best-effort: cada instância serverless tem a
   sua própria contagem. Segura abuso casual; para bloqueio sério use um WAF
   ou o rate limit da própria Vercel. */
const janelas = new Map();
export function limiteExcedido(chave, maximo = 10, janelaMs = 60_000) {
  const agora = Date.now();
  const registro = janelas.get(chave);
  if (!registro || agora > registro.expira) {
    janelas.set(chave, { contagem: 1, expira: agora + janelaMs });
    return false;
  }
  registro.contagem++;
  return registro.contagem > maximo;
}

export function limparLimites() { janelas.clear(); }
