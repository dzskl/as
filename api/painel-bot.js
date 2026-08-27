/* =========================================================================
   POST /api/painel-bot — controla o bot a partir do painel
     { acao: "conectar" }   registra o webhook no Telegram
     { acao: "desconectar" } remove o webhook
     { acao: "status" }     consulta como o Telegram vê o bot
     { acao: "disparo", mensagem, apenasCompradores? }  envia para os leads
   ========================================================================= */

import { protegido } from './_painel.js';
import { json, erro, lerJson, ipDoCliente } from './_http.js';
import { registrar } from './_auditoria.js';
import { chamar, configurarWebhook, infoWebhook, infoBot, enviar, botConfigurado } from './_telegram.js';
import { listarLeads, totalLeads } from './_leads.js';
import { CONFIG } from './_config.js';

/* O Telegram limita cerca de 30 mensagens por segundo. Mandamos em lotes com
   pausa entre eles: passar do limite faz o bot ser silenciado temporariamente,
   o que é bem pior do que um disparo lento. */
const LOTE = 25;
const PAUSA_MS = 1100;

async function disparar(mensagem, apenasCompradores) {
  const leads = await listarLeads({ limite: 1000 });
  const alvos = leads.filter(l => !l.bloqueado && (!apenasCompradores || l.compras > 0));

  let enviados = 0, falhas = 0;
  for (let i = 0; i < alvos.length; i += LOTE) {
    const lote = alvos.slice(i, i + LOTE);
    await Promise.all(lote.map(async (lead) => {
      try { await enviar(lead.chatId, mensagem); enviados++; }
      catch (e) {
        falhas++;
        /* "bot was blocked by the user" é o caso mais comum e não é erro
           nosso — a pessoa saiu, e o registro fica para não insistir. */
        console.warn('[disparo] falhou para', lead.chatId, e.message);
      }
    }));
    if (i + LOTE < alvos.length) await new Promise(r => setTimeout(r, PAUSA_MS));
  }
  return { alvos: alvos.length, enviados, falhas };
}

async function handler(req, res, eu) {
  if (req.method !== 'POST') return erro(res, 405, 'Método não permitido');

  if (!botConfigurado()) {
    return erro(res, 400, 'Configure TELEGRAM_BOT_TOKEN nas variáveis de ambiente antes de usar o bot.');
  }

  let corpo;
  try { corpo = await lerJson(req); }
  catch { return erro(res, 400, 'Requisição inválida'); }

  try {
    if (corpo.acao === 'status') {
      const [bot, webhook] = await Promise.all([infoBot(), infoWebhook()]);
      return json(res, 200, {
        ok: true,
        bot: { id: bot.id, nome: bot.first_name, usuario: bot.username },
        webhook: {
          url: webhook.url || '',
          conectado: Boolean(webhook.url),
          pendentes: webhook.pending_update_count || 0,
          ultimoErro: webhook.last_error_message || ''
        }
      });
    }

    if (corpo.acao === 'conectar') {
      const base = (process.env.URL_SITE || CONFIG.urlSite || '').replace(/\/$/, '');
      if (!base.startsWith('https://')) {
        return erro(res, 400, 'O Telegram exige HTTPS. Configure URL_SITE com o endereço público do site.');
      }
      const segredo = process.env.TELEGRAM_WEBHOOK_SEGREDO;
      if (!segredo) {
        return erro(res, 400, 'Defina TELEGRAM_WEBHOOK_SEGREDO — é ele que impede terceiros de falarem pelo seu bot.');
      }
      await configurarWebhook(`${base}/api/telegram`, segredo);
      /* Os comandos aparecem no menu "/" do app, então vale registrá-los
         junto: bot sem comandos visíveis parece quebrado. */
      await registrar('bot_conectado', { quem: eu.email, ip: ipDoCliente(req), detalhe: `${base}/api/telegram` });
      await chamar('setMyCommands', {
        commands: [
          { command: 'start', description: 'Começar' },
          { command: 'comprar', description: 'Ver produtos' },
          { command: 'ajuda', description: 'Dúvidas frequentes' },
          { command: 'suporte', description: 'Falar com um humano' },
          { command: 'cancelar', description: 'Cancelar o que estou fazendo' }
        ]
      });
      return json(res, 200, { ok: true, url: `${base}/api/telegram` });
    }

    if (corpo.acao === 'desconectar') {
      await chamar('deleteWebhook', { drop_pending_updates: false });
      await registrar('bot_desconectado', { quem: eu.email, ip: ipDoCliente(req) });
      return json(res, 200, { ok: true });
    }

    if (corpo.acao === 'disparo') {
      const mensagem = String(corpo.mensagem || '').trim();
      if (mensagem.length < 2) return erro(res, 422, 'Escreva a mensagem do disparo.');
      if (mensagem.length > 3500) return erro(res, 422, 'Mensagem longa demais (limite do Telegram é 4096 caracteres).');
      if (!(await totalLeads())) return erro(res, 400, 'Ainda não há contatos para enviar.');

      const resultado = await disparar(mensagem, Boolean(corpo.apenasCompradores));
      await registrar('disparo', {
        quem: eu.email, ip: ipDoCliente(req),
        detalhe: `${resultado.enviados}/${resultado.alvos} contatos · "${mensagem.slice(0, 80)}"`
      });
      return json(res, 200, { ok: true, ...resultado });
    }

    return erro(res, 400, 'Ação desconhecida');

  } catch (e) {
    console.error('[painel-bot]', corpo.acao, e);
    return erro(res, 502, e.message || 'Falha ao falar com o Telegram');
  }
}

export default protegido('operar_bot', handler);
