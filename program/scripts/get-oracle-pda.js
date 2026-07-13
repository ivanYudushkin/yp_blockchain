#!/usr/bin/env node
import { PublicKey } from "@solana/web3.js";

const ORACLE_PROGRAM_ID = new PublicKey("8h4ZUSdg2uQ9sKFXHwFo9sLa2fgqdQUbuqLPktbS6SUB");
const [oraclePda] = PublicKey.findProgramAddressSync(
  [Buffer.from("oracle_state")],
  ORACLE_PROGRAM_ID
);
console.log("ORACLE_STATE_PUBKEY=" + oraclePda.toBase58());
