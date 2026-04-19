import { isSupabaseConfigured, supabase } from "./supabase.js";

const categories = [
  "DeFi",
  "NFTs",
  "Memecoins",
  "Trading",
  "GameFi",
  "Education",
  "Airdrops",
  "News",
  "Technical Reviews",
  "Community Growth",
  "Prediction Market/Gambling"
];

const rateRanges = [
  [10, 50],
  [50, 100],
  [100, 150],
  [150, 200],
  [200, 250],
  [250, 300],
  [300, 350],
  [350, 400],
  [400, 450],
  [450, 500],
  [500, 550],
  [550, 600],
  [600, 650],
  [650, 700],
  [700, 750],
  [750, 800],
  [800, 900],
  [900, 1000],
  [1000, 1100],
  [1100, 1200],
  [1200, 1300],
  [1300, 1400],
  [1400, 1500],
  [1500, Infinity]
];

const regions = [
  "Global",
  "Africa",
  "Nigeria",
  "North America",
  "Europe",
  "Asia",
  "Latin America",
  "Middle East",
  "Oceania"
];

function normalizeCreator(creator) {
  return {
    ...creator,
    region: creator.region || "Global",
    availability: creator.availability || "Available this week",
    example: creator.example || "",
    maxRate: creator.maxRate === null ? Infinity : creator.maxRate
  };
}

let creators = [];
let requests = [];
let selectedCreatorIds = new Set();
let currentSession = null;
let currentUserRole = "";
const PROJECT_ACCESS_STORAGE_KEY = "creatorDeskProjectAccess";
const PENDING_CREATOR_SELECTION_KEY = "creatorDeskPendingCreatorSelection";
const OAUTH_PROVIDER_TOKEN_STORAGE_KEY = "creatorDeskOAuthProviderToken";
const OAUTH_PROVIDER_REFRESH_TOKEN_STORAGE_KEY = "creatorDeskOAuthProviderRefreshToken";
const DEFAULT_PRODUCTION_API_ORIGIN = "https://creatordec-production.up.railway.app";

function cacheProviderTokensFromSession(session) {
  if (session?.provider_token) {
    window.localStorage.setItem(OAUTH_PROVIDER_TOKEN_STORAGE_KEY, session.provider_token);
  }

  if (session?.provider_refresh_token) {
    window.localStorage.setItem(OAUTH_PROVIDER_REFRESH_TOKEN_STORAGE_KEY, session.provider_refresh_token);
  }
}

function cacheProviderTokensFromUrl() {
  const hashParams = new URLSearchParams(window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash);
  const providerToken = hashParams.get("provider_token");
  const providerRefreshToken = hashParams.get("provider_refresh_token");

  if (providerToken) {
    window.localStorage.setItem(OAUTH_PROVIDER_TOKEN_STORAGE_KEY, providerToken);
  }

  if (providerRefreshToken) {
    window.localStorage.setItem(OAUTH_PROVIDER_REFRESH_TOKEN_STORAGE_KEY, providerRefreshToken);
  }
}

if (isSupabaseConfigured) {
  cacheProviderTokensFromUrl();
  supabase.auth.onAuthStateChange((event, session) => {
    cacheProviderTokensFromSession(session);

    if (event === "SIGNED_OUT") {
      window.localStorage.removeItem(OAUTH_PROVIDER_TOKEN_STORAGE_KEY);
      window.localStorage.removeItem(OAUTH_PROVIDER_REFRESH_TOKEN_STORAGE_KEY);
    }
  });
}

function canUseBackend() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

function getApiUrl(path) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  const configuredOrigin = window.CREATOR_DESK_API_ORIGIN || "";
  const hostname = window.location.hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "";
  const apiOrigin = configuredOrigin || (isLocalHost ? "" : DEFAULT_PRODUCTION_API_ORIGIN);
  return `${apiOrigin}${path}`;
}

async function sendApi(path, method = "GET", payload) {
  if (!canUseBackend()) {
    return null;
  }

  try {
    const response = await fetch(getApiUrl(path), {
      method,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined
    });

    if (!response.ok) {
      throw new Error("API request failed");
    }

    return response.json();
  } catch {
    return null;
  }
}

async function sendApiStrict(path, method = "GET", payload, options = {}) {
  if (!canUseBackend()) {
    throw new Error("Backend server is required for permanent Supabase storage.");
  }

  const headers = {
    ...(options.headers || {})
  };

  let body = options.body;
  if (payload !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(payload);
  }

  const response = await fetch(getApiUrl(path), {
    method,
    headers,
    body
  });
  const contentType = response.headers.get("content-type") || "";
  const responsePayload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(responsePayload?.error || responsePayload || "API request failed.");
  }

  return responsePayload;
}

function getPageName() {
  return window.location.pathname.split("/").pop() || "index.html";
}

function normalizeTrackingCode(code) {
  return String(code || "").trim().toUpperCase().replace(/\s+/g, "");
}

function getStoredProjectAccess() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROJECT_ACCESS_STORAGE_KEY) || "null");
    return stored?.contact && stored?.trackingCode
      ? {
          contact: stored.contact,
          trackingCode: normalizeTrackingCode(stored.trackingCode)
        }
      : null;
  } catch {
    return null;
  }
}

function rememberProjectAccess(contact, trackingCode) {
  const normalizedCode = normalizeTrackingCode(trackingCode);

  if (!contact || !normalizedCode) {
    return null;
  }

  const access = { contact, trackingCode: normalizedCode };
  window.localStorage.setItem(PROJECT_ACCESS_STORAGE_KEY, JSON.stringify(access));
  return access;
}

function contactMatchesStoredAccess(contact, storedAccess) {
  return storedAccess?.contact &&
    String(storedAccess.contact).trim().toLowerCase() === String(contact || "").trim().toLowerCase();
}

function getRedirectUrl(page) {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, page)}`;
}

function hasAuthCallbackParams() {
  const hashParams = new URLSearchParams(window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash);
  const queryParams = new URLSearchParams(window.location.search);

  return Boolean(
    hashParams.get("access_token") ||
    hashParams.get("refresh_token") ||
    hashParams.get("error") ||
    queryParams.get("code") ||
    queryParams.get("error")
  );
}

function isXAuthSession(session) {
  const appMetadata = session?.user?.app_metadata || {};
  const providers = [
    appMetadata.provider,
    ...(Array.isArray(appMetadata.providers) ? appMetadata.providers : []),
    ...(Array.isArray(session?.user?.identities)
      ? session.user.identities.map((identity) => identity.provider)
      : [])
  ];

  return providers.some((provider) => ["x", "twitter"].includes(String(provider || "").toLowerCase()));
}

function normalizeHandleForStore(handle) {
  return String(handle || "").trim().replace(/^@/, "").toLowerCase();
}

function normalizeHandleForDisplay(handle) {
  const normalizedHandle = normalizeHandleForStore(handle);
  return normalizedHandle ? `@${normalizedHandle}` : "";
}

function getUserMetadata(user) {
  return user?.user_metadata || {};
}

function getIdentityMetadata(user) {
  const identities = Array.isArray(user?.identities) ? user.identities : [];
  const xIdentity = identities.find((identity) => ["x", "twitter"].includes(identity.provider));
  return xIdentity?.identity_data || identities[0]?.identity_data || {};
}

function mergeMetadata(...metadataItems) {
  return metadataItems.reduce((merged, metadata) => {
    Object.entries(metadata || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "" && merged[key] === undefined) {
        merged[key] = value;
      }
    });
    return merged;
  }, {});
}

function getMetricValue(metrics, ...keys) {
  for (const key of keys) {
    const value = metrics?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return Number(value);
    }
  }

  return 0;
}

function hasLiveXProfile(profile = {}) {
  return Boolean(
    profile.provider ||
    profile.avatarUrl ||
    profile.bio ||
    profile.followers ||
    profile.following ||
    profile.tweetCount ||
    profile.location ||
    profile.verified ||
    profile.pinnedTweet ||
    profile.notableFollowers
  );
}

function getFirstMetadataValue(meta = {}, ...keys) {
  for (const key of keys) {
    const value = meta?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return "";
}

function extractXDataFromMetadata(meta = {}) {
  const publicMetrics = meta.public_metrics || {};
  return {
    name: getFirstMetadataValue(meta, "full_name", "name", "display_name"),
    handle: normalizeHandleForStore(getFirstMetadataValue(meta, "user_name", "userName", "username", "preferred_username", "nickname", "screen_name", "screenName")),
    avatarUrl: getFirstMetadataValue(meta, "avatar_url", "avatarUrl", "picture", "profile_image_url", "profileImageUrl", "profile_image_url_https", "profilePicture"),
    bio: getFirstMetadataValue(meta, "description", "bio"),
    followers: getMetricValue(publicMetrics, "followers_count", "followers") || getMetricValue(meta, "followers_count", "followers"),
    following: getMetricValue(publicMetrics, "following_count", "following") || getMetricValue(meta, "following_count", "following", "friends_count"),
    tweetCount: getMetricValue(publicMetrics, "tweet_count", "tweets") || getMetricValue(meta, "tweet_count", "tweets", "statuses_count"),
    location: meta.location || "",
    verified: Boolean(meta.verified),
    collectedAt: new Date().toISOString(),
    collected: true
  };
}

function extractXDataFromUser(user) {
  return extractXDataFromMetadata(mergeMetadata(getUserMetadata(user), getIdentityMetadata(user)));
}

async function fetchXDataFromProviderToken(session) {
  const providerToken = session?.provider_token || window.localStorage.getItem(OAUTH_PROVIDER_TOKEN_STORAGE_KEY);
  if (!providerToken) {
    return null;
  }

  try {
    const backendProfile = await sendApiStrict("/api/x-me", "POST", { providerToken });
    if (hasLiveXProfile(backendProfile)) {
      return backendProfile;
    }
  } catch {
    // Fall back to a direct provider-token request below when the backend is unavailable.
  }

  const userFields = "description,location,profile_image_url,public_metrics,verified,username,name";
  const urls = [
    `https://api.x.com/2/users/me?user.fields=${encodeURIComponent(userFields)}`,
    `https://api.twitter.com/2/users/me?user.fields=${encodeURIComponent(userFields)}`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${providerToken}`
        }
      });

      if (!response.ok) {
        continue;
      }

      const payload = await response.json();
      return extractXDataFromMetadata(payload.data || {});
    } catch {
      // Try the next host, then fall back to Supabase identity metadata.
    }
  }

  return null;
}

async function getXDataFromSession(session, options = {}) {
  const metadataXData = extractXDataFromUser(session?.user);
  const tokenXData = await fetchXDataFromProviderToken(session);
  const mergedXData = tokenXData
    ? { ...metadataXData, ...tokenXData, collectedAt: new Date().toISOString(), collected: true }
    : metadataXData;

  if (!mergedXData.handle) {
    return mergedXData;
  }

  return enrichXDataByHandle(mergedXData.handle, mergedXData, options);
}

async function enrichXDataByHandle(handle, fallbackXData = {}, options = {}) {
  const normalizedHandle = normalizeHandleForStore(handle || fallbackXData.handle);
  if (!normalizedHandle) {
    return fallbackXData;
  }

  try {
    const backendXData = await requestXProfileEnrichment(normalizedHandle, options);
    if (!hasLiveXProfile(backendXData)) {
      return backendXData?.note ? { ...fallbackXData, handle: normalizedHandle, note: backendXData.note } : { ...fallbackXData, handle: normalizedHandle };
    }

    return {
      ...fallbackXData,
      ...backendXData,
      name: backendXData.name || fallbackXData.name,
      handle: backendXData.handle || normalizedHandle,
      avatarUrl: backendXData.avatarUrl || fallbackXData.avatarUrl,
      bio: backendXData.bio || fallbackXData.bio,
      followers: backendXData.followers ?? fallbackXData.followers,
      following: backendXData.following ?? fallbackXData.following,
      tweetCount: backendXData.tweetCount ?? fallbackXData.tweetCount,
      location: backendXData.location || fallbackXData.location,
      verified: Boolean(backendXData.verified || fallbackXData.verified),
      collectedAt: backendXData.collectedAt || new Date().toISOString(),
      collected: true
    };
  } catch {
    return { ...fallbackXData, handle: normalizedHandle };
  }
}

function getCreatorNameFromUser(user) {
  const xData = extractXDataFromUser(user);
  return xData.name || xData.handle || "";
}

function getCreatorHandleFromUser(user) {
  const xData = extractXDataFromUser(user);
  return normalizeHandleForDisplay(xData.handle);
}

function getCreatorInitials(name, handle = "") {
  const source = String(name || handle || "X").replace("@", "").trim();
  const words = source.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0]}${words[1][0]}`
    : source.slice(0, 2);
  return initials.toUpperCase();
}

function formatCount(value) {
  return Number(value || 0).toLocaleString();
}

function truncateText(value, maxLength = 100) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trim()}...`;
}

function renderXAvatar(profile = {}, name = "", size = 52) {
  const avatarUrl = getHighQualityAvatarUrl(profile.avatarUrl || profile.avatar || "");
  const safeSize = Number(size || 52);
  const avatarStyle = `width:${safeSize}px;height:${safeSize}px;border-radius:999px;object-fit:cover;flex:0 0 ${safeSize}px;border:1px solid rgba(16,19,15,0.14);background:rgba(255,255,255,0.7);`;

  if (avatarUrl) {
    return `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name || profile.handle || "Creator")} profile picture" style="${avatarStyle}">`;
  }

  return `<span aria-hidden="true" style="${avatarStyle}display:grid;place-items:center;font-family:Archivo,sans-serif;font-weight:800;color:var(--lime);">${escapeHtml(getCreatorInitials(name, profile.handle))}</span>`;
}

function getHighQualityAvatarUrl(value = "") {
  const avatarUrl = String(value || "").trim();
  if (!avatarUrl) {
    return "";
  }

  return avatarUrl.replace(/_normal(\.[a-z0-9]+)(\?|$)/i, "$1$2");
}

