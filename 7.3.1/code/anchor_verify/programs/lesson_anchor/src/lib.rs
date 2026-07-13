use anchor_lang::prelude::*;

declare_id!("9XtC7LKSJWjfAdJ514EdHhXD3LhvUvBQgpsFVTqJZBvb");

#[program]
pub mod lesson_anchor {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, initial_fee_usd: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.signer.key();
        config.fee_usd = initial_fee_usd;
        Ok(())
    }

    pub fn update_fee(ctx: Context<UpdateFee>, new_fee_usd: u64) -> Result<()> {
        ctx.accounts.config.fee_usd = new_fee_usd;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = signer, space = 8 + 32 + 8)]
    pub config: Account<'info, LaunchpadConfig>,

    #[account(mut)]
    pub signer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateFee<'info> {
    #[account(mut, has_one = admin)]
    pub config: Account<'info, LaunchpadConfig>,
    pub admin: Signer<'info>,
}

#[account]
pub struct LaunchpadConfig {
    pub admin: Pubkey,
    pub fee_usd: u64,
}
