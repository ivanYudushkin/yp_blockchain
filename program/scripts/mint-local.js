#!/usr/bin/env node
/** Mint a test token on localnet (oracle + minter must be initialized). */
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import BN from "bn.js";

const require = createRequire(import.meta.url);
const ORACLE_PROGRAM_ID = new PublicKey("8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB");
const MINTER_PROGRAM_ID = new PublicKey("Gky53TnpYWU33mtsfd7tBFn3xggpuLtShGi1jQYn5x8P");
const ORACLE_SEED = Buffer.from("oracle_state");
const MINTER_SEED = Buffer.from("minter_config");

const programDir = path.resolve(process.cwd());
const walletPath = process.env.ANCHOR_WALLET || path.join(process.env.HOME || "", ".config/solana/id.json");

async function main() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8899";
  const connection = new Connection(rpcUrl);
  const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))));
  const minterIdl = require(path.join(programDir, "target/idl/token_minter.json"));
  const minterCoder = new BorshInstructionCoder(minterIdl);

  const [oraclePda] = PublicKey.findProgramAddressSync([ORACLE_SEED], ORACLE_PROGRAM_ID);
  const [minterPda] = PublicKey.findProgramAddressSync([MINTER_SEED], MINTER_PROGRAM_ID);
  const mintKeypair = Keypair.generate();
  const userAta = getAssociatedTokenAddressSync(mintKeypair.publicKey, payer.publicKey);

  const ix = {
    programId: MINTER_PROGRAM_ID,
    keys: [
      { pubkey: minterPda, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: true },
      { pubkey: ORACLE_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: oraclePda, isSigner: false, isWritable: false },
      { pubkey: mintKeypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: userAta, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    data: Buffer.from(
      minterCoder.encode("mint_token", {
        decimals: 6,
        initial_supply: new BN(1_000_000),
        name: "",
        symbol: "",
        uri: "",
      })
    ),
  };

  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer, mintKeypair]);
  console.log("MINT_TX=" + sig);
  console.log("MINT_PUBKEY=" + mintKeypair.publicKey.toBase58());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