function getSafeExternalUrl(value = "") {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function getCreatorXProfileUrl(creator = {}) {
  const xProfile = creator.xProfile || creator;
  const handle = normalizeHandleForStore(xProfile.handle || creator.handle || "");
  return handle ? `https://x.com/${handle}` : "";
}

function getCreatorHighlights(creator = {}, limit = 3) {
  const portfolio = Array.isArray(creator.portfolio) ? creator.portfolio : [];
  return portfolio
    .filter((item) => item && (item.campaignName || item.platform || item.link || item.screenshotUrl))
    .slice(-limit)
    .reverse();
}

function renderCreatorPortfolioHighlights(creator = {}, options = {}) {
  const limit = options.limit || 3;
  const highlights = getCreatorHighlights(creator, limit);

  if (!highlights.length) {
    return `<div class="empty-state creator-highlight-empty">${escapeHtml(options.emptyText || "No creator-uploaded tweets or campaign links yet.")}</div>`;
  }

  return `
    <div class="creator-highlight-grid">
      ${highlights.map((item) => {
        const link = getSafeExternalUrl(item.link);
        const screenshotUrl = getSafeExternalUrl(item.screenshotUrl);
        return `
          <article class="creator-highlight-card">
            ${screenshotUrl
              ? `<img class="creator-highlight-image" src="${escapeHtml(screenshotUrl)}" alt="${escapeHtml(item.campaignName || "Creator post")} proof image">`
              : `<div class="creator-highlight-fallback">Post proof</div>`}
            <div>
              <span>${escapeHtml(item.platform || "X")}</span>
              <h3>${escapeHtml(item.campaignName || "Creator highlight")}</h3>
              ${link ? `<a class="button subtle" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">Open tweet/post</a>` : ""}
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function mergeCreatorWithXData(creator, xData) {
  return {
    ...creator,
    name: creator.name || xData.name || "",
    handle: creator.handle || normalizeHandleForDisplay(xData.handle),
    bio: creator.bio || xData.bio || "",
    xProfile: {
      ...(creator.xProfile || {}),
      handle: xData.handle || normalizeHandleForStore(creator.handle),
      avatarUrl: xData.avatarUrl || creator.xProfile?.avatarUrl || "",
      bio: xData.bio || creator.xProfile?.bio || "",
      followers: Number(xData.followers || creator.xProfile?.followers || 0),
      following: Number(xData.following || creator.xProfile?.following || 0),
      tweetCount: Number(xData.tweetCount || creator.xProfile?.tweetCount || 0),
      location: xData.location || creator.xProfile?.location || "",
      verified: Boolean(xData.verified || creator.xProfile?.verified),
      collectedAt: xData.collectedAt || new Date().toISOString(),
      collected: true
    }
  };
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function calculateSorsaScore(creator) {
  let score = 50;
  if (creator.x_followers >= 100000) score += 20;
  else if (creator.x_followers >= 50000) score += 15;
  else if (creator.x_followers >= 10000) score += 10;
  else if (creator.x_followers >= 1000) score += 5;
  if (creator.bio && creator.bio.length > 50) score += 5;
  if (creator.example) score += 5;
  if (creator.portfolio && creator.portfolio.length > 0) score += 5;
  if (creator.contact) score += 3;
  if (creator.x_notable_followers) score += 5;
  if (creator.verified_campaign) score += 10;
  return Math.min(score, 99);
}

function normalizeSorsaScore(value, fallback = 50) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

function toAppCreator(row) {
  if (!row) {
    return null;
  }

  return normalizeCreator({
    id: row.id,
    name: row.name || "",
    handle: normalizeHandleForDisplay(row.handle),
    minRate: Number(row.min_rate || 0),
    maxRate: row.max_rate === null ? Infinity : Number(row.max_rate || 0),
    sorsaScore: normalizeSorsaScore(row.sorsa_score, 50),
    region: row.region || "Global",
    availability: row.availability || "Available this week",
    example: row.example || "",
    categories: Array.isArray(row.categories) ? row.categories : [],
    skillType: row.skill_type || "Writing",
    videoStyles: Array.isArray(row.video_styles) ? row.video_styles : [],
    contact: row.contact || "",
    bio: row.bio || "",
    isPublicProfile: Boolean(row.is_public_profile),
    verifiedCampaign: Boolean(row.verified_campaign),
    portfolio: Array.isArray(row.portfolio) ? row.portfolio : [],
    xProfile: {
      handle: normalizeHandleForStore(row.handle),
      avatarUrl: row.x_avatar_url || "",
      bio: row.x_bio || "",
      followers: Number(row.x_followers || 0),
      following: Number(row.x_following || 0),
      tweetCount: Number(row.x_tweet_count || 0),
      location: row.x_location || "",
      verified: Boolean(row.x_verified),
      collectedAt: row.x_collected_at || "",
      notableFollowers: row.x_notable_followers || "",
      pinnedTweet: row.x_pinned_tweet || "",
      collected: Boolean(row.x_collected_at || row.x_followers || row.x_avatar_url || row.x_bio || row.x_notable_followers || row.x_pinned_tweet)
    }
  });
}

function toDbCreator(creator, userId = creator.id) {
  const xProfile = creator.xProfile || {};
  const portfolio = Array.isArray(creator.portfolio) ? creator.portfolio : [];
  const dbCreator = {
    id: userId,
    name: creator.name || "",
    handle: normalizeHandleForStore(creator.handle),
    x_avatar_url: xProfile.avatarUrl || creator.x_avatar_url || "",
    x_bio: xProfile.bio || creator.x_bio || "",
    x_followers: Number(xProfile.followers || creator.x_followers || 0),
    x_following: Number(xProfile.following || creator.x_following || 0),
    x_tweet_count: Number(xProfile.tweetCount || creator.x_tweet_count || 0),
    x_location: xProfile.location || creator.x_location || "",
    x_verified: Boolean(xProfile.verified || creator.x_verified),
    x_collected_at: xProfile.collectedAt || creator.x_collected_at || null,
    x_pinned_tweet: xProfile.pinnedTweet || creator.x_pinned_tweet || "",
    x_notable_followers: xProfile.notableFollowers || creator.x_notable_followers || "",
    bio: creator.bio || "",
    region: creator.region || "Global",
    categories: Array.isArray(creator.categories) ? creator.categories : [],
    skill_type: creator.skillType || creator.skill_type || "Writing",
    video_styles: Array.isArray(creator.videoStyles) ? creator.videoStyles : [],
    min_rate: Number(creator.minRate || creator.min_rate || 0),
    max_rate: creator.maxRate === Infinity ? null : Number(creator.maxRate ?? creator.max_rate ?? 0),
    availability: creator.availability || "Available this week",
    contact: creator.contact || "",
    example: creator.example || "",
    is_public_profile: creator.isPublicProfile !== undefined
      ? Boolean(creator.isPublicProfile)
      : creator.is_public_profile !== undefined
        ? Boolean(creator.is_public_profile)
        : true,
    verified_campaign: Boolean(creator.verifiedCampaign || creator.verified_campaign),
    portfolio
  };

  dbCreator.sorsa_score = normalizeSorsaScore(creator.sorsaScore ?? creator.sorsa_score, calculateSorsaScore(dbCreator));
  return dbCreator;
}

function normalizeCampaignRequest(request) {
  if (!request) {
    return null;
  }

  if (request.projectName) {
    return request;
  }

  return toAppCampaign(request);
}

function toAppCampaign(row) {
  if (!row) {
    return null;
  }

  const linkedCreators = Array.isArray(row.campaign_creators)
    ? row.campaign_creators
      .map((link) => toAppCreator(link.creators || link.creator))
      .filter(Boolean)
    : [];
  const maxBudget = row.budget_max === null ? Infinity : Number(row.budget_max || 0);

  return {
    id: row.id,
    projectName: row.project_name || "",
    contact: row.brands?.contact || row.brands?.email || "",
    category: row.category || "All",
    region: row.region || "Global",
    budget: maxBudget,
    budgetRange: [Number(row.budget_min || 0), maxBudget],
    skillType: row.skill_type || "Writing",
    urgency: row.urgency || "Flexible timeline",
    videoStyles: Array.isArray(row.video_styles) ? row.video_styles : [],
    notes: row.notes || "",
    contentScope: row.content_scope || "",
    draftFile: row.draft_file || null,
    creators: linkedCreators,
    status: row.status || "Received",
    createdAt: formatDateTime(row.created_at)
  };
}

async function getActiveSession() {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

async function getUserRole(userId) {
  if (!isSupabaseConfigured || !userId) {
    return "";
  }

  const [{ data: creator }, { data: brand }] = await Promise.all([
    supabase.from("creators").select("id").eq("id", userId).maybeSingle(),
    supabase.from("brands").select("id").eq("id", userId).maybeSingle()
  ]);

  if (creator) {
    return "creator";
  }

  if (brand) {
    return "brand";
  }

  return "";
}

async function fetchCreators() {
  if (!isSupabaseConfigured) {
    return [];
  }

  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("is_public_profile", true)
    .order("sorsa_score", { ascending: false });

  if (error) {
    showToast("Creator data could not load from Supabase yet.");
    return creators;
  }

  return (data || []).map(toAppCreator).filter(Boolean);
}

async function fetchCreatorByHandle(handle) {
  const normalizedHandle = normalizeHandleForStore(handle);

  if (!isSupabaseConfigured) {
    return creators.find((item) => normalizeHandleForStore(item.handle) === normalizedHandle) || null;
  }

  const { data, error } = await supabase
    .from("creators")
    .select("*")
    .eq("handle", normalizedHandle)
    .eq("is_public_profile", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    showToast("Creator profile could not load.");
    return null;
  }

  return toAppCreator((data || [])[0]);
}

async function saveCreatorProfile(creator, userId = creator.id) {
  const dbCreator = toDbCreator(creator, userId);

  if (!isSupabaseConfigured) {
    const appCreator = toAppCreator(dbCreator);
    creators = [appCreator, ...creators.filter((item) => item.id !== appCreator.id)];
    return appCreator;
  }

  const { data, error } = await supabase
    .from("creators")
    .upsert(dbCreator, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const savedCreator = toAppCreator(data);
  creators = [savedCreator, ...creators.filter((item) => item.id !== savedCreator.id)];
  return savedCreator;
}

async function refreshCreatorXData(creator) {
  if (!isSupabaseConfigured) {
    return creator;
  }

  const { data, error } = await supabase.auth.refreshSession();
  if (error) {
    throw error;
  }

  const refreshedSession = data.session || await getActiveSession();
  if (!refreshedSession?.user) {
    throw new Error("No active creator session found.");
  }

  currentSession = refreshedSession;
  const sessionXData = await getXDataFromSession(refreshedSession);
  const fallbackHandle = normalizeHandleForStore(sessionXData.handle || creator.xProfile?.handle || creator.handle);
  const xData = await enrichXDataByHandle(fallbackHandle, sessionXData, { forceRefresh: true });
  if (!hasLiveXProfile(xData) && xData.note) {
    throw new Error(xData.note);
  }

  const updatedCreator = mergeCreatorWithXData(creator, xData);
  return saveCreatorProfile(updatedCreator, refreshedSession.user.id);
}

async function ensureBrandProfile({ projectName = "", contact = "" } = {}) {
  if (!currentSession?.user || !isSupabaseConfigured) {
    return null;
  }

  const payload = {
    id: currentSession.user.id,
    project_name: projectName,
    email: currentSession.user.email || "",
    contact
  };

  const { data: existing } = await supabase
    .from("brands")
    .select("*")
    .eq("id", currentSession.user.id)
    .maybeSingle();

  if (existing) {
    const updates = {
      project_name: existing.project_name || projectName,
      contact: existing.contact || contact,
      email: existing.email || currentSession.user.email || ""
    };
    await supabase.from("brands").update(updates).eq("id", currentSession.user.id);
    return { ...existing, ...updates };
  }

  const { data, error } = await supabase
    .from("brands")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  currentUserRole = "brand";
  return data;
}

async function createCampaignRequest(request, selectedCreators) {
  const storedAccess = getStoredProjectAccess();
  const trackingCode = contactMatchesStoredAccess(request.contact, storedAccess)
    ? storedAccess.trackingCode
    : "";
  const response = await sendApiStrict("/api/tracked-requests", "POST", {
    request: {
      ...request,
      trackingCode
    },
    creatorIds: selectedCreators.map((creator) => creator.id)
  });
  const savedRequest = normalizeCampaignRequest(response.request);

  rememberProjectAccess(request.contact, response?.trackingCode || savedRequest.trackingCode);
  requests = [savedRequest, ...requests];
  return savedRequest;
}

async function uploadCampaignDraftFile(file) {
  if (!file) {
    return null;
  }

  return sendApiStrict("/api/uploads/campaign-draft", "POST", undefined, {
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": encodeURIComponent(file.name || "campaign-draft")
    },
    body: file
  });
}

async function fetchBrandCampaigns(brandId) {
  if (!isSupabaseConfigured || !brandId) {
    return requests;
  }

  const { data, error } = await supabase
    .from("campaigns")
    .select("*, campaign_creators(creator_id, creators(*))")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Campaigns could not load.");
    return [];
  }

  return (data || []).map(toAppCampaign);
}

async function fetchCreatorCampaigns(creatorId, options = {}) {
  if (!creatorId) {
    return [];
  }

  const apiRequests = await sendApi("/api/requests");
  const apiCampaigns = Array.isArray(apiRequests)
    ? apiRequests
      .map(normalizeCampaignRequest)
      .filter((request) => (request?.creators || []).some((creator) => creator.id === creatorId))
    : [];

  if (!isSupabaseConfigured) {
    return apiCampaigns;
  }

  const { data, error } = await supabase
    .from("campaign_creators")
    .select("campaigns(*)")
    .eq("creator_id", creatorId);

  if (error) {
    if (!options.silent) {
      showToast("Incoming requests could not load.");
    }
    return apiCampaigns;
  }

  const supabaseCampaigns = (data || [])
    .map((item) => toAppCampaign(item.campaigns))
    .filter(Boolean);

  const campaignIds = new Set(supabaseCampaigns.map((campaign) => campaign.id));
  return [
    ...supabaseCampaigns,
    ...apiCampaigns.filter((campaign) => !campaignIds.has(campaign.id))
  ];
}

async function fetchShortlists(brandId) {
  if (!isSupabaseConfigured || !brandId) {
    return [];
  }

  const { data, error } = await supabase
    .from("shortlists")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) {
    showToast("Saved shortlists could not load.");
    return [];
  }

  return data || [];
}

async function fetchShortlist(shortlistId) {
  if (!shortlistId) {
    return null;
  }

  try {
    const apiShortlist = await sendApiStrict(`/api/shortlists/${encodeURIComponent(shortlistId)}`);
    if (apiShortlist?.id) {
      return apiShortlist;
    }
  } catch {
    // Fall through to direct Supabase auth lookup for legacy brand sessions.
  }

  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase
    .from("shortlists")
    .select("*")
    .eq("id", shortlistId)
    .maybeSingle();

  if (error) {
    showToast("Saved shortlist could not load.");
    return null;
  }

  return data;
}

async function saveCurrentShortlist(name, creatorIds, context = {}) {
  const storedAccess = getStoredProjectAccess();
  const trackingCode = contactMatchesStoredAccess(context.contact, storedAccess)
    ? storedAccess.trackingCode
    : "";
  const response = await sendApiStrict("/api/tracked-shortlists", "POST", {
    name,
    creatorIds,
    projectName: context.projectName || "",
    contact: context.contact || "",
    trackingCode
  });

  rememberProjectAccess(context.contact, response.trackingCode);
  return {
    ...response.shortlist,
    trackingCode: response.trackingCode
  };
}

async function fetchAdminRequests() {
  const apiRequests = await sendApi("/api/requests");
  if (!Array.isArray(apiRequests)) {
    return [];
  }

  return apiRequests.map(normalizeCampaignRequest).filter(Boolean);
}

async function signInWithX() {
  return supabase.auth.signInWithOAuth({
    provider: "x",
    options: {
      scopes: "tweet.read users.read follows.read offline.access",
      redirectTo: getRedirectUrl("creator-onboarding.html")
    }
  });
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function getRateRange(index) {
  return rateRanges[Number(index)] || rateRanges[0];
}

function getRateRangeIndex(minRate, maxRate) {
  const normalizedMaxRate = maxRate === Infinity || maxRate === null ? Infinity : Number(maxRate);
  const index = rateRanges.findIndex(([rangeMin, rangeMax]) => {
    const normalizedRangeMax = rangeMax === Infinity ? Infinity : Number(rangeMax);
    return Number(minRate) === rangeMin && normalizedMaxRate === normalizedRangeMax;
  });

  return index >= 0 ? index : 0;
}

function formatRateRange(index) {
  const [minRate, maxRate] = getRateRange(index);
  if (maxRate === Infinity) {
    return `${money(minRate)}+ - Custom`;
  }

  return `${money(minRate)} - ${money(maxRate)}`;
}

function setRangeLabel(rangeInput, labelElement) {
  if (!rangeInput || !labelElement) {
    return;
  }

  labelElement.textContent = formatRateRange(rangeInput.value);
}

function toggleVideoOptions(skillSelect, optionsElement) {
  if (!skillSelect || !optionsElement) {
    return;
  }

  const usesVideo = skillSelect.value === "Video" || skillSelect.value === "Both";
  optionsElement.classList.toggle("is-hidden", !usesVideo);

  if (!usesVideo) {
    optionsElement
      .querySelectorAll("input[type='checkbox']")
      .forEach((input) => {
        input.checked = false;
      });
  }
}

function getCheckedValues(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
    .map((input) => input.value);
}

function creatorCanProvideSkill(creatorSkill, projectSkill) {
  if (!projectSkill) {
    return true;
  }

  if (projectSkill === "Both") {
    return creatorSkill === "Both";
  }

  return creatorSkill === projectSkill || creatorSkill === "Both";
}

function matchesVideoStyles(creator, projectVideoStyles) {
  if (!projectVideoStyles.length) {
    return true;
  }

  const creatorVideoStyles = creator.videoStyles || [];
  return projectVideoStyles.some((style) => creatorVideoStyles.includes(style));
}

function formatStoredRate(minRate, maxRate) {
  if (maxRate === Infinity || maxRate === null) {
    return `${money(minRate)}+ - Custom`;
  }

  return `${money(minRate)} - ${money(maxRate)}`;
}

function calculateSelectedBudgetRange(selectedCreators) {
  return selectedCreators.reduce((total, creator) => {
    const minRate = Number(creator.minRate || 0);
    const rawMaxRate = creator.maxRate === null ? Infinity : creator.maxRate;
    const maxRate = rawMaxRate === Infinity ? Infinity : Number(rawMaxRate || 0);

    return {
      min: total.min + minRate,
      max: total.max === Infinity || maxRate === Infinity ? Infinity : total.max + maxRate
    };
  }, { min: 0, max: 0 });
}

function formatSelectedBudgetEstimate(selectedCreators) {
  if (!selectedCreators.length) {
    return "$0";
  }

  const { min, max } = calculateSelectedBudgetRange(selectedCreators);
  if (max === Infinity) {
    return `${money(min)}+`;
  }

  if (min === max) {
    return money(min);
  }

  return `${money(min)} - ${money(max)}`;
}

function isCreatorInSelectedPriceRange(creator, minBudget, maxBudget) {
  const creatorMaxRate = creator.maxRate === null ? Infinity : creator.maxRate;

  if (maxBudget === Infinity || maxBudget === null) {
    return creator.minRate >= minBudget;
  }

  return creator.minRate >= minBudget && creatorMaxRate <= maxBudget;
}

function regionMatches(creatorRegion, projectRegion) {
  if (!projectRegion || projectRegion === "Global") {
    return true;
  }

  return creatorRegion === "Global" || creatorRegion === projectRegion;
}

function formatFileSize(bytes) {
  if (!bytes) {
    return "";
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderDraftFileLink(draftFile) {
  if (!draftFile) {
    return "";
  }

  const fileName = draftFile.name || "Campaign draft";
  const fileSize = draftFile.size ? ` (${formatFileSize(draftFile.size)})` : "";
  const label = `${fileName}${fileSize}`;

  if (draftFile.url) {
    return `<a href="${escapeHtml(draftFile.url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
  }

  return escapeHtml(label);
}

function getCreatorFollowers(creator) {
  return Number(creator.xProfile?.followers || creator.x_followers || 0);
}

function calculateCreatorMatchScore(creator, context = {}) {
  let score = Number(creator.sorsaScore || 0);

  if (context.category && context.category !== "All" && creator.categories.includes(context.category)) {
    score += 18;
  }

  if (regionMatches(creator.region || "Global", context.region || "Global")) {
    score += 12;
  }

  if (creatorCanProvideSkill(creator.skillType || "Writing", context.skillType || "")) {
    score += 10;
  }

  if (creator.availability === "Available now") {
    score += 8;
  }

  if (getCreatorFollowers(creator) > 50000) {
    score += 8;
  }

  return score;
}

function getCreatorBadges(creator, matchScore) {
  const badges = [];

  if (matchScore >= 105) {
    badges.push("Best Match");
  }

  if (Number(creator.sorsaScore || 0) >= 85) {
    badges.push("High Trust");
  }

  if (creator.availability === "Available now") {
    badges.push("Fast Reply");
  }

  if (creator.maxRate >= 1500 || creator.maxRate === Infinity) {
    badges.push("Premium Reach");
  }

  return badges.slice(0, 3);
}

function parseXHandle(profileUrl) {
  const trimmedUrl = profileUrl.trim();
  if (!trimmedUrl) {
    return "";
  }

  const directHandle = trimmedUrl.match(/^@?([A-Za-z0-9_]{1,15})$/);
  if (directHandle) {
    return directHandle[1];
  }

  try {
    const url = new URL(trimmedUrl);
    const host = url.hostname.replace(/^www\./, "");
    const isXHost = host === "x.com" || host === "twitter.com";
    const handle = url.pathname.split("/").filter(Boolean)[0];

    if (isXHost && handle && !["home", "i", "intent", "share"].includes(handle)) {
      return handle.replace("@", "");
    }
  } catch {
    return "";
  }

  return "";
}

async function requestXProfileEnrichment(handle, options = {}) {
  const params = new URLSearchParams({ handle });
  if (options.forceRefresh) {
    params.set("refresh", "1");
  }

  const response = await fetch(getApiUrl(`/api/x-profile?${params.toString()}`));
  if (!response.ok) {
    const contentType = response.headers.get("content-type") || "";
    const errorPayload = contentType.includes("application/json")
      ? await response.json()
      : await response.text();
    throw new Error(errorPayload?.error || errorPayload || "X enrichment endpoint is not available yet.");
  }

  return response.json();
}

function renderCreatorXIntel(profile, options = {}) {
  if (!profile?.url && !profile?.handle && !profile?.followers && !profile?.following && !profile?.tweetCount && !profile?.location && !profile?.avatarUrl && !profile?.bio && !profile?.pinnedTweet && !profile?.notableFollowers) {
    if (!options.showRefreshButton) {
      return "";
    }

    return `
      <div class="x-intel-card">
        <div class="x-intel-heading">
          <div>
            <strong>${escapeHtml(options.name || "X profile")}</strong>
            <span>X data has not been collected yet.</span>
          </div>
          <button class="button subtle" id="refreshXData" type="button" data-refresh-x-data>Refresh X data</button>
        </div>
        <p>Use refresh to pull the latest creator profile from TwitterAPI.io.</p>
      </div>
    `;
  }

  const displayName = options.name || profile.name || "X profile";
  const handle = normalizeHandleForDisplay(profile.handle);
  const profileUrl = getCreatorXProfileUrl(profile);
  const lastSynced = profile.collectedAt ? formatDateTime(profile.collectedAt) : "Not synced yet";
  const avatarSize = options.avatarSize || 54;
  return `
    <div class="x-intel-card">
      <div class="x-intel-heading">
        <div style="display:flex;align-items:center;gap:0.75rem;min-width:0;">
          ${renderXAvatar(profile, displayName, avatarSize)}
          <div>
            <strong>${escapeHtml(displayName)} ${profile.verified ? "&#10003;" : ""}</strong>
            ${profileUrl
              ? `<a class="x-handle-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(handle || "X profile")}</a>`
              : `<span>${escapeHtml(handle || "X profile")}</span>`}
          </div>
        </div>
        ${options.showRefreshButton ? '<button class="button subtle" id="refreshXData" type="button" data-refresh-x-data>Refresh X data</button>' : `<span>${escapeHtml(options.label || "Data collected directly from X")}</span>`}
      </div>
      <div class="x-intel-grid">
        <span><strong>${formatCount(profile.followers)}</strong> Followers</span>
        <span><strong>${formatCount(profile.following)}</strong> Following</span>
        <span><strong>${formatCount(profile.tweetCount)}</strong> Tweets</span>
        <span><strong>${escapeHtml(profile.location || "Not added")}</strong> Location</span>
        <span><strong>${profile.verified ? "Verified" : "Not verified"}</strong> X status</span>
        <span><strong>${escapeHtml(lastSynced)}</strong> Last synced</span>
      </div>
      ${profile.bio ? `<p>${escapeHtml(profile.bio)}</p>` : ""}
      ${profile.notableFollowers ? `<p><strong>Notable followers:</strong> ${escapeHtml(profile.notableFollowers)}</p>` : ""}
      ${profile.pinnedTweet ? `<p><strong>Pinned:</strong> ${escapeHtml(profile.pinnedTweet)}</p>` : ""}
    </div>
  `;
}

function renderCreatorProfileCard(creator) {
  const matchScore = calculateCreatorMatchScore(creator, {
    category: creator.categories[0],
    region: creator.region,
    skillType: creator.skillType
  });
  const badges = getCreatorBadges(creator, matchScore);
  const xProfileUrl = getCreatorXProfileUrl(creator);
  const displayHandle = normalizeHandleForDisplay(creator.xProfile?.handle || creator.handle);

  return `
    <article class="profile-card">
      <div>
        <p class="eyebrow">Creator profile</p>
        <h2>${escapeHtml(creator.name)}</h2>
        <p class="creator-handle">
          ${xProfileUrl
            ? `<a href="${escapeHtml(xProfileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(displayHandle || creator.handle)}</a>`
            : escapeHtml(displayHandle || creator.handle)}
        </p>
      </div>
      <div class="profile-stats">
        <span><strong>${escapeHtml(creator.sorsaScore)}</strong>Sorsa score</span>
        <span><strong>${getCreatorFollowers(creator).toLocaleString()}</strong>X followers</span>
        <span><strong>${formatStoredRate(creator.minRate, creator.maxRate)}</strong>Rate per post</span>
        <span><strong>${escapeHtml(creator.region || "Global")}</strong>Region</span>
        <span><strong>${escapeHtml(creator.availability || "Available this week")}</strong>Availability</span>
      </div>
      ${renderCreatorXIntel(creator.xProfile, { name: creator.name, avatarSize: 84 })}
      <div class="badge-row">
        ${creator.verifiedCampaign ? "<span>Verified campaign</span>" : ""}
        ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
      </div>
      <div class="creator-tags">
        ${creator.categories.map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join("")}
        <span class="tag">${escapeHtml(creator.skillType || "Writing")}</span>
        ${(creator.videoStyles || []).map((style) => `<span class="tag">${escapeHtml(style)}</span>`).join("")}
      </div>
      <p>${escapeHtml(creator.bio || "No creator notes added yet.")}</p>
      ${creator.example ? `<p><strong>Campaign example:</strong> ${escapeHtml(creator.example)}</p>` : ""}
      <div class="hero-actions">
        <button class="button primary" type="button" data-select-profile-creator="${escapeHtml(creator.id)}">Select this creator</button>
        <button class="button ghost" type="button" data-profile-portfolio-jump>View portfolio</button>
      </div>
      <section class="creator-profile-portfolio" id="creatorProfilePortfolio">
        <div class="section-heading">
          <p class="eyebrow">Creator-uploaded proof</p>
          <h2>Highlighted posts.</h2>
        </div>
        ${renderCreatorPortfolioHighlights(creator, { limit: 3 })}
      </section>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) {
    return;
  }

  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function renderStats() {
  const creatorCount = document.querySelector("#creatorCount");
  const requestCount = document.querySelector("#requestCount");

  if (creatorCount) {
    creatorCount.textContent = creators.length;
  }

  if (requestCount) {
    requestCount.textContent = requests.length;
  }
}

function initMobileNav() {
  const menuToggle = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (!menuToggle || !navLinks) {
    return;
  }

  if (!document.querySelector(".header-cta")) {
    menuToggle.insertAdjacentHTML("beforebegin", '<a class="header-cta" href="projects.html">Find creators</a>');
  }

  menuToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("open");
    menuToggle.classList.toggle("is-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
  });
}

async function initAuthAwareNav() {
  const navLinks = document.querySelector(".site-header .nav-links");
  if (!navLinks) {
    return;
  }

  currentSession = currentSession || await getActiveSession();
  currentUserRole = currentSession?.user ? await getUserRole(currentSession.user.id) : "";

  navLinks.querySelectorAll("[data-auth-link]").forEach((link) => link.remove());

  if (!currentSession?.user) {
    navLinks.insertAdjacentHTML("beforeend", `
      <a data-auth-link href="login.html">Log in</a>
      <a data-auth-link href="signup.html">Sign up</a>
    `);
    return;
  }

  const dashboardUrl = currentUserRole === "creator"
    ? "creator-dashboard.html"
    : currentUserRole === "brand"
      ? "project-dashboard.html"
      : "signup.html";

  navLinks.insertAdjacentHTML("beforeend", `
    <a data-auth-link href="${dashboardUrl}">Dashboard</a>
    <a data-auth-link href="#" data-logout>Log out</a>
  `);

  navLinks.querySelector("[data-logout]")?.addEventListener("click", async (event) => {
    event.preventDefault();
    await supabase.auth.signOut();
    currentSession = null;
    currentUserRole = "";
    window.location.href = "index.html";
  });
}

function initHomePage() {
  const slides = [...document.querySelectorAll(".slide-card")];
  const dotsContainer = document.querySelector("#slideDots");
  const creatorPop = document.querySelector("#creatorPop");
  const ecosystemRail = document.querySelector(".ecosystem-rail div");

  if (!slides.length) {
    return;
  }

  if (ecosystemRail && ecosystemRail.children.length < 18) {
    ecosystemRail.innerHTML += ecosystemRail.innerHTML;
  }

  if (slides.length) {
    let activeSlide = 0;

    function renderDots() {
      if (!dotsContainer) {
        return;
      }

      dotsContainer.innerHTML = slides.map((_, index) => `
        <button class="${index === activeSlide ? "active" : ""}" type="button" aria-label="Show slide ${index + 1}" data-slide="${index}"></button>
      `).join("");
    }

    function showSlide(index) {
      activeSlide = (index + slides.length) % slides.length;
      slides.forEach((slide, slideIndex) => {
        slide.classList.toggle("active", slideIndex === activeSlide);
      });
      renderDots();
    }

    renderDots();
    const slideTimer = window.setInterval(() => {
      showSlide(activeSlide + 1);
    }, 5200);

    dotsContainer?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-slide]");
      if (!button) {
        return;
      }

      window.clearInterval(slideTimer);
      showSlide(Number(button.dataset.slide));
    });
  }

  if (!creatorPop || !creators.length) {
    return;
  }

  let creatorIndex = 0;

  function showCreatorPop() {
    const creator = creators[creatorIndex % creators.length];
    creatorIndex += 1;
    creatorPop.innerHTML = `
      <span>Creator available</span>
      <strong>${escapeHtml(creator.name)}</strong>
      <small>${escapeHtml(creator.region || "Global")} | ${creator.categories.map(escapeHtml).join(", ")} | ${formatStoredRate(creator.minRate, creator.maxRate)}</small>
    `;
    creatorPop.classList.remove("is-hidden");
    creatorPop.classList.add("show");

    window.setTimeout(() => {
      creatorPop.classList.remove("show");
    }, 4200);
  }

  window.setTimeout(showCreatorPop, 1800);
  window.setInterval(showCreatorPop, 7600);
}

function initChameleonTheme() {
  const themedSections = [...document.querySelectorAll("[data-chameleon]")];

  if (!themedSections.length) {
    document.body.removeAttribute("data-chameleon");
    return;
  }

  let ticking = false;

  function applyTheme() {
    const marker = window.innerHeight * 0.48;
    let activeSection = themedSections[0];

    themedSections.forEach((section) => {
      const rect = section.getBoundingClientRect();
      if (rect.top <= marker && rect.bottom > 0) {
        activeSection = section;
      }
    });

    document.body.dataset.chameleon = activeSection.dataset.chameleon || "paper";
    ticking = false;
  }

  function requestThemeUpdate() {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(applyTheme);
  }

  applyTheme();
  window.addEventListener("scroll", requestThemeUpdate, { passive: true });
  window.addEventListener("resize", requestThemeUpdate);
}

function initScrollAnimations() {
  const revealTargets = new Set();
  const homePage = document.querySelector(".signal-hero");

  if (homePage) {
    const sectionEffects = [
      [".logo-section", "rail-sweep"],
      [".editorial-section", "long-drift"],
      [".signal-services", "straight-rush"],
      [".reach-section", "blackout-rise"],
      [".audit-section", "split-scan"],
      [".results-grid", "metric-slam"],
      [".testimonial-section", "slow-lift"],
      [".audience-grid", "straight-rush"],
      [".package-section", "poster-slam"],
      [".process-section", "clip-rise"],
      [".faq-section", "soft-rise"],
      [".final-cta", "final-charge"],
    ];

    sectionEffects.forEach(([selector, effect]) => {
      const section = document.querySelector(selector);
      if (!section) {
        return;
      }

      section.classList.add("reveal-ready");
      section.dataset.reveal = effect;
      revealTargets.add(section);
    });

    const cardGroups = [
      [".logo-cloud span", "card-flip", 60],
      [".signal-service:not([aria-hidden='true'])", "card-charge", 95],
      [".reach-matrix article", "card-rise", 85],
      [".metric-card", "card-slam", 120],
      [".testimonial-card", "card-swing", 90],
      [".audience-card", "card-charge", 150],
      [".package-grid article", "card-slam", 140],
      [".process-grid > div", "card-rise", 110],
      [".faq-list details", "card-rise", 75],
    ];

    cardGroups.forEach(([selector, effect, delayStep]) => {
      document.querySelectorAll(selector).forEach((card, index) => {
        card.classList.add("reveal-ready", "reveal-card");
        card.dataset.reveal = effect;
        card.style.setProperty("--reveal-delay", `${Math.min(index * delayStep, 620)}ms`);
        revealTargets.add(card);
      });
    });
  } else {
    document.querySelectorAll(".editorial-section").forEach((section) => revealTargets.add(section));
  }

  if (!revealTargets.size) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    revealTargets.forEach((target) => target.classList.add("is-in-view"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-in-view");
        observer.unobserve(entry.target);
      });
    },
    {
      rootMargin: "0px 0px -14% 0px",
      threshold: 0.18,
    },
  );

  revealTargets.forEach((target) => observer.observe(target));
}

