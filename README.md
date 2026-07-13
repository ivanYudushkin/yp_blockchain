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

## Шаг 3. Свой контур деплоя (localnet)

Сгенерированы свои keypair программ, ID подставлены в `declare_id!`, `Anchor.toml`, тесты, frontend, backend и init-скрипты. Контракты собраны, задеплоены и инициализированы на localnet.

### Адреса

| Компонент | Адрес |
|-----------|-------|
| Oracle (`sol_usd_oracle`) | `8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB` |
| Launchpad (`token_minter`) | `Gky53TnpYWU33mtsfd7tBFn3xggpuLtShGi1jQYn5x8P` |
| PDA оракула (`oracle_state`) | `Fpwi1HzT8tz64HLeUPF252ZTGDpYcUZHHLk2euHMqrKW` |

### Команды

```bash
cd program
mkdir -p target/deploy
solana-keygen new -o target/deploy/sol_usd_oracle-keypair.json --force --no-bip39-passphrase
solana-keygen new -o target/deploy/token_minter-keypair.json --force --no-bip39-passphrase

# подставить pubkey в declare_id!, Anchor.toml, frontend/app/config.ts, backend/.env.example, scripts/

anchor build
# в другом терминале: solana-test-validator
anchor deploy --provider.cluster localnet
node scripts/init-local.js
```

### Результат деплоя и init

```
Deploying program "sol_usd_oracle"...
Program Id: 8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB
Signature: 4GF8wKgNN4tFS7pfdZsbaXKREdNtdbyuG8GjiptouGDbGvcQWUjfES8yrPwyA4F3WtLmaNZNboRG9g1oum4YXmi9

Deploying program "token_minter"...
Program Id: Gky53TnpYWU33mtsfd7tBFn3xggpuLtShGi1jQYn5x8P
Signature: kZZ7aWGhUp1Y1cVAWGyxb6ZPvqnqdFDeeBhWZmHrsJq5B7eR7udZ6hjSDwoA5dmzs1PSNf68ZFbkn1HZ3xT1Sgv
Deploy success

ORACLE_STATE_PUBKEY=Fpwi1HzT8tz64HLeUPF252ZTGDpYcUZHHLk2euHMqrKW
Initializing oracle...
  tx: x2nmZHUfnDsaf6XZuH4ad2R7XzyWv4ytqGzwUeqGzA5AW7TBmsrZzGV6UhQhu8chCkM8jhrTM7v3mx3MauZMgxp
Setting initial price...
  tx: 3kKa5MgBN71rMDNSsnEhaZVPT9imtr1JtK7Va6XPixK9dSFR5mQt9mw1gsRuWjmmtpR4dcEVCmY62qT9AVstMa6n
Initializing minter (treasury = wallet)...
  tx: 5fSkPjvHakC8frnLhdjh8gP8W9GkBqiQT8xtmBsvqgMEAjGa1cqicN3FKed36ATbK1Tw8Bc4vcZudjRK3vJ9Q2qA
Done.
```

### Проверка тестов после смены ID

```bash
# из корня репозитория
make test
cd backend && cargo test
```

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

  7 passing (50ms)
```

```
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.02s
```
