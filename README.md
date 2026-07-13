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

## Шаг 2. backend/

Восстановлена helper-функция преобразования цены и исправлен сломанный unit-тест:

- **`to_fixed_6`** — парсит decimal-строку в fixed-point с 6 знаками (`"120"` → `120_000_000`, `"120.12"` → `120_120_000`, `"0.000001"` → `1`); лишние цифры после 6-го знака **обрезаются**, не округляются
- **тест `to_fixed_6_truncates_fraction_to_six_digits`** — ожидание `1_123_456` вместо `1_123_457` для `"1.1234569"`
- **`Cargo.toml`** — путь к crate оракула: `../program/programs/sol_usd_oracle` (вместо `../program-task/...`)

Проверка:

```bash
cd backend
cargo test
```

Результат:

```
running 7 tests
test tests::price_source_prefers_mock_over_url ... ok
test tests::price_source_uses_default_url_when_no_override ... ok
test tests::to_fixed_6_truncates_fraction_to_six_digits ... ok
test tests::to_fixed_6_parses_integer_and_fractional_part ... ok
test tests::to_fixed_6_rejects_invalid_input ... ok
test tests::parse_token_created_returns_none_for_unrelated_logs ... ok
test tests::parse_token_created_reads_expected_fields ... ok

test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
```
