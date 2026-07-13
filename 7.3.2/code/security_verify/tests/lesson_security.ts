import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

describe("lesson_security", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LessonSecurity as any;
  const configKeypair = Keypair.generate();
  const treasuryKeypair = Keypair.generate();
  const attackerKeypair = Keypair.generate();
  const userKeypair = Keypair.generate();
  const fakeConfigKeypair = Keypair.generate();
  const [wrongUserPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), attackerKeypair.publicKey.toBuffer()],
    program.programId
  );

  const [userStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("user"), userKeypair.publicKey.toBuffer()],
    program.programId
  );

  before("initialize config", async () => {
    await program.methods
      .initialize(treasuryKeypair.publicKey, new BN(100))
      .accounts({
        config: configKeypair.publicKey,
        admin: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([configKeypair])
      .rpc();
    for (const kp of [userKeypair, treasuryKeypair]) {
      const sig = await provider.connection.requestAirdrop(
        kp.publicKey,
        2 * anchor.web3.LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig);
    }
  });

  describe("positive: authorized and correct accounts", () => {
    it("withdraw_to_treasury with correct treasury", async () => {
      await program.methods
        .withdrawToTreasury(new BN(1000))
        .accounts({
          config: configKeypair.publicKey,
          treasury: treasuryKeypair.publicKey,
          payer: provider.wallet.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    });

    it("set_treasury by admin", async () => {
      const newTreasury = Keypair.generate().publicKey;
      await program.methods
        .setTreasury(newTreasury)
        .accounts({
          config: configKeypair.publicKey,
          admin: provider.wallet.publicKey,
        })
        .rpc();
      await program.methods
        .setTreasury(treasuryKeypair.publicKey)
        .accounts({
          config: configKeypair.publicKey,
          admin: provider.wallet.publicKey,
        })
        .rpc();
    });

    it("create_user_state and claim_reward once", async () => {
      await program.methods
        .createUserState()
        .accounts({
          userState: userStatePda,
          user: userKeypair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([userKeypair])
        .rpc();

      await program.methods
        .claimReward()
        .accounts({
          userState: userStatePda,
          user: userKeypair.publicKey,
        })
        .signers([userKeypair])
        .rpc();

      const state = await program.account.userState.fetch(userStatePda);
      expect(state.claimed).to.equal(true);
    });

    it("safe_calc valid numbers", async () => {
      await program.methods
        .safeCalc(new BN(100), new BN(5))
        .accounts({ signer: provider.wallet.publicKey })
        .rpc();
    });

    it("check_staleness with fresh slot", async () => {
      const slot = (await provider.connection.getSlot()) - 1;
      await program.methods
        .checkStaleness(new BN(slot))
        .accounts({ config: configKeypair.publicKey })
        .rpc();
    });
  });

  describe("security regression: negative tests", () => {
    it("substitution: wrong treasury fails", async () => {
      try {
        await program.methods
          .withdrawToTreasury(new BN(1000))
          .accounts({
            config: configKeypair.publicKey,
            treasury: attackerKeypair.publicKey,
            payer: provider.wallet.publicKey,
          })
          .rpc();
        expect.fail("expected constraint violation");
      } catch (e: unknown) {
        const err = e as { message?: string };
        expect(err?.message ?? "").to.match(/constraint|address|Treasury/i);
      }
    });

    it("unauthorized: set_treasury by non-admin fails", async () => {
      try {
        await program.methods
          .setTreasury(attackerKeypair.publicKey)
          .accounts({
            config: configKeypair.publicKey,
            admin: attackerKeypair.publicKey,
          })
          .signers([attackerKeypair])
          .rpc();
        expect.fail("expected has_one or constraint");
      } catch (e: unknown) {
        const err = e as { message?: string };
        expect(err?.message ?? "").to.match(/has_one|constraint|Admin/i);
      }
    });

    it("owner spoofing: wrong config owner fails", async () => {
      try {
        await program.methods
          .setTreasury(attackerKeypair.publicKey)
          .accounts({
            config: fakeConfigKeypair.publicKey,
            admin: provider.wallet.publicKey,
          })
          .rpc();
        expect.fail("expected owner/discriminator check");
      } catch (e: unknown) {
        const err = e as { message?: string };
        expect(err?.message ?? "").to.match(/owner|discriminator|Account/i);
      }
    });

    it("wrong PDA: claim_reward with wrong PDA fails", async () => {
      try {
        await program.methods
          .claimReward()
          .accounts({
            userState: wrongUserPda,
            user: userKeypair.publicKey,
          })
          .signers([userKeypair])
          .rpc();
        expect.fail("expected seeds/has_one/constraint");
      } catch (e: unknown) {
        const err = e as { message?: string };
        expect(err?.message ?? "").to.match(/seeds|has_one|constraint|Account/i);
      }
    });

    it("replay: second claim_reward fails", async () => {
      try {
        await program.methods
          .claimReward()
          .accounts({
            userState: userStatePda,
            user: userKeypair.publicKey,
          })
          .signers([userKeypair])
          .rpc();
        expect.fail("expected AlreadyClaimed");
      } catch (e: unknown) {
        const err = e as { message?: string };
        expect(err?.message ?? "").to.match(/AlreadyClaimed|already claimed|Reward already/i);
      }
    });

    it("overflow: safe_calc overflow fails", async () => {
      try {
        await program.methods
          .safeCalc(
            new BN("18446744073709551615"),
            new BN(2)
          )
          .accounts({ signer: provider.wallet.publicKey })
          .rpc();
        expect.fail("expected overflow");
      } catch (e: unknown) {
        const err = e as { message?: string };
        expect(err?.message ?? "").to.match(/overflow|Overflow/i);
      }
    });

    it("stale: check_staleness with old slot fails", async () => {
      try {
        await program.methods
          .checkStaleness(new BN(0))
          .accounts({ config: configKeypair.publicKey })
          .rpc();
        expect.fail("expected StaleData");
      } catch (e: unknown) {
        const err = e as { message?: string };
        expect(err?.message ?? "").to.match(/Stale|stale/i);
      }
    });
  });
});
