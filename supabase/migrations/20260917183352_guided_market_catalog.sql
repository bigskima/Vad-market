create table if not exists market.guided_categories (
  code text primary key,
  name text not null,
  description text not null default '',
  display_order integer not null default 100,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint guided_categories_code_format check (code ~ '^[A-Z0-9_]+$')
);

create table if not exists market.guided_market_types (
  code text primary key,
  category_code text not null references market.guided_categories(code),
  name text not null,
  description text not null default '',
  handler_code text not null default 'VERIFIED_EVENT' check (handler_code in ('VERIFIED_EVENT','FOOTBALL_MATCH')),
  question_template text not null default '',
  condition_template text not null default '',
  source_label text not null default 'Authoritative result source',
  source_required boolean not null default true,
  field_schema jsonb not null default '[]'::jsonb,
  display_order integer not null default 100,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','DISABLED')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint guided_market_types_code_format check (code ~ '^[A-Z0-9_]+$'),
  constraint guided_market_types_fields_array check (jsonb_typeof(field_schema)='array')
);

alter table market.guided_categories enable row level security;
alter table market.guided_market_types enable row level security;

insert into market.guided_categories(code,name,description,display_order,status) values
('SPORTS','Sports','Matches, tournaments, player moves, awards and measurable sporting events.',10,'ACTIVE'),
('POLITICS','Politics & Elections','Elections, public office, legislation, referendums and other officially verifiable political events.',20,'ACTIVE'),
('MUSIC','Music','Awards, charts, releases, collaborations, tours and measurable music milestones.',30,'ACTIVE'),
('ENTERTAINMENT','Entertainment','Film, television, awards, casting, box office and reality-show outcomes.',40,'ACTIVE'),
('RELIGION_FAITH','Religion & Faith','Objectively verifiable public or institutional religious events. Beliefs, prophecies and supernatural claims are not suitable resolution criteria.',50,'ACTIVE'),
('BUSINESS','Business','Company actions, mergers, listings, appointments, funding and reported business milestones.',60,'ACTIVE'),
('ECONOMY_FINANCE','Economy & Finance','Official economic releases, central-bank decisions and measurable financial indicators.',70,'ACTIVE'),
('TECHNOLOGY','Technology','Product launches, releases, company actions and measurable technology milestones.',80,'ACTIVE'),
('SCIENCE_SPACE','Science & Space','Space missions, approvals, publications and officially announced scientific milestones.',90,'ACTIVE'),
('GAMING_ESPORTS','Gaming & Esports','Matches, tournaments, releases, awards and player or team moves.',100,'ACTIVE'),
('CRYPTO_WEB3','Crypto & Web3','Listings, launches, upgrades, governance votes and other objective Web3 events.',110,'ACTIVE'),
('WORLD_AFFAIRS','World & Current Affairs','Treaties, official decisions, international appointments and other objective public events.',120,'ACTIVE'),
('MEDIA_CULTURE','Media & Culture','Publishing, cultural events, media awards and releases.',130,'ACTIVE'),
('EDUCATION','Education','Official education policy, results, rankings and institutional decisions.',140,'ACTIVE'),
('OTHER','Other','Any objective YES/NO event with a clear authoritative result source.',999,'ACTIVE')
on conflict (code) do update set
  name=excluded.name,
  description=excluded.description,
  display_order=excluded.display_order,
  status=excluded.status,
  updated_at=statement_timestamp();

