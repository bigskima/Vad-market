use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, TokenAccount, TokenInterface, TransferChecked,
};

declare_id!("Fg6PaFpoGXkYsidMpWxTWqkZcfb4A5e6J3z1jXzCwWpq");

const ZERO_32: [u8; 32] = [0u8; 32];

#[program]
pub mod vad_settlement {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        quote_signer: Pubkey,
        settlement_signer: Pubkey,
        resolver: Pubkey,
        treasury: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(quote_signer, Pubkey::default(), VadError::ZeroAddress);
        require_keys_neq!(settlement_signer, Pubkey::default(), VadError::ZeroAddress);
        require_keys_neq!(resolver, Pubkey::default(), VadError::ZeroAddress);
        require_keys_neq!(treasury, Pubkey::default(), VadError::ZeroAddress);

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.pending_admin = Pubkey::default();
        config.quote_signer = quote_signer;
        config.settlement_signer = settlement_signer;
        config.resolver = resolver;
        config.treasury = treasury;
        config.settlement_mint = ctx.accounts.settlement_mint.key();
        config.new_locks_paused = false;
        config.bump = ctx.bumps.config;

        emit!(ConfigInitialized {
            admin: config.admin,
            settlement_mint: config.settlement_mint,
            quote_signer,
            settlement_signer,
            resolver,
            treasury,
        });
        Ok(())
    }

    pub fn initialize_market(
        ctx: Context<InitializeMarket>,
        market_id: [u8; 32],
    ) -> Result<()> {
        require!(market_id != ZERO_32, VadError::InvalidIdentifier);

        let market = &mut ctx.accounts.market;
        market.market_id = market_id;
        market.resolved = false;
        market.voided = false;
        market.winning_outcome_id = ZERO_32;
        market.evidence_hash = ZERO_32;
        market.escrow_amount = 0;
        market.bump = ctx.bumps.market;
        market.vault_bump = ctx.bumps.vault;

        emit!(MarketInitialized {
            market_id,
            vault: ctx.accounts.vault.key(),
        });
        Ok(())
    }

    pub fn lock_position(
        ctx: Context<LockPosition>,
        authorization_id: [u8; 32],
        position_id: [u8; 32],
        market_id: [u8; 32],
        outcome_id: [u8; 32],
        collateral_amount: u64,
        trading_fee_amount: u64,
        trading_fee_policy_version: u64,
        deadline_unix: i64,
    ) -> Result<()> {
        require!(!ctx.accounts.config.new_locks_paused, VadError::NewLocksPaused);
        require!(!ctx.accounts.market.resolved, VadError::MarketAlreadyResolved);
        require!(authorization_id != ZERO_32, VadError::InvalidIdentifier);
        require!(position_id != ZERO_32, VadError::InvalidIdentifier);
        require!(market_id != ZERO_32, VadError::InvalidIdentifier);
        require!(outcome_id != ZERO_32, VadError::InvalidIdentifier);
        require!(collateral_amount > 0, VadError::InvalidAmount);
        require!(
            deadline_unix >= Clock::get()?.unix_timestamp,
            VadError::AuthorizationExpired
        );
        require!(
            trading_fee_amount == 0 || trading_fee_policy_version > 0,
            VadError::FeePolicyVersionRequired
        );

        if trading_fee_amount > 0 {
            transfer_from_user(
                &ctx.accounts.user,
                &ctx.accounts.user_token,
                &ctx.accounts.treasury_token,
                &ctx.accounts.settlement_mint,
                &ctx.accounts.token_program,
                trading_fee_amount,
            )?;
        }

        transfer_from_user(
            &ctx.accounts.user,
            &ctx.accounts.user_token,
            &ctx.accounts.vault,
            &ctx.accounts.settlement_mint,
            &ctx.accounts.token_program,
            collateral_amount,
        )?;

        let market = &mut ctx.accounts.market;
        market.escrow_amount = market
            .escrow_amount
            .checked_add(collateral_amount)
            .ok_or(VadError::ArithmeticOverflow)?;

        let position = &mut ctx.accounts.position;
        position.authorization_id = authorization_id;
        position.position_id = position_id;
        position.market_id = market_id;
        position.outcome_id = outcome_id;
        position.user = ctx.accounts.user.key();
        position.collateral_amount = collateral_amount;
        position.trading_fee_amount = trading_fee_amount;
        position.trading_fee_policy_version = trading_fee_policy_version;
        position.settled = false;
        position.bump = ctx.bumps.position;

        emit!(PositionLocked {
            position_id,
            market_id,
            outcome_id,
            user: position.user,
            collateral_amount,
            trading_fee_amount,
            trading_fee_policy_version,
        });

        if trading_fee_amount > 0 {
            emit!(TradingFeeCollected {
                position_id,
                user: position.user,
                fee_amount: trading_fee_amount,
                policy_version: trading_fee_policy_version,
            });
        }

        Ok(())
    }

    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        market_id: [u8; 32],
        winning_outcome_id: [u8; 32],
        voided: bool,
        evidence_hash: [u8; 32],
    ) -> Result<()> {
        require!(market_id != ZERO_32, VadError::InvalidIdentifier);
        require!(evidence_hash != ZERO_32, VadError::InvalidResolution);
        require!(
            voided || winning_outcome_id != ZERO_32,
            VadError::InvalidResolution
        );

        let market = &mut ctx.accounts.market;
        require!(!market.resolved, VadError::MarketAlreadyResolved);

        market.resolved = true;
        market.voided = voided;
        market.winning_outcome_id = winning_outcome_id;
        market.evidence_hash = evidence_hash;

        emit!(MarketResolved {
            market_id,
            winning_outcome_id,
            voided,
            evidence_hash,
        });
        Ok(())
    }

    pub fn settle_position(
        ctx: Context<SettlePosition>,
        position_id: [u8; 32],
        market_id: [u8; 32],
        gross_payout: u64,
        settlement_fee_amount: u64,
        settlement_fee_policy_version: u64,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let market = &mut ctx.accounts.market;

        require!(!position.settled, VadError::PositionAlreadySettled);
        require!(market.resolved, VadError::MarketNotResolved);
        require_keys_eq!(position.user, ctx.accounts.user.key(), VadError::Unauthorized);
        require!(position.market_id == market_id, VadError::InvalidState);
        require!(
            settlement_fee_amount <= gross_payout,
            VadError::InvalidAmount
        );
        require!(
            settlement_fee_amount == 0 || settlement_fee_policy_version > 0,
            VadError::FeePolicyVersionRequired
        );

        if market.voided {
            require!(
                gross_payout == position.collateral_amount && settlement_fee_amount == 0,
                VadError::InvalidPayout
            );
        } else if position.outcome_id != market.winning_outcome_id {
            require!(
                gross_payout == 0 && settlement_fee_amount == 0,
                VadError::InvalidPayout
            );
        } else {
            require!(gross_payout > 0, VadError::InvalidPayout);
        }

        require!(
            gross_payout <= market.escrow_amount,
            VadError::InsufficientMarketEscrow
        );

        position.settled = true;
        market.escrow_amount = market
            .escrow_amount
            .checked_sub(gross_payout)
            .ok_or(VadError::ArithmeticOverflow)?;

        let market_id_seed = market.market_id;
        let market_bump = [market.bump];
        let signer_seeds: &[&[&[u8]]] = &[&[
            b"market",
            market_id_seed.as_ref(),
            market_bump.as_ref(),
        ]];

        if settlement_fee_amount > 0 {
            transfer_from_vault(
                &ctx.accounts.market,
                &ctx.accounts.vault,
                &ctx.accounts.treasury_token,
                &ctx.accounts.settlement_mint,
                &ctx.accounts.token_program,
                settlement_fee_amount,
                signer_seeds,
            )?;
            emit!(SettlementFeeCollected {
                position_id,
                user: position.user,
                fee_amount: settlement_fee_amount,
                policy_version: settlement_fee_policy_version,
            });
        }

        let net_payout = gross_payout
            .checked_sub(settlement_fee_amount)
            .ok_or(VadError::ArithmeticOverflow)?;

        if net_payout > 0 {
            transfer_from_vault(
                &ctx.accounts.market,
                &ctx.accounts.vault,
                &ctx.accounts.user_token,
                &ctx.accounts.settlement_mint,
                &ctx.accounts.token_program,
                net_payout,
                signer_seeds,
            )?;
        }

        emit!(PositionSettled {
            position_id,
            market_id,
            user: position.user,
            gross_payout,
            settlement_fee_amount,
            net_payout,
            settlement_fee_policy_version,
        });
        Ok(())
    }

    pub fn set_new_locks_paused(
        ctx: Context<AdminConfig>,
        paused: bool,
    ) -> Result<()> {
        ctx.accounts.config.new_locks_paused = paused;
        emit!(NewLocksPauseChanged { paused });
        Ok(())
    }

    pub fn set_quote_signer(
        ctx: Context<AdminConfig>,
        next_signer: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(next_signer, Pubkey::default(), VadError::ZeroAddress);
        let previous = ctx.accounts.config.quote_signer;
        ctx.accounts.config.quote_signer = next_signer;
        emit!(QuoteSignerChanged {
            previous,
            next: next_signer,
        });
        Ok(())
    }

    pub fn set_settlement_signer(
        ctx: Context<AdminConfig>,
        next_signer: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(next_signer, Pubkey::default(), VadError::ZeroAddress);
        let previous = ctx.accounts.config.settlement_signer;
        ctx.accounts.config.settlement_signer = next_signer;
        emit!(SettlementSignerChanged {
            previous,
            next: next_signer,
        });
        Ok(())
    }

    pub fn set_resolver(
        ctx: Context<AdminConfig>,
        next_resolver: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(next_resolver, Pubkey::default(), VadError::ZeroAddress);
        let previous = ctx.accounts.config.resolver;
        ctx.accounts.config.resolver = next_resolver;
        emit!(ResolverChanged {
            previous,
            next: next_resolver,
        });
        Ok(())
    }

    pub fn set_treasury(
        ctx: Context<AdminConfig>,
        next_treasury: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(next_treasury, Pubkey::default(), VadError::ZeroAddress);
        let previous = ctx.accounts.config.treasury;
        ctx.accounts.config.treasury = next_treasury;
        emit!(TreasuryChanged {
            previous,
            next: next_treasury,
        });
        Ok(())
    }

    pub fn start_admin_transfer(
        ctx: Context<AdminConfig>,
        next_admin: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(next_admin, Pubkey::default(), VadError::ZeroAddress);
        ctx.accounts.config.pending_admin = next_admin;
        emit!(AdminTransferStarted {
            current: ctx.accounts.config.admin,
            pending: next_admin,
        });
        Ok(())
    }

    pub fn accept_admin(ctx: Context<AcceptAdmin>) -> Result<()> {
        let previous = ctx.accounts.config.admin;
        ctx.accounts.config.admin = ctx.accounts.pending_admin.key();
        ctx.accounts.config.pending_admin = Pubkey::default();
        emit!(AdminTransferred {
            previous,
            next: ctx.accounts.config.admin,
        });
        Ok(())
    }
}