async function initCreatorProfilePage() {
  const profileShell = document.querySelector("#creatorProfile");
  const profileTitle = document.querySelector("#profileTitle");
  const profileSubtitle = document.querySelector("#profileSubtitle");

  if (!profileShell) {
    return;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const handle = searchParams.get("handle");
  const legacyCreatorId = searchParams.get("id");
  const creator = handle
    ? await fetchCreatorByHandle(handle)
    : creators.find((item) => item.id === legacyCreatorId) || creators[0];

  if (!creator) {
    profileShell.innerHTML = '<div class="empty-state">No creator profiles are available yet.</div>';
    return;
  }

  profileTitle.textContent = creator.name;
  profileSubtitle.textContent = `${creator.handle} | ${creator.region || "Global"} | ${creator.categories.join(", ")}`;
  profileShell.innerHTML = renderCreatorProfileCard(creator);

  profileShell.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-select-profile-creator]");
    if (selectButton) {
      window.localStorage.setItem(PENDING_CREATOR_SELECTION_KEY, selectButton.dataset.selectProfileCreator);
      selectButton.textContent = "Selected";
      selectButton.classList.add("is-selected");
      showToast("Creator selected. They will be preloaded when you open the project shortlist.");
      return;
    }

    const portfolioButton = event.target.closest("[data-profile-portfolio-jump]");
    if (portfolioButton) {
      document.querySelector("#creatorProfilePortfolio")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

async function initCreatorDashboard() {
  if (getPageName() !== "creator-dashboard.html") {
    return;
  }

  const output = document.querySelector("#creatorDashboardOutput");
  if (!output) {
    return;
  }

  currentSession = currentSession || await getActiveSession();
  if (!currentSession?.user) {
    window.location.href = "login.html?role=creator";
    return;
  }

  let creator = creators.find((item) => item.id === currentSession.user.id);
  if (!creator && isSupabaseConfigured) {
    const { data } = await supabase
      .from("creators")
      .select("*")
      .eq("id", currentSession.user.id)
      .maybeSingle();
    creator = toAppCreator(data);
  }

  if (!creator) {
    window.location.href = "creator-onboarding.html";
    return;
  }

  async function renderCreatorDashboard(activeCreator) {
    const incomingRequests = await fetchCreatorCampaigns(activeCreator.id, { silent: true });
    output.innerHTML = `
      ${renderCreatorXIntel(activeCreator.xProfile, { name: activeCreator.name, showRefreshButton: true, avatarSize: 64 })}
      <section class="panel stacked-form">
        <div class="section-heading">
          <p class="eyebrow">Creator profile</p>
          <h2>${escapeHtml(activeCreator.name)}</h2>
          <p>${escapeHtml(activeCreator.handle)} | ${getCreatorFollowers(activeCreator).toLocaleString()} followers | Sorsa ${escapeHtml(activeCreator.sorsaScore)}${activeCreator.verifiedCampaign ? " | Verified campaign" : ""}</p>
          <button class="button subtle dashboard-mobile-refresh" type="button" data-refresh-x-data>Refresh X data</button>
        </div>
        <label>
          Availability
          <select id="dashboardAvailability">
            <option value="Available now">Available now</option>
            <option value="Available this week">Available this week</option>
            <option value="Booked">Booked</option>
            <option value="Premium only">Premium only</option>
          </select>
        </label>
        <label class="toggle-row">
          <span>
            <strong>Visible to projects</strong>
            <small>Let brands find this creator profile in project search.</small>
          </span>
          <input type="checkbox" id="dashboardVisibility">
        </label>
      </section>

      <form class="panel stacked-form dashboard-edit" id="creatorDashboardEdit">
        <div class="form-row">
          <label>
            Creator region
            <select id="dashboardRegion" required></select>
          </label>
          <label>
            Content skill
            <select id="dashboardSkill" required>
              <option value="Writing">Writing content only</option>
              <option value="Video">Video content only</option>
              <option value="Both">Both writing and video</option>
            </select>
          </label>
        </div>
        <label>
          Sorsa score
          <input type="number" id="dashboardSorsaScore" min="0" max="100" step="1" value="${escapeHtml(activeCreator.sorsaScore)}" required>
        </label>
        <label class="range-field">
          Pay range per post
          <input type="range" id="dashboardRateRange" min="0" max="${rateRanges.length - 1}" step="1" value="${getRateRangeIndex(activeCreator.minRate, activeCreator.maxRate)}">
          <span class="range-value" id="dashboardRateLabel">${formatStoredRate(activeCreator.minRate, activeCreator.maxRate)}</span>
        </label>
        <div class="form-row">
          <label>
            Primary contact
            <input type="text" id="dashboardContact" value="${escapeHtml(activeCreator.contact || "")}" required>
          </label>
          <label>
            Best campaign example
            <input type="text" id="dashboardExample" value="${escapeHtml(activeCreator.example || "")}">
          </label>
        </div>
        <fieldset class="video-options" id="dashboardVideoOptions">
          <legend>Video content type <span>Choose all you can provide</span></legend>
          <div class="category-options compact-options">
            ${["Motion Graphics", "Storytelling", "Talking Head"].map((style) => `
              <label class="category-pill">
                <input type="checkbox" name="dashboardVideoStyle" value="${escapeHtml(style)}" ${(activeCreator.videoStyles || []).includes(style) ? "checked" : ""}>
                ${escapeHtml(style)}
              </label>
            `).join("")}
          </div>
        </fieldset>
        <fieldset>
          <legend>Content categories <span>Choose maximum two</span></legend>
          <div class="category-options" id="dashboardCategoryOptions">
            ${categories.map((category) => `
              <label class="category-pill">
                <input type="checkbox" name="dashboardCategory" value="${escapeHtml(category)}" ${activeCreator.categories.includes(category) ? "checked" : ""}>
                ${escapeHtml(category)}
              </label>
            `).join("")}
          </div>
        </fieldset>
        <label>
          Creator notes
          <textarea id="dashboardBio" rows="4">${escapeHtml(activeCreator.bio || "")}</textarea>
        </label>
        <button class="button primary" type="submit">Save profile changes</button>
      </form>

      <section class="panel stacked-form">
        <div class="section-heading">
          <p class="eyebrow">Portfolio</p>
          <h2>Campaign proof.</h2>
        </div>
        <div id="portfolioList"></div>
        <form class="stacked-form" id="portfolioForm">
          <div class="form-row">
            <label>
              Campaign name
              <input type="text" id="portfolioCampaign" required>
            </label>
            <label>
              Platform
              <input type="text" id="portfolioPlatform" placeholder="X, YouTube, TikTok..." required>
            </label>
          </div>
          <div class="form-row">
            <label>
              Link
              <input type="url" id="portfolioLink" placeholder="https://..." required>
            </label>
            <label>
              Screenshot URL
              <input type="url" id="portfolioScreenshot" placeholder="https://...">
            </label>
          </div>
          <button class="button ghost" type="submit">Add portfolio item</button>
        </form>
      </section>

      <section class="panel stacked-form">
        <div class="section-heading">
          <p class="eyebrow">Incoming requests</p>
          <h2>Shortlisted campaigns.</h2>
        </div>
        <div id="incomingRequests"></div>
      </section>

      <button class="button subtle" id="creatorLogout" type="button">Log out</button>
    `;

    const availabilitySelect = document.querySelector("#dashboardAvailability");
    const visibilityInput = document.querySelector("#dashboardVisibility");
    const regionSelect = document.querySelector("#dashboardRegion");
    const skillSelect = document.querySelector("#dashboardSkill");
    const sorsaInput = document.querySelector("#dashboardSorsaScore");
    const videoOptions = document.querySelector("#dashboardVideoOptions");
    const rateRange = document.querySelector("#dashboardRateRange");
    const rateLabel = document.querySelector("#dashboardRateLabel");

    availabilitySelect.value = activeCreator.availability || "Available this week";
    visibilityInput.checked = Boolean(activeCreator.isPublicProfile);
    renderRegionSelect(regionSelect);
    regionSelect.value = activeCreator.region || "Global";
    skillSelect.value = activeCreator.skillType || "Writing";
    sorsaInput.value = normalizeSorsaScore(activeCreator.sorsaScore, 50);
    toggleVideoOptions(skillSelect, videoOptions);
    setRangeLabel(rateRange, rateLabel);
    renderPortfolio(activeCreator);
    renderIncomingRequests(incomingRequests);

    document.querySelectorAll("[data-refresh-x-data]").forEach((refreshXDataButton) => refreshXDataButton.addEventListener("click", async () => {
      try {
        refreshXDataButton.disabled = true;
        refreshXDataButton.textContent = "Refreshing...";
        activeCreator = await refreshCreatorXData(activeCreator);
        showToast("X profile data refreshed");
        await renderCreatorDashboard(activeCreator);
      } catch (error) {
        refreshXDataButton.disabled = false;
        refreshXDataButton.textContent = "Refresh X data";
        showToast(error.message || "X profile data could not be refreshed.");
      }
    }));

    availabilitySelect.addEventListener("change", async () => {
      activeCreator = await saveCreatorProfile({
        ...activeCreator,
        availability: availabilitySelect.value
      }, currentSession.user.id);
      showToast("Availability saved.");
    });

    visibilityInput.addEventListener("change", async () => {
      try {
        activeCreator = await saveCreatorProfile({
          ...activeCreator,
          isPublicProfile: visibilityInput.checked
        }, currentSession.user.id);
        showToast(visibilityInput.checked ? "Profile is visible to projects." : "Profile hidden from project search.");
      } catch (error) {
        visibilityInput.checked = !visibilityInput.checked;
        showToast(error.message || "Profile visibility could not be saved.");
      }
    });

    rateRange.addEventListener("input", () => setRangeLabel(rateRange, rateLabel));
    skillSelect.addEventListener("change", () => toggleVideoOptions(skillSelect, videoOptions));

    document.querySelector("#dashboardCategoryOptions").addEventListener("change", (event) => {
      if (!event.target.matches('input[name="dashboardCategory"]')) {
        return;
      }

      const checked = [...document.querySelectorAll('input[name="dashboardCategory"]:checked')];
      if (checked.length > 2) {
        event.target.checked = false;
        showToast("Creators can choose a maximum of two content categories.");
      }
    });

    document.querySelector("#creatorDashboardEdit").addEventListener("submit", async (event) => {
      event.preventDefault();
      const selectedCategories = [...document.querySelectorAll('input[name="dashboardCategory"]:checked')]
        .map((input) => input.value);
      const videoStyles = getCheckedValues("dashboardVideoStyle");
      const [minRate, maxRate] = getRateRange(rateRange.value);

      if (!selectedCategories.length) {
        showToast("Please choose at least one creator category.");
        return;
      }

      if ((skillSelect.value === "Video" || skillSelect.value === "Both") && !videoStyles.length) {
        showToast("Please choose at least one video content type.");
        return;
      }

      try {
        activeCreator = await saveCreatorProfile({
          ...activeCreator,
          minRate,
          maxRate,
          sorsaScore: normalizeSorsaScore(sorsaInput.value, activeCreator.sorsaScore),
          region: regionSelect.value,
          contact: document.querySelector("#dashboardContact").value.trim(),
          example: document.querySelector("#dashboardExample").value.trim(),
          categories: selectedCategories,
          skillType: skillSelect.value,
          videoStyles,
          bio: document.querySelector("#dashboardBio").value.trim()
        }, currentSession.user.id);
        showToast("Creator profile updated.");
        await renderCreatorDashboard(activeCreator);
      } catch (error) {
        showToast(error.message || "Profile could not be saved.");
      }
    });

    document.querySelector("#portfolioForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const portfolioItem = {
        id: `portfolio-${Date.now()}`,
        campaignName: document.querySelector("#portfolioCampaign").value.trim(),
        platform: document.querySelector("#portfolioPlatform").value.trim(),
        link: document.querySelector("#portfolioLink").value.trim(),
        screenshotUrl: document.querySelector("#portfolioScreenshot").value.trim()
      };

      try {
        activeCreator = await saveCreatorProfile({
          ...activeCreator,
          portfolio: [...(activeCreator.portfolio || []), portfolioItem]
        }, currentSession.user.id);
        showToast("Portfolio item added.");
        await renderCreatorDashboard(activeCreator);
      } catch (error) {
        showToast(error.message || "Portfolio item could not be saved.");
      }
    });

    document.querySelector("#portfolioList").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-delete-portfolio]");
      if (!button) {
        return;
      }

      try {
        activeCreator = await saveCreatorProfile({
          ...activeCreator,
          portfolio: (activeCreator.portfolio || []).filter((item) => item.id !== button.dataset.deletePortfolio)
        }, currentSession.user.id);
        showToast("Portfolio item deleted.");
        await renderCreatorDashboard(activeCreator);
      } catch (error) {
        showToast(error.message || "Portfolio item could not be deleted.");
      }
    });

    document.querySelector("#creatorLogout").addEventListener("click", async () => {
      await supabase.auth.signOut();
      window.location.href = "index.html";
    });
  }

  function renderPortfolio(activeCreator) {
    const portfolioList = document.querySelector("#portfolioList");
    const portfolio = activeCreator.portfolio || [];

    if (!portfolio.length) {
      portfolioList.innerHTML = '<div class="empty-state">No portfolio items added yet.</div>';
      return;
    }

    portfolioList.innerHTML = `
      <div class="dashboard-portfolio-grid">
        ${portfolio.map((item) => {
          const link = getSafeExternalUrl(item.link);
          const screenshotUrl = getSafeExternalUrl(item.screenshotUrl);
          return `
            <article class="admin-card portfolio-admin-card">
              ${screenshotUrl ? `<img class="portfolio-thumb" src="${escapeHtml(screenshotUrl)}" alt="${escapeHtml(item.campaignName || "Portfolio")} proof image">` : ""}
              <div>
                <span class="creator-kicker">${escapeHtml(item.platform || "Platform")}</span>
                <h3>${escapeHtml(item.campaignName || "Campaign")}</h3>
                <div class="admin-meta">
                  ${link ? `<a href="${escapeHtml(link)}" target="_blank" rel="noreferrer">Open tweet/post</a>` : ""}
                  ${screenshotUrl ? `<a href="${escapeHtml(screenshotUrl)}" target="_blank" rel="noreferrer">Open proof image</a>` : ""}
                </div>
              </div>
              <button class="button subtle" type="button" data-delete-portfolio="${escapeHtml(item.id)}">Delete</button>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderIncomingRequests(incomingRequests) {
    const incomingShell = document.querySelector("#incomingRequests");

    if (!incomingRequests.length) {
      incomingShell.innerHTML = '<div class="empty-state">No incoming shortlisted campaign requests yet.</div>';
      return;
    }

    incomingShell.innerHTML = incomingRequests.map((request) => `
      <article class="admin-card">
        <h3>${escapeHtml(request.projectName)}</h3>
        <div class="admin-meta">
          <span>${escapeHtml(request.category)}</span>
          <span>${request.budgetRange ? formatStoredRate(request.budgetRange[0], request.budgetRange[1]) : money(request.budget || 0)}</span>
          <span>${escapeHtml(request.urgency || "Flexible timeline")}</span>
          <span>Status: ${escapeHtml(request.status || "Received")}</span>
        </div>
      </article>
    `).join("");
  }

  await renderCreatorDashboard(creator);
}

