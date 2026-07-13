# Solana Mini Launchpad

Учебный мини-лаунчпад на Solana + Anchor.

## Шаг 1. program/

Исправлены `todo!()` и сломанные ожидания в LiteSVM-тестах:

- **sol_usd_oracle** — `apply_price_update` сохраняет `price` и `last_updated_slot`
- **token_minter** — `compute_fee_lamports`: `fee_lamports = mint_fee_usd * LAMPORTS_PER_SOL / price` (u128 + `checked`_*)
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

- `**to_fixed_6**` — парсит decimal-строку в fixed-point с 6 знаками (`"120"` → `120_000_000`, `"120.12"` → `120_120_000`, `"0.000001"` → `1`); лишние цифры после 6-го знака **обрезаются**, не округляются
- **тест `to_fixed_6_truncates_fraction_to_six_digits`** — ожидание `1_123_456` вместо `1_123_457` для `"1.1234569"`
- `**Cargo.toml**` — путь к crate оракула: `../program/programs/sol_usd_oracle` (вместо `../program-task/...`)

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

## Шаг 3. Контур деплоя

Сгенерированы свои keypair программ, ID подставлены в `declare_id!`, `Anchor.toml`, тесты, frontend, backend и init-скрипты Контракты собраны, задеплоены и инициализированы на localnet.

### Адреса


| Компонент                    | Адрес                                          |
| ---------------------------- | ---------------------------------------------- |
| Oracle (`sol_usd_oracle`)    | `8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB` |
| Launchpad (`token_minter`)   | `Gky53TnpYWU33mtsfd7tBFn3xggpuLtShGi1jQYn5x8P` |
| PDA оракула (`oracle_state`) | `Fpwi1HzT8tz64HLeUPF252ZTGDpYcUZHHLk2euHMqrKW` |


### Команды

```bash
cd program
mkdir -p target/deploy
solana-keygen new -o target/deploy/sol_usd_oracle-keypair.json --force --no-bip39-passphrase
solana-keygen new -o target/deploy/token_minter-keypair.json --force --no-bip39-passphrase


anchor build
anchor deploy --provider.cluster localnet
node scripts/init-local.js
```

### Результат

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

### Тесты

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

## Шаг 4. Backend-сервис (localnet)

Настроен `backend/.env` и запущен feeder: backend обновляет цену оракула на localnet.

### `.env`

```
ORACLE_PROGRAM_ID=8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB
MINTER_PROGRAM_ID=Gky53TnpYWU33mtsfd7tBFn3xggpuLtShGi1jQYn5x8P
ORACLE_STATE_PUBKEY=Fpwi1HzT8tz64HLeUPF252ZTGDpYcUZHHLk2euHMqrKW
BACKEND_KEYPAIR_PATH=~/.config/solana/id.json
MOCK_PRICE=120000000
```

### Команды

```bash
# терминал 1
solana-test-validator --ledger ~/solana-test-ledger --reset

# терминал 2
cd program
anchor deploy --provider.cluster localnet
node scripts/init-local.js

# терминал 3 — backend
cd backend
RUST_LOG=info cargo run
```

### Результат

```
2026-07-13T19:54:56.264074Z  INFO backend: oracle price updated (initial) sig=3V8sP9RtxGHGGKMAKuqPasjqxSC8Pnh9FrR7tktCcFU3MA7p1SSjXczWqCp1H249vdQCjyCSFffHCquZoFHVXv3t price=120000000
2026-07-13T19:54:56.769352Z  INFO backend: oracle price updated (scheduled) sig=4P6CVhLTAQ7rDLmpzqesMFUpT66GjyFf875ie3m8rtqHZTXkqaznXiCDRnGWYf1poxwivqiYsiduxMpWAY75xVQD price=120000000
```

Backend стабильно отправляет `update_price` в оракул (`price=120000000`)

## Шаг 5-6. Полный цикл + Devnet

### Адреса


| Компонент                    | Адрес                                          |
| ---------------------------- | ---------------------------------------------- |
| Oracle (`sol_usd_oracle`)    | `8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB` |
| Launchpad (`token_minter`)   | `Gky53TnpYWU33mtsfd7tBFn3xggpuLtShGi1jQYn5x8P` |
| PDA оракула (`oracle_state`) | `Fpwi1HzT8tz64HLeUPF252ZTGDpYcUZHHLk2euHMqrKW` |


### Команды