fn transfer_from_user<'info>(
    user: &Signer<'info>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
) -> Result<()> {
    let accounts = TransferChecked {
        mint: mint.to_account_info(),
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: user.to_account_info(),
    };
    let cpi = CpiContext::new(token_program.key(), accounts);
    token_interface::transfer_checked(cpi, amount, mint.decimals)
}

fn transfer_from_vault<'info>(
    market: &Account<'info, Market>,
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let accounts = TransferChecked {
        mint: mint.to_account_info(),
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: market.to_account_info(),
    };
    let cpi = CpiContext::new(token_program.key(), accounts)
        .with_signer(signer_seeds);
    token_interface::transfer_checked(cpi, amount, mint.decimals)
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, ProtocolConfig>,
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct InitializeMarket<'info> {
    #[account(mut, address = config.admin @ VadError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(address = config.settlement_mint @ VadError::InvalidMint)]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = admin,
        space = 8 + Market::INIT_SPACE,
        seeds = [b"market", market_id.as_ref()],
        bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = admin,
        token::mint = settlement_mint,
        token::authority = market,
        token::token_program = token_program,
        seeds = [b"vault", market_id.as_ref()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(
    _authorization_id: [u8; 32],
    position_id: [u8; 32],
    market_id: [u8; 32]
)]
pub struct LockPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address = config.quote_signer @ VadError::Unauthorized)]
    pub quote_signer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(address = config.settlement_mint @ VadError::InvalidMint)]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"market", market_id.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"vault", market_id.as_ref()],
        bump = market.vault_bump,
        token::mint = settlement_mint,
        token::authority = market,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [b"position", position_id.as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: address is constrained to the configured treasury owner.
    #[account(address = config.treasury @ VadError::Unauthorized)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = treasury,
        token::token_program = token_program
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ResolveMarket<'info> {
    #[account(address = config.resolver @ VadError::Unauthorized)]
    pub resolver: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(
        mut,
        seeds = [b"market", market_id.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
#[instruction(position_id: [u8; 32], market_id: [u8; 32])]
pub struct SettlePosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(address = config.settlement_signer @ VadError::Unauthorized)]
    pub settlement_signer: Signer<'info>,
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
    #[account(address = config.settlement_mint @ VadError::InvalidMint)]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [b"market", market_id.as_ref()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"vault", market_id.as_ref()],
        bump = market.vault_bump,
        token::mint = settlement_mint,
        token::authority = market,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"position", position_id.as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = user,
        token::token_program = token_program
    )]
    pub user_token: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: address is constrained to the configured treasury owner.
    #[account(address = config.treasury @ VadError::Unauthorized)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::authority = treasury,
        token::token_program = token_program
    )]
    pub treasury_token: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct AdminConfig<'info> {
    #[account(address = config.admin @ VadError::Unauthorized)]
    pub admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
}

