import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-request-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  Vary: "Origin",
};

const capabilityMap = {
  create_post: "createPost",
  submit_market_proposal: "submitMarketProposal",
  view_portfolio: "viewPortfolio",
  trade: "trade",
  deposit: "deposit",
  withdraw: "withdraw",
} as const;

type DatabaseCapabilityKey = keyof typeof capabilityMap;
type ClientCapabilityKey = (typeof capabilityMap)[DatabaseCapabilityKey];

interface CapabilityRule {
  capability_key: string;
  enabled: boolean;
  reason_code: string;
  version: number;
}

function closedCapabilities() {
  return {
    createPost: false,
    submitMarketProposal: false,
    viewPortfolio: false,
    trade: false,
    deposit: false,
    withdraw: false,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function apiError(
  requestId: string,
  code: string,
  userMessage: string,
  status: number,
  retryable: boolean,
) {
  return json(
    {
      error: {
        code,
        message: code,
        user_message: userMessage,
        retryable,
        context: {},
        request_id: requestId,
      },
      request_id: requestId,
    },
    status,
  );
}

const authenticatedHandler = withSupabase(
  { auth: "user" },
  async (req, ctx) => {
    const requestId = crypto.randomUUID();

    if (req.method !== "GET" && req.method !== "POST") {
      return apiError(
        requestId,
        "METHOD_NOT_ALLOWED",
        "This request method is not supported.",
        405,
        false,
      );
    }

    const { data: account, error: accountError } = await ctx.supabase
      .from("user_accounts")
      .select("status,country_code")
      .single();

    if (accountError || !account) {
      console.error("runtime-capabilities account lookup failed", {
        requestId,
        code: accountError?.code,
      });
      return apiError(
        requestId,
        "ACCOUNT_CONTEXT_UNAVAILABLE",
        "Your VAD account context is not available yet.",
        503,
        true,
      );
    }

    const { data: jurisdiction, error: jurisdictionError } = await ctx.supabase
      .from("jurisdictions")
      .select("id,status")
      .eq("country_code", account.country_code)
      .maybeSingle();

    if (jurisdictionError || !jurisdiction || jurisdiction.status !== "ACTIVE") {
      return apiError(
        requestId,
        "JURISDICTION_UNAVAILABLE",
        "VAD financial services are not enabled for this account location.",
        403,
        false,
      );
    }

    const [rulesResult, jurisdictionAssetsResult] = await Promise.all([
      ctx.supabase
        .from("capability_rules")
        .select("capability_key,enabled,reason_code,version")
        .eq("country_code", account.country_code)
        .order("version", { ascending: false }),
      ctx.supabase
        .from("jurisdiction_assets")
        .select("asset_id")
        .eq("jurisdiction_id", jurisdiction.id)
        .eq("status", "ACTIVE"),
    ]);

    if (rulesResult.error || jurisdictionAssetsResult.error) {
      console.error("runtime-capabilities policy lookup failed", {
        requestId,
        rulesCode: rulesResult.error?.code,
        jurisdictionAssetsCode: jurisdictionAssetsResult.error?.code,
      });
      return apiError(
        requestId,
        "POLICY_CONTEXT_UNAVAILABLE",
        "VAD cannot confirm available actions right now.",
        503,
        true,
      );
    }

    const eligibleAssetIds = jurisdictionAssetsResult.data.map((row) => row.asset_id);
    let activeAssetCodes: string[] = [];

    if (eligibleAssetIds.length > 0) {
      const { data: assets, error: assetsError } = await ctx.supabase
        .from("assets")
        .select("code")
        .in("id", eligibleAssetIds)
        .eq("status", "ACTIVE")
        .order("code");

      if (assetsError) {
        console.error("runtime-capabilities asset lookup failed", {
          requestId,
          assetsCode: assetsError.code,
        });
        return apiError(
          requestId,
          "POLICY_CONTEXT_UNAVAILABLE",
          "VAD cannot confirm available assets right now.",
          503,
          true,
        );
      }

      activeAssetCodes = assets.map((asset) => asset.code);
    }

    const capabilities = closedCapabilities();
    const reasons: Partial<Record<ClientCapabilityKey, string>> = {};
    const seen = new Set<ClientCapabilityKey>();
    const accountIsActive = account.status === "ACTIVE";

    for (const rule of rulesResult.data as CapabilityRule[]) {
      const databaseKey = rule.capability_key as DatabaseCapabilityKey;
      const clientKey = capabilityMap[databaseKey];
      if (!clientKey || seen.has(clientKey)) continue;

      seen.add(clientKey);
      capabilities[clientKey] = accountIsActive && rule.enabled;
      if (!capabilities[clientKey]) {
        reasons[clientKey] = accountIsActive
          ? rule.reason_code
          : "ACCOUNT_NOT_ACTIVE";
      }
    }

    for (const clientKey of Object.values(capabilityMap)) {
      if (!seen.has(clientKey)) reasons[clientKey] = "NO_ACTIVE_POLICY";
    }

    if (activeAssetCodes.length === 0) {
      capabilities.trade = false;
      capabilities.deposit = false;
      capabilities.withdraw = false;
      reasons.trade = "NO_ACTIVE_ASSET";
      reasons.deposit = "NO_ACTIVE_ASSET";
      reasons.withdraw = "NO_ACTIVE_ASSET";
    }

    return json({
      version: 2,
      status: "ready",
      requestId,
      evaluatedAt: new Date().toISOString(),
      context: {
        countryCode: account.country_code,
        jurisdictionStatus: jurisdiction.status,
        activeAssetCodes,
      },
      capabilities,
      reasons,
    });
  },
);

export default {
  async fetch(req: Request) {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    try {
      const response = await authenticatedHandler(req);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        headers.set(key, value);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      const requestId = crypto.randomUUID();
      console.error("runtime-capabilities unhandled failure", {
        requestId,
        message: error instanceof Error ? error.message : "unknown",
      });
      return apiError(
        requestId,
        "INTERNAL_ERROR",
        "VAD cannot confirm available actions right now.",
        500,
        true,
      );
    }
  },
};