async function initProjectDashboard() {
  if (getPageName() !== "project-dashboard.html") {
    return;
  }

  const output = document.querySelector("#projectDashboardOutput");
  if (!output) {
    return;
  }

  output.innerHTML = `
    <section class="panel stacked-form tracking-access-panel">
      <div class="section-heading">
        <p class="eyebrow">Tracking access</p>
        <h2>Use your contact and tracking code.</h2>
        <p>Your tracking code works like a project password. Use the same email, Telegram, or contact you submitted with.</p>
      </div>
      <form class="stacked-form" id="projectAccessForm">
        <label>
          Email or contact
          <input type="text" id="projectAccessContact" placeholder="team@example.com or @telegram" required>
        </label>
        <label>
          Tracking code
          <input type="text" id="projectAccessCode" placeholder="CD-AB12-CD34" required>
        </label>
        <button class="button primary" type="submit">Open project dashboard</button>
      </form>
    </section>
    <section class="panel stacked-form">
      <div class="section-heading">
        <p class="eyebrow">Project records</p>
        <h2>Requests and saved shortlists.</h2>
      </div>
      <div id="projectAccessResults">
        <div class="empty-state">Enter your contact and tracking code to view project records.</div>
      </div>
    </section>
  `;

  const accessForm = document.querySelector("#projectAccessForm");
  const accessContact = document.querySelector("#projectAccessContact");
  const accessCode = document.querySelector("#projectAccessCode");
  const resultsShell = document.querySelector("#projectAccessResults");

  function renderProjectAccessRecords(payload) {
    const campaigns = (payload?.campaigns || []).map(normalizeCampaignRequest).filter(Boolean);
    const shortlists = payload?.shortlists || [];

    if (!campaigns.length && !shortlists.length) {
      resultsShell.innerHTML = '<div class="empty-state">No requests or shortlists were found for that tracking code yet.</div>';
      return;
    }

    resultsShell.innerHTML = `
      <div class="tracking-code-panel">
        <span>Tracking code</span>
        <strong>${escapeHtml(normalizeTrackingCode(payload.trackingCode))}</strong>
        <p>Keep this code. It unlocks records for ${escapeHtml(payload.contact || "this project")}.</p>
      </div>
      <div class="stacked-form">
        <div class="section-heading">
          <p class="eyebrow">Submitted campaigns</p>
          <h2>${campaigns.length ? `${campaigns.length} request${campaigns.length === 1 ? "" : "s"}` : "No submitted campaigns"}</h2>
        </div>
        ${campaigns.length ? campaigns.map((request) => `
          <article class="admin-card">
            <h3>${escapeHtml(request.projectName)}</h3>
            <div class="admin-meta">
              <span>Status: ${escapeHtml(request.status || "Received")}</span>
              <span>${escapeHtml(request.category || "All")}</span>
              <span>${escapeHtml(request.region || "Global")}</span>
              <span>${request.budgetRange ? formatStoredRate(request.budgetRange[0], request.budgetRange[1]) : money(request.budget || 0)}</span>
              <span>${escapeHtml(request.urgency || "Flexible timeline")}</span>
              <span>${escapeHtml(request.createdAt)}</span>
            </div>
            <p>${escapeHtml(request.notes || "No campaign notes provided.")}</p>
            <ul class="selected-list">
              ${(request.creators || []).map((creator) => `<li><strong>${escapeHtml(creator.name)}</strong><span class="selected-meta">${formatStoredRate(creator.minRate, creator.maxRate)} | Sorsa ${escapeHtml(creator.sorsaScore)}</span></li>`).join("")}
            </ul>
          </article>
        `).join("") : '<div class="empty-state">No submitted campaigns yet.</div>'}
      </div>
      <div class="stacked-form">
        <div class="section-heading">
          <p class="eyebrow">Saved shortlists</p>
          <h2>${shortlists.length ? `${shortlists.length} saved set${shortlists.length === 1 ? "" : "s"}` : "No saved shortlists"}</h2>
        </div>
        ${shortlists.length ? shortlists.map((shortlist) => `
          <article class="admin-card">
            <h3>${escapeHtml(shortlist.name)}</h3>
            <div class="admin-meta">
              <span>${(shortlist.creator_ids || []).length} creators</span>
              <span>${formatDateTime(shortlist.created_at)}</span>
            </div>
            <a class="button ghost" href="projects.html?shortlist=${encodeURIComponent(shortlist.id)}">Reload in filter</a>
          </article>
        `).join("") : '<div class="empty-state">No saved shortlists yet. Save one from the project filter page.</div>'}
      </div>
    `;
  }

  async function lookupProjectAccess(contact, trackingCode) {
    resultsShell.innerHTML = '<div class="empty-state">Checking tracking code...</div>';
    try {
      const payload = await sendApiStrict("/api/project-access", "POST", {
        contact,
        trackingCode: normalizeTrackingCode(trackingCode)
      });

      if (!payload?.trackingCode) {
        resultsShell.innerHTML = '<div class="empty-state">No project records matched that contact and tracking code.</div>';
        return;
      }

      rememberProjectAccess(contact, payload.trackingCode);
      renderProjectAccessRecords(payload);
    } catch (error) {
      resultsShell.innerHTML = `<div class="empty-state">${escapeHtml(error.message || "Project records could not be loaded.")}</div>`;
    }
  }

  const storedAccess = getStoredProjectAccess();
  if (storedAccess) {
    accessContact.value = storedAccess.contact;
    accessCode.value = storedAccess.trackingCode;
    lookupProjectAccess(storedAccess.contact, storedAccess.trackingCode);
  }

  accessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    lookupProjectAccess(accessContact.value.trim(), accessCode.value.trim());
  });
}

