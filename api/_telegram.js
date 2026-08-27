/* =========================================================================
   Cliente da API do Telegram.

   O bot roda por WEBHOOK, não por polling: em ambiente serverless não existe
   processo vivo para ficar perguntando "tem mensagem nova?". O Telegram é
   quem chama /api/telegram a cada mensagem, e a função responde e morre.
   ========================================================================= */

/* TELEGRAM_API_BASE existe para os testes apontarem para um servidor falso.
   Em produção fica vazia e vale o endereço real. */
const API = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org/bot';

function token() {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN não configurado');
  return t;
}

export function botConfigurado() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export async function chamar(metodo, corpo) {
  const r = await fetch(`${API}${token()}/${metodo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
  });
  const dados = await r.json().catch(() => ({}));
  if (!dados.ok) {
    /* description é o campo onde o Telegram explica o motivo — vale mais que
       o código HTTP, que costuma ser 400 para tudo. */
    throw new Error(`Telegram ${metodo}: ${dados.description || r.status}`);
  }
  return dados.result;
}

export async function enviar(chatId, texto, opcoes = {}) {
  return chamar('sendMessage', {
    chat_id: chatId,
    text: texto,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
    ...opcoes
  });
}

export async function enviarFoto(chatId, imagemBase64OuUrl, legenda, opcoes = {}) {
  /* A API aceita URL direto; para base64 é preciso enviar como arquivo em
     multipart. Como nem todo gateway devolve imagem, quem chama decide. */
  return chamar('sendPhoto', {
    chat_id: chatId,
    photo: imagemBase64OuUrl,
    caption: legenda,
    parse_mode: 'Markdown',
    ...opcoes
  });
}

export async function editar(chatId, messageId, texto, opcoes = {}) {
  return chamar('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: texto,
    parse_mode: 'Markdown',
    ...opcoes
  });
}

/* Responder o callback tira o "relógio girando" do botão. Sem isso o app do
   cliente fica com aparência de travado por alguns segundos. */
export async function responderBotao(callbackId, texto = '') {
  try { await chamar('answerCallbackQuery', { callback_query_id: callbackId, text: texto }); }
  catch { /* não vale interromper o fluxo por causa do aviso visual */ }
}

export function teclado(linhas) {
  return { reply_markup: { inline_keyboard: linhas } };
}

export async function configurarWebhook(url, segredo) {
  return chamar('setWebhook', {
    url,
    secret_token: segredo,
    allowed_updates: ['message', 'callback_query'],
    drop_pending_updates: true
  });
}

export async function infoWebhook() {
  return chamar('getWebhookInfo', {});
}

export async function infoBot() {
  return chamar('getMe', {});
}

/* Markdown do Telegram quebra a mensagem inteira se houver um caractere
   especial solto — um nome com "_" já é suficiente. */
export function escapar(texto) {
  return String(texto ?? '').replace(/([_*`\[\]])/g, '\\$1');
}