#[derive(Accounts)]
pub struct AcceptAdmin<'info> {
    #[account(address = config.pending_admin @ VadError::Unauthorized)]
    pub pending_admin: Signer<'info>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, ProtocolConfig>,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    pub admin: Pubkey,
    pub pending_admin: Pubkey,
    pub quote_signer: Pubkey,
    pub settlement_signer: Pubkey,
    pub resolver: Pubkey,
    pub treasury: Pubkey,
    pub settlement_mint: Pubkey,
    pub new_locks_paused: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub market_id: [u8; 32],
    pub resolved: bool,
    pub voided: bool,
    pub winning_outcome_id: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub escrow_amount: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub authorization_id: [u8; 32],
    pub position_id: [u8; 32],
    pub market_id: [u8; 32],
    pub outcome_id: [u8; 32],
    pub user: Pubkey,
    pub collateral_amount: u64,
    pub trading_fee_amount: u64,
    pub trading_fee_policy_version: u64,
    pub settled: bool,
    pub bump: u8,
}

#[event]
pub struct ConfigInitialized {
    pub admin: Pubkey,
    pub settlement_mint: Pubkey,
    pub quote_signer: Pubkey,
    pub settlement_signer: Pubkey,
    pub resolver: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct MarketInitialized {
    pub market_id: [u8; 32],
    pub vault: Pubkey,
}

#[event]
pub struct PositionLocked {
    pub position_id: [u8; 32],
    pub market_id: [u8; 32],
    pub outcome_id: [u8; 32],
    pub user: Pubkey,
    pub collateral_amount: u64,
    pub trading_fee_amount: u64,
    pub trading_fee_policy_version: u64,
}

#[event]
pub struct TradingFeeCollected {
    pub position_id: [u8; 32],
    pub user: Pubkey,
    pub fee_amount: u64,
    pub policy_version: u64,
}

#[event]
pub struct MarketResolved {
    pub market_id: [u8; 32],
    pub winning_outcome_id: [u8; 32],
    pub voided: bool,
    pub evidence_hash: [u8; 32],
}

#[event]
pub struct PositionSettled {
    pub position_id: [u8; 32],
    pub market_id: [u8; 32],
    pub user: Pubkey,
    pub gross_payout: u64,
    pub settlement_fee_amount: u64,
    pub net_payout: u64,
    pub settlement_fee_policy_version: u64,
}

#[event]
pub struct SettlementFeeCollected {
    pub position_id: [u8; 32],
    pub user: Pubkey,
    pub fee_amount: u64,
    pub policy_version: u64,
}

#[event]
pub struct NewLocksPauseChanged {
    pub paused: bool,
}

#[event]
pub struct QuoteSignerChanged {
    pub previous: Pubkey,
    pub next: Pubkey,
}

#[event]
pub struct SettlementSignerChanged {
    pub previous: Pubkey,
    pub next: Pubkey,
}

#[event]
pub struct ResolverChanged {
    pub previous: Pubkey,
    pub next: Pubkey,
}

#[event]
pub struct TreasuryChanged {
    pub previous: Pubkey,
    pub next: Pubkey,
}

#[event]
pub struct AdminTransferStarted {
    pub current: Pubkey,
    pub pending: Pubkey,
}

#[event]
pub struct AdminTransferred {
    pub previous: Pubkey,
    pub next: Pubkey,
}

#[error_code]
pub enum VadError {
    #[msg("The signer is not authorized for this VAD operation.")]
    Unauthorized,
    #[msg("A required address cannot be zero.")]
    ZeroAddress,
    #[msg("The identifier is invalid.")]
    InvalidIdentifier,
    #[msg("The amount is invalid.")]
    InvalidAmount,
    #[msg("The authorization has expired.")]
    AuthorizationExpired,
    #[msg("A positive VAD fee must reference a fee-policy version.")]
    FeePolicyVersionRequired,
    #[msg("New position locks are paused.")]
    NewLocksPaused,
    #[msg("The market has already been resolved.")]
    MarketAlreadyResolved,
    #[msg("The market has not been resolved.")]
    MarketNotResolved,
    #[msg("The market resolution is invalid.")]
    InvalidResolution,
    #[msg("The settlement payout does not match the market result.")]
    InvalidPayout,
    #[msg("The position has already been settled.")]
    PositionAlreadySettled,
    #[msg("The market escrow is insufficient.")]
    InsufficientMarketEscrow,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
    #[msg("The settlement mint does not match VAD configuration.")]
    InvalidMint,
    #[msg("The account state is invalid.")]
    InvalidState,
}
