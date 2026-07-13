/**
 * Off-chain feeder: fetches price (mock or HTTP) and sends update_price transaction.
 * Usage: npm run feeder
 * Requires: cluster running (e.g. anchor localnet), oracle initialized;
 *           ANCHOR_PROVIDER_URL, ANCHOR_WALLET (~/.config/solana/id.json) or env from anchor.
 */
import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/lesson_oracle.json";

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const programId = new PublicKey((idl as { address: string }).address);
  const program = new anchor.Program(idl as anchor.Idl, provider) as any;

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle")],
    programId
  );

  // Mock price (e.g. 1.5 USD with 6 decimals = 1_500_000)
  const mockPrice = 1_500_000 + Math.floor(Math.random() * 100_000);
  console.log("Feeder: mock price (6 decimals):", mockPrice);

  const sig = await program.methods
    .updatePrice(new anchor.BN(mockPrice))
    .accounts({
      oracle: oraclePda,
      admin: provider.wallet.publicKey,
    })
    .rpc();

  console.log("Signature:", sig);
  const oracle = await program.account.oracleState.fetch(oraclePda);
  console.log("Oracle price:", oracle.price.toString(), "last_updated_slot:", oracle.lastUpdatedSlot.toString());
}

main().catch(console.error);
