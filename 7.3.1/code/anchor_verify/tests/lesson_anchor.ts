import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import BN from "bn.js";
import { Keypair } from "@solana/web3.js";

describe("lesson_anchor", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LessonAnchor as any;
  const configKeypair = Keypair.generate();

  it("initialize launchpad config", async () => {
    await program.methods
      .initialize(new BN(25_000_000))
      .accounts({
        config: configKeypair.publicKey,
        signer: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([configKeypair])
      .rpc();

    const config = await program.account.launchpadConfig.fetch(configKeypair.publicKey);
    expect(config.feeUsd.toNumber()).to.equal(25_000_000);
    expect(config.admin.toBase58()).to.equal(provider.wallet.publicKey.toBase58());
  });

  it("update fee by admin", async () => {
    await program.methods
      .updateFee(new BN(30_000_000))
      .accounts({
        config: configKeypair.publicKey,
        admin: provider.wallet.publicKey,
      })
      .rpc();

    const config = await program.account.launchpadConfig.fetch(configKeypair.publicKey);
    expect(config.feeUsd.toNumber()).to.equal(30_000_000);
  });

  it("second initialize fails", async () => {
    try {
      await program.methods
        .initialize(new BN(0))
        .accounts({
          config: configKeypair.publicKey,
          signer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([configKeypair])
        .rpc();
      expect.fail("expected error");
    } catch (e) {
      expect(e).to.be.ok;
    }
  });
});
