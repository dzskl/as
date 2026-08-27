/* =========================================================================
   Configuração editável pelo painel.

   Tudo que o lojista muda sem programador — textos do bot, botões, produtos,
   preços, links de suporte — vive aqui, gravado no KV. Os valores do arquivo
   são apenas o ponto de partida de uma instalação nova.

   Preço continua sendo decidido no servidor: o painel grava, o checkout e o
   bot leem daqui. O navegador nunca opina sobre valor.
   ========================================================================= */

import { ler, guardar } from './_kv.js';
import { PRODUTOS as PADRAO_ARQUIVO, ligado } from './_config.js';

const CHAVE = 'config:loja';

export const CONFIG_PADRAO = {
  loja: {
    nome: 'Bot 24h',
    suporteTelegram: 'seuusuario',
    emailSuporte: 'suporte@seudominio.com.br'
  },
  bot: {
    ativo: true,
    boasVindas:
      'Olá, {nome}! 👋\n\nSou o assistente do *{loja}*. Posso te mostrar os produtos, ' +
      'tirar dúvidas e gerar seu Pix na hora.\n\nO que você quer fazer?',
    textoCatalogo: 'Escolha o que você quer levar:',
    textoDuvidas:
      '*Perguntas frequentes*\n\n' +
      '*Como recebo o acesso?* Automaticamente, assim que o Pix é confirmado.\n' +
      '*Tem garantia?* Sim, 7 dias. Não gostou, devolvemos tudo.\n' +
      '*Preciso saber programar?* Não. A instalação é guiada em vídeo.',
    textoPosPagamento:
      '✅ *Pagamento confirmado!*\n\nSeu acesso ao *{produto}* está liberado. ' +
      'Enviamos os detalhes para *{email}*.\n\nQualquer dúvida, é só chamar aqui.',
    pedirEmail: 'Perfeito! Para emitir a nota e liberar seu acesso, me diga seu *e-mail*:',
    pedirCpf: 'Agora seu *CPF* (só números):',
    pixGerado:
      '💸 *Pix gerado!*\n\nValor: *R$ {valor}*\n\nCopie o código abaixo e pague no app do seu banco. ' +
      'Assim que cair, eu te aviso aqui mesmo — não precisa mandar comprovante.'
  },
  produtos: null   // null = usa o catálogo do arquivo
};

/* Junta o que está gravado com o padrão, campo a campo, para que uma versão
   nova do código com chaves novas não quebre uma configuração antiga. */
function mesclar(padrao, salvo) {
  if (!salvo || typeof salvo !== 'object') return padrao;
  const saida = { ...padrao };
  for (const [chave, valor] of Object.entries(salvo)) {
    saida[chave] = (valor && typeof valor === 'object' && !Array.isArray(valor))
      ? mesclar(padrao[chave] ?? {}, valor)
      : valor;
  }
  return saida;
}

export async function lerConfig() {
  return mesclar(CONFIG_PADRAO, await ler(CHAVE));
}

export async function salvarConfig(novo) {
  const atual = await lerConfig();
  const mesclado = mesclar(atual, novo);
  await guardar(CHAVE, mesclado);
  return mesclado;
}

/* Catálogo efetivo: o que o painel gravou, ou o do arquivo. */
export async function catalogo() {
  const config = await lerConfig();
  if (config.produtos && Object.keys(config.produtos).length) return config.produtos;
  return PADRAO_ARQUIVO;
}

export async function buscarProduto(id) {
  const produtos = await catalogo();
  const produto = produtos[id];
  if (!produto || produto.ativo === false) return null;

  /* Preço de teste, igual ao do checkout: só vale com DIAGNOSTICO ligado. */
  const teste = Number(process.env.PRECO_TESTE_CENTAVOS);
  if (ligado(process.env.DIAGNOSTICO) && Number.isFinite(teste) && teste >= 100) {
    return { ...produto, valorCentavos: teste, nome: produto.nome + ' (TESTE)' };
  }
  return produto;
}

/* Substitui {chaves} no texto. Mantém o marcador quando não há valor, para
   ficar visível no painel que algo não foi preenchido. */
export function preencher(texto, valores) {
  return String(texto || '').replace(/\{(\w+)\}/g, (marcador, chave) =>
    valores[chave] !== undefined && valores[chave] !== null ? String(valores[chave]) : marcador);
}
