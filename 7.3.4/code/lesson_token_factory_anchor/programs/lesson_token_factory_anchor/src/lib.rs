use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, MintTo, Token, TokenAccount};

declare_id!("75DTEVD79eDMJG2bToMqcU9g2mkMLyv2u1w6X1tfcJRq");

pub const EXPECTED_DECIMALS: u8 = 6;
pub const MAX_STALENESS_SLOTS: u64 = 100;
pub const LAMPORTS_PER_SOL_U64: u64 = 1_000_000_000;

#[program]
pub mod lesson_token_factory_anchor {
    use super::*;

    pub fn initialize_oracle(ctx: Context<InitializeOracle>, initial_price: u64) -> Result<()> {
        require!(initial_price > 0, FactoryError::InvalidPrice);
        let oracle = &mut ctx.accounts.oracle;
        oracle.admin = ctx.accounts.admin.key();
        oracle.price = initial_price;
        oracle.decimals = EXPECTED_DECIMALS;
        oracle.last_updated_slot = Clock::get()?.slot;
        oracle.bump = ctx.bumps.oracle;
        Ok(())
    }

    pub fn update_price(ctx: Context<UpdateOracle>, new_price: u64) -> Result<()> {
        require!(new_price > 0, FactoryError::InvalidPrice);
        let oracle = &mut ctx.accounts.oracle;
        oracle.price = new_price;
        oracle.last_updated_slot = Clock::get()?.slot;
        Ok(())
    }

    pub fn create_token(
        ctx: Context<CreateToken>,
        decimals: u8,
        initial_supply: u64,
    ) -> Result<()> {
        require!(
            decimals == EXPECTED_DECIMALS,
            FactoryError::BadTokenDecimals
        );
        let amount_raw = calc_amount_raw(initial_supply, decimals)?;

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[
            b"mint_authority",
            mint_key.as_ref(),
            &[ctx.bumps.mint_authority],
        ];

        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.creator_ata.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        let signer_seeds_arr = [signer_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            &signer_seeds_arr,
        );
        token::mint_to(cpi_ctx, amount_raw)?;

        Ok(())
    }

    pub fn create_token_with_fee(
        ctx: Context<CreateTokenWithFee>,
        decimals: u8,
        initial_supply: u64,
        fee_usd: u64,
    ) -> Result<()> {
        require!(
            decimals == EXPECTED_DECIMALS,
            FactoryError::BadTokenDecimals
        );
        validate_oracle(&ctx.accounts.oracle)?;
        require_fresh(&ctx.accounts.oracle)?;

        let fee_lamports = calc_fee_lamports(fee_usd, ctx.accounts.oracle.price)?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.payer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee_lamports,
        )?;

        let amount_raw = calc_amount_raw(initial_supply, decimals)?;

        let mint_key = ctx.accounts.mint.key();
        let signer_seeds: &[&[u8]] = &[
            b"mint_authority",
            mint_key.as_ref(),
            &[ctx.bumps.mint_authority],
        ];
        let cpi_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.payer_ata.to_account_info(),
            authority: ctx.accounts.mint_authority.to_account_info(),
        };
        let signer_seeds_arr = [signer_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            &signer_seeds_arr,
        );
        token::mint_to(cpi_ctx, amount_raw)?;

        let clock = Clock::get()?;
        emit!(TokenCreated {
            creator: ctx.accounts.payer.key(),
            mint: ctx.accounts.mint.key(),
            supply: amount_raw,
            fee_lamports,
            price: ctx.accounts.oracle.price,
            slot: clock.slot,
        });

        Ok(())
    }

    #[cfg(feature = "local-testing")]
    /// Test helper only: excluded from production when feature is disabled.
    pub fn set_oracle_last_updated_slot(ctx: Context<UpdateOracle>, slot: u64) -> Result<()> {
        ctx.accounts.oracle.last_updated_slot = slot;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeOracle<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 8 + 1 + 8 + 1,
        seeds = [b"oracle"],
        bump
    )]
    pub oracle: Account<'info, OracleState>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateOracle<'info> {
    #[account(
        mut,
        seeds = [b"oracle"],
        bump = oracle.bump,
        has_one = admin
    )]
    pub oracle: Account<'info, OracleState>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct CreateToken<'info> {
    #[account(
        init,
        payer = creator,
        mint::decimals = decimals,
        mint::authority = mint_authority,
        mint::freeze_authority = mint_authority
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator
    )]
    pub creator_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"mint_authority", mint.key().as_ref()],
        bump
    )]
    /// CHECK: PDA signer for mint authority, verified by seeds.
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(decimals: u8)]
pub struct CreateTokenWithFee<'info> {
    #[account(
        init,
        payer = payer,
        mint::decimals = decimals,
        mint::authority = mint_authority,
        mint::freeze_authority = mint_authority
    )]
    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        associated_token::mint = mint,
        associated_token::authority = payer
    )]
    pub payer_ata: Account<'info, TokenAccount>,

    #[account(
        seeds = [b"mint_authority", mint.key().as_ref()],
        bump
    )]
    /// CHECK: PDA signer for mint authority, verified by seeds.
    pub mint_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub treasury: SystemAccount<'info>,

    #[account(seeds = [b"oracle"], bump = oracle.bump)]
    pub oracle: Account<'info, OracleState>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[account]
pub struct OracleState {
    pub admin: Pubkey,
    pub price: u64,
    pub decimals: u8,
    pub last_updated_slot: u64,
    pub bump: u8,
}

#[event]
pub struct TokenCreated {
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub supply: u64,
    pub fee_lamports: u64,
    pub price: u64,
    pub slot: u64,
}

#[error_code]
pub enum FactoryError {
    #[msg("Invalid oracle price")]
    InvalidPrice,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Bad oracle decimals")]
    BadOracleDecimals,
    #[msg("Bad token decimals")]
    BadTokenDecimals,
    #[msg("Stale oracle data")]
    StaleOracle,
}

pub fn calc_amount_raw(initial_supply: u64, decimals: u8) -> Result<u64> {
    let factor = 10u64
        .checked_pow(decimals as u32)
        .ok_or(FactoryError::MathOverflow)?;
    let amount_raw = initial_supply
        .checked_mul(factor)
        .ok_or(FactoryError::MathOverflow)?;
    Ok(amount_raw)
}

pub fn calc_fee_lamports(fee_usd: u64, price: u64) -> Result<u64> {
    require!(price > 0, FactoryError::InvalidPrice);

    let fee = fee_usd as u128;
    let price_u128 = price as u128;
    let lps = LAMPORTS_PER_SOL_U64 as u128;

    let numerator = fee
        .checked_mul(lps)
        .ok_or(FactoryError::MathOverflow)?;

    let fee_lamports_u128 = numerator
        .checked_div(price_u128)
        .ok_or(FactoryError::MathOverflow)?;

    let fee_lamports = u64::try_from(fee_lamports_u128)
        .map_err(|_| FactoryError::MathOverflow)?;

    Ok(fee_lamports)
}

pub fn validate_oracle(oracle: &OracleState) -> Result<()> {
    require!(
        oracle.decimals == EXPECTED_DECIMALS,
        FactoryError::BadOracleDecimals
    );
    require!(oracle.price > 0, FactoryError::InvalidPrice);
    Ok(())
}

pub fn require_fresh(oracle: &OracleState) -> Result<()> {
    let clock = Clock::get()?;
    let slots_ago = clock.slot.saturating_sub(oracle.last_updated_slot);
    require!(slots_ago <= MAX_STALENESS_SLOTS, FactoryError::StaleOracle);
    Ok(())
}
