# Página de vendas — Bot do Telegram

Página de vendas de arquivo único (`index.html`), em português, com oferta de **pagamento único / acesso vitalício**.
Sem dependências, sem build: é só abrir o arquivo no navegador ou subir em qualquer hospedagem.

## Como publicar

| Onde | Como |
|---|---|
| **Netlify Drop** | Arraste a pasta em [app.netlify.com/drop](https://app.netlify.com/drop) — no ar em segundos, grátis |
| **Vercel** | `vercel` na pasta, ou importe o repositório |
| **GitHub Pages** | Settings → Pages → branch → `/root` |
| **Hospedagem comum** | Envie o `index.html` para a pasta `public_html` via FTP |

## O que editar (na ordem)

Abra o `index.html` num editor e use **Ctrl+F** para achar cada item. Tudo que estiver entre
colchetes `[ASSIM]` é placeholder e precisa ser trocado.

1. **`[NOME DO BOT]`** → nome do seu bot (aparece em ~8 lugares, use "Substituir todos").
2. **Título e descrição** (linhas 6–17) → o que aparece no Google e no preview do link no WhatsApp/Telegram.
3. **Headline do hero** → a promessa principal. Fórmula que funciona: *[resultado] em [tempo] sem [dor]*.
4. **Conversa do celular** → escreva um diálogo real mostrando o bot resolvendo o problema. É o trecho que mais convence.
5. **Números da faixa** → use só métricas que você consegue comprovar.
6. **3 dores / 6 benefícios** → fale de resultado ("responde na hora"), não de recurso técnico ("webhook assíncrono").
7. **Depoimentos** → precisam ser verdadeiros. Print de conversa do Telegram converte mais que texto digitado.
8. **Preço** → `[497]` (valor riscado), `[197]` (valor real), `[19,90]` (parcela). Aparece também na barra fixa do celular e no CTA final.
9. **Link do checkout** → no fim do arquivo, na variável `LINK_CHECKOUT`. Preencha uma vez e **todos** os botões de compra passam a apontar para lá:
   ```js
   var LINK_CHECKOUT = 'https://pay.kiwify.com.br/seu-produto';
   ```
10. **Rodapé** → nome da empresa, CNPJ, links de termos/privacidade e seu usuário do Telegram.
11. **`capa.jpg`** → coloque uma imagem 1200×630 na pasta para o preview do link ficar bonito ao compartilhar.

## Trocar as cores

Tudo sai das variáveis no topo do `<style>`:

```css
--azul:#2aabee;   /* cor da marca (padrão: azul do Telegram) */
--verde:#22c55e;  /* botões de compra e preço */
--bg:#0a141d;     /* fundo */
```

## Estrutura da página

Hero com preview do bot → prova em números → 3 dores → 6 benefícios → 3 passos de instalação →
o que está incluído → depoimentos → **preço + garantia de 7 dias** → FAQ → CTA final → rodapé.
No celular, uma barra fixa com o botão de compra acompanha a rolagem.

## Antes de anunciar

- [ ] Nenhum `[ ]` sobrou na página (`grep -o '\[[^]]*\]' index.html`)
- [ ] `LINK_CHECKOUT` preenchido e testado numa compra de teste
- [ ] Abriu no celular e no computador
- [ ] Depoimentos e números são reais (Código de Defesa do Consumidor, art. 37: propaganda enganosa dá multa)
- [ ] Política de reembolso do rodapé bate com a garantia de 7 dias anunciada
- [ ] Pixel do Facebook / Google Analytics colado antes do `</head>`, se for anunciar
