/* =========================================================================
   POST /api/telegram — webhook do bot

   O Telegram chama esta função a cada mensagem ou clique de botão. Não há
   processo vivo esperando: a função acorda, responde e morre. O que precisa
   ser lembrado entre uma mensagem e outra (em que passo da compra a pessoa
   está) fica no KV, não em memória.

   Fluxo de venda, quatro toques:
     catálogo → escolhe produto → e-mail → CPF → telefone → Pix na tela

   Regra que vale para o bot inteiro: SEMPRE responder 200 ao Telegram, mesmo
   quando algo falha do nosso lado. Um erro devolvido faz o Telegram reenviar
   a mesma atualização em intervalos crescentes, e um bug vira uma tempestade
   de mensagens repetidas para o cliente.
   ========================================================================= */

import crypto from 'node:crypto';
import { lerConfig, buscarProduto, catalogo, preencher } from './_configuracao.js';
import { registrarContato, buscarLead, atualizarLead, lerEstado, gravarEstado, limparEstado } from './_leads.js';
import { criarPagamentoPix } from './_gateway.js';
import { salvarPedido, diaBR } from './_pedidos.js';
import { formatarBRL } from './_config.js';
import { emailValido, cpfValido, telefoneValido, soDigitos, limpar } from './_validacao.js';
import { enviar, editar, responderBotao, teclado, escapar, botConfigurado } from './_telegram.js';
import { incrementar } from './_kv.js';
import { json, erro, lerCorpoBruto } from './_http.js';
import { mascararId, erroSemDadosPessoais } from './_privacidade.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido');

  /* O segredo é definido por nós ao registrar o webhook e devolvido pelo
     Telegram em todo chamado. Sem ele, qualquer pessoa que descobrisse a URL
     poderia fingir ser o Telegram e disparar mensagens em nome do bot. */
  const segredo = process.env.TELEGRAM_WEBHOOK_SEGREDO;
  if (segredo && req.headers['x-telegram-bot-api-secret-token'] !== segredo) {
    console.warn('[telegram] segredo inválido — atualização descartada');
    return erro(res, 401, 'Não autorizado');
  }

  let atualizacao;
  try { atualizacao = JSON.parse(await lerCorpoBruto(req) || '{}'); }
  catch { return json(res, 200, { ok: true }); }

  try {
    await processar(atualizacao);
  } catch (e) {
    console.error('[telegram] falha ao processar atualização:', erroSemDadosPessoais(e));
  }
  return json(res, 200, { ok: true });
}

/* ------------------------------------------------------------- roteamento */

async function processar(u) {
  const cfg = await lerConfig();
  if (!cfg.bot.ativo) return;

  if (u.callback_query) return tratarBotao(u.callback_query, cfg);
  if (u.message) return tratarMensagem(u.message, cfg);
}

async function tratarMensagem(msg, cfg) {
  const chatId = msg.chat.id;
  const lead = await registrarContato(msg.from);
  if (lead.bloqueado) return;

  /* Contato compartilhado pelo botão: preenche o telefone sem digitação. */
  if (msg.contact?.phone_number) {
    return receberTelefone(chatId, msg.contact.phone_number, cfg);
  }

  const texto = (msg.text || '').trim();

  if (texto.startsWith('/')) {
    const comando = texto.split(/[\s@]/)[0].toLowerCase();
    if (comando === '/start') { await limparEstado(chatId); return menuPrincipal(chatId, lead, cfg); }
    if (comando === '/comprar') return mostrarCatalogo(chatId, cfg);
    if (comando === '/suporte') return enviar(chatId, `Fale com a gente: @${cfg.loja.suporteTelegram}`);
    if (comando === '/ajuda') return enviar(chatId, cfg.bot.textoDuvidas);
    if (comando === '/cancelar') { await limparEstado(chatId); return enviar(chatId, 'Ok, cancelei. Mande /start quando quiser recomeçar.'); }
    return menuPrincipal(chatId, lead, cfg);
  }

  /* Fora de comando, o texto é resposta a alguma pergunta em andamento. */
  const estado = await lerEstado(chatId);
  if (estado.passo === 'email') return receberEmail(chatId, texto, estado, cfg);
  if (estado.passo === 'cpf') return receberCpf(chatId, texto, estado, cfg);
  if (estado.passo === 'telefone') return receberTelefone(chatId, texto, cfg);

  return menuPrincipal(chatId, lead, cfg);
}

async function tratarBotao(cb, cfg) {
  const chatId = cb.message.chat.id;
  const dados = cb.data || '';
  await responderBotao(cb.id);
  const lead = await registrarContato(cb.from);
  if (lead.bloqueado) return;

  if (dados === 'catalogo') return mostrarCatalogo(chatId, cfg);
  if (dados === 'duvidas') return enviar(chatId, cfg.bot.textoDuvidas, teclado([[{ text: '⬅️ Voltar', callback_data: 'menu' }]]));
  if (dados === 'suporte') return enviar(chatId, `Fale com a gente: @${cfg.loja.suporteTelegram}`);
  if (dados === 'menu') return menuPrincipal(chatId, lead, cfg);
  if (dados.startsWith('comprar:')) return iniciarCompra(chatId, dados.slice(8), cfg);
}

/* ------------------------------------------------------------------ telas */

