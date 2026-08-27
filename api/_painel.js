/* =========================================================================
   Autenticação do painel.

   Um administrador só, sem cadastro: a senha vem de PAINEL_SENHA e a sessão
   é um cookie assinado com HMAC. Sem banco de sessões, sem biblioteca — e
   sem estado no servidor, o que importa em ambiente serverless.

   O cookie guarda validade + assinatura. Como o segredo nunca sai do
   servidor, ninguém consegue forjar um cookie válido nem esticar o prazo.
   ========================================================================= */

import crypto from 'node:crypto';
import { CONFIG } from './_config.js';
import { erro } from './_http.js';

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

export function senhaConfigurada() {
  return Boolean(process.env.PAINEL_SENHA);
}

export function senhaCorreta(tentativa) {
  const esperada = process.env.PAINEL_SENHA || '';
  if (!esperada) return false;
  /* Comparação em tempo constante: senha curta não pode ser descoberta
     medindo quanto tempo a resposta demora. */
  return iguais(
    crypto.createHash('sha256').update(String(tentativa)).digest('hex'),
    crypto.createHash('sha256').update(esperada).digest('hex')
  );
}

export function criarCookie() {
  const expira = Date.now() + DURACAO_HORAS * 3600 * 1000;
  const valor = `${expira}.${assinar(String(expira))}`;
  return `${COOKIE}=${valor}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=${DURACAO_HORAS * 3600}`;
}

export function cookieExpirado() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=0`;
}

export function sessaoValida(req) {
  const cabecalho = req.headers.cookie || '';
  const bruto = cabecalho.split(';')
    .map(p => p.trim())
    .find(p => p.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!bruto) return false;

  const [expira, assinatura] = bruto.split('.');
  if (!expira || !assinatura) return false;
  if (!iguais(assinatura, assinar(expira))) return false;
  return Number(expira) > Date.now();
}

/* Envolve um handler exigindo sessão. Devolve 401 em JSON, para o painel
   saber que precisa pedir a senha de novo em vez de mostrar tela vazia. */
export function protegido(handler) {
  return async (req, res) => {
    if (!senhaConfigurada()) {
      return erro(res, 503, 'Painel sem senha configurada. Defina PAINEL_SENHA nas variáveis de ambiente.');
    }
    if (!sessaoValida(req)) return erro(res, 401, 'Sessão expirada');
    return handler(req, res);
  };
}
