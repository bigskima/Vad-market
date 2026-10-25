-- Replace the legacy getting-started sequence with a version whose target IDs map
-- to real, named controls in the current product screens. Existing progress is kept;
-- because auto_prompt_existing is false, users who already finished an older version
-- are not unexpectedly interrupted.
do $$
declare
  tour_id bigint;
  version_id bigint;
begin
  select id into tour_id
  from experience.product_tours
  where code = 'GETTING_STARTED';

  if tour_id is null then
    raise exception 'GETTING_STARTED product tour is missing; apply the guided-tour base migration first';
  end if;

  select id into version_id
  from experience.product_tour_versions
  where tour_id = tour_id and version_number = 2;

  if version_id is null then
    insert into experience.product_tour_versions (
      tour_id, version_number, version_label, effective_at, auto_prompt_existing
    ) values (
      tour_id, 2, '2026.10-real-screen-map', statement_timestamp(), false
    ) returning id into version_id;
  end if;

  delete from experience.product_tour_steps where tour_version_id = version_id;

  insert into experience.product_tour_steps (
    tour_version_id, step_key, sequence, route, target_id, title, body, metadata
  ) values
    (version_id,'home-balance',1,'/home','home-overview','Your VAD home','This is your current balance overview. The amount and currency come from your enabled wallet accounts; use the visibility control when you want to hide the figure.','{"area":"home","kind":"summary"}'::jsonb),
    (version_id,'home-actions',2,'/home','home-actions','Everyday money actions','These are the actual Home shortcuts for deposits, withdrawals, market discovery and sending. The tour will not submit a payment or trade on your behalf.','{"area":"home","kind":"actions"}'::jsonb),
    (version_id,'home-discovery',3,'/home','home-categories','Discover current markets','Use the categories and market rows to narrow what you see. Open a market only after reviewing its question, closing time and resolution rules.','{"area":"home","kind":"discovery"}'::jsonb),
    (version_id,'markets-filters',4,'/markets','markets-discovery','Filter the market catalogue','Search and category, activity, timing and status controls work together here. Change a filter to narrow the real catalogue; the tour highlights these controls without changing them.','{"area":"markets","kind":"filters"}'::jsonb),
    (version_id,'markets-cards',5,'/markets','markets-results','Review market cards','These are live market results from the catalogue. Open a market to inspect its details, available outcomes, current pricing and close time before committing funds.','{"area":"markets","kind":"results"}'::jsonb),
    (version_id,'watchlist',6,'/watchlist','watchlist-list','Your saved markets','This is the dedicated Watchlist. Use the bookmark controls on market cards to save markets, and use the X control here to remove one. If it is empty, return to Markets and save a market first.','{"area":"watchlist","kind":"saved-markets"}'::jsonb),
    (version_id,'wallet-overview',7,'/wallet','wallet-balance','Understand your wallet balance','Available funds, committed amounts and pending activity are presented separately. NGN and USDC are not automatically converted into one another.','{"area":"wallet","kind":"balances"}'::jsonb),
    (version_id,'wallet-actions',8,'/wallet','wallet-actions','Choose a wallet action','These are the real Deposit, Withdraw, Transfer and History entry points. Availability depends on account eligibility, enabled currencies and payment readiness.','{"area":"wallet","kind":"actions"}'::jsonb),
    (version_id,'wallet-activity-preview',9,'/wallet','wallet-activity','Review recent activity','Recent transactions show the latest recorded wallet events. Open History for the full ledger or open an item when a transaction detail is available.','{"area":"wallet","kind":"activity"}'::jsonb),
    (version_id,'wallet-deposit',10,'/wallet/deposit','wallet-deposit-form','Deposit funds','Review the payment method, destination currency and capability status on this screen. The walkthrough never starts a deposit or authorizes a payment.','{"area":"wallet","kind":"deposit"}'::jsonb),
    (version_id,'wallet-withdraw',11,'/wallet/withdraw','wallet-withdraw-form','Withdraw with care','This screen checks withdrawal readiness and presents the current flow. Review the displayed limits and status; the walkthrough will not submit a withdrawal.','{"area":"wallet","kind":"withdrawal"}'::jsonb),
    (version_id,'wallet-history',12,'/wallet/activity','wallet-history','Open the full wallet history','The wallet activity page brings ledger events and payment activity together. Open a transaction for its status and recorded details.','{"area":"wallet","kind":"history"}'::jsonb),
    (version_id,'wallet-send',13,'/wallet/send','wallet-send-form','Send to another user','This is the transfer flow. Verify the recipient and all displayed details carefully before any real transfer; moving to the next tour step does not submit it.','{"area":"wallet","kind":"send"}'::jsonb),
    (version_id,'portfolio-summary',14,'/portfolio','portfolio-summary','Your positions and performance','Portfolio brings together active positions, pool stakes, filled holdings and valuation history. Values depend on the selected asset and available valuation marks.','{"area":"portfolio","kind":"summary"}'::jsonb),
    (version_id,'portfolio-sections',15,'/portfolio','portfolio-switcher','Move through portfolio views','Use these tabs to switch between positions, open orders, history and performance. Each view uses the same portfolio data but answers a different question.','{"area":"portfolio","kind":"tabs"}'::jsonb),
    (version_id,'account-home',16,'/account','account-overview','Account and identity','This is your account hub for profile details, identity status, app preferences and account-specific settings. Controls here open their own product screens.','{"area":"account","kind":"overview"}'::jsonb),
    (version_id,'account-verification',17,'/account','account-verification','Check verification status','This real status row opens identity verification. Some funding or account capabilities may depend on verification and jurisdiction checks.','{"area":"account","kind":"verification-shortcut"}'::jsonb),
    (version_id,'account-navigation',18,'/account','account-navigation','Find account settings','These rows open the relevant settings screens for funding, region, security, appearance, policies and the tour itself.','{"area":"account","kind":"settings-navigation"}'::jsonb),
    (version_id,'public-profile',19,'/account/profile','profile-editor','Manage your public profile','Edit the profile information shown by VAD. Only save details you want associated with your profile.','{"area":"account","kind":"profile"}'::jsonb),
    (version_id,'identity-verification',20,'/account/verification','verification-details','Identity verification details','Review the current verification state and any actions requested from your account. Verification availability is subject to the configured provider and jurisdiction.','{"area":"account","kind":"verification"}'::jsonb),
    (version_id,'funding-preferences',21,'/account/funding','funding-overview','Funding and withdrawal access','This overview shows the current funding and withdrawal capability state and why a capability may be unavailable. It does not change or bypass restrictions.','{"area":"account","kind":"funding"}'::jsonb),
    (version_id,'region-preferences',22,'/account/region','region-settings','Region and available currencies','Your region influences legal availability and currency eligibility. Changing a display preference does not change jurisdiction eligibility.','{"area":"account","kind":"region"}'::jsonb),
    (version_id,'appearance-preferences',23,'/account/appearance','appearance-settings','Personalize the interface','The real appearance controls let you choose a theme and display density where supported. These choices affect presentation, not account balances.','{"area":"account","kind":"appearance"}'::jsonb),
    (version_id,'security-settings',24,'/account/security','security-settings','Protect your account','Review sign-in and multi-factor security settings. Never share authentication codes or recovery details.','{"area":"account","kind":"security"}'::jsonb),
    (version_id,'policy-library',25,'/account/policies','policy-library','Read current policies','Use this page to review the terms and privacy information that apply to the product. Published requirements are presented separately from general settings.','{"area":"account","kind":"policies"}'::jsonb),
    (version_id,'growth-tools',26,'/account/growth','growth-tools','Account growth and invitations','This page contains the growth and referral tools currently enabled for your account. Options may depend on eligibility or campaign availability.','{"area":"account","kind":"growth"}'::jsonb),
    (version_id,'about-product',27,'/account/about','about-vad','About VAD','Find product information and relevant support or build details here. Return to Account when you need another setting.','{"area":"account","kind":"about"}'::jsonb),
    (version_id,'notifications',28,'/notifications','notification-center','Your notification centre','Review updates associated with your account and market activity. Opening the route does not mark every item as read unless the screen itself does so.','{"area":"notifications","kind":"inbox"}'::jsonb),
    (version_id,'news-feed',29,'/news','news-feed','News and headlines','Browse news content separately from market cards. Open a story to read its details; news context is not a guarantee of a market outcome.','{"area":"news","kind":"feed"}'::jsonb),
    (version_id,'financial-assets',30,'/financial-markets','financial-assets','Explore financial markets','The financial markets screen provides asset-market information and relevant market data. Availability and freshness depend on the configured data providers.','{"area":"financial-markets","kind":"assets"}'::jsonb),
    (version_id,'crypto-assets',31,'/crypto-assets','crypto-assets','Explore crypto assets','This screen presents supported crypto-asset information. A displayed asset price is reference information, not a promise of future performance.','{"area":"crypto-assets","kind":"assets"}'::jsonb),
    (version_id,'community-feed',32,'/community','community-feed','Community discussions','Browse community posts and discussions. Treat user-generated content as opinions, and check market details and resolution rules before making a decision.','{"area":"community","kind":"feed"}'::jsonb),
    (version_id,'assistant-guide',33,'/assistant','assistant-help','Ask the VAD assistant','Use the assistant to help navigate product information. Verify important financial or account decisions against the official details shown in VAD.','{"area":"assistant","kind":"guide"}'::jsonb),
    (version_id,'market-creation',34,'/create-market','market-creation','Create a market','Market creation is subject to the configured workflow and permissions. Review the required fields and preview the market before submitting it for any approval or publication process.','{"area":"markets","kind":"creation"}'::jsonb);

  update experience.product_tours
  set current_version_id = version_id,
      status = 'ACTIVE',
      auto_start = true,
      updated_at = statement_timestamp()
  where id = tour_id;
end;
$$;