function syncRateSliderMax() {
  document.querySelectorAll("#creatorRateRange, #budgetFilter").forEach((rangeInput) => {
    rangeInput.max = String(rateRanges.length - 1);
  });
}

function renderCategorySelect(selectElement) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = '<option value="All">All categories</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    selectElement.appendChild(option);
  });
}

function renderCategoryCheckboxes(container) {
  if (!container) {
    return;
  }

  container.innerHTML = categories.map((category) => `
    <label class="category-pill">
      <input type="checkbox" name="creatorCategory" value="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </label>
  `).join("");
}

function renderRegionSelect(selectElement, includeAllOption = false) {
  if (!selectElement) {
    return;
  }

  const leadingOption = includeAllOption
    ? '<option value="Global">Global / all regions</option>'
    : '<option value="">Select region</option>';

  selectElement.innerHTML = leadingOption;
  regions
    .filter((region) => includeAllOption ? region !== "Global" : true)
    .forEach((region) => {
      const option = document.createElement("option");
      option.value = region;
      option.textContent = region;
      selectElement.appendChild(option);
    });
}

async function initProjectsPage() {
  const categoryFilter = document.querySelector("#categoryFilter");
  const projectRegion = document.querySelector("#projectRegion");
  const budgetFilter = document.querySelector("#budgetFilter");
  const budgetLabel = document.querySelector("#budgetLabel");
  const budgetMinInput = document.querySelector("#budgetMin");
  const budgetMaxInput = document.querySelector("#budgetMax");
  const creatorList = document.querySelector("#creatorList");
  const resultTitle = document.querySelector("#resultTitle");
  const selectedSummary = document.querySelector("#selectedSummary");
  const selectedBudgetEstimate = document.querySelector("#selectedBudgetEstimate");
  const comparisonPanel = document.querySelector("#comparisonPanel");
  const sortCreators = document.querySelector("#sortCreators");
  const minSorsaFilter = document.querySelector("#minSorsaFilter");
  const availabilityFilter = document.querySelector("#availabilityFilter");
  const creatorSearch = document.querySelector("#creatorSearch");
  const submitRequestButton = document.querySelector("#submitRequest");
  const clearSelectionButton = document.querySelector("#clearSelection");
  const finderPanel = document.querySelector("#campaignBriefPanel");
  const creatorResults = document.querySelector("#creatorResults");
  const shortlistBox = document.querySelector("#shortlistBox");
  const projectBriefToggle = document.querySelector("#projectBriefToggle");
  const mobileBriefButton = document.querySelector("#mobileBriefButton");
  const mobileShortlistButton = document.querySelector("#mobileShortlistButton");
  const mobileSubmitButton = document.querySelector("#mobileSubmitButton");
  const mobileSelectedCount = document.querySelector("#mobileSelectedCount");
  const trackingCodePanel = document.querySelector("#trackingCodePanel");
  const shortlistName = document.querySelector("#shortlistName");
  const saveShortlistButton = document.querySelector("#saveShortlist");
  const projectForm = document.querySelector("#projectForm");
  const projectName = document.querySelector("#projectName");
  const projectContact = document.querySelector("#projectContact");
  const projectNotes = document.querySelector("#projectNotes");
  const projectSkill = document.querySelector("#projectSkill");
  const projectUrgency = document.querySelector("#projectUrgency");
  const contentScope = document.querySelector("#contentScope");
  const projectDraftFile = document.querySelector("#projectDraftFile");
  const projectVideoOptions = document.querySelector("#projectVideoOptions");

  if (!projectForm || !creatorList) {
    return;
  }

  const mobileBriefQuery = window.matchMedia("(max-width: 819px)");

  function setBriefCollapsed(collapsed, shouldScroll = false) {
    if (!finderPanel || !projectBriefToggle) {
      return;
    }

    finderPanel.classList.toggle("is-brief-collapsed", collapsed);
    projectBriefToggle.setAttribute("aria-expanded", String(!collapsed));
    projectBriefToggle.querySelector("span").textContent = collapsed ? "Open" : "Close";

    if (mobileBriefButton) {
      mobileBriefButton.textContent = collapsed ? "Brief" : "Close";
    }

    if (shouldScroll) {
      finderPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function syncBriefLayout() {
    setBriefCollapsed(mobileBriefQuery.matches, false);
  }

  function showTrackingCodePanel(trackingCode, action = "Request submitted") {
    if (!trackingCodePanel || !trackingCode) {
      return;
    }

    trackingCodePanel.classList.remove("is-hidden");
    trackingCodePanel.innerHTML = `
      <span>${escapeHtml(action)}</span>
      <strong>${escapeHtml(normalizeTrackingCode(trackingCode))}</strong>
      <p>Use this code with your contact/email on the project dashboard to reopen saved shortlists and campaign requests.</p>
      <a class="button ghost" href="project-dashboard.html">Track request</a>
    `;
  }

  let creatorProfileModal = null;

  function renderProjectCreatorModal(creator) {
    const xProfile = creator.xProfile || {};
    const xProfileUrl = getCreatorXProfileUrl(creator);
    const displayHandle = normalizeHandleForDisplay(xProfile.handle || creator.handle);
    const avatarUrl = getHighQualityAvatarUrl(xProfile.avatarUrl || "");
    const matchScore = calculateCreatorMatchScore(creator, {
      category: categoryFilter.value,
      region: projectRegion.value,
      skillType: projectSkill.value
    });
    const selected = selectedCreatorIds.has(creator.id);
    const badges = getCreatorBadges(creator, matchScore);

    return `
      <div class="creator-profile-dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(creator.name)} creator profile">
        <button class="modal-close" type="button" data-close-creator-profile aria-label="Close creator profile">Close</button>
        <div class="creator-profile-modal-grid">
          <div class="creator-profile-modal-media">
            ${avatarUrl
              ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(creator.name)} profile picture">`
              : `<div class="creator-preview-fallback">${escapeHtml(getCreatorInitials(creator.name, creator.handle))}</div>`}
            <div class="creator-modal-score">
              <span>Sorsa</span>
              <strong>${escapeHtml(creator.sorsaScore)}</strong>
            </div>
          </div>
          <div class="creator-profile-modal-copy">
            <p class="eyebrow">Creator profile</p>
            <h2>${escapeHtml(creator.name)}</h2>
            <a class="creator-x-link" href="${escapeHtml(xProfileUrl || "#")}" ${xProfileUrl ? 'target="_blank" rel="noreferrer"' : ""}>${escapeHtml(displayHandle || creator.handle)}</a>
            <p>${escapeHtml(creator.bio || xProfile.bio || "No creator notes added yet.")}</p>
            <div class="profile-stats creator-modal-stats">
              <span><strong>${formatCount(getCreatorFollowers(creator))}</strong>X followers</span>
              <span><strong>${formatCount(xProfile.following)}</strong>Following</span>
              <span><strong>${formatCount(xProfile.tweetCount)}</strong>Tweets</span>
              <span><strong>${formatStoredRate(creator.minRate, creator.maxRate)}</strong>Rate per post</span>
              <span><strong>${escapeHtml(creator.region || "Global")}</strong>Region</span>
              <span><strong>${escapeHtml(creator.availability || "Available this week")}</strong>Availability</span>
            </div>
            <div class="badge-row">
              ${creator.verifiedCampaign ? "<span>Verified campaign</span>" : ""}
              ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
              <span>Match ${Math.min(Math.round(matchScore), 120)}</span>
            </div>
            <div class="creator-tags">
              ${creator.categories.map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join("")}
              <span class="tag">${escapeHtml(creator.skillType || "Writing")}</span>
              ${(creator.videoStyles || []).map((style) => `<span class="tag">${escapeHtml(style)}</span>`).join("")}
              ${xProfile.location ? `<span class="tag">${escapeHtml(xProfile.location)}</span>` : ""}
            </div>
            ${creator.example ? `<p><strong>Campaign example:</strong> ${escapeHtml(creator.example)}</p>` : ""}
            ${xProfile.notableFollowers ? `<p><strong>Notable followers:</strong> ${escapeHtml(xProfile.notableFollowers)}</p>` : ""}
            ${xProfile.pinnedTweet ? `<p><strong>Pinned:</strong> ${escapeHtml(xProfile.pinnedTweet)}</p>` : ""}
            <div class="hero-actions">
              <button class="button ${selected ? "primary is-selected" : "primary"}" type="button" data-modal-select-creator="${escapeHtml(creator.id)}">${selected ? "Selected" : "Select this creator"}</button>
              <button class="button ghost" type="button" data-modal-view-portfolio>View portfolio</button>
            </div>
          </div>
        </div>
        <section class="creator-modal-portfolio" data-modal-portfolio>
          <div class="section-heading">
            <p class="eyebrow">Creator-uploaded proof</p>
            <h2>Highlighted tweets and posts.</h2>
            <p>Recent proof uploaded from the creator dashboard.</p>
          </div>
          ${renderCreatorPortfolioHighlights(creator, { limit: 3 })}
        </section>
      </div>
    `;
  }

  function updateModalSelectionState(creatorId) {
    const button = Array.from(creatorProfileModal?.querySelectorAll("[data-modal-select-creator]") || [])
      .find((item) => item.dataset.modalSelectCreator === creatorId);
    if (!button) {
      return;
    }

    button.textContent = selectedCreatorIds.has(creatorId) ? "Selected" : "Select this creator";
    button.classList.toggle("is-selected", selectedCreatorIds.has(creatorId));
  }

  function closeCreatorProfileModal() {
    if (!creatorProfileModal) {
      return;
    }

    creatorProfileModal.classList.remove("is-open");
    creatorProfileModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  function ensureCreatorProfileModal() {
    if (creatorProfileModal) {
      return creatorProfileModal;
    }

    creatorProfileModal = document.createElement("div");
    creatorProfileModal.id = "creatorProfileModal";
    creatorProfileModal.className = "creator-profile-modal";
    creatorProfileModal.setAttribute("aria-hidden", "true");
    document.body.appendChild(creatorProfileModal);

    creatorProfileModal.addEventListener("click", (event) => {
      if (event.target === creatorProfileModal || event.target.closest("[data-close-creator-profile]")) {
        closeCreatorProfileModal();
        return;
      }

      const selectButton = event.target.closest("[data-modal-select-creator]");
      if (selectButton) {
        selectedCreatorIds.add(selectButton.dataset.modalSelectCreator);
        renderCreators();
        renderSelection();
        updateModalSelectionState(selectButton.dataset.modalSelectCreator);
        showToast("Creator added to the shortlist.");
        return;
      }

      if (event.target.closest("[data-modal-view-portfolio]")) {
        creatorProfileModal.querySelector("[data-modal-portfolio]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && creatorProfileModal?.classList.contains("is-open")) {
        closeCreatorProfileModal();
      }
    });

    return creatorProfileModal;
  }

  function openCreatorProfileModal(creatorId) {
    const creator = creators.find((item) => item.id === creatorId);
    if (!creator) {
      showToast("Creator profile could not be found.");
      return;
    }

    const modal = ensureCreatorProfileModal();
    modal.innerHTML = renderProjectCreatorModal(creator);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    modal.querySelector("[data-close-creator-profile]")?.focus();
  }

  function readBudgetNumber(input, fallback = 0) {
    const value = Number(input?.value);
    if (!Number.isFinite(value) || value < 0) {
      return fallback;
    }

    return Math.round(value);
  }

  function getProjectBudgetRange() {
    const [presetMin, presetMax] = getRateRange(budgetFilter.value);
    const minBudget = readBudgetNumber(budgetMinInput, presetMin);
    const rawMaxBudget = String(budgetMaxInput?.value || "").trim();
    let maxBudget = rawMaxBudget ? Number(rawMaxBudget) : presetMax;

    if (!Number.isFinite(maxBudget) || maxBudget < 0) {
      maxBudget = presetMax;
    }

    if (maxBudget !== Infinity && maxBudget < minBudget) {
      maxBudget = minBudget;
    }

    return [minBudget, maxBudget];
  }

  function updateBudgetLabel() {
    if (!budgetLabel) {
      return;
    }

    const [minBudget, maxBudget] = getProjectBudgetRange();
    budgetLabel.textContent = formatStoredRate(minBudget, maxBudget);
  }

  function applyBudgetPreset() {
    const [minBudget, maxBudget] = getRateRange(budgetFilter.value);

    if (budgetMinInput) {
      budgetMinInput.value = String(minBudget);
    }

    if (budgetMaxInput) {
      budgetMaxInput.value = maxBudget === Infinity ? "" : String(maxBudget);
      budgetMaxInput.placeholder = maxBudget === Infinity ? "No max" : "";
    }

    updateBudgetLabel();
  }

  function normalizeBudgetInputs() {
    if (!budgetMinInput || !budgetMaxInput) {
      updateBudgetLabel();
      return;
    }

    const minBudget = readBudgetNumber(budgetMinInput, 0);
    const rawMaxBudget = budgetMaxInput.value.trim();

    budgetMinInput.value = String(minBudget);

    if (rawMaxBudget) {
      const maxBudget = Math.max(readBudgetNumber(budgetMaxInput, minBudget), minBudget);
      budgetMaxInput.value = String(maxBudget);
    }

    updateBudgetLabel();
  }

  function creatorMatchesSearch(creator, searchValue) {
    const query = String(searchValue || "").trim().toLowerCase();
    const normalizedQuery = normalizeHandleForStore(query);

    if (!query && !normalizedQuery) {
      return true;
    }

    const xProfile = creator.xProfile || {};
    const searchableText = [
      creator.name,
      creator.handle,
      normalizeHandleForStore(creator.handle),
      xProfile.name,
      xProfile.handle,
      normalizeHandleForStore(xProfile.handle),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(query) || Boolean(normalizedQuery && searchableText.includes(normalizedQuery));
  }

  function getVisibleCreators() {
    const category = categoryFilter.value;
    const [minBudget, maxBudget] = getProjectBudgetRange();
    const projectVideoStyles = getCheckedValues("projectVideoStyle");
    const minSorsa = Number(minSorsaFilter.value || 0);
    const availability = availabilityFilter.value;
    const searchValue = creatorSearch?.value || "";
    const context = {
      category,
      region: projectRegion.value,
      skillType: projectSkill.value
    };

    const filteredCreators = creators.filter((creator) => {
      const hasCreatorSearch = String(searchValue || "").trim().length > 0;
      const matchesCategory = category === "All" || creator.categories.includes(category);
      const matchesBudget = hasCreatorSearch || isCreatorInSelectedPriceRange(creator, minBudget, maxBudget);
      const matchesRegion = regionMatches(creator.region || "Global", projectRegion.value);
      const matchesSkill = creatorCanProvideSkill(creator.skillType || "Writing", projectSkill.value);
      const matchesVideo = matchesVideoStyles(creator, projectVideoStyles);
      const matchesScore = hasCreatorSearch || Number(creator.sorsaScore || 0) >= minSorsa;
      const matchesAvailability = availability === "All" || creator.availability === availability;
      const matchesSearch = creatorMatchesSearch(creator, searchValue);
      return matchesCategory && matchesBudget && matchesRegion && matchesSkill && matchesVideo && matchesScore && matchesAvailability && matchesSearch;
    });

    return filteredCreators.sort((a, b) => {
      if (sortCreators.value === "score") {
        return Number(b.sorsaScore || 0) - Number(a.sorsaScore || 0);
      }

      if (sortCreators.value === "price-low") {
        return Number(a.minRate || 0) - Number(b.minRate || 0);
      }

      if (sortCreators.value === "followers") {
        return getCreatorFollowers(b) - getCreatorFollowers(a);
      }

      return calculateCreatorMatchScore(b, context) - calculateCreatorMatchScore(a, context);
    });
  }

  function renderComparison() {
    const selectedCreators = creators.filter((creator) => selectedCreatorIds.has(creator.id));

    if (!comparisonPanel || selectedCreators.length < 2) {
      comparisonPanel?.classList.add("is-hidden");
      return;
    }

    comparisonPanel.classList.remove("is-hidden");
    comparisonPanel.innerHTML = `
      <div>
        <strong>Compare shortlist</strong>
        <span>${selectedCreators.length} creators selected | ${formatSelectedBudgetEstimate(selectedCreators)} estimated total</span>
      </div>
      <div class="compare-grid">
        ${selectedCreators.map((creator) => `
          <article>
            <strong>${escapeHtml(creator.name)}</strong>
            <span>${escapeHtml(creator.region || "Global")}</span>
            <span>${formatStoredRate(creator.minRate, creator.maxRate)}</span>
            <span>Sorsa ${escapeHtml(creator.sorsaScore)}</span>
            <span>${escapeHtml(creator.availability || "Available this week")}</span>
          </article>
        `).join("")}
      </div>
    `;
  }

  function renderCreators() {
    const visibleCreators = getVisibleCreators();
    const category = categoryFilter.value;
    const [minBudget, maxBudget] = getProjectBudgetRange();
    const searchValue = creatorSearch?.value.trim();
    const titleParts = [
      category === "All" ? "All creator matches" : `${category} creator matches`,
      `within ${formatStoredRate(minBudget, maxBudget)}`,
      searchValue ? `matching "${searchValue}"` : ""
    ].filter(Boolean);

    resultTitle.textContent = titleParts.join(" ");

    if (!visibleCreators.length) {
      creatorList.innerHTML = `
        <div class="empty-state">
          No creators match this filter yet. Try a higher budget, choose another category, or ask creators to register first.
        </div>
      `;
      return;
    }

    creatorList.innerHTML = visibleCreators.map((creator) => {
      const selected = selectedCreatorIds.has(creator.id);
      const xProfile = creator.xProfile || {};
      const xBio = truncateText(xProfile.bio, 100);
      const previewImage = getHighQualityAvatarUrl(xProfile.avatarUrl || "");
      const xProfileUrl = getCreatorXProfileUrl(creator);
      const displayHandle = normalizeHandleForDisplay(xProfile.handle || creator.handle);
      const matchScore = calculateCreatorMatchScore(creator, {
        category,
        region: projectRegion.value,
        skillType: projectSkill.value
      });
      const badges = getCreatorBadges(creator, matchScore);
      return `
        <article class="creator-card signal-creator-row ${selected ? "selected" : ""}">
          <div class="creator-preview">
            ${previewImage
              ? `<img class="creator-preview-image" src="${escapeHtml(previewImage)}" alt="${escapeHtml(creator.name)} profile picture">`
              : `<div class="creator-preview-fallback">${escapeHtml(getCreatorInitials(creator.name, creator.handle))}</div>`}
          </div>
          <div class="creator-row-main">
            <div class="creator-header">
              <div class="creator-title-block">
                <span class="creator-kicker">${escapeHtml(creator.region || "Global")} / ${escapeHtml(creator.skillType || "Writing")}</span>
                <h3>${escapeHtml(creator.name)}</h3>
                <p class="creator-handle">
                  ${xProfileUrl
                    ? `<a href="${escapeHtml(xProfileUrl)}" target="_blank" rel="noreferrer">${escapeHtml(displayHandle || creator.handle)}</a>`
                    : escapeHtml(displayHandle || creator.handle)}
                  ${xProfile.verified ? "<span title=\"X verified\">&#10003;</span>" : ""}
                </p>
                ${xBio ? `<p class="creator-x-bio">${escapeHtml(xBio)}</p>` : ""}
                <p class="rate-line">${formatCount(xProfile.followers)} X followers / ${formatStoredRate(creator.minRate, creator.maxRate)} per post</p>
              </div>
              <span class="score-badge">${escapeHtml(creator.sorsaScore)}</span>
            </div>
            <div class="badge-row">
              ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
              <span>Match ${Math.min(Math.round(matchScore), 120)}</span>
            </div>
            <div class="creator-tags">
              ${creator.categories.map((category) => `<span class="tag">${escapeHtml(category)}</span>`).join("")}
              <span class="tag">${escapeHtml(creator.availability || "Available this week")}</span>
              ${(creator.videoStyles || []).map((style) => `<span class="tag">${escapeHtml(style)}</span>`).join("")}
              ${xProfile.location ? `<span class="tag">${escapeHtml(xProfile.location)}</span>` : ""}
            </div>
            ${creator.example ? `<p class="creator-example">Example: ${escapeHtml(creator.example)}</p>` : ""}
            <p class="creator-bio">${escapeHtml(creator.bio || "No creator notes added yet.")}</p>
            <div class="button-row creator-row-actions">
              <button class="button ${selected ? "primary" : "ghost"}" type="button" data-select-creator="${escapeHtml(creator.id)}">
                ${selected ? "Selected" : "Select creator"}
              </button>
              <button class="button subtle" type="button" data-open-creator-profile="${escapeHtml(creator.id)}">View profile</button>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderSelection() {
    const selectedCreators = creators.filter((creator) => selectedCreatorIds.has(creator.id));
    const budgetEstimate = formatSelectedBudgetEstimate(selectedCreators);
    submitRequestButton.disabled = selectedCreators.length === 0;

    selectedSummary.textContent = selectedCreators.length
      ? selectedCreators.map((creator) => creator.name).join(", ")
      : "No creators selected yet.";

    if (selectedBudgetEstimate) {
      selectedBudgetEstimate.textContent = budgetEstimate;
    }

    if (mobileSelectedCount) {
      mobileSelectedCount.textContent = selectedCreators.length === 1
        ? `1 selected | ${budgetEstimate}`
        : `${selectedCreators.length} selected | ${budgetEstimate}`;
    }

    if (mobileSubmitButton) {
      mobileSubmitButton.disabled = selectedCreators.length === 0;
    }

    renderComparison();
  }

  function toggleCreatorSelection(creatorId) {
    if (selectedCreatorIds.has(creatorId)) {
      selectedCreatorIds.delete(creatorId);
    } else {
      selectedCreatorIds.add(creatorId);
    }

    renderCreators();
    renderSelection();
  }

  async function submitRequest() {
    if (!projectForm.reportValidity()) {
      return;
    }

    const selectedCreators = creators.filter((creator) => selectedCreatorIds.has(creator.id));
    if (!selectedCreators.length) {
      showToast("Select at least one creator before submitting.");
      return;
    }

    const [minBudget, maxBudget] = getProjectBudgetRange();
    const draftFile = projectDraftFile.files[0];
    const uploadedDraftFile = draftFile ? await uploadCampaignDraftFile(draftFile) : null;
    const request = {
      id: `request-${Date.now()}`,
      projectName: projectName.value.trim(),
      contact: projectContact.value.trim(),
      category: categoryFilter.value,
      region: projectRegion.value,
      budget: maxBudget,
      budgetRange: [minBudget, maxBudget],
      skillType: projectSkill.value,
      urgency: projectUrgency.value,
      videoStyles: getCheckedValues("projectVideoStyle"),
      notes: projectNotes.value.trim(),
      contentScope: contentScope.value.trim(),
      draftFile: uploadedDraftFile,
      creators: selectedCreators,
      status: "Received",
      createdAt: new Date().toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short"
      })
    };

    try {
      const savedRequest = await createCampaignRequest(request, selectedCreators);
      selectedCreatorIds = new Set();
      projectForm.reset();
      renderCategorySelect(categoryFilter);
      renderRegionSelect(projectRegion, true);
      applyBudgetPreset();
      if (creatorSearch) {
        creatorSearch.value = "";
      }
      toggleVideoOptions(projectSkill, projectVideoOptions);
      renderCreators();
      renderSelection();
      showTrackingCodePanel(savedRequest.trackingCode, "Request submitted");
      showToast(`Request submitted. Tracking code: ${normalizeTrackingCode(savedRequest.trackingCode)}`);
    } catch (error) {
      showToast(error.message || "Request could not be submitted.");
    }
  }

  async function loadShortlistFromUrl() {
    const shortlistId = new URLSearchParams(window.location.search).get("shortlist");
    if (!shortlistId) {
      return;
    }

    const shortlist = await fetchShortlist(shortlistId);
    if (!shortlist?.creator_ids?.length) {
      return;
    }

    selectedCreatorIds = new Set(shortlist.creator_ids);
    showToast(`Loaded shortlist: ${shortlist.name}`);
  }

  function loadPendingCreatorSelection() {
    const pendingCreatorId = window.localStorage.getItem(PENDING_CREATOR_SELECTION_KEY);
    if (!pendingCreatorId) {
      return;
    }

    const pendingCreator = creators.find((creator) => creator.id === pendingCreatorId);
    window.localStorage.removeItem(PENDING_CREATOR_SELECTION_KEY);

    if (!pendingCreator) {
      return;
    }

    selectedCreatorIds.add(pendingCreator.id);
    showToast(`${pendingCreator.name} added to the shortlist.`);
  }

  renderCategorySelect(categoryFilter);
  renderRegionSelect(projectRegion, true);
  applyBudgetPreset();
  toggleVideoOptions(projectSkill, projectVideoOptions);
  syncBriefLayout();
  await loadShortlistFromUrl();
  loadPendingCreatorSelection();
  renderCreators();
  renderSelection();

  if (mobileBriefQuery.addEventListener) {
    mobileBriefQuery.addEventListener("change", syncBriefLayout);
  } else if (mobileBriefQuery.addListener) {
    mobileBriefQuery.addListener(syncBriefLayout);
  }

  categoryFilter.addEventListener("change", renderCreators);
  projectRegion.addEventListener("change", renderCreators);
  sortCreators.addEventListener("change", renderCreators);
  minSorsaFilter.addEventListener("input", renderCreators);
  availabilityFilter.addEventListener("change", renderCreators);
  budgetFilter.addEventListener("input", () => {
    applyBudgetPreset();
    renderCreators();
  });
  [budgetMinInput, budgetMaxInput].forEach((input) => {
    input?.addEventListener("input", () => {
      updateBudgetLabel();
      renderCreators();
    });
    input?.addEventListener("blur", () => {
      normalizeBudgetInputs();
      renderCreators();
    });
  });
  creatorSearch?.addEventListener("input", renderCreators);
  projectBriefToggle?.addEventListener("click", () => {
    setBriefCollapsed(!finderPanel?.classList.contains("is-brief-collapsed"), true);
  });
  mobileBriefButton?.addEventListener("click", () => {
    setBriefCollapsed(!finderPanel?.classList.contains("is-brief-collapsed"), true);
  });
  mobileShortlistButton?.addEventListener("click", () => {
    setBriefCollapsed(false, false);
    window.requestAnimationFrame(() => {
      (shortlistBox || finderPanel)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
  mobileSubmitButton?.addEventListener("click", () => {
    setBriefCollapsed(false, false);
    window.requestAnimationFrame(() => {
      if (!projectForm.reportValidity()) {
        projectForm.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }

      submitRequestButton.click();
    });
  });
  projectSkill.addEventListener("change", () => {
    toggleVideoOptions(projectSkill, projectVideoOptions);
    renderCreators();
  });
  projectVideoOptions.addEventListener("change", renderCreators);
  creatorList.addEventListener("click", (event) => {
    const profileButton = event.target.closest("[data-open-creator-profile]");
    if (profileButton) {
      openCreatorProfileModal(profileButton.dataset.openCreatorProfile);
      return;
    }

    const button = event.target.closest("[data-select-creator]");
    if (button) {
      toggleCreatorSelection(button.dataset.selectCreator);
    }
  });
  submitRequestButton.addEventListener("click", submitRequest);
  clearSelectionButton.addEventListener("click", () => {
    selectedCreatorIds = new Set();
    renderCreators();
    renderSelection();
    showToast("Shortlist cleared.");
  });

  saveShortlistButton?.addEventListener("click", async () => {
    const selectedCreators = creators.filter((creator) => selectedCreatorIds.has(creator.id));
    const name = shortlistName?.value.trim();

    if (!selectedCreators.length) {
      showToast("Select at least one creator before saving a shortlist.");
      return;
    }

    if (!name) {
      showToast("Name this shortlist before saving.");
      return;
    }

    try {
      if (!projectContact.value.trim()) {
        showToast("Add your contact email or Telegram before saving a shortlist.");
        projectContact.focus();
        return;
      }

      const savedShortlist = await saveCurrentShortlist(name, selectedCreators.map((creator) => creator.id), {
        contact: projectContact.value.trim(),
        projectName: projectName.value.trim()
      });
      shortlistName.value = "";
      showTrackingCodePanel(savedShortlist.trackingCode, "Shortlist saved");
      showToast(`Shortlist saved. Tracking code: ${normalizeTrackingCode(savedShortlist.trackingCode)}`);
    } catch (error) {
      showToast(error.message || "Shortlist could not be saved.");
    }
  });
}

function initSignupPage() {
  if (getPageName() !== "signup.html") {
    return;
  }

  const creatorSignupButton = document.querySelector("#creatorSignupX");
  const brandSignupForm = document.querySelector("#brandSignupForm");

  creatorSignupButton?.addEventListener("click", async () => {
    if (!isSupabaseConfigured) {
      showToast("Add your Supabase URL and anon key before using X login.");
      return;
    }

    const { error } = await signInWithX();

    if (error) {
      showToast(error.message);
    }
  });

  brandSignupForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      showToast("Add your Supabase URL and anon key before creating accounts.");
      return;
    }

    const email = document.querySelector("#brandSignupEmail").value.trim();
    const password = document.querySelector("#brandSignupPassword").value;
    const projectName = document.querySelector("#brandSignupProject").value.trim();
    const contact = document.querySelector("#brandSignupContact").value.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role: "brand",
          project_name: projectName
        }
      }
    });

    if (error) {
      showToast(error.message);
      return;
    }

    if (!data.session) {
      showToast("Check your email to confirm this brand account.");
      return;
    }

    currentSession = data.session;
    try {
      await ensureBrandProfile({ projectName, contact });
      window.location.href = "project-dashboard.html";
    } catch (profileError) {
      showToast(profileError.message || "Brand profile could not be created.");
    }
  });
}

