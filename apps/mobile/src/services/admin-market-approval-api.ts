import { userFacingError } from '@/lib/user-facing-error';
import { supabase } from '@/lib/supabase';

export type AdminMarketAutoOptions = {
  jurisdictions: { countryCode: string; name: string; assets: string[] }[];
  guided: {
    verifiedResultAvailable: boolean;
    football: {
      automaticSourceName: string;
      automaticSandboxAvailable: boolean;
      automaticProductionAvailable: boolean;
    };
  };
};

export type AdminGuidedMarketSetup =
  | {
      kind: 'FOOTBALL_MATCH';
      resultChecking: 'AUTOMATIC' | 'VERIFIED';
      competition: string;
      homeTeam: string;
      awayTeam: string;
      prediction: 'HOME_WIN' | 'DRAW' | 'AWAY_WIN';
      matchReference?: string;
      sourceName?: string;
      sourceUrl?: string;
    }
  | {
      kind: 'PLAYER_TRANSFER';
      resultChecking: 'VERIFIED';
      player: string;
      destinationClub: string;
      sourceName: string;
      sourceUrl?: string;
    }
  | {
      kind: 'ELECTION_WINNER';
      resultChecking: 'VERIFIED';
      country: string;
      office: string;
      candidate: string;
      electionLabel?: string;
      sourceName: string;
      sourceUrl?: string;
    }
  | {
      kind: 'SPORTS_EVENT' | 'POLITICAL_EVENT' | 'OBJECTIVE_EVENT';
      resultChecking: 'VERIFIED';
      condition?: string;
      sourceName: string;
      sourceUrl?: string;
    };

type CreateMarketInput = {
  title: string;
  description: string;
  category: string;
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
  countryCode: string;
  assetCode: string;
  publishNow?: boolean;
};

function fail(error: { message: string; code?: string; details?: string; hint?: string } | null, fallback: string) {
  if (error) throw userFacingError(error, 'admin', fallback);
}

export async function getAdminMarketAutoOptions() {
  const { data, error } = await supabase.rpc('admin_market_approval_options');
  fail(error, 'We could not load the available market options right now.');
  const raw = (data ?? {}) as Partial<AdminMarketAutoOptions>;
  const guided = raw.guided ?? ({} as Partial<AdminMarketAutoOptions['guided']>);
  const football = guided.football ?? ({} as Partial<AdminMarketAutoOptions['guided']['football']>);
  return {
    jurisdictions: Array.isArray(raw.jurisdictions) ? raw.jurisdictions : [],
    guided: {
      verifiedResultAvailable: guided.verifiedResultAvailable !== false,
      football: {
        automaticSourceName: String(football.automaticSourceName ?? 'Football-Data.org'),
        automaticSandboxAvailable: football.automaticSandboxAvailable === true,
        automaticProductionAvailable: football.automaticProductionAvailable === true,
      },
    },
  } satisfies AdminMarketAutoOptions;
}

export async function approveAdminMarketProposalAutomatically(input: {
  proposalPublicId: string;
  title: string;
  description: string;
  category: string;
  opensAt: string;
  closesAt: string;
  resolvesAfter: string;
  countryCode: string;
  assetCode: string;
}) {
  const { data, error } = await supabase.rpc('admin_approve_market_proposal_auto', {
    p_proposal_public_id: input.proposalPublicId,
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
  });
  fail(error, 'We could not approve this market right now. Please try again.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function createAdminMarketDraft(input: Omit<CreateMarketInput, 'publishNow'>) {
  const { data, error } = await supabase.rpc('admin_create_market_draft', {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
  });
  fail(error, 'We could not create this VAD market right now.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function createAdminCustomMarket(input: CreateMarketInput) {
  const { data, error } = await supabase.rpc('admin_create_custom_market', {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
    p_publish_now: input.publishNow === true,
  });
  fail(error, 'We could not create this VAD market right now.');
  return (data ?? {}) as Record<string, unknown>;
}

function serializeGuidedSetup(input: AdminGuidedMarketSetup) {
  if (input.kind === 'FOOTBALL_MATCH') {
    return {
      kind: input.kind,
      result_checking: input.resultChecking,
      competition: input.competition.trim(),
      home_team: input.homeTeam.trim(),
      away_team: input.awayTeam.trim(),
      prediction: input.prediction,
      match_reference: input.matchReference?.trim() || null,
      source_name: input.sourceName?.trim() || null,
      source_url: input.sourceUrl?.trim() || null,
    };
  }
  if (input.kind === 'PLAYER_TRANSFER') {
    return {
      kind: input.kind,
      result_checking: input.resultChecking,
      player: input.player.trim(),
      destination_club: input.destinationClub.trim(),
      source_name: input.sourceName.trim(),
      source_url: input.sourceUrl?.trim() || null,
    };
  }
  if (input.kind === 'ELECTION_WINNER') {
    return {
      kind: input.kind,
      result_checking: input.resultChecking,
      country: input.country.trim(),
      office: input.office.trim(),
      candidate: input.candidate.trim(),
      election_label: input.electionLabel?.trim() || null,
      source_name: input.sourceName.trim(),
      source_url: input.sourceUrl?.trim() || null,
    };
  }
  return {
    kind: input.kind,
    result_checking: input.resultChecking,
    condition: input.condition?.trim() || null,
    source_name: input.sourceName.trim(),
    source_url: input.sourceUrl?.trim() || null,
  };
}

export async function createAdminGuidedMarket(input: CreateMarketInput & { setup: AdminGuidedMarketSetup }) {
  const { data, error } = await supabase.rpc('admin_create_guided_market', {
    p_title: input.title.trim(),
    p_description: input.description.trim(),
    p_category: input.category.trim(),
    p_market_setup: serializeGuidedSetup(input.setup),
    p_opens_at: input.opensAt,
    p_closes_at: input.closesAt,
    p_resolves_after: input.resolvesAfter,
    p_country_code: input.countryCode,
    p_asset_code: input.assetCode,
    p_publish_now: input.publishNow === true,
  });
  fail(error, 'We could not create this guided VAD market right now.');
  return (data ?? {}) as Record<string, unknown>;
}

export async function decideAdminMarketProposalSimple(input: {
  proposalPublicId: string;
  decision: 'REJECT' | 'NEEDS_CLARIFICATION';
  reason: string;
}) {
  const { data, error } = await supabase.rpc('admin_decide_market_proposal', {
    p_proposal_public_id: input.proposalPublicId,
    p_decision: input.decision,
    p_reason: input.reason.trim(),
  });
  fail(error, 'We could not save this proposal decision right now.');
  return Boolean(data);
}
