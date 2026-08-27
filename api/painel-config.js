/* =========================================================================
   GET  /api/painel-config  → configuração atual
   POST /api/painel-config  → grava alterações

   É por aqui que o lojista muda textos do bot, produtos e preços sem tocar
   em código. O valor gravado vale para o site e para o bot ao mesmo tempo,
   porque os dois leem da mesma fonte.
   ========================================================================= */

import { protegido } from './_painel.js';
import { json, erro, lerJson, ipDoCliente } from './_http.js';
import { lerConfig, salvarConfig, CONFIG_PADRAO } from './_configuracao.js';
import { PRODUTOS } from './_config.js';
import { pode } from './_usuarios.js';
import { registrar, descreverMudancas } from './_auditoria.js';

/* Preço chega do navegador aqui — e só aqui, vindo de um administrador
   autenticado. Ainda assim é validado: um erro de digitação que grave 0
   deixaria a loja vendendo de graça. */
function validarProdutos(entrada) {
  if (!entrada || typeof entrada !== 'object') return null;
  const saida = {};

  for (const [id, p] of Object.entries(entrada)) {
    const chave = String(id).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 40);
    if (!chave) continue;

    const valor = Math.round(Number(p.valorCentavos));
    if (!Number.isFinite(valor) || valor < 100 || valor > 5_000_000) return null;  // R$1 a R$50.000

    const parcelas = Math.min(12, Math.max(1, Number(p.maxParcelas) || 12));

    saida[chave] = {
      id: chave,
      nome: String(p.nome || '').trim().slice(0, 80) || 'Produto sem nome',
      descricao: String(p.descricao || '').trim().slice(0, 200),
      valorCentavos: valor,
      maxParcelas: parcelas,
      parcelaMinimaCentavos: 1000,
      ativo: p.ativo !== false
    };
  }
  return Object.keys(saida).length ? saida : null;
}

function limparTextos(bot) {
  if (!bot) return undefined;
  const campos = ['boasVindas','textoCatalogo','textoDuvidas','textoPosPagamento','pedirEmail','pedirCpf','pixGerado'];
  const saida = {};
  for (const campo of campos) {
    if (typeof bot[campo] === 'string') saida[campo] = bot[campo].slice(0, 2000);
  }
  if (typeof bot.ativo === 'boolean') saida.ativo = bot.ativo;
  return saida;
}

async function handler(req, res, eu) {
  if (req.method === 'GET') {
    const config = await lerConfig();
    return json(res, 200, {
      ok: true,
      config,
      /* O painel mostra os produtos do arquivo quando ainda não houve edição,
         para a tela nunca aparecer vazia numa instalação nova. */
      produtos: config.produtos || PRODUTOS,
      padrao: CONFIG_PADRAO
    });
  }

  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido');

  let corpo;
  try { corpo = await lerJson(req); }
  catch { return erro(res, 400, 'Requisição inválida'); }

  const mudancas = {};

  if (corpo.loja) {
    mudancas.loja = {
      nome: String(corpo.loja.nome || '').slice(0, 60),
      suporteTelegram: String(corpo.loja.suporteTelegram || '').replace(/^@/, '').slice(0, 40),
      emailSuporte: String(corpo.loja.emailSuporte || '').slice(0, 120)
    };
  }

  if (corpo.bot) mudancas.bot = limparTextos(corpo.bot);

  if (corpo.produtos) {
    /* Preço é a única coisa aqui que muda quanto entra de dinheiro. Supervisor
       edita mensagens; alterar catálogo e valor é do administrador. */
    if (!pode(eu.papel, 'editar_precos')) {
      return erro(res, 403, 'Somente administradores podem alterar produtos e preços.');
    }
    const produtos = validarProdutos(corpo.produtos);
    if (!produtos) return erro(res, 422, 'Confira os produtos: o valor precisa ficar entre R$ 1,00 e R$ 50.000,00.');
    mudancas.produtos = produtos;
  }

  const antes = await lerConfig();
  const salvo = await salvarConfig(mudancas);
  await registrar('config_salva', {
    quem: eu.email, ip: ipDoCliente(req),
    detalhe: descreverMudancas({ ...antes, produtos: antes.produtos || PRODUTOS }, salvo)
  });
  return json(res, 200, { ok: true, config: salvo });
}

export default protegido('editar_mensagens', handler);