function initLoginPage() {
  if (getPageName() !== "login.html") {
    return;
  }

  const creatorTab = document.querySelector("#creatorLoginTab");
  const brandTab = document.querySelector("#brandLoginTab");
  const creatorPanel = document.querySelector("#creatorLoginPanel");
  const brandPanel = document.querySelector("#brandLoginPanel");
  const creatorLoginButton = document.querySelector("#creatorLoginX");
  const brandLoginForm = document.querySelector("#brandLoginPanel");
  const role = new URLSearchParams(window.location.search).get("role");

  function showPanel(activeRole) {
    const creatorActive = activeRole !== "brand";
    creatorPanel?.classList.toggle("is-hidden", !creatorActive);
    brandPanel?.classList.toggle("is-hidden", creatorActive);
    creatorTab?.classList.toggle("active", creatorActive);
    brandTab?.classList.toggle("active", !creatorActive);
  }

  showPanel(role || "creator");
  creatorTab?.addEventListener("click", () => showPanel("creator"));
  brandTab?.addEventListener("click", () => showPanel("brand"));

  creatorLoginButton?.addEventListener("click", async () => {
    if (!isSupabaseConfigured) {
      showToast("Add your Supabase URL and anon key before using X login.");
      return;
    }

    const { error } = await signInWithX();

    if (error) {
      showToast(error.message);
    }
  });

  brandLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!isSupabaseConfigured) {
      showToast("Add your Supabase URL and anon key before logging in.");
      return;
    }

    const email = document.querySelector("#brandLoginEmail").value.trim();
    const password = document.querySelector("#brandLoginPassword").value;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showToast(error.message);
      return;
    }

    currentSession = data.session;
    await ensureBrandProfile();
    window.location.href = "project-dashboard.html";
  });
}