insert into market.guided_market_types(code,category_code,name,description,handler_code,question_template,condition_template,source_label,field_schema,display_order,status,metadata) values
('SPORTS_FOOTBALL_MATCH','SPORTS','Football match result','Choose a competition, teams and a win/draw outcome. Automatic checking remains available where configured.','FOOTBALL_MATCH','','','Official result source','[]'::jsonb,10,'ACTIVE','{"sport":"FOOTBALL"}'::jsonb),
('SPORTS_MATCH_WINNER','SPORTS','Other match or game winner','Basketball, volleyball, rugby and other head-to-head sporting contests.','VERIFIED_EVENT','Will {{competitor_a}} beat {{competitor_b}} in {{competition}}?','Resolve YES if {{competitor_a}} is officially recorded as the winner against {{competitor_b}} in {{competition}}; otherwise resolve NO.','Official competition result source','[{"key":"competitor_a","label":"Team / competitor A","placeholder":"Team or athlete","required":true},{"key":"competitor_b","label":"Team / competitor B","placeholder":"Opponent","required":true},{"key":"competition","label":"Competition / event","placeholder":"League, tournament or event","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('SPORTS_TOURNAMENT_WINNER','SPORTS','Tournament or championship winner','Who will win a league, cup, championship or tournament.','VERIFIED_EVENT','Will {{subject}} win {{event_name}}?','Resolve YES if {{subject}} is officially declared the winner of {{event_name}}; otherwise resolve NO.','Official competition result source','[{"key":"subject","label":"Team / athlete","placeholder":"Winner candidate","required":true},{"key":"event_name","label":"Tournament / championship","placeholder":"Competition name","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),
('SPORTS_PLAYER_TRANSFER','SPORTS','Player transfer','Whether a player officially joins a club or team.','VERIFIED_EVENT','Will {{subject}} join {{destination}}?','Resolve YES if {{subject}} is officially registered or announced as joining {{destination}} by the result deadline; otherwise resolve NO.','Official club, league or governing-body source','[{"key":"subject","label":"Player","placeholder":"Player name","required":true},{"key":"destination","label":"Destination club / team","placeholder":"Club or team","required":true}]'::jsonb,40,'ACTIVE','{}'::jsonb),
('SPORTS_AWARD_MILESTONE','SPORTS','Player award or milestone','Awards, records, goals, points, appearances and other measurable sporting milestones.','VERIFIED_EVENT','Will {{subject}} achieve {{achievement}}?','Resolve YES if the configured authoritative source officially confirms that {{subject}} achieved {{achievement}} within the market time scope; otherwise resolve NO.','Official league, team or governing-body source','[{"key":"subject","label":"Player / team","placeholder":"Name","required":true},{"key":"achievement","label":"Award / milestone","placeholder":"e.g. win MVP, score 30 goals","required":true}]'::jsonb,50,'ACTIVE','{}'::jsonb),
('SPORTS_RACE_FIGHT','SPORTS','Race, boxing or MMA result','Motorsport races, boxing bouts, MMA fights and similar contests.','VERIFIED_EVENT','Will {{subject}} win {{event_name}}?','Resolve YES if {{subject}} is officially recorded as the winner of {{event_name}}; otherwise resolve NO.','Official event or governing-body source','[{"key":"subject","label":"Driver / fighter / competitor","placeholder":"Competitor name","required":true},{"key":"event_name","label":"Race / fight / event","placeholder":"Event name","required":true}]'::jsonb,60,'ACTIVE','{}'::jsonb),

('POLITICS_ELECTION_WINNER','POLITICS','Election winner','Whether a named candidate is officially declared winner of an election.','VERIFIED_EVENT','Will {{subject}} win the {{event_name}}?','Resolve YES if {{subject}} is officially declared the winner of {{event_name}} by the configured election authority; otherwise resolve NO.','Official election authority','[{"key":"subject","label":"Candidate","placeholder":"Candidate name","required":true},{"key":"event_name","label":"Election","placeholder":"e.g. 2027 Nigerian presidential election","required":true},{"key":"office","label":"Office · optional","placeholder":"e.g. President","required":false}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('POLITICS_LEGISLATION','POLITICS','Bill or legislation','Whether legislation passes, fails, is signed or otherwise reaches a defined official status.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured official source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official legislature or government source','[{"key":"subject","label":"Bill / legislation","placeholder":"Name or bill number","required":true},{"key":"outcome","label":"Expected outcome","placeholder":"e.g. pass the Senate, be signed into law","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('POLITICS_APPOINTMENT','POLITICS','Appointment or resignation','Appointments, confirmations, resignations and removals from public office.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured official source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official government or institution source','[{"key":"subject","label":"Person / officeholder","placeholder":"Name","required":true},{"key":"outcome","label":"Event","placeholder":"e.g. be appointed Finance Minister, resign as governor","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),
('POLITICS_REFERENDUM','POLITICS','Referendum or ballot measure','Whether an official referendum or ballot measure passes or fails.','VERIFIED_EVENT','Will {{subject}} pass?','Resolve YES if {{subject}} is officially certified as passing by the configured authority; otherwise resolve NO.','Official electoral authority','[{"key":"subject","label":"Referendum / measure","placeholder":"Measure name","required":true},{"key":"jurisdiction","label":"Jurisdiction","placeholder":"Country, state or region","required":true}]'::jsonb,40,'ACTIVE','{}'::jsonb),
('POLITICS_COURT_RULING','POLITICS','Court or official ruling','A defined outcome of a court, tribunal or official adjudication.','VERIFIED_EVENT','Will {{subject}} result in {{outcome}}?','Resolve YES if the configured authoritative source confirms the outcome {{outcome}} for {{subject}}; otherwise resolve NO.','Official court, tribunal or government source','[{"key":"subject","label":"Case / proceeding","placeholder":"Case or proceeding","required":true},{"key":"outcome","label":"Expected ruling / outcome","placeholder":"Specific objective outcome","required":true}]'::jsonb,50,'ACTIVE','{}'::jsonb),

('MUSIC_AWARD_WINNER','MUSIC','Award winner','Whether an artist, group, song or album wins a named award category.','VERIFIED_EVENT','Will {{subject}} win {{award_category}} at {{event_name}}?','Resolve YES if {{subject}} is officially announced as the winner of {{award_category}} at {{event_name}}; otherwise resolve NO.','Official award organizer','[{"key":"subject","label":"Nominee / artist / work","placeholder":"e.g. Davido","required":true},{"key":"event_name","label":"Award / ceremony","placeholder":"e.g. Grammy Awards","required":true},{"key":"award_category","label":"Award category","placeholder":"e.g. Best African Music Performance","required":true},{"key":"edition","label":"Edition / year · optional","placeholder":"e.g. 2027","required":false}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('MUSIC_CHART_POSITION','MUSIC','Chart position','Whether a song, album or artist reaches a defined official chart position.','VERIFIED_EVENT','Will {{subject}} reach {{achievement}} on {{event_name}}?','Resolve YES if the configured chart source records {{subject}} as achieving {{achievement}} on {{event_name}} within the market time scope; otherwise resolve NO.','Official chart source','[{"key":"subject","label":"Artist / song / album","placeholder":"Name","required":true},{"key":"achievement","label":"Target position","placeholder":"e.g. No. 1","required":true},{"key":"event_name","label":"Chart","placeholder":"e.g. Billboard Hot 100","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('MUSIC_RELEASE','MUSIC','Song or album release','Whether a named music release is officially released by a deadline.','VERIFIED_EVENT','Will {{subject}} be officially released?','Resolve YES if {{subject}} is officially released by the result deadline according to the configured source; otherwise resolve NO.','Official artist, label or distribution source','[{"key":"subject","label":"Song / album / project","placeholder":"Release name","required":true},{"key":"artist","label":"Artist","placeholder":"Artist name","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),
('MUSIC_STREAMING_MILESTONE','MUSIC','Streaming milestone','Whether a song, album or artist reaches a measurable streaming milestone.','VERIFIED_EVENT','Will {{subject}} reach {{achievement}}?','Resolve YES if the configured authoritative source confirms that {{subject}} reached {{achievement}} within the market time scope; otherwise resolve NO.','Official platform or recognized chart/data source','[{"key":"subject","label":"Artist / song / album","placeholder":"Name","required":true},{"key":"achievement","label":"Streaming milestone","placeholder":"e.g. 500 million Spotify streams","required":true}]'::jsonb,40,'ACTIVE','{}'::jsonb),
('MUSIC_COLLAB_TOUR','MUSIC','Collaboration, tour or concert','Whether an official collaboration, tour, concert or performance is announced or occurs.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official artist, promoter, venue or label source','[{"key":"subject","label":"Artist / act","placeholder":"Name","required":true},{"key":"outcome","label":"Event","placeholder":"e.g. announce a world tour, collaborate with Artist X","required":true}]'::jsonb,50,'ACTIVE','{}'::jsonb),

('ENTERTAINMENT_AWARD_WINNER','ENTERTAINMENT','Award winner','Film, television, acting and entertainment award outcomes.','VERIFIED_EVENT','Will {{subject}} win {{award_category}} at {{event_name}}?','Resolve YES if {{subject}} is officially announced as the winner of {{award_category}} at {{event_name}}; otherwise resolve NO.','Official award organizer','[{"key":"subject","label":"Nominee / work","placeholder":"Person, film or show","required":true},{"key":"event_name","label":"Award / ceremony","placeholder":"Award name","required":true},{"key":"award_category","label":"Award category","placeholder":"Category","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('ENTERTAINMENT_RELEASE','ENTERTAINMENT','Film or TV release','Whether a film, season, episode or entertainment project is officially released by a deadline.','VERIFIED_EVENT','Will {{subject}} be officially released?','Resolve YES if {{subject}} is officially released by the result deadline according to the configured source; otherwise resolve NO.','Official studio, network or distributor','[{"key":"subject","label":"Film / show / project","placeholder":"Title","required":true},{"key":"platform","label":"Studio / network / platform · optional","placeholder":"e.g. Netflix","required":false}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('ENTERTAINMENT_BOX_OFFICE','ENTERTAINMENT','Box-office milestone','Whether a film reaches a defined box-office milestone.','VERIFIED_EVENT','Will {{subject}} reach {{achievement}}?','Resolve YES if the configured authoritative source confirms that {{subject}} reached {{achievement}} within the market time scope; otherwise resolve NO.','Recognized box-office reporting source','[{"key":"subject","label":"Film","placeholder":"Film title","required":true},{"key":"achievement","label":"Box-office target","placeholder":"e.g. $500 million worldwide","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),
('ENTERTAINMENT_CASTING','ENTERTAINMENT','Casting or role announcement','Whether a person is officially announced for a named role or project.','VERIFIED_EVENT','Will {{subject}} be officially cast in {{event_name}}?','Resolve YES if {{subject}} is officially announced as cast in {{event_name}} by the configured authoritative source; otherwise resolve NO.','Official studio, network, production or representative source','[{"key":"subject","label":"Actor / personality","placeholder":"Name","required":true},{"key":"event_name","label":"Project / role","placeholder":"Film, show or role","required":true}]'::jsonb,40,'ACTIVE','{}'::jsonb),
('ENTERTAINMENT_SHOW_WINNER','ENTERTAINMENT','Reality or competition-show winner','Whether a contestant wins a named entertainment competition.','VERIFIED_EVENT','Will {{subject}} win {{event_name}}?','Resolve YES if {{subject}} is officially announced as the winner of {{event_name}}; otherwise resolve NO.','Official broadcaster or show organizer','[{"key":"subject","label":"Contestant","placeholder":"Name","required":true},{"key":"event_name","label":"Show / competition","placeholder":"Name","required":true}]'::jsonb,50,'ACTIVE','{}'::jsonb),

('RELIGION_LEADERSHIP','RELIGION_FAITH','Leadership appointment or election','Objectively verifiable appointment or election to a religious institutional role.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured official institutional source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official church, denomination or religious organization source','[{"key":"subject","label":"Person","placeholder":"Name","required":true},{"key":"outcome","label":"Leadership event","placeholder":"e.g. be appointed bishop of …","required":true}]'::jsonb,10,'ACTIVE','{"objective_only":true}'::jsonb),
('RELIGION_ORG_DECISION','RELIGION_FAITH','Organization decision','A documented decision by a church, denomination, council or religious institution.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured official institutional source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official institutional source','[{"key":"subject","label":"Organization / council","placeholder":"Name","required":true},{"key":"outcome","label":"Decision / action","placeholder":"Objective decision or action","required":true}]'::jsonb,20,'ACTIVE','{"objective_only":true}'::jsonb),
('RELIGION_EVENT_HELD','RELIGION_FAITH','Public event held','Whether a publicly announced religious conference, gathering or institutional event occurs as defined.','VERIFIED_EVENT','Will {{event_name}} take place as scheduled?','Resolve YES if {{event_name}} is confirmed by the configured authoritative source as having taken place within the market time scope; otherwise resolve NO.','Official organizer or venue source','[{"key":"event_name","label":"Event","placeholder":"Conference, gathering or event","required":true},{"key":"location","label":"Location · optional","placeholder":"City / venue","required":false}]'::jsonb,30,'ACTIVE','{"objective_only":true}'::jsonb),
('RELIGION_OFFICIAL_DECLARATION','RELIGION_FAITH','Official declaration','A documented public declaration or institutional announcement.','VERIFIED_EVENT','Will {{subject}} officially announce {{outcome}}?','Resolve YES if the configured official source confirms that {{subject}} announced {{outcome}} within the market time scope; otherwise resolve NO.','Official institutional source','[{"key":"subject","label":"Leader / organization","placeholder":"Name","required":true},{"key":"outcome","label":"Expected declaration","placeholder":"Objective announcement","required":true}]'::jsonb,40,'ACTIVE','{"objective_only":true}'::jsonb),

('BUSINESS_MERGER_ACQUISITION','BUSINESS','Merger or acquisition','Whether an acquisition or merger is officially announced or completed.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official company, exchange or regulator source','[{"key":"subject","label":"Company / deal","placeholder":"Company or transaction","required":true},{"key":"outcome","label":"Expected event","placeholder":"e.g. acquire Company B, complete the merger","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('BUSINESS_LISTING_IPO','BUSINESS','IPO or public listing','Whether a company completes a defined public listing or IPO.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official exchange, company or regulator source','[{"key":"subject","label":"Company","placeholder":"Company name","required":true},{"key":"outcome","label":"Listing event","placeholder":"e.g. list on the NYSE","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('BUSINESS_EXECUTIVE','BUSINESS','Executive appointment or departure','Whether an executive is appointed, resigns or leaves a defined role.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official company or regulator source','[{"key":"subject","label":"Executive / company","placeholder":"Name","required":true},{"key":"outcome","label":"Expected event","placeholder":"e.g. become CEO of …","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),
('BUSINESS_FUNDING_EARNINGS','BUSINESS','Funding or reported milestone','Funding rounds, revenue, profit or other officially reported business milestones.','VERIFIED_EVENT','Will {{subject}} reach {{achievement}}?','Resolve YES if the configured authoritative source confirms that {{subject}} reached {{achievement}} within the market time scope; otherwise resolve NO.','Official company filing, exchange or recognized reporting source','[{"key":"subject","label":"Company","placeholder":"Company name","required":true},{"key":"achievement","label":"Funding / financial milestone","placeholder":"Objective target","required":true}]'::jsonb,40,'ACTIVE','{}'::jsonb),

('ECONOMY_RATE_DECISION','ECONOMY_FINANCE','Interest-rate decision','A central bank raises, cuts or holds a policy rate as defined.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured official source confirms that {{subject}} {{outcome}} at the relevant decision; otherwise resolve NO.','Official central-bank source','[{"key":"subject","label":"Central bank","placeholder":"e.g. Central Bank of Nigeria","required":true},{"key":"outcome","label":"Rate outcome","placeholder":"e.g. cut the policy rate","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('ECONOMY_INDICATOR','ECONOMY_FINANCE','Economic indicator','Inflation, GDP, unemployment or another official economic statistic relative to a threshold.','VERIFIED_EVENT','Will {{subject}} be {{outcome}}?','Resolve YES if the configured official release confirms that {{subject}} is {{outcome}} for the specified period; otherwise resolve NO.','Official statistical or government source','[{"key":"subject","label":"Indicator","placeholder":"e.g. Nigeria CPI inflation","required":true},{"key":"outcome","label":"Target / comparison","placeholder":"e.g. above 20% in Q4 2026","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('ECONOMY_FX_MARKET','ECONOMY_FINANCE','FX or market threshold','Whether an exchange rate or recognized market benchmark meets a defined threshold.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source records that {{subject}} {{outcome}} at the defined observation point; otherwise resolve NO.','Official or recognized market-data source','[{"key":"subject","label":"Rate / benchmark","placeholder":"e.g. NGN/USD official rate","required":true},{"key":"outcome","label":"Threshold / condition","placeholder":"e.g. close above 1,500","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),

('TECH_PRODUCT_LAUNCH','TECHNOLOGY','Product launch','Whether a product, device or service is officially launched by a deadline.','VERIFIED_EVENT','Will {{subject}} be officially launched?','Resolve YES if {{subject}} is officially launched by the result deadline according to the configured source; otherwise resolve NO.','Official company or product source','[{"key":"subject","label":"Product / service","placeholder":"Product name","required":true},{"key":"company","label":"Company","placeholder":"Company name","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('TECH_RELEASE_FEATURE','TECHNOLOGY','Software or feature release','Whether a software release or feature becomes officially available.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured official source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official developer or company source','[{"key":"subject","label":"Product / software","placeholder":"Name","required":true},{"key":"outcome","label":"Release / feature","placeholder":"e.g. ship version 5.0","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('TECH_COMPANY_EVENT','TECHNOLOGY','Technology company event','Acquisitions, shutdowns, official announcements and other objective company events.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official company or regulator source','[{"key":"subject","label":"Company / product","placeholder":"Name","required":true},{"key":"outcome","label":"Expected event","placeholder":"Objective event","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),

('SCIENCE_SPACE_MISSION','SCIENCE_SPACE','Space mission milestone','Launches, landings, deployments and other objectively reported mission milestones.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative mission source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official space agency or mission operator','[{"key":"subject","label":"Mission / spacecraft","placeholder":"Mission name","required":true},{"key":"outcome","label":"Mission milestone","placeholder":"e.g. launch successfully, land on the Moon","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('SCIENCE_APPROVAL','SCIENCE_SPACE','Scientific or regulatory approval','Whether a regulator or scientific authority grants a defined approval.','VERIFIED_EVENT','Will {{subject}} receive {{outcome}}?','Resolve YES if the configured official source confirms that {{subject}} received {{outcome}} within the market time scope; otherwise resolve NO.','Official regulator or scientific authority','[{"key":"subject","label":"Product / treatment / project","placeholder":"Name","required":true},{"key":"outcome","label":"Approval / decision","placeholder":"Specific approval","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('SCIENCE_PUBLICATION_DISCOVERY','SCIENCE_SPACE','Publication or discovery announcement','Whether a defined study, result or discovery is officially published or announced.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official journal, institution or agency source','[{"key":"subject","label":"Study / institution / project","placeholder":"Name","required":true},{"key":"outcome","label":"Expected publication / discovery","placeholder":"Objective event","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),

('GAMING_MATCH_WINNER','GAMING_ESPORTS','Match or tournament winner','Esports matches, tournaments and championship outcomes.','VERIFIED_EVENT','Will {{subject}} win {{event_name}}?','Resolve YES if {{subject}} is officially recorded as the winner of {{event_name}}; otherwise resolve NO.','Official tournament or league source','[{"key":"subject","label":"Player / team","placeholder":"Name","required":true},{"key":"event_name","label":"Match / tournament","placeholder":"Competition","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('GAMING_RELEASE','GAMING_ESPORTS','Game release','Whether a game or expansion is officially released by a deadline.','VERIFIED_EVENT','Will {{subject}} be officially released?','Resolve YES if {{subject}} is officially released by the result deadline according to the configured source; otherwise resolve NO.','Official publisher or storefront source','[{"key":"subject","label":"Game / expansion","placeholder":"Title","required":true},{"key":"publisher","label":"Publisher / studio","placeholder":"Name","required":false}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('GAMING_TRANSFER_AWARD','GAMING_ESPORTS','Player move or award','Esports roster moves and gaming awards.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official team, tournament or award source','[{"key":"subject","label":"Player / team / game","placeholder":"Name","required":true},{"key":"outcome","label":"Transfer / award event","placeholder":"Objective event","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),

('CRYPTO_LISTING','CRYPTO_WEB3','Token listing','Whether a token is officially listed on a named venue.','VERIFIED_EVENT','Will {{subject}} be listed on {{event_name}}?','Resolve YES if the configured official venue source confirms that {{subject}} is listed on {{event_name}} within the market time scope; otherwise resolve NO.','Official exchange or venue source','[{"key":"subject","label":"Token / asset","placeholder":"Token name or symbol","required":true},{"key":"event_name","label":"Exchange / venue","placeholder":"Venue","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('CRYPTO_PROTOCOL_EVENT','CRYPTO_WEB3','Protocol launch or upgrade','Whether a protocol launches, upgrades or reaches a defined on-chain/public milestone.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official protocol, chain or recognized explorer source','[{"key":"subject","label":"Protocol / network","placeholder":"Name","required":true},{"key":"outcome","label":"Launch / upgrade / milestone","placeholder":"Objective event","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('CRYPTO_GOVERNANCE','CRYPTO_WEB3','Governance vote','Whether an on-chain or formally recorded governance proposal passes or fails.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative governance source confirms that {{subject}} {{outcome}}; otherwise resolve NO.','Official governance or on-chain source','[{"key":"subject","label":"Proposal","placeholder":"Proposal name / number","required":true},{"key":"outcome","label":"Expected outcome","placeholder":"e.g. pass","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),

('WORLD_AGREEMENT','WORLD_AFFAIRS','Treaty or official agreement','Whether a defined treaty, agreement or formal international action occurs.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official government or international-organization source','[{"key":"subject","label":"Countries / organizations / agreement","placeholder":"Subject","required":true},{"key":"outcome","label":"Expected event","placeholder":"e.g. sign the agreement","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('WORLD_INTERNATIONAL_DECISION','WORLD_AFFAIRS','International decision or appointment','Official decisions, votes and appointments by international institutions.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official international-organization source','[{"key":"subject","label":"Organization / person / matter","placeholder":"Subject","required":true},{"key":"outcome","label":"Expected decision / appointment","placeholder":"Objective outcome","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),
('WORLD_LEGAL_EVENT','WORLD_AFFAIRS','Legal or official public event','A clearly defined court, regulatory or official public outcome.','VERIFIED_EVENT','Will {{subject}} result in {{outcome}}?','Resolve YES if the configured authoritative source confirms {{outcome}} for {{subject}}; otherwise resolve NO.','Official court, regulator or government source','[{"key":"subject","label":"Case / issue / proceeding","placeholder":"Subject","required":true},{"key":"outcome","label":"Expected outcome","placeholder":"Objective outcome","required":true}]'::jsonb,30,'ACTIVE','{}'::jsonb),

('MEDIA_AWARD_RELEASE','MEDIA_CULTURE','Media award or release','Books, publications, media awards and cultural releases.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official publisher, organizer or award source','[{"key":"subject","label":"Person / work / publication","placeholder":"Name","required":true},{"key":"outcome","label":"Award / release event","placeholder":"Objective event","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('MEDIA_CULTURAL_EVENT','MEDIA_CULTURE','Cultural event','Whether a festival, ceremony or public cultural event occurs as defined.','VERIFIED_EVENT','Will {{event_name}} take place?','Resolve YES if the configured authoritative source confirms that {{event_name}} took place within the market time scope; otherwise resolve NO.','Official organizer or venue source','[{"key":"event_name","label":"Event","placeholder":"Festival, ceremony or event","required":true},{"key":"location","label":"Location · optional","placeholder":"City / venue","required":false}]'::jsonb,20,'ACTIVE','{}'::jsonb),

('EDUCATION_POLICY','EDUCATION','Education policy or institutional decision','Official school, university, examination-body or government decisions.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured official source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official institution or government source','[{"key":"subject","label":"Institution / policy","placeholder":"Name","required":true},{"key":"outcome","label":"Expected decision","placeholder":"Objective outcome","required":true}]'::jsonb,10,'ACTIVE','{}'::jsonb),
('EDUCATION_RESULTS_RANKING','EDUCATION','Results or ranking','Whether an official result is released or an institution/person reaches a defined ranking.','VERIFIED_EVENT','Will {{subject}} {{outcome}}?','Resolve YES if the configured authoritative source confirms that {{subject}} {{outcome}} within the market time scope; otherwise resolve NO.','Official examination, institution or ranking source','[{"key":"subject","label":"Institution / exam / person","placeholder":"Subject","required":true},{"key":"outcome","label":"Result / ranking target","placeholder":"Objective outcome","required":true}]'::jsonb,20,'ACTIVE','{}'::jsonb),

('OTHER_OBJECTIVE_EVENT','OTHER','Other objective event','Use this when no named market type fits. The outcome still needs a clear YES rule and authoritative source.','VERIFIED_EVENT','','','Authoritative result source','[]'::jsonb,10,'ACTIVE','{}'::jsonb)
on conflict (code) do update set
  category_code=excluded.category_code,
  name=excluded.name,
  description=excluded.description,
  handler_code=excluded.handler_code,
  question_template=excluded.question_template,
  condition_template=excluded.condition_template,
  source_label=excluded.source_label,
  source_required=excluded.source_required,
  field_schema=excluded.field_schema,
  display_order=excluded.display_order,
  status=excluded.status,
  metadata=excluded.metadata,
  updated_at=statement_timestamp();

create or replace function private.render_guided_market_text(p_template text,p_values jsonb)
returns text
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_text text:=coalesce(p_template,'');
  v_item record;
begin
  if jsonb_typeof(coalesce(p_values,'{}'::jsonb))<>'object' then return btrim(v_text); end if;
  for v_item in select key,value from jsonb_each_text(coalesce(p_values,'{}'::jsonb)) loop
    v_text:=replace(v_text,'{{'||v_item.key||'}}',coalesce(v_item.value,''));
  end loop;
  v_text:=regexp_replace(v_text,'\{\{[A-Za-z0-9_]+\}\}','','g');
  v_text:=regexp_replace(v_text,'[[:space:]]+',' ','g');
  return btrim(v_text);
end;
$$;

create or replace function public.admin_guided_market_catalog()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;

  select jsonb_build_object(
    'categories',coalesce(jsonb_agg(jsonb_build_object(
      'code',c.code,
      'name',c.name,
      'description',c.description,
      'displayOrder',c.display_order,
      'marketTypes',coalesce((
        select jsonb_agg(jsonb_build_object(
          'code',t.code,
          'name',t.name,
          'description',t.description,
          'handler',t.handler_code,
          'questionTemplate',t.question_template,
          'conditionTemplate',t.condition_template,
          'sourceLabel',t.source_label,
          'sourceRequired',t.source_required,
          'fields',t.field_schema,
          'displayOrder',t.display_order,
          'metadata',t.metadata
        ) order by t.display_order,t.name)
        from market.guided_market_types t
        where t.category_code=c.code and t.status='ACTIVE'
      ),'[]'::jsonb)
    ) order by c.display_order,c.name),'[]'::jsonb)
  ) into v_result
  from market.guided_categories c
  where c.status='ACTIVE';

  return v_result;
end;
$$;

create or replace function public.admin_create_catalog_market(
  p_title text,
  p_description text,
  p_market_type_code text,
  p_details jsonb,
  p_condition text,
  p_source_name text,
  p_source_url text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_publish_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_type market.guided_market_types%rowtype;
  v_category market.guided_categories%rowtype;
  v_title text:=btrim(coalesce(p_title,''));
  v_details jsonb:=coalesce(p_details,'{}'::jsonb);
  v_condition text:=btrim(coalesce(p_condition,''));
  v_source_name text:=btrim(coalesce(p_source_name,''));
  v_source_url text:=btrim(coalesce(p_source_url,''));
  v_field jsonb;
  v_field_key text;
  v_field_label text;
  v_render_values jsonb;
  v_scope jsonb;
  v_proposal_public_id uuid;
  v_result jsonb;
  v_instrument_public_id uuid;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_title='' then raise exception 'Enter a clear YES/NO market question.' using errcode='22023'; end if;
  if jsonb_typeof(v_details)<>'object' then raise exception 'Review the market details and try again.' using errcode='22023'; end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at<=p_opens_at or p_resolves_after<p_closes_at then
    raise exception 'Choose valid opening, closing and result-checking times.' using errcode='22023';
  end if;
  if coalesce(p_publish_now,false) and p_opens_at>statement_timestamp() then
    raise exception 'Publish now needs an opening time that has already started. Save it as a draft for a future opening time.' using errcode='22023';
  end if;
  if v_source_url<>'' and v_source_url !~* '^https?://' then
    raise exception 'Source website must start with http:// or https://' using errcode='22023';
  end if;

  select * into v_type from market.guided_market_types
  where code=upper(btrim(coalesce(p_market_type_code,''))) and status='ACTIVE';
  if v_type.code is null then raise exception 'That market type is unavailable. Choose another type or use Custom question.' using errcode='P0002'; end if;

  select * into v_category from market.guided_categories
  where code=v_type.category_code and status='ACTIVE';
  if v_category.code is null then raise exception 'That market category is unavailable.' using errcode='P0002'; end if;

  if v_type.handler_code='FOOTBALL_MATCH' then
    raise exception 'Use the Football match form for this market type.' using errcode='22023';
  end if;

  for v_field in select value from jsonb_array_elements(v_type.field_schema) loop
    if coalesce((v_field->>'required')::boolean,false) then
      v_field_key:=btrim(coalesce(v_field->>'key',''));
      v_field_label:=coalesce(nullif(btrim(coalesce(v_field->>'label','')),''),v_field_key);
      if v_field_key='' or btrim(coalesce(v_details->>v_field_key,''))='' then
        raise exception 'Add % before continuing.',v_field_label using errcode='22023';
      end if;
    end if;
  end loop;

  if v_type.source_required and v_source_name='' then
    raise exception 'Add the authoritative result source VAD should use.' using errcode='22023';
  end if;

  v_render_values:=v_details||jsonb_build_object('question',v_title);
  if v_condition='' then
    v_condition:=private.render_guided_market_text(v_type.condition_template,v_render_values);
  end if;
  if v_condition='' then
    v_condition:='Resolve YES only when the configured authoritative source clearly confirms the proposition in the market question; otherwise resolve NO.';
  end if;

  v_scope:=jsonb_build_object(
    'resolver_type','VAD_REVIEW_V1',
    'event_type',v_type.code,
    'catalog_category',v_category.code,
    'catalog_market_type',v_type.code,
    'condition',v_condition,
    'subject',v_details,
    'verification','Verify the outcome from the configured authoritative source.',
    'source_name',nullif(v_source_name,''),
    'source_url',nullif(v_source_url,''),
    'market_question',v_title,
    'configured_by','ADMIN_GUIDED_CATALOG'
  );

  insert into market.proposals(
    proposer_user_id,raw_question,raw_context,normalized_payload,status,admission_lane,
    admission_confidence,decision_reason,admission_evaluated_at
  ) values(
    auth.uid(),v_title,nullif(btrim(coalesce(p_description,'')),''),
    jsonb_build_object(
      'submitted_category',v_category.name,
      'requested_asset_code',upper(btrim(p_asset_code)),
      'admin_created',true,
      'guided_creation',true,
      'catalog_market_type',v_type.code,
      'guided_details',v_details,
      'ai_admission',jsonb_build_object('resolutionScope',v_scope)
    ),
    'UNDER_REVIEW','UNDER_REVIEW',1,'Created from the VAD guided market catalog',statement_timestamp()
  ) returning public_id into v_proposal_public_id;

  v_result:=public.admin_approve_market_proposal_auto(
    v_proposal_public_id,
    v_title,
    coalesce(p_description,''),
    v_category.name,
    p_opens_at,
    p_closes_at,
    p_resolves_after,
    upper(btrim(p_country_code)),
    upper(btrim(p_asset_code))
  );

  v_instrument_public_id:=nullif(v_result->>'instrument_id','')::uuid;
  if v_instrument_public_id is null then raise exception 'The market was created without a publishable market record.' using errcode='P0001'; end if;

  if coalesce(p_publish_now,false) then
    perform public.admin_publish_market(v_instrument_public_id,100,'Published during guided admin market creation');
    v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED');
  else
    v_result:=v_result||jsonb_build_object('publication_status','DRAFT');
  end if;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','GUIDED_MARKET_CREATED','MARKET_INSTRUMENT',v_instrument_public_id::text,
    'Market created from database-driven guided catalog',
    jsonb_build_object('category',v_category.code,'market_type',v_type.code,'source',nullif(v_source_name,'')));

  return v_result||jsonb_build_object(
    'proposal_id',v_proposal_public_id,
    'admin_created',true,
    'creation_style','GUIDED',
    'category',v_category.name,
    'market_type',v_type.name,
    'market_type_code',v_type.code,
    'result_checking','VERIFIED',
    'result_source',v_source_name
  );
end;
$$;

create or replace function public.admin_save_guided_category(
  p_code text,
  p_name text,
  p_description text default '',
  p_display_order integer default 100,
  p_enabled boolean default true
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_code text:=upper(regexp_replace(btrim(coalesce(p_code,'')),'[^A-Za-z0-9]+','_','g'));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  if v_code='' or btrim(coalesce(p_name,''))='' then raise exception 'Category name is required.' using errcode='22023'; end if;
  insert into market.guided_categories(code,name,description,display_order,status)
  values(v_code,btrim(p_name),btrim(coalesce(p_description,'')),greatest(coalesce(p_display_order,100),0),case when coalesce(p_enabled,true) then 'ACTIVE' else 'DISABLED' end)
  on conflict(code) do update set name=excluded.name,description=excluded.description,display_order=excluded.display_order,status=excluded.status,updated_at=statement_timestamp();
  return true;
end;
$$;

create or replace function public.admin_save_simple_guided_market_type(
  p_code text,
  p_category_code text,
  p_name text,
  p_description text default '',
  p_source_label text default 'Authoritative result source',
  p_display_order integer default 100,
  p_enabled boolean default true
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_code text:=upper(regexp_replace(btrim(coalesce(p_code,'')),'[^A-Za-z0-9]+','_','g'));
  v_category text:=upper(btrim(coalesce(p_category_code,'')));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  if v_code='' or btrim(coalesce(p_name,''))='' then raise exception 'Market type name is required.' using errcode='22023'; end if;
  if not exists(select 1 from market.guided_categories where code=v_category) then raise exception 'Choose a valid category.' using errcode='22023'; end if;
  insert into market.guided_market_types(code,category_code,name,description,handler_code,question_template,condition_template,source_label,source_required,field_schema,display_order,status,metadata)
  values(v_code,v_category,btrim(p_name),btrim(coalesce(p_description,'')),'VERIFIED_EVENT','','',coalesce(nullif(btrim(coalesce(p_source_label,'')),''),'Authoritative result source'),true,'[]'::jsonb,greatest(coalesce(p_display_order,100),0),case when coalesce(p_enabled,true) then 'ACTIVE' else 'DISABLED' end,jsonb_build_object('admin_created',true))
  on conflict(code) do update set category_code=excluded.category_code,name=excluded.name,description=excluded.description,source_label=excluded.source_label,display_order=excluded.display_order,status=excluded.status,updated_at=statement_timestamp();
  return true;
end;
$$;

revoke all on function public.admin_guided_market_catalog() from public,anon;
grant execute on function public.admin_guided_market_catalog() to authenticated;
revoke all on function public.admin_create_catalog_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean) from public,anon;
grant execute on function public.admin_create_catalog_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean) to authenticated;
revoke all on function public.admin_save_guided_category(text,text,text,integer,boolean) from public,anon;
grant execute on function public.admin_save_guided_category(text,text,text,integer,boolean) to authenticated;
revoke all on function public.admin_save_simple_guided_market_type(text,text,text,text,text,integer,boolean) from public,anon;
grant execute on function public.admin_save_simple_guided_market_type(text,text,text,text,text,integer,boolean) to authenticated;