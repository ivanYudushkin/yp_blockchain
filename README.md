# Solana Mini Launchpad

Учебный мини-лаунчпад на Solana + Anchor.

## Шаг 1. program/

Исправлены `todo!()` и сломанные ожидания в LiteSVM-тестах:

- **sol_usd_oracle** — `apply_price_update` сохраняет `price` и `last_updated_slot`
- **token_minter** — `compute_fee_lamports`: `fee_lamports = mint_fee_usd * LAMPORTS_PER_SOL / price` (u128 + `checked_*`)
- **oracle.litesvm.ts** — `decimals` = 6
- **minter.litesvm.ts** — формула ожидаемой комиссии: `FEE_USD * LAMPORTS_PER_SOL / PRICE`

Проверка:

```bash
cd program
yarn install
anchor build
yarn run ts-mocha -p ./tsconfig.json -t 1000000 "tests/**/*.ts"
```

Результат:

```
  token_minter (LiteSVM)
    ✔ initialize oracle + minter and mint token with fee
    ✔ rejects mint when initial supply is zero
    ✔ rejects mint when decimals exceed allowed range

  sol_usd_oracle (LiteSVM)
    ✔ initialize_oracle sets admin and defaults
    ✔ update_price updates price only for admin
    ✔ rejects update_price from non-admin signer
    ✔ rejects zero price update


  7 passing (47ms)
```