async function initCreatorOnboardingPage() {
  if (getPageName() !== "creator-onboarding.html") {
    return;
  }

  const onboardingForm = document.querySelector("#creatorOnboardingForm");
  const categoryOptions = document.querySelector("#onboardingCategoryOptions");
  const rateRange = document.querySelector("#onboardingRateRange");
  const rateLabel = document.querySelector("#onboardingRateLabel");
  const sorsaInput = document.querySelector("#onboardingSorsaScore");
  const skillSelect = document.querySelector("#onboardingSkill");
  const videoOptions = document.querySelector("#onboardingVideoOptions");
  const regionSelect = document.querySelector("#onboardingRegion");
  const xPreview = document.querySelector("#onboardingXPreview");

  if (!onboardingForm) {
    return;
  }

  currentSession = currentSession || await getActiveSession();
  if (!currentSession?.user) {
    window.location.href = "login.html?role=creator";
    return;
  }

  let existingCreator = creators.find((item) => item.id === currentSession.user.id);
  if (!existingCreator && isSupabaseConfigured) {
    const { data } = await supabase
      .from("creators")
      .select("*")
      .eq("id", currentSession.user.id)
      .maybeSingle();
    existingCreator = toAppCreator(data);
  }

  if (existingCreator) {
    window.location.href = "creator-dashboard.html";
    return;
  }

  const xData = await getXDataFromSession(currentSession, { forceRefresh: true });
  document.querySelector("#onboardingName").value = xData.name || "";
  document.querySelector("#onboardingHandle").value = normalizeHandleForDisplay(xData.handle);
  document.querySelector("#onboardingBio").value = xData.bio || "";
  if (xPreview) {
    xPreview.innerHTML = renderCreatorXIntel(xData, {
      name: xData.name,
      avatarSize: 68,
      label: xData.cached
        ? `Cached profile data${xData.provider ? ` from ${xData.provider}` : ""}`
        : xData.provider ? `Data collected from ${xData.provider}` : "Data collected directly from X"
    }) || `<div class="x-intel-card"><p>No X profile data was returned yet. You can still complete the profile manually.</p>${xData.note ? `<p>${escapeHtml(xData.note)}</p>` : ""}</div>`;
  }
  renderCategoryCheckboxes(categoryOptions);
  renderRegionSelect(regionSelect);
  setRangeLabel(rateRange, rateLabel);
  toggleVideoOptions(skillSelect, videoOptions);

  rateRange.addEventListener("input", () => setRangeLabel(rateRange, rateLabel));
  skillSelect.addEventListener("change", () => toggleVideoOptions(skillSelect, videoOptions));

  categoryOptions.addEventListener("change", (event) => {
    if (!event.target.matches('input[name="creatorCategory"]')) {
      return;
    }

    const checked = [...document.querySelectorAll('input[name="creatorCategory"]:checked')];
    if (checked.length > 2) {
      event.target.checked = false;
      showToast("Creators can choose a maximum of two content categories.");
    }
  });

  onboardingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedCategories = [...document.querySelectorAll('input[name="creatorCategory"]:checked')]
      .map((input) => input.value);
    const [minRate, maxRate] = getRateRange(rateRange.value);
    const videoStyles = getCheckedValues("creatorVideoStyle");
    const handle = document.querySelector("#onboardingHandle").value.trim();

    if (!selectedCategories.length) {
      showToast("Please choose at least one creator category.");
      return;
    }

    if ((skillSelect.value === "Video" || skillSelect.value === "Both") && !videoStyles.length) {
      showToast("Please choose at least one video content type.");
      return;
    }

    try {
      const formHandle = normalizeHandleForStore(handle) || xData.handle;
      const savedXData = await enrichXDataByHandle(formHandle, xData, { forceRefresh: true });
      await saveCreatorProfile({
        id: currentSession.user.id,
        name: document.querySelector("#onboardingName").value.trim() || savedXData.name || normalizeHandleForDisplay(formHandle),
        handle: normalizeHandleForDisplay(formHandle),
        minRate,
        maxRate,
        sorsaScore: normalizeSorsaScore(sorsaInput?.value, 50),
        region: regionSelect.value,
        availability: document.querySelector("#onboardingAvailability").value,
        example: document.querySelector("#onboardingExample").value.trim(),
        categories: selectedCategories,
        skillType: skillSelect.value,
        videoStyles,
        contact: document.querySelector("#onboardingContact").value.trim(),
        bio: document.querySelector("#onboardingBio").value.trim(),
        portfolio: [],
        isPublicProfile: true,
        xProfile: {
          handle: formHandle || savedXData.handle,
          avatarUrl: savedXData.avatarUrl,
          bio: savedXData.bio,
          followers: savedXData.followers,
          following: savedXData.following,
          tweetCount: savedXData.tweetCount,
          location: savedXData.location,
          verified: savedXData.verified,
          collectedAt: savedXData.collectedAt || new Date().toISOString(),
          notableFollowers: savedXData.notableFollowers || "",
          pinnedTweet: savedXData.pinnedTweet || "",
          collected: true
        }
      }, currentSession.user.id);
      window.location.href = "creator-dashboard.html";
    } catch (error) {
      showToast(error.message || "Creator profile could not be saved.");
    }
  });
}

