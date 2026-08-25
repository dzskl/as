# Bot 24h — página de vendas completa

Página de vendas pronta para publicar, em português, com oferta de **pagamento único / acesso vitalício**.
HTML e CSS puros: sem build, sem framework, sem dependência. É só subir os arquivos.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página de vendas (copy completa, nada em branco) |
| `obrigado.html` | Página pós-compra com os próximos passos — aponte o checkout para ela |
| `termos.html` | Termos de uso + política de reembolso |
| `privacidade.html` | Política de privacidade (LGPD) |
| `estilo-paginas.css` | Estilo compartilhado das três páginas internas |
| `capa.png` | Imagem 1200×630 que aparece ao compartilhar o link |
| `vercel.json` | Configuração de deploy (URLs limpas, cache e headers) |

## Antes de publicar — o mínimo obrigatório

**1. Link do checkout.** No fim do `index.html`, preencha:

```js
var LINK_CHECKOUT = 'https://pay.kiwify.com.br/seu-produto';
```

Todos os botões de compra passam a apontar para lá. Enquanto estiver vazio, eles só rolam até a seção de preço.

**2. Dados da empresa.** Um localizar/substituir em todos os arquivos:

| Trocar | Por |
|---|---|
| `SUA EMPRESA LTDA` | sua razão social |
| `00.000.000/0001-00` | seu CNPJ |
| `@seuusuario` e `t.me/seuusuario` | seu usuário do Telegram |
| `seudominio.com.br` | seu domínio (e-mails e URLs) |
| `[cidade/UF]` (termos.html) | sua cidade |
| `[nome do responsável]` (privacidade.html) | quem responde por dados |

**3. Depoimentos.** Os três da seção "Quem colocou pra rodar" são **exemplos de formato** — está avisado
num comentário no código. Troque pelos depoimentos reais dos seus clientes antes de anunciar. Print de conversa
do Telegram converte mais que texto digitado, e depoimento inventado é propaganda enganosa (CDC, art. 37).

**4. Preço.** Se o seu não for R$ 197, busque por `197`, `497` e `19,90` no `index.html` — aparecem na caixa de
preço, na barra fixa do celular, no CTA final e no texto da garantia.

## Trocar o nome do produto

"Bot 24h" aparece nos 4 arquivos HTML e na `capa.png`. Um substituir-todos resolve o texto;
a imagem de capa você refaz em qualquer editor no tamanho 1200×630.

## Ajustar as cores

Tudo sai de três variáveis no topo do `<style>` do `index.html` (e repetidas no `estilo-paginas.css`):

```css
--azul:#2aabee;   /* cor da marca (padrão: azul do Telegram) */
--verde:#22c55e;  /* botões de compra e preço */
--bg:#0a141d;     /* fundo */
```

## Publicar na Vercel

O repositório já tem o `vercel.json` configurado (URLs limpas, cache dos arquivos estáticos e headers de
segurança). Não há build: a Vercel serve os arquivos direto.

**Pelo painel (3 cliques, recomendado):**

1. Acesse [vercel.com/new](https://vercel.com/new) e conecte sua conta do GitHub.
2. Escolha o repositório `dzskl/as` → **Import**.
3. Em *Framework Preset* deixe **Other**, não preencha build nem output → **Deploy**.

A Vercel publica a branch padrão do repositório — hoje é a `claude/telegram-bot-sales-page-cghi64`.
Em ~30 segundos você recebe uma URL `*.vercel.app`, e cada `git push` novo redeploya sozinho.
Para usar domínio próprio: *Project → Settings → Domains*.

**Pelo terminal, sem GitHub:**

```bash
npx vercel          # pré-visualização
npx vercel --prod   # produção
```

Rode dentro da pasta do projeto; o `npx` pede login na primeira vez.

### Outras hospedagens

| Onde | Como |
|---|---|
| **Netlify Drop** | Arraste a pasta em [app.netlify.com/drop](https://app.netlify.com/drop) — no ar em segundos |
| **GitHub Pages** | Settings → Pages → branch → `/root` |
| **Hospedagem comum** | Suba os arquivos para a pasta `public_html` via FTP |

Depois de publicar, troque `https://seudominio.com.br/` nas tags `og:url` e `canonical` do `index.html`
pelo endereço real — é o que faz o preview do link aparecer certo no WhatsApp e no Telegram.

## Estrutura da página

Hero com demonstração do bot → faixa de números → 3 dores → comparativo antes/depois → 6 recursos →
3 passos de instalação → o que está incluído → depoimentos → **preço + garantia de 7 dias** → sobre →
8 perguntas frequentes → CTA final → rodapé. No celular, uma barra fixa com o botão de compra acompanha a rolagem.

## Checklist final

- [ ] `LINK_CHECKOUT` preenchido e testado com uma compra de teste
- [ ] Checkout configurado para redirecionar à `obrigado.html` após a aprovação
- [ ] Dados da empresa trocados nos 4 arquivos (`grep -rn "SUA EMPRESA\|seuusuario\|seudominio" .`)
- [ ] Depoimentos reais no lugar dos exemplos
- [ ] Aberto no celular e no computador
- [ ] `og:url` e `canonical` com o domínio real; link testado no WhatsApp para ver a capa
- [ ] Pixel do Meta / Google Analytics colados no bloco reservado antes do `</head>`
- [ ] Prazo de garantia da página igual ao configurado na plataforma de pagamento
