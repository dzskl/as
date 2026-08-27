/* =========================================================================
   GET    /api/painel-equipe          → lista a equipe
   POST   /api/painel-equipe          → cria conta      { email, nome, senha, papel }
   PATCH  /api/painel-equipe          → altera conta    { email, ...campos }
   DELETE /api/painel-equipe?email=   → remove conta

   Só administrador. Duas travas existem para evitar erros sem volta pela
   tela: ninguém remove ou rebaixa a própria conta, e a equipe nunca fica sem
   nenhum administrador ativo.
   ========================================================================= */

import { protegido } from './_painel.js';
import { json, erro, lerJson, ipDoCliente } from './_http.js';
import { listarUsuarios, criarUsuario, atualizarUsuario, removerUsuario,
         buscarUsuario, totalAdmins, PAPEIS } from './_usuarios.js';
import { registrar } from './_auditoria.js';

async function handler(req, res, eu) {
  const ip = ipDoCliente(req);

  if (req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      papeis: Object.entries(PAPEIS).map(([id, p]) => ({ id, nome: p.nome })),
      usuarios: (await listarUsuarios()).map(u => ({ ...u, papelNome: PAPEIS[u.papel]?.nome, souEu: u.email === eu.email }))
    });
  }

  if (req.method === 'POST') {
    let corpo;
    try { corpo = await lerJson(req); } catch { return erro(res, 400, 'Requisição inválida'); }
    try {
      const novo = await criarUsuario(corpo);
      await registrar('usuario_criado', { quem: eu.email, ip, detalhe: `${novo.email} como ${PAPEIS[novo.papel].nome}` });
      return json(res, 201, { ok: true, usuario: novo });
    } catch (e) { return erro(res, 422, e.message); }
  }

  if (req.method === 'PATCH') {
    let corpo;
    try { corpo = await lerJson(req); } catch { return erro(res, 400, 'Requisição inválida'); }

    const alvo = await buscarUsuario(corpo.email);
    if (!alvo) return erro(res, 404, 'Conta não encontrada');

    const seMesmo = alvo.email === eu.email;
    if (seMesmo && (corpo.papel && corpo.papel !== 'admin')) {
      return erro(res, 422, 'Você não pode rebaixar a própria conta. Peça a outro administrador.');
    }
    if (seMesmo && corpo.ativo === false) {
      return erro(res, 422, 'Você não pode desativar a própria conta.');
    }

    /* Rebaixar ou desativar o último administrador deixaria a equipe sem
       ninguém capaz de gerir acessos — sem volta pela interface. */
    const perdeAdmin = alvo.papel === 'admin' &&
      ((corpo.papel && corpo.papel !== 'admin') || corpo.ativo === false);
    if (perdeAdmin && (await totalAdmins()) <= 1) {
      return erro(res, 422, 'Precisa existir pelo menos um administrador ativo.');
    }

    try {
      const novo = await atualizarUsuario(corpo.email, corpo);
      const mudou = [
        corpo.papel && `papel → ${PAPEIS[corpo.papel].nome}`,
        corpo.ativo !== undefined && (corpo.ativo ? 'reativado' : 'desativado'),
        corpo.senha && 'senha redefinida',
        corpo.nome && 'nome alterado'
      ].filter(Boolean).join(', ');
      await registrar('usuario_alterado', { quem: eu.email, ip, detalhe: `${corpo.email}: ${mudou}` });
      return json(res, 200, { ok: true, usuario: novo });
    } catch (e) { return erro(res, 422, e.message); }
  }

  if (req.method === 'DELETE') {
    const email = new URL(req.url, 'http://local').searchParams.get('email');
    const alvo = await buscarUsuario(email);
    if (!alvo) return erro(res, 404, 'Conta não encontrada');
    if (alvo.email === eu.email) return erro(res, 422, 'Você não pode remover a própria conta.');
    if (alvo.papel === 'admin' && (await totalAdmins()) <= 1) {
      return erro(res, 422, 'Precisa existir pelo menos um administrador ativo.');
    }

    await removerUsuario(email);
    await registrar('usuario_removido', { quem: eu.email, ip, detalhe: email });
    return json(res, 200, { ok: true });
  }

  return erro(res, 405, 'Método não permitido');
}

export default protegido('gerir_equipe', handler);
