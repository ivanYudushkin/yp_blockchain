use anchor_lang::prelude::*;

declare_id!("H3GNtHAqoZX9gU68vwF4shvBQNdkFbgMnug9y73NP9To");

#[program]
pub mod lesson_security {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        treasury: Pubkey,
        max_staleness_slots: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.treasury = treasury;
        config.max_staleness_slots = max_staleness_slots;
        Ok(())
    }

    pub fn withdraw_to_treasury(ctx: Context<WithdrawToTreasury>, amount: u64) -> Result<()> {
        let from = &ctx.accounts.payer;
        let treasury = &ctx.accounts.treasury;
        let transfer_ix = anchor_lang::solana_program::system_instruction::transfer(
            &from.key(),
            &treasury.key(),
            amount,
        );
        anchor_lang::solana_program::program::invoke_signed(
            &transfer_ix,
            &[
                from.to_account_info(),
                treasury.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
            &[],
        )?;
        Ok(())
    }

    pub fn set_treasury(ctx: Context<SetTreasury>, new_treasury: Pubkey) -> Result<()> {
        ctx.accounts.config.treasury = new_treasury;
        Ok(())
    }

    pub fn create_user_state(ctx: Context<CreateUserState>) -> Result<()> {
        ctx.accounts.user_state.user = ctx.accounts.user.key();
        ctx.accounts.user_state.claimed = false;
        ctx.accounts.user_state.bump = ctx.bumps.user_state;
        Ok(())
    }

    pub fn claim_reward(ctx: Context<ClaimReward>) -> Result<()> {
        require!(!ctx.accounts.user_state.claimed, SecurityError::AlreadyClaimed);
        ctx.accounts.user_state.claimed = true;
        Ok(())
    }

    pub fn safe_calc(_ctx: Context<SafeCalc>, amount: u64, price: u64) -> Result<()> {
        let total = amount
            .checked_mul(price)
            .ok_or(SecurityError::Overflow)?;
        require!(amount > 0 && price > 0, SecurityError::ZeroAmount);
        msg!("safe_calc total: {}", total);
        Ok(())
    }

    pub fn check_staleness(ctx: Context<CheckStaleness>, last_slot: u64) -> Result<()> {
        let clock = Clock::get()?;
        let slots_ago = clock.slot.saturating_sub(last_slot);
        require!(
            slots_ago <= ctx.accounts.config.max_staleness_slots,
            SecurityError::StaleData
        );
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 32 + 8)]
    pub config: Account<'info, Config>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawToTreasury<'info> {
    pub config: Account<'info, Config>,

    #[account(mut, address = config.treasury)]
    /// CHECK: validated by address constraint
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetTreasury<'info> {
    #[account(mut, has_one = admin)]
    pub config: Account<'info, Config>,

    pub admin: Signer<'info>,
}

#[derive(Accounts)]
pub struct CreateUserState<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 32 + 1 + 1,
        seeds = [b"user", user.key().as_ref()],
        bump
    )]
    pub user_state: Account<'info, UserState>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimReward<'info> {
    #[account(
        mut,
        seeds = [b"user", user_state.user.as_ref()],
        bump = user_state.bump,
        has_one = user
    )]
    pub user_state: Account<'info, UserState>,

    pub user: Signer<'info>,
}

#[derive(Accounts)]
pub struct SafeCalc<'info> {
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct CheckStaleness<'info> {
    pub config: Account<'info, Config>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub max_staleness_slots: u64,
}

#[account]
pub struct UserState {
    pub user: Pubkey,
    pub claimed: bool,
    pub bump: u8,
}

#[error_code]
pub enum SecurityError {
    #[msg("Reward already claimed")]
    AlreadyClaimed,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Amount or price must be positive")]
    ZeroAmount,
    #[msg("Data is too stale")]
    StaleData,
}
