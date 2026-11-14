# Coin payouts · Major Scrims

Painel separado do site para pagar Major Coins a partir dos CSVs de leaderboard do Yunite.

1. Sobe 1 ou mais CSVs (até 10).
2. Escolhe o modo:
   - **Combine into one final table**: soma pontos, vitórias e kills da mesma equipe (mesmos jogadores) em todos os arquivos e monta a tabela final por pontos (desempate: vitórias, kills, melhor colocação).
   - **Pay each file separately**: cada CSV paga sozinho, pela coluna `Placement`.
3. Ajusta a tabela de prêmios por equipe (fica salva como padrão).
4. **Preview** mostra quanto cada jogador recebe; **Pay** credita.

As moedas de cada equipe são divididas igualmente pelo tamanho do modo (trio = 3). Quem não tem Discord ID no CSV é procurado pelo nome da Epic em `verified_players`; quem não for encontrado não recebe e aparece riscado na prévia.

O crédito é um `$inc` em `wallet` no registro da season em curso (`players`, mesma regra do site e do bot). Cada pagamento fica em `coin_payouts`; os mesmos arquivos não podem ser pagos duas vezes, e **Undo** devolve o pagamento (sem deixar saldo negativo).

## Tabela para a transmissão

No painel, a **General table** aparece ao subir o primeiro CSV. Com **Live on stream** ligado, cada mudança vai para `/stream`, que é pública (para usar como fonte de navegador no OBS, 1920x1080) e se atualiza sozinha a cada 8 segundos.

O topo do `/stream` é feito em CSS (`.s-banner` em `app/globals.css`); a moeda é `public/coin.png`.

Parâmetros de `/stream`: `?lang=pt` (padrão espanhol), `?rows=12` (linhas por página), `?rotate=12` (segundos por página), `?top=50` (só até essa posição).

## Variáveis de ambiente (Vercel)

| Variável | O que é |
|---|---|
| `MONGODB_URI` | URI do cluster com permissão de escrita (a mesma de `LEADERBOARD_MONGODB_WRITE_URI` do site) |
| `MONGODB_DB` | Nome do banco. Padrão: `test` |
| `GUILD_ID` | ID do servidor do Discord (o mesmo `DISCORD_GUILD_ID` do site) |
| `PANEL_PASSWORD` | Senha para entrar no painel |
| `SESSION_SECRET` | Texto aleatório longo: `openssl rand -base64 32` |

## Rodar local

```
npm install
npm run dev
npm test
```