async function initAdminPage() {
  const adminList = document.querySelector("#adminList");
  const clearRequestsButton = document.querySelector("#clearRequests");
  const adminLoginForm = document.querySelector("#adminLoginForm");
  const adminLoginSection = document.querySelector("#adminLoginSection");
  const adminWorkspace = document.querySelector("#adminWorkspace");

  if (!adminList) {
    return;
  }

  async function unlockAdmin() {
    adminLoginSection?.classList.add("is-hidden");
    adminWorkspace?.classList.remove("is-hidden");
    requests = await fetchAdminRequests();
    renderAdmin();
  }

  function renderAdmin() {
    if (!requests.length) {
      adminList.innerHTML = `
        <div class="empty-state">
          No campaign requests have been submitted yet. Once a project shortlists creators and submits, the request will appear here.
        </div>
      `;
      return;
    }

    adminList.innerHTML = requests.map((request) => `
      <article class="admin-card">
        <h3>${escapeHtml(request.projectName)}</h3>
        <div class="admin-meta">
          <span>Status: ${escapeHtml(request.status || "Received")}</span>
          <span>${escapeHtml(request.contact)}</span>
          <span>${escapeHtml(request.category)}</span>
          <span>${escapeHtml(request.region || "Global")}</span>
          <span>Budget: ${request.budgetRange ? formatStoredRate(request.budgetRange[0], request.budgetRange[1]) : money(request.budget)}</span>
          <span>${escapeHtml(request.skillType || "Writing")}</span>
          <span>${escapeHtml(request.urgency || "Flexible timeline")}</span>
          ${(request.videoStyles || []).map((style) => `<span>${escapeHtml(style)}</span>`).join("")}
          <span>${escapeHtml(request.createdAt)}</span>
        </div>
        <p>${escapeHtml(request.notes || "No campaign notes provided.")}</p>
        ${request.contentScope ? `<p><strong>Scope:</strong> ${escapeHtml(request.contentScope)}</p>` : ""}
        ${request.draftFile ? `<p><strong>Draft file:</strong> ${escapeHtml(request.draftFile.name)} ${request.draftFile.size ? `(${formatFileSize(request.draftFile.size)})` : ""}</p>` : ""}
        <label class="status-control">
          Request status
          <select data-request-status="${escapeHtml(request.id)}">
            <option value="Received">Received</option>
            <option value="Creators contacted">Creators contacted</option>
            <option value="Negotiating">Negotiating</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Completed">Completed</option>
          </select>
        </label>
        <ul class="selected-list">
          ${request.creators.map((creator) => `
            <li>
              <strong>${escapeHtml(creator.name)} ${escapeHtml(creator.handle)}</strong>
              <span class="selected-meta">${creator.categories.map(escapeHtml).join(", ")} | ${escapeHtml(creator.region || "Global")} | ${escapeHtml(creator.skillType || "Writing")} ${(creator.videoStyles || []).length ? `| ${(creator.videoStyles || []).map(escapeHtml).join(", ")}` : ""} | ${formatStoredRate(creator.minRate, creator.maxRate)} | Sorsa ${escapeHtml(creator.sorsaScore)} | ${escapeHtml(creator.contact)}</span>
              ${creator.xProfile?.url ? `<span class="selected-meta">X: ${escapeHtml(creator.xProfile.url)}${creator.xProfile.followers ? ` | ${Number(creator.xProfile.followers).toLocaleString()} followers` : ""}${creator.xProfile.notableFollowers ? ` | Notable followers: ${escapeHtml(creator.xProfile.notableFollowers)}` : ""}${creator.xProfile.pinnedTweet ? ` | Pinned: ${escapeHtml(creator.xProfile.pinnedTweet)}` : ""}</span>` : ""}
            </li>
          `).join("")}
        </ul>
      </article>
    `).join("");

    adminList.querySelectorAll("[data-request-status]").forEach((select) => {
      const request = requests.find((item) => item.id === select.dataset.requestStatus);
      select.value = request?.status || "Received";
    });
  }

  if (localStorage.getItem("cryptoAgencyAdminUnlocked") === "true") {
    await unlockAdmin();
  }

  adminLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passcode = document.querySelector("#adminPasscode").value;

    const backendLogin = await sendApi("/api/admin/login", "POST", { passcode });

    if (passcode !== "admin123" && !backendLogin?.ok) {
      showToast("Incorrect passcode. Demo passcode is admin123.");
      return;
    }

    localStorage.setItem("cryptoAgencyAdminUnlocked", "true");
    await unlockAdmin();
    showToast("Admin unlocked.");
  });

  adminList.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-request-status]");
    if (!select) {
      return;
    }

    requests = requests.map((request) => request.id === select.dataset.requestStatus
      ? { ...request, status: select.value }
      : request);
    await sendApi(`/api/requests/${encodeURIComponent(select.dataset.requestStatus)}`, "PATCH", { status: select.value });
    renderAdmin();
    showToast("Request status updated.");
  });

  if (clearRequestsButton) {
    clearRequestsButton.addEventListener("click", async () => {
      requests = [];
      await sendApi("/api/requests", "DELETE");
      renderAdmin();
      showToast("Demo requests cleared.");
    });
  }
}

async function bootApp() {
  const arrivedFromAuthCallback = hasAuthCallbackParams();

  syncRateSliderMax();
  initMobileNav();
  initChameleonTheme();
  initScrollAnimations();
  currentSession = await getActiveSession();
  currentUserRole = currentSession?.user ? await getUserRole(currentSession.user.id) : "";

  if (
    arrivedFromAuthCallback &&
    currentSession?.user &&
    !currentUserRole &&
    isXAuthSession(currentSession) &&
    getPageName() !== "creator-onboarding.html"
  ) {
    window.location.replace(getRedirectUrl("creator-onboarding.html"));
    return;
  }

  creators = await fetchCreators();
  requests = currentSession?.user && currentUserRole === "brand"
    ? await fetchBrandCampaigns(currentSession.user.id)
    : [];
  await initAuthAwareNav();
  renderStats();
  initHomePage();
  await initCreatorProfilePage();
  await initCreatorDashboard();
  await initProjectDashboard();
  await initProjectsPage();
  initSignupPage();
  initLoginPage();
  await initCreatorOnboardingPage();
  await initAdminPage();
}

bootApp();
