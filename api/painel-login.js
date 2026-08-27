/* =========================================================================
   GET    /api/painel-login  → estado da sessão e da instalação
   POST   /api/painel-login  { email, senha } → abre sessão
   DELETE /api/painel-login  → encerra sessão
   ========================================================================= */

import { criarCookie, cookieExpirado, usuarioDaRequisicao, instalacaoPronta } from './_painel.js';
import { buscarUsuario, conferirSenha, atualizarUsuario, PAPEIS } from './_usuarios.js';
import { registrar } from './_auditoria.js';
import { json, erro, lerJson, ipDoCliente } from './_http.js';

/* Contagem de falhas por conta+IP, na própria instância. Best-effort, como
   qualquer contador em ambiente serverless: segura ataque casual e não
   depende de banco. Para bloqueio duro, use o WAF da hospedagem. */
const falhas = new Map();
const JANELA_MS = 60_000, MAXIMO = 5;

function registrarFalha(chave) {
  const agora = Date.now();
  const atual = falhas.get(chave);
  if (!atual || agora > atual.expira) falhas.set(chave, { contagem: 1, expira: agora + JANELA_MS });
  else atual.contagem++;
}

function falhasExcedidas(chave) {
  const atual = falhas.get(chave);
  if (!atual || Date.now() > atual.expira) return false;
  return atual.contagem >= MAXIMO;
}

export default async function handler(req, res) {
  if (req.method === 'DELETE') {
    const usuario = await usuarioDaRequisicao(req);
    if (usuario) await registrar('logout', { quem: usuario.email, ip: ipDoCliente(req) });
    res.setHeader('Set-Cookie', cookieExpirado());
    return json(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    const pronta = await instalacaoPronta();
    const usuario = pronta ? await usuarioDaRequisicao(req) : null;
    return json(res, 200, {
      ok: true,
      configurado: pronta,
      autenticado: Boolean(usuario),
      usuario: usuario ? { ...usuario, papelNome: PAPEIS[usuario.papel]?.nome } : null
    });
  }

  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido');

  if (!(await instalacaoPronta())) {
    return erro(res, 503, 'Painel sem administrador. Defina PAINEL_ADMIN_EMAIL e PAINEL_ADMIN_SENHA nas variáveis de ambiente.');
  }

  const ip = ipDoCliente(req);

  let corpo;
  try { corpo = await lerJson(req); }
  catch { return erro(res, 400, 'Requisição inválida'); }

  const email = String(corpo.email || '').trim().toLowerCase();

  /* O limite conta apenas as tentativas FALHAS, e por conta + IP.
     Contar acesso bem-sucedido travaria a equipe inteira de um escritório,
     que sai pelo mesmo IP — e não é login certo que caracteriza ataque. */
  if (falhasExcedidas(`${email}|${ip}`)) {
    return erro(res, 429, 'Muitas tentativas seguidas nesta conta. Espere um minuto.');
  }
  const usuario = await buscarUsuario(email);

  /* Mesma resposta para conta inexistente, senha errada e conta desativada:
     distinguir entregaria a atacante a lista de e-mails válidos. */
  const senhaOk = usuario && usuario.ativo && conferirSenha(corpo.senha, usuario.senhaHash);
  if (!senhaOk) {
    registrarFalha(`${email}|${ip}`);
    await registrar('login_falho', { quem: email || 'sem e-mail', ip });
    return erro(res, 401, 'E-mail ou senha incorretos');
  }

  await atualizarUsuario(email, { ultimoAcesso: new Date().toISOString() });
  await registrar('login', { quem: email, ip });

  res.setHeader('Set-Cookie', criarCookie(email));
  return json(res, 200, {
    ok: true,
    usuario: { email: usuario.email, nome: usuario.nome, papel: usuario.papel, papelNome: PAPEIS[usuario.papel]?.nome }
  });
}
