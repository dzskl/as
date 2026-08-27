/* =========================================================================
   Contas e papéis.

   Uma senha compartilhada não escala com equipe: ninguém sabe quem mudou o
   preço, quem disparou a mensagem, nem como tirar o acesso de quem saiu.
   Aqui cada pessoa tem conta própria, papel e histórico.

   PAPÉIS
     admin       tudo, incluindo preços, produtos e gestão da equipe
     supervisor  opera o dia a dia: vê tudo, dispara mensagem, conecta o bot
     operador    só leitura: acompanha vendas e pedidos

   Senha é guardada como scrypt + sal aleatório. Nunca em texto, nunca
   reversível — se o banco vazar, as senhas não vão junto.
   ========================================================================= */

import crypto from 'node:crypto';
import { ler, guardar, empilhar, lerLista, apagar } from './_kv.js';

const INDICE = 'usuarios:indice';

export const PAPEIS = {
  admin:      { nome: 'Administrador', nivel: 3 },
  supervisor: { nome: 'Supervisor',    nivel: 2 },
  operador:   { nome: 'Operador',      nivel: 1 }
};

/* O que cada papel pode fazer. Declarado como dado, não espalhado em ifs:
   assim a regra é lida de um lugar só e testada de um lugar só. */
export const PERMISSOES = {
  ver_painel:       ['admin', 'supervisor', 'operador'],
  ver_contatos:     ['admin', 'supervisor', 'operador'],
  disparar:         ['admin', 'supervisor'],
  operar_bot:       ['admin', 'supervisor'],
  editar_mensagens: ['admin', 'supervisor'],
  editar_precos:    ['admin'],
  gerir_equipe:     ['admin'],
  ver_auditoria:    ['admin', 'supervisor']
};

export function pode(papel, permissao) {
  return (PERMISSOES[permissao] || []).includes(papel);
}

/* ------------------------------------------------------------- senhas */

const ITERACOES = { N: 16384, r: 8, p: 1 };

export function criarHash(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const derivada = crypto.scryptSync(String(senha), sal, 32, ITERACOES).toString('hex');
  return `scrypt$${sal}$${derivada}`;
}

export function conferirSenha(senha, guardado) {
  const [algoritmo, sal, esperado] = String(guardado || '').split('$');
  if (algoritmo !== 'scrypt' || !sal || !esperado) return false;
  const derivada = crypto.scryptSync(String(senha), sal, 32, ITERACOES).toString('hex');
  const a = Buffer.from(derivada, 'hex');
  const b = Buffer.from(esperado, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Regra mínima de senha. Curta demais é o caminho mais fácil para dentro. */
export function senhaFraca(senha) {
  const s = String(senha || '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[a-zA-Z]/.test(s) || !/\d/.test(s)) return 'Use pelo menos uma letra e um número.';
  return null;
}

/* ------------------------------------------------------------ usuários */

const chave = (email) => 'usuario:' + String(email).trim().toLowerCase();

export async function buscarUsuario(email) {
  if (!email) return null;
  return ler(chave(email));
}

export async function listarUsuarios() {
  const emails = await lerLista(INDICE, 0, 199);
  const usuarios = await Promise.all(emails.map(e => ler(chave(e))));
  /* Nunca devolvemos o hash: ele não tem uso fora da conferência de senha. */
  return usuarios.filter(Boolean).map(({ senhaHash, ...resto }) => resto);
}

export async function criarUsuario({ email, nome, senha, papel }) {
  const limpo = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(limpo)) throw new Error('E-mail inválido');
  if (!PAPEIS[papel]) throw new Error('Papel inválido');
  const fraca = senhaFraca(senha);
  if (fraca) throw new Error(fraca);
  if (await buscarUsuario(limpo)) throw new Error('Já existe uma conta com esse e-mail');

  const usuario = {
    email: limpo,
    nome: String(nome || '').trim().slice(0, 60) || limpo.split('@')[0],
    papel,
    senhaHash: criarHash(senha),
    ativo: true,
    criadoEm: new Date().toISOString(),
    ultimoAcesso: null
  };
  await guardar(chave(limpo), usuario);
  await empilhar(INDICE, limpo, 200);
  const { senhaHash, ...publico } = usuario;
  return publico;
}

export async function atualizarUsuario(email, campos) {
  const usuario = await buscarUsuario(email);
  if (!usuario) return null;

  const novo = { ...usuario };
  if (campos.nome !== undefined) novo.nome = String(campos.nome).trim().slice(0, 60);
  if (campos.papel !== undefined) {
    if (!PAPEIS[campos.papel]) throw new Error('Papel inválido');
    novo.papel = campos.papel;
  }
  if (campos.ativo !== undefined) novo.ativo = Boolean(campos.ativo);
  if (campos.senha) {
    const fraca = senhaFraca(campos.senha);
    if (fraca) throw new Error(fraca);
    novo.senhaHash = criarHash(campos.senha);
  }
  if (campos.ultimoAcesso !== undefined) novo.ultimoAcesso = campos.ultimoAcesso;

  await guardar(chave(email), novo);
  const { senhaHash, ...publico } = novo;
  return publico;
}

export async function removerUsuario(email) {
  await apagar(chave(email));
}

/* Quantos administradores ativos existem. Serve para impedir que a equipe
   fique sem ninguém capaz de gerir acessos — um erro sem volta pela tela. */
export async function totalAdmins() {
  const usuarios = await listarUsuarios();
  return usuarios.filter(u => u.papel === 'admin' && u.ativo).length;
}

/* ------------------------------------------------------- primeiro acesso
   A instalação começa vazia. O primeiro administrador nasce das variáveis de
   ambiente, uma única vez, para não existir tela pública de cadastro. */
export async function garantirAdminInicial() {
  const email = process.env.PAINEL_ADMIN_EMAIL;
  const senha = process.env.PAINEL_ADMIN_SENHA || process.env.PAINEL_SENHA;
  if (!email || !senha) return null;

  const existente = await buscarUsuario(email);
  if (existente) return null;
  if ((await listarUsuarios()).length) return null;   // já há equipe; não recria

  try {
    return await criarUsuario({
      email,
      nome: process.env.PAINEL_ADMIN_NOME || 'Administrador',
      senha,
      papel: 'admin'
    });
  } catch (e) {
    console.error('[usuarios] não foi possível criar o admin inicial:', e.message);
    return null;
  }
}