```bash
cd program
RPC_URL=http://127.0.0.1:8899 node scripts/mint-local.js

# Devnet
solana config set --url devnet
cd program
anchor deploy --provider.cluster devnet
RPC_URL=https://api.devnet.solana.com node scripts/init-local.js
RPC_URL=https://api.devnet.solana.com node scripts/mint-local.js
```

### Localnet mint

```
MINT_TX=2h2yhXsZgRJYthZJAv1puJ1oN57YzwuzfsaNMZgDPQGnF3SigzYxy4T4tJg5T64F9z9yDnB5BER7X4MQdRJCYMTq
MINT_PUBKEY=vVxgfQ8TPkfc7kraQE2tQsnHbN7ibCNkmJ1D31zkBRr
```

### Devnet deploy

```
sol_usd_oracle Program Id: 8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB
Signature: 3gPNfmyZW1A8VZJj35887ty5m52pp9xALJ5djvbJMaJHNuWLQ5wybpJrcwbcArXix75PR1yJpcwXgp17QUkpDZWA

token_minter Program Id: Gky53TnpYWU33mtsfd7tBFn3xggpuLtShGi1jQYn5x8P
Signature: 1bNivNHps14gpfJPLHQnzxaMjn5Ukq9hSkJoQaJ6kB9SEvjPVAh5cVRQnpfqGHGc9uzoXPsLRTymMpb2wxDcuqy
Deploy success
```

### Devnet init

```
ORACLE_STATE_PUBKEY=Fpwi1HzT8tz64HLeUPF252ZTGDpYcUZHHLk2euHMqrKW
Initializing oracle...
  tx: FZyw9ML1QhMpXcw5dFE2ZXiRPj4uNHyFnxtu9z3gMhoo1i9MYq4khFCahcrPVm8u6ZXrnhV2uYKg6c9QEJDzPgN
Setting initial price...
  tx: 4VMqWkS6oMEAzmzFgqp4pet6KA18WZ7hgv993vMU7NQJGE7upjYj15bTyHvBfSXqRK9A2fDjWEVxsUifsnDcvFkU
Initializing minter...
  tx: 4VQj42Mk45FExG9hU9JWXHw2VbrXzz3FEoPoB3bat21wQbqoHhhLpuGrHjkjXWv1YGiWEeVptUg4s8WYFi3kj9Yf
```

### Успешные минта в Devnet (Explorer)

1. [https://explorer.solana.com/tx/2Vvni2LkonTdkpycvL3zjX1is3Hr6mkH84bbvkxw1vun1vhgfUiGeSEfQTs1yPdbnWqFTQt2ejqcA3M4JwKnUWp1?cluster=devnet](https://explorer.solana.com/tx/2Vvni2LkonTdkpycvL3zjX1is3Hr6mkH84bbvkxw1vun1vhgfUiGeSEfQTs1yPdbnWqFTQt2ejqcA3M4JwKnUWp1?cluster=devnet)
  mint: `9KHtGrw8zh7DQLdwnZooFCDKpwKhmN1EDKY3xx73gtYv`
2. [https://explorer.solana.com/tx/5uf6cxsVt76AJCrjQbxgSdssLFAnrdS2jb1Y34C2eN2qrrKAiC7m1EpRLqrEhuFNHbBYtM7gTQgbcgZUMLXpGh83?cluster=devnet](https://explorer.solana.com/tx/5uf6cxsVt76AJCrjQbxgSdssLFAnrdS2jb1Y34C2eN2qrrKAiC7m1EpRLqrEhuFNHbBYtM7gTQgbcgZUMLXpGh83?cluster=devnet)
  mint: `8292nRxJnXjfz7nh7C5svNb7jwk7XHT5AwX7Xwu356KQ`
3. [https://explorer.solana.com/tx/5pT65GjHsZT4Vg896PkHZzfkHAAJuMh8K6KN2KJJa9KkKWmrE9MHunQN5efT6FFg1DT1SuSDcwVfb83roepxR3c7?cluster=devnet](https://explorer.solana.com/tx/5pT65GjHsZT4Vg896PkHZzfkHAAJuMh8K6KN2KJJa9KkKWmrE9MHunQN5efT6FFg1DT1SuSDcwVfb83roepxR3c7?cluster=devnet)
  mint: `CcofPbcP6fhxeJ5pGdEb8mELLyFXR5qEiFfGk3HbwYgD`