async function menuPrincipal(chatId, lead, cfg) {
  const texto = preencher(cfg.bot.boasVindas, {
    nome: escapar(lead.nome.split(' ')[0]),
    loja: escapar(cfg.loja.nome)
  });
  return enviar(chatId, texto, teclado([
    [{ text: '🛒 Ver produtos', callback_data: 'catalogo' }],
    [{ text: '❓ Dúvidas', callback_data: 'duvidas' }, { text: '💬 Suporte', callback_data: 'suporte' }]
  ]));
}

async function mostrarCatalogo(chatId, cfg) {
  const produtos = Object.values(await catalogo()).filter(p => p.ativo !== false);
  if (!produtos.length) return enviar(chatId, 'Nenhum produto disponível no momento.');

  const linhas = produtos.map(p => ([{
    text: `${p.nome} — R$ ${formatarBRL(p.valorCentavos)}`,
    callback_data: 'comprar:' + p.id
  }]));
  linhas.push([{ text: '⬅️ Voltar', callback_data: 'menu' }]);

  return enviar(chatId, cfg.bot.textoCatalogo, teclado(linhas));
}

/* ------------------------------------------------------------ compra */

async function iniciarCompra(chatId, produtoId, cfg) {
  const produto = await buscarProduto(produtoId);
  if (!produto) return enviar(chatId, 'Esse produto não está mais disponível.');

  await incrementar(`m:${diaBR()}:iniciou_compra`);
  const lead = await buscarLead(chatId);

  await enviar(chatId,
    `Ótima escolha: *${escapar(produto.nome)}*\nValor: *R$ ${formatarBRL(produto.valorCentavos)}*`);

  /* Quem já comprou antes não repete os dados. */
  if (lead?.email && lead?.cpf && lead?.telefone) {
    await gravarEstado(chatId, { passo: 'confirmar', produtoId });
    return gerarPix(chatId, produtoId, cfg);
  }

  await gravarEstado(chatId, { passo: 'email', produtoId });
  return enviar(chatId, cfg.bot.pedirEmail);
}

async function receberEmail(chatId, texto, estado, cfg) {
  const email = limpar(texto, 160).toLowerCase();
  if (!emailValido(email)) {
    return enviar(chatId, 'Esse e-mail não parece válido. Pode conferir e mandar de novo?');
  }
  await atualizarLead(chatId, { email });
  await gravarEstado(chatId, { ...estado, passo: 'cpf' });
  return enviar(chatId, cfg.bot.pedirCpf);
}

async function receberCpf(chatId, texto, estado, cfg) {
  const cpf = soDigitos(texto);
  if (!cpfValido(cpf)) {
    return enviar(chatId, 'Esse CPF não confere. Manda só os números, por favor.');
  }
  await atualizarLead(chatId, { cpf });
  await gravarEstado(chatId, { ...estado, passo: 'telefone' });

  /* O botão de contato evita digitação e traz o número já formatado. */
  return enviar(chatId, 'Por último, seu *telefone com DDD*. Pode tocar no botão abaixo:', {
    reply_markup: {
      keyboard: [[{ text: '📱 Compartilhar meu telefone', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
}

async function receberTelefone(chatId, texto, cfg) {
  const telefone = soDigitos(texto).slice(-11);
  if (!telefoneValido(telefone)) {
    return enviar(chatId, 'Telefone inválido. Mande com DDD, por exemplo 11999998888.');
  }
  await atualizarLead(chatId, { telefone });

  const estado = await lerEstado(chatId);
  if (!estado.produtoId) return enviar(chatId, 'Vamos recomeçar: mande /start.');

  await enviar(chatId, 'Perfeito! Gerando seu Pix…', { reply_markup: { remove_keyboard: true } });
  return gerarPix(chatId, estado.produtoId, cfg);
}

async function gerarPix(chatId, produtoId, cfg) {
  const produto = await buscarProduto(produtoId);
  const lead = await buscarLead(chatId);
  if (!produto || !lead) return enviar(chatId, 'Algo saiu do lugar. Mande /start para recomeçar.');

  const pedido = {
    id: crypto.randomUUID(),
    produtoId: produto.id,
    valorCentavos: produto.valorCentavos,
    metodo: 'pix',
    parcelas: 1,
    origem: 'telegram',
    chatId: String(chatId),
    cliente: { nome: lead.nome, email: lead.email, cpf: lead.cpf, telefone: lead.telefone },
    status: 'pendente',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString()
  };

  try {
    const cobranca = await criarPagamentoPix({ pedido, produto, cliente: pedido.cliente });
    if (!cobranca.pixTexto) throw new Error('gateway não devolveu o código Pix');

    pedido.idGateway = cobranca.idGateway;
    pedido.status = cobranca.status;
    await salvarPedido(pedido);
    await limparEstado(chatId);

    await enviar(chatId, preencher(cfg.bot.pixGerado, {
      valor: formatarBRL(produto.valorCentavos),
      produto: escapar(produto.nome)
    }));
    /* Código sozinho numa mensagem: no Telegram, tocar no bloco de código
       copia tudo — é o caminho mais curto entre ver e pagar. */
    return enviar(chatId, '`' + cobranca.pixTexto + '`');

  } catch (e) {
    console.error('[telegram] falha ao gerar Pix para', mascararId(chatId), erroSemDadosPessoais(e));
    return enviar(chatId,
      'Não consegui gerar o Pix agora. Tente de novo em instantes ou fale com ' +
      `@${cfg.loja.suporteTelegram}.`);
  }
}
