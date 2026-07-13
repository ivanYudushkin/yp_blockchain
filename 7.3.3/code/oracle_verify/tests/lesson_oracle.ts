import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

describe("lesson_oracle", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.LessonOracle as any;
  const nonAdminKeypair = Keypair.generate();

  const [oraclePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("oracle")],
    program.programId
  );

  before("airdrop non-admin and initialize oracle", async () => {
    const sig = await provider.connection.requestAirdrop(
      nonAdminKeypair.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig);
    await program.methods
      .initialize()
      .accounts({
        oracle: oraclePda,
        admin: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("oracle PDA has decimals 6 and admin", async () => {
    const oracle = await program.account.oracleState.fetch(oraclePda);
    expect(oracle.decimals).to.equal(6);
    expect(oracle.admin.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
  });

  it("update_price from admin succeeds", async () => {
    await program.methods
      .updatePrice(new BN(1_500_000))
      .accounts({ oracle: oraclePda, admin: provider.wallet.publicKey })
      .rpc();
    const oracle = await program.account.oracleState.fetch(oraclePda);
    expect(oracle.price.toString()).to.equal("1500000");
  });

  it("update_price from non-admin fails", async () => {
    try {
      await program.methods
        .updatePrice(new BN(2_000_000))
        .accounts({ oracle: oraclePda, admin: nonAdminKeypair.publicKey })
        .signers([nonAdminKeypair])
        .rpc();
      expect.fail("expected unauthorized");
    } catch (e: unknown) {
      expect((e as { message?: string }).message ?? "").to.match(/has_one|constraint|Admin/i);
    }
  });

  it("update_price with zero fails", async () => {
    try {
      await program.methods
        .updatePrice(new BN(0))
        .accounts({ oracle: oraclePda, admin: provider.wallet.publicKey })
        .rpc();
      expect.fail("expected invalid price");
    } catch (e: unknown) {
      expect((e as { message?: string }).message ?? "").to.match(/InvalidPrice|invalid price|positive/i);
    }
  });

  it("use_oracle_price with fresh oracle succeeds", async () => {
    await program.methods
      .useOraclePrice()
      .accounts({ oracle: oraclePda })
      .rpc();
  });

  it("use_oracle_price with stale oracle fails", async () => {
    await program.methods
      .setLastUpdatedSlot(new BN(0))
      .accounts({ oracle: oraclePda, admin: provider.wallet.publicKey })
      .rpc();
    try {
      await program.methods
        .useOraclePrice()
        .accounts({ oracle: oraclePda })
        .rpc();
      expect.fail("expected StaleOracle");
    } catch (e: unknown) {
      expect((e as { message?: string }).message ?? "").to.match(/Stale|stale/i);
    }
  });
});
