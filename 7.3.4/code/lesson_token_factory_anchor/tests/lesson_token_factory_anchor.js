const anchor = require("@coral-xyz/anchor");
const { expect } = require("chai");
const {
  getAccount,
  getMint,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} = require("@solana/spl-token");

describe("lesson_token_factory_anchor", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.LessonTokenFactoryAnchor;
  const treasury = anchor.web3.Keypair.generate();

  const [oraclePda] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("oracle")],
    program.programId
  );

  async function airdrop(pubkey, lamports) {
    const signature = await provider.connection.requestAirdrop(pubkey, lamports);
    await provider.connection.confirmTransaction(signature);
  }

  before("initialize oracle + treasury", async () => {
    await airdrop(treasury.publicKey, 1 * anchor.web3.LAMPORTS_PER_SOL);
    await program.methods
      .initializeOracle(new anchor.BN(25_000_000))
      .accounts({
        oracle: oraclePda,
        admin: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
  });

  it("create_token mints supply to creator ATA", async () => {
    const mint = anchor.web3.Keypair.generate();
    const [mintAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority"), mint.publicKey.toBuffer()],
      program.programId
    );
    const creatorAta = getAssociatedTokenAddressSync(mint.publicKey, provider.wallet.publicKey);

    await program.methods
      .createToken(6, new anchor.BN(1_000))
      .accounts({
        mint: mint.publicKey,
        creatorAta,
        mintAuthority,
        creator: provider.wallet.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    const mintInfo = await getMint(provider.connection, mint.publicKey);
    const ataInfo = await getAccount(provider.connection, creatorAta);
    const expectedRaw = BigInt(1_000_000_000);

    expect(mintInfo.decimals).to.equal(6);
    expect(mintInfo.supply).to.equal(expectedRaw);
    expect(ataInfo.amount).to.equal(expectedRaw);
  });

  it("create_token_with_fee transfers SOL and mints", async () => {
    const mint = anchor.web3.Keypair.generate();
    const [mintAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority"), mint.publicKey.toBuffer()],
      program.programId
    );
    const payerAta = getAssociatedTokenAddressSync(mint.publicKey, provider.wallet.publicKey);

    const treasuryBefore = await provider.connection.getBalance(treasury.publicKey);

    await program.methods
      .createTokenWithFee(6, new anchor.BN(500), new anchor.BN(25_000_000))
      .accounts({
        mint: mint.publicKey,
        payerAta,
        mintAuthority,
        payer: provider.wallet.publicKey,
        treasury: treasury.publicKey,
        oracle: oraclePda,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([mint])
      .rpc();

    const treasuryAfter = await provider.connection.getBalance(treasury.publicKey);
    expect(treasuryAfter - treasuryBefore).to.equal(anchor.web3.LAMPORTS_PER_SOL);

    const mintInfo = await getMint(provider.connection, mint.publicKey);
    const ataInfo = await getAccount(provider.connection, payerAta);
    const expectedRaw = BigInt(500_000_000);
    expect(mintInfo.supply).to.equal(expectedRaw);
    expect(ataInfo.amount).to.equal(expectedRaw);
  });

  it("rejects stale oracle in create_token_with_fee", async () => {
    await program.methods
      .setOracleLastUpdatedSlot(new anchor.BN(0))
      .accounts({
        oracle: oraclePda,
        admin: provider.wallet.publicKey,
      })
      .rpc();

    const mint = anchor.web3.Keypair.generate();
    const [mintAuthority] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("mint_authority"), mint.publicKey.toBuffer()],
      program.programId
    );
    const payerAta = getAssociatedTokenAddressSync(mint.publicKey, provider.wallet.publicKey);

    try {
      await program.methods
        .createTokenWithFee(6, new anchor.BN(10), new anchor.BN(25_000_000))
        .accounts({
          mint: mint.publicKey,
          payerAta,
          mintAuthority,
          payer: provider.wallet.publicKey,
          treasury: treasury.publicKey,
          oracle: oraclePda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([mint])
        .rpc();
      expect.fail("expected stale oracle error");
    } catch (e) {
      expect(String(e.message || e)).to.match(/stale/i);
    }
  });
});
