/* =========================================================================
   Sessão e autorização do painel.

   A sessão é um cookie assinado com HMAC contendo e-mail e validade. Sem
   banco de sessões — o que importa em ambiente serverless, onde não há
   processo para guardá-las. Como o segredo não sai do servidor, o cookie não
   pode ser forjado nem ter o prazo esticado.

   Toda rota protegida declara a permissão que exige. A regra de quem pode o
   quê vive em _usuarios.js, num único lugar.
   ========================================================================= */

import crypto from 'node:crypto';
import { CONFIG } from './_config.js';
import { erro } from './_http.js';
import { buscarUsuario, garantirAdminInicial, pode } from './_usuarios.js';

const COOKIE = 'painel';
const DURACAO_HORAS = 12;

function assinar(conteudo) {
  return crypto.createHmac('sha256', CONFIG.segredoApp).update(conteudo).digest('hex');
}

function iguais(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

export function criarCookie(email) {
  const expira = Date.now() + DURACAO_HORAS * 3600 * 1000;
  const carga = `${expira}:${email}`;
  const valor = Buffer.from(carga).toString('base64url') + '.' + assinar(carga);
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${DURACAO_HORAS * 3600}`;
}

export function cookieExpirado() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`;
}

/* Devolve o e-mail da sessão, ou null. Não consulta o banco: isso fica para
   quem precisa do usuário completo. */
export function emailDaSessao(req) {
  const bruto = (req.headers.cookie || '').split(';')
    .map(p => p.trim())
    .find(p => p.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!bruto) return null;

  const [carga64, assinatura] = bruto.split('.');
  if (!carga64 || !assinatura) return null;

  let carga;
  try { carga = Buffer.from(carga64, 'base64url').toString('utf8'); }
  catch { return null; }

  if (!iguais(assinatura, assinar(carga))) return null;

  const separador = carga.indexOf(':');
  const expira = Number(carga.slice(0, separador));
  if (!(expira > Date.now())) return null;

  return carga.slice(separador + 1) || null;
}

/* Usuário da requisição, já conferido: conta existente e ativa. Desativar
   alguém no painel derruba o acesso na requisição seguinte, sem esperar o
   cookie expirar. */
export async function usuarioDaRequisicao(req) {
  const email = emailDaSessao(req);
  if (!email) return null;
  const usuario = await buscarUsuario(email);
  if (!usuario || !usuario.ativo) return null;
  const { senhaHash, ...publico } = usuario;
  return publico;
}

export async function instalacaoPronta() {
  await garantirAdminInicial();
  const { listarUsuarios } = await import('./_usuarios.js');
  return (await listarUsuarios()).length > 0;
}

/* Envolve um handler exigindo sessão válida e, opcionalmente, uma permissão.
   O handler recebe o usuário como terceiro argumento — assim ninguém precisa
   reler o cookie para saber quem está agindo. */
export function protegido(permissao, handler) {
  if (typeof permissao === 'function') { handler = permissao; permissao = null; }

  return async (req, res) => {
    if (!(await instalacaoPronta())) {
      return erro(res, 503, 'Painel sem administrador. Defina PAINEL_ADMIN_EMAIL e PAINEL_ADMIN_SENHA nas variáveis de ambiente.');
    }

    const usuario = await usuarioDaRequisicao(req);
    if (!usuario) return erro(res, 401, 'Sessão expirada');

    if (permissao && !pode(usuario.papel, permissao)) {
      /* 403 e não 401: a sessão é válida, o papel é que não alcança. O painel
         usa essa diferença para não jogar a pessoa na tela de login à toa. */
      return erro(res, 403, 'Seu perfil não tem permissão para esta ação.');
    }

    return handler(req, res, usuario);
  };
}
