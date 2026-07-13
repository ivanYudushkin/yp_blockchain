use anchor_lang::prelude::*;

declare_id!("75DTEVD79eDMJG2bToMqcU9g2mkMLyv2u1w6X1tfcJRq");

pub const MAX_STALENESS_SLOTS: u64 = 100;

#[program]
pub mod lesson_oracle {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let oracle = &mut ctx.accounts.oracle;
        oracle.admin = ctx.accounts.admin.key();
        oracle.price = 0;
        oracle.decimals = 6;
        let clock = Clock::get()?;
        oracle.last_updated_slot = clock.slot;
        oracle.bump = ctx.bumps.oracle;
        Ok(())
    }

    pub fn update_price(ctx: Context<UpdatePrice>, new_price: u64) -> Result<()> {
        require!(new_price > 0, OracleError::InvalidPrice);
        let oracle = &mut ctx.accounts.oracle;
        let clock = Clock::get()?;
        oracle.price = new_price;
        oracle.last_updated_slot = clock.slot;
        Ok(())
    }

    #[cfg(feature = "local-testing")]
    /// For local-testing only: set last_updated_slot to simulate stale oracle.
    pub fn set_last_updated_slot(ctx: Context<UpdatePrice>, slot: u64) -> Result<()> {
        ctx.accounts.oracle.last_updated_slot = slot;
        Ok(())
    }

    pub fn use_oracle_price(ctx: Context<UseOraclePrice>) -> Result<()> {
        let clock = Clock::get()?;
        let slots_ago = clock.slot.saturating_sub(ctx.accounts.oracle.last_updated_slot);
        require!(
            slots_ago <= MAX_STALENESS_SLOTS,
            OracleError::StaleOracle
        );
        msg!("Using oracle price: {}", ctx.accounts.oracle.price);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
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
pub struct UpdatePrice<'info> {
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
pub struct UseOraclePrice<'info> {
    pub oracle: Account<'info, OracleState>,
}

#[account]
pub struct OracleState {
    pub admin: Pubkey,
    pub price: u64,
    pub decimals: u8,
    pub last_updated_slot: u64,
    pub bump: u8,
}

#[error_code]
pub enum OracleError {
    #[msg("Price must be positive")]
    InvalidPrice,
    #[msg("Oracle data is too stale")]
    StaleOracle,
}
