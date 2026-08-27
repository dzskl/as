/* =========================================================================
   Leads do bot: quem conversou, quando, e em que pé está a conversa.

   Serve para três coisas: a lista de contatos do painel, o disparo em massa,
   e a máquina de estados da conversa (o bot precisa lembrar que pediu o
   e-mail para entender que a próxima mensagem é a resposta).
   ========================================================================= */

import { ler, guardar, empilhar, lerLista, tamanhoLista, incrementar } from './_kv.js';
import { diaBR } from './_pedidos.js';

const INDICE = 'leads:indice';

export async function registrarContato(usuario) {
  const chatId = String(usuario.id);
  const existente = await ler('lead:' + chatId);
  const agora = new Date().toISOString();

  const lead = {
    chatId,
    nome: [usuario.first_name, usuario.last_name].filter(Boolean).join(' ') || 'Sem nome',
    usuario: usuario.username || '',
    primeiroContato: existente?.primeiroContato || agora,
    ultimoContato: agora,
    mensagens: (existente?.mensagens || 0) + 1,
    compras: existente?.compras || 0,
    email: existente?.email || '',
    cpf: existente?.cpf || '',
    bloqueado: existente?.bloqueado || false
  };

  await guardar('lead:' + chatId, lead);
  if (!existente) {
    await empilhar(INDICE, chatId);
    await incrementar(`m:${diaBR()}:leads`);
  }
  return lead;
}

export async function buscarLead(chatId) {
  return ler('lead:' + String(chatId));
}

export async function atualizarLead(chatId, campos) {
  const lead = await buscarLead(chatId);
  if (!lead) return null;
  const novo = { ...lead, ...campos };
  await guardar('lead:' + String(chatId), novo);
  return novo;
}

export async function listarLeads({ limite = 100, pagina = 0 } = {}) {
  const inicio = pagina * limite;
  const ids = await lerLista(INDICE, inicio, inicio + limite - 1);
  const leads = await Promise.all(ids.map(id => buscarLead(id)));
  return leads.filter(Boolean);
}

export async function totalLeads() {
  return tamanhoLista(INDICE);
}

/* ------------------------------------------------------ estado da conversa
   Curto de propósito: uma conversa de compra que ficou parada por horas não
   deve continuar do meio quando a pessoa voltar — melhor recomeçar limpo. */

const VALIDADE_ESTADO = 60 * 30;   // 30 minutos

export async function lerEstado(chatId) {
  return (await ler('estado:' + String(chatId))) || { passo: 'inicio' };
}

export async function gravarEstado(chatId, estado) {
  return guardar('estado:' + String(chatId), estado, VALIDADE_ESTADO);
}

export async function limparEstado(chatId) {
  return guardar('estado:' + String(chatId), { passo: 'inicio' }, VALIDADE_ESTADO);
}
