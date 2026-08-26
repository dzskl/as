/* =========================================================================
   Configuração central do checkout.
   Preços e dados do produto ficam AQUI, no servidor — nunca no navegador.
   Motivo: se o valor viesse do front, qualquer pessoa abriria o DevTools,
   trocaria 197 por 1 e pagaria R$ 1,00. O front só manda o ID do produto.
   ========================================================================= */

export const PRODUTOS = {
  'bot-24h': {
    id: 'bot-24h',
    nome: 'Bot 24h — acesso vitalício',
    descricao: 'Bot de atendimento para Telegram + instalação guiada + bônus',
    valorCentavos: 19700,          // R$ 197,00
    maxParcelas: 12,
    parcelaMinimaCentavos: 1000    // não parcela abaixo de R$ 10 por parcela
  }
};

export function buscarProduto(id) {
  return PRODUTOS[id] || null;
}

/* Formata centavos para exibição: 19700 -> "197,00" */
export function formatarBRL(centavos) {
  return (centavos / 100).toFixed(2).replace('.', ',');
}

/* Opções de parcelamento SEM juros (o gateway pode aplicar juros próprios). */
export function opcoesParcelamento(produto) {
  const opcoes = [];
  for (let n = 1; n <= produto.maxParcelas; n++) {
    const parcela = Math.round(produto.valorCentavos / n);
    if (n > 1 && parcela < produto.parcelaMinimaCentavos) break;
    opcoes.push({ parcelas: n, valorParcelaCentavos: parcela });
  }
  return opcoes;
}

export const CONFIG = {
  /* 'simulado' permite testar o fluxo inteiro sem credencial de gateway.
     Em produção use GATEWAY_MODO=freepay. */
  modoGateway: process.env.GATEWAY_MODO || 'simulado',
  urlSite: process.env.URL_SITE || 'http://localhost:3000',
  /* Segredo usado para assinar o token de acesso à página de obrigado. */
  segredoApp: process.env.SEGREDO_APP || 'troque-este-segredo-em-producao'
};
