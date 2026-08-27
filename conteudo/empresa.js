/* =========================================================================
   FONTE ÚNICA DOS DADOS DA EMPRESA

   Todo dado de identificação que aparece no site vive aqui. As páginas
   carregam este arquivo e se preenchem sozinhas — trocar por dado real é
   editar SÓ este arquivo, não caçar em quatro.

   ⚠️ NADA AQUI É REAL. Cada campo abaixo está com valor de exemplo e precisa
   ser preenchido antes de qualquer tráfego chegar à página. Rode
   `npm run conteudo` para ver a lista do que ainda falta.

   Depoimento inventado é propaganda enganosa (Código de Defesa do
   Consumidor, art. 37) e sujeita a multa — os três abaixo são modelos de
   FORMATO, não de conteúdo.
   ========================================================================= */

export const EMPRESA = {

  /* ---- Identificação legal -------------------------------------------- */
  // TODO: razão social exata do contrato social
  razaoSocial: 'SUA EMPRESA LTDA',
  // TODO: CNPJ com pontuação
  cnpj: '00.000.000/0001-00',
  // TODO: cidade e UF da sede — usado no foro dos Termos de Uso
  cidadeUF: '[cidade/UF]',

  /* ---- Endereços de contato ------------------------------------------- */
  // TODO: e-mail que recebe dúvidas de compra e suporte
  emailSuporte: 'suporte@seudominio.com.br',
  // TODO: e-mail do canal de privacidade (LGPD, art. 41 — pode ser o mesmo)
  emailPrivacidade: 'privacidade@seudominio.com.br',
  // TODO: nome de quem responde por dados pessoais (encarregado/DPO)
  encarregadoDados: '[nome do responsável]',

  /* ---- Telegram -------------------------------------------------------- */
  // TODO: usuário do Telegram do suporte, SEM o @
  telegramUsuario: 'seuusuario',

  /* ---- Domínio --------------------------------------------------------- */
  // TODO: endereço público do site, sem barra no fim.
  // Também usado em og:url e canonical — errado aqui, o preview do link no
  // WhatsApp e no Telegram aponta para o lugar errado.
  site: 'https://seudominio.com.br',

  /* ---- Depoimentos ------------------------------------------------------
     Substitua pelos depoimentos REAIS dos seus clientes. Print de conversa
     converte mais que texto digitado — e é verificável.                    */
  depoimentos: [
    {
      // TODO: depoimento real do cliente 1
      iniciais: 'MR',
      texto: 'Eu perdia umas duas horas por dia respondendo a mesma coisa. Hoje o bot resolve tudo e só me chama quando a pessoa realmente quer fechar. Recuperei minha manhã inteira.',
      autor: 'Marina R.',
      contexto: 'Loja de semijoias · Curitiba'
    },
    {
      // TODO: depoimento real do cliente 2
      iniciais: 'JS',
      texto: 'Confesso que achei que não ia funcionar pro meu caso. Na primeira semana fechei três vendas que entraram depois das 22h — horário que eu simplesmente não atendia antes.',
      autor: 'Jonas S.',
      contexto: 'Mentoria de vendas · Belo Horizonte'
    },
    {
      // TODO: depoimento real do cliente 3
      iniciais: 'AC',
      texto: 'Não entendo nada de tecnologia e instalei sozinha assistindo o vídeo. Levei uns 15 minutos porque parei pra tomar café no meio.',
      autor: 'Ana C.',
      contexto: 'Estúdio de pilates · Recife'
    }
  ]
};

/* Campos derivados: montados a partir dos de cima, para não haver duas
   verdades sobre a mesma coisa. */
export const DERIVADOS = {
  telegramUrl: `https://t.me/${EMPRESA.telegramUsuario}`,
  telegramArroba: `@${EMPRESA.telegramUsuario}`,
  siteBarra: `${EMPRESA.site}/`,
  mailtoSuporte: `mailto:${EMPRESA.emailSuporte}`,
  mailtoPrivacidade: `mailto:${EMPRESA.emailPrivacidade}`,
  rodapeLegal: `${EMPRESA.razaoSocial} — CNPJ ${EMPRESA.cnpj}`
};

/* Cada valor que ainda está como exemplo. É o que alimenta o aviso do
   `npm run conteudo` e o teste que impede a página de ir ao ar assim. */
export const VALORES_DE_EXEMPLO = {
  razaoSocial: 'SUA EMPRESA LTDA',
  cnpj: '00.000.000/0001-00',
  cidadeUF: '[cidade/UF]',
  emailSuporte: 'suporte@seudominio.com.br',
  emailPrivacidade: 'privacidade@seudominio.com.br',
  encarregadoDados: '[nome do responsável]',
  telegramUsuario: 'seuusuario',
  site: 'https://seudominio.com.br'
};

export function pendencias() {
  const faltando = Object.entries(VALORES_DE_EXEMPLO)
    .filter(([campo, exemplo]) => EMPRESA[campo] === exemplo)
    .map(([campo]) => campo);

  const depoimentosFicticios = EMPRESA.depoimentos
    .filter(d => ['Marina R.', 'Jonas S.', 'Ana C.'].includes(d.autor))
    .map(d => d.autor);

  return { campos: faltando, depoimentos: depoimentosFicticios };
}

export default EMPRESA;
