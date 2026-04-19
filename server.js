const http = require("http");
const fs = require("fs");
const path = require("path");
const { randomBytes, randomUUID } = require("crypto");

let createClient = null;
try {
  ({ createClient } = require("@supabase/supabase-js"));
} catch {
  createClient = null;
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const X_PROFILE_CACHE_PATH = path.join(DATA_DIR, "x-profile-cache.json");
const CAMPAIGN_DRAFT_BUCKET = "campaign-drafts";
const CAMPAIGN_DRAFT_MAX_BYTES = Number(process.env.CAMPAIGN_DRAFT_MAX_BYTES || 50 * 1024 * 1024);
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || "admin123";
const X_BEARER_TOKEN = process.env.X_BEARER_TOKEN || "";
const TWITTERAPI_IO_KEY =
  process.env.TWITTERAPI_IO_KEY ||
  process.env.TWITTERAPI_IO_API_KEY ||
  process.env.TWITTER_API_IO_KEY ||
  process.env.TWITTERAPI_KEY ||
  process.env.TWITTER_API_KEY ||
  "";
const SOCIALDATA_API_KEY = process.env.SOCIALDATA_API_KEY || "";
const X_PROFILE_CACHE_TTL_HOURS = Number(process.env.X_PROFILE_CACHE_TTL_HOURS || 24);
const X_PROFILE_CACHE_TTL_MS = Math.max(0, X_PROFILE_CACHE_TTL_HOURS) * 60 * 60 * 1000;
const SUPABASE_URL = process.env.SUPABASE_URL || "https://tioxocilqbmcixrgbyac.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const supabaseAdmin = createClient && SUPABASE_URL !== "YOUR_SUPABASE_URL" && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
  })
  : null;

const runtimeConfig = {
  hasSupabaseServiceRole: Boolean(SUPABASE_SERVICE_ROLE_KEY),
  xProfileProviders: {
    preferred: TWITTERAPI_IO_KEY ? "TwitterAPI.io" : X_BEARER_TOKEN ? "X API" : SOCIALDATA_API_KEY ? "SocialData" : "",
    xBearerToken: Boolean(X_BEARER_TOKEN),
    twitterApiIo: Boolean(TWITTERAPI_IO_KEY),
    socialData: Boolean(SOCIALDATA_API_KEY)
  }
};

function getCorsOrigin(request) {
  if (ALLOWED_ORIGINS.includes("*")) {
    return "*";
  }

  const origin = request.headers.origin || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : "";
}

function getCorsHeaders(request) {
  const origin = getCorsOrigin(request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-File-Name, X-Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ creators: [], requests: [], shortlists: [], projectAccess: [] }, null, 2));
  }
}

function readDb() {
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  return {
    creators: [],
    requests: [],
    shortlists: [],
    projectAccess: [],
    ...db
  };
}

function writeDb(db) {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function readXProfileCache() {
  ensureDb();

  if (!fs.existsSync(X_PROFILE_CACHE_PATH)) {
    return { profiles: {} };
  }

  try {
    const cache = JSON.parse(fs.readFileSync(X_PROFILE_CACHE_PATH, "utf8"));
    return cache && typeof cache === "object" && cache.profiles
      ? cache
      : { profiles: {} };
  } catch {
    return { profiles: {} };
  }
}

function writeXProfileCache(cache) {
  ensureDb();
  fs.writeFileSync(X_PROFILE_CACHE_PATH, JSON.stringify(cache, null, 2));
}

function sendJson(response, statusCode, payload, request = null) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    ...(request ? getCorsHeaders(request) : {})
  });
  response.end(JSON.stringify(payload));
}

function logInfo(message, context = {}) {
  console.log(JSON.stringify({
    level: "info",
    message,
    ...context,
    at: new Date().toISOString()
  }));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function readRawBody(request, maxBytes = CAMPAIGN_DRAFT_MAX_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;

      if (size > maxBytes) {
        reject(new Error(`Upload exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit.`));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const safePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(__dirname, safePath));

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  });
}

function cleanXHandle(handle) {
  return String(handle || "").trim().replace(/^@/, "");
}

function toNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function requireSupabaseAdmin() {
  if (!supabaseAdmin) {
    const error = new Error("Supabase service role is required for permanent project storage.");
    error.statusCode = 503;
    throw error;
  }
}

function normalizeContact(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeTrackingCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function generateTrackingCode() {
  const token = randomBytes(4).toString("hex").toUpperCase();
  return `CD-${token.slice(0, 4)}-${token.slice(4)}`;
}

function sanitizeFileName(fileName) {
  const parsed = path.parse(String(fileName || "campaign-draft"));
  const safeBase = parsed.name
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "campaign-draft";
  const safeExt = parsed.ext.replace(/[^a-z0-9.]+/gi, "").slice(0, 12);
  return `${safeBase}${safeExt}`;
}

function decodeHeaderValue(value, fallback = "") {
  try {
    return decodeURIComponent(String(value || fallback));
  } catch {
    return String(value || fallback);
  }
}

function findProjectAccess(db, contact, trackingCode) {
  const contactKey = normalizeContact(contact);
  const code = normalizeTrackingCode(trackingCode);
  return db.projectAccess.find((access) => access.contactKey === contactKey && access.trackingCode === code) || null;
}

function ensureProjectAccess(db, { contact, trackingCode = "", projectName = "" }) {
  const contactKey = normalizeContact(contact);
  const code = normalizeTrackingCode(trackingCode) || generateTrackingCode();
  let access = findProjectAccess(db, contact, code);

  if (access) {
    access.projectName = access.projectName || projectName;
    access.contact = access.contact || contact;
    return access;
  }

  access = {
    id: `access-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    contactKey,
    contact,
    trackingCode: code,
    brandId: randomUUID(),
    projectName,
    requestIds: [],
    shortlistIds: [],
    createdAt: new Date().toISOString()
  };
  db.projectAccess.unshift(access);
  return access;
}

function profileResponse(profile) {
  return {
    handle: cleanXHandle(profile.handle),
    name: profile.name || "",
    avatarUrl: profile.avatarUrl || "",
    bio: profile.bio || "",
    followers: profile.followers ?? null,
    following: profile.following ?? null,
    tweetCount: profile.tweetCount ?? null,
    location: profile.location || "",
    verified: Boolean(profile.verified),
    pinnedTweet: profile.pinnedTweet || "",
    notableFollowers: profile.notableFollowers || "",
    collectedAt: profile.collectedAt || new Date().toISOString(),
    provider: profile.provider || "",
    cached: Boolean(profile.cached),
    cacheExpiresAt: profile.cacheExpiresAt || "",
    note: profile.note || ""
  };
}

function profileFromXUser(user, fallbackHandle = "", provider = "X API") {
  return profileResponse({
    handle: user.username || fallbackHandle,
    name: user.name || "",
    avatarUrl: user.profile_image_url || "",
    bio: user.description || "",
    followers: user.public_metrics?.followers_count || null,
    following: user.public_metrics?.following_count || null,
    tweetCount: user.public_metrics?.tweet_count || null,
    location: user.location || "",
    verified: Boolean(user.verified),
    pinnedTweet: "",
    notableFollowers: "",
    provider,
    note: "Notable followers require elevated X API access or a separate enrichment provider."
  });
}

function getCachedXProfile(handle) {
  if (!X_PROFILE_CACHE_TTL_MS) {
    return null;
  }

  const cache = readXProfileCache();
  const cacheKey = cleanXHandle(handle).toLowerCase();
  const cached = cache.profiles[cacheKey];
  const expiresAt = cached?.expiresAt ? Date.parse(cached.expiresAt) : 0;

  if (!cached?.profile || !expiresAt || expiresAt <= Date.now()) {
    return null;
  }

  return profileResponse({
    ...cached.profile,
    cached: true,
    cacheExpiresAt: cached.expiresAt
  });
}

function cacheXProfile(handle, profile) {
  if (!X_PROFILE_CACHE_TTL_MS || !profile?.provider) {
    return profile;
  }

  const now = Date.now();
  const expiresAt = new Date(now + X_PROFILE_CACHE_TTL_MS).toISOString();
  const cache = readXProfileCache();
  const cacheKey = cleanXHandle(handle).toLowerCase();
  const profileToCache = profileResponse({
    ...profile,
    cached: false,
    cacheExpiresAt: expiresAt,
    collectedAt: profile.collectedAt || new Date(now).toISOString()
  });

  cache.profiles[cacheKey] = {
    profile: profileToCache,
    cachedAt: new Date(now).toISOString(),
    expiresAt
  };
  writeXProfileCache(cache);
  return profileToCache;
}

async function fetchOfficialXProfile(handle) {
  if (!X_BEARER_TOKEN) {
    return null;
  }

  logInfo("x_profile_official_lookup_started", { handle });
  const userUrl = new URL(`https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`);
  userUrl.searchParams.set("user.fields", "public_metrics,pinned_tweet_id,description,location,profile_image_url,verified,username,name");

  const userResponse = await fetch(userUrl, {
    headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` }
  });

  logInfo("x_profile_official_lookup_finished", { handle, status: userResponse.status });
  if (!userResponse.ok) {
    throw new Error(`X API request failed with ${userResponse.status}`);
  }

  const userPayload = await userResponse.json();
  const user = userPayload.data || {};
  let pinnedTweet = "";

  if (user.pinned_tweet_id) {
    const tweetResponse = await fetch(`https://api.x.com/2/tweets/${user.pinned_tweet_id}`, {
      headers: { Authorization: `Bearer ${X_BEARER_TOKEN}` }
    });

    if (tweetResponse.ok) {
      const tweetPayload = await tweetResponse.json();
      pinnedTweet = tweetPayload.data?.text || "";
    }
  }

  return profileResponse({
    ...profileFromXUser(user, handle, "X API"),
    pinnedTweet,
    note: "Notable followers require elevated X API access or a separate enrichment provider."
  });
}

async function fetchXProfileWithUserToken(providerToken) {
  const userFields = "description,location,profile_image_url,public_metrics,verified,username,name";
  const urls = [
    `https://api.x.com/2/users/me?user.fields=${encodeURIComponent(userFields)}`,
    `https://api.twitter.com/2/users/me?user.fields=${encodeURIComponent(userFields)}`
  ];
  const errors = [];

  for (const url of urls) {
    try {
      logInfo("x_oauth_profile_lookup_started", { host: new URL(url).hostname });
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${providerToken}`
        }
      });

      logInfo("x_oauth_profile_lookup_finished", { host: new URL(url).hostname, status: response.status });
      if (!response.ok) {
        errors.push(`${new URL(url).hostname}: ${response.status}`);
        continue;
      }

      const payload = await response.json();
      return profileFromXUser(payload.data || {}, "", "X OAuth");
    } catch (error) {
      errors.push(`${new URL(url).hostname}: ${error.message}`);
    }
  }

  throw new Error(`X OAuth profile request failed. ${errors.join("; ")}`);
}

async function fetchTwitterApiIoProfile(handle) {
  if (!TWITTERAPI_IO_KEY) {
    return null;
  }

  const profileUrl = new URL("https://api.twitterapi.io/twitter/user/info");
  profileUrl.searchParams.set("userName", handle);

  logInfo("twitterapi_io_profile_lookup_started", { handle });
  const profileResponseRaw = await fetch(profileUrl, {
    headers: { "X-API-Key": TWITTERAPI_IO_KEY }
  });

  logInfo("twitterapi_io_profile_lookup_finished", { handle, status: profileResponseRaw.status });
  if (!profileResponseRaw.ok) {
    throw new Error(`TwitterAPI.io request failed with ${profileResponseRaw.status}`);
  }

  const payload = await profileResponseRaw.json();
  if (payload.status === "error") {
    throw new Error(payload.msg || "TwitterAPI.io request failed");
  }

  const user = payload.data || {};
  const pinnedTweetId = Array.isArray(user.pinnedTweetIds) ? user.pinnedTweetIds[0] : "";

  return profileResponse({
    handle: user.userName || handle,
    name: user.name || "",
    avatarUrl: user.profilePicture || "",
    bio: user.description || user.profile_bio?.description || "",
    followers: toNumber(user.followers),
    following: toNumber(user.following),
    tweetCount: toNumber(user.statusesCount),
    location: user.location || "",
    verified: Boolean(user.isBlueVerified || user.verifiedType),
    pinnedTweet: pinnedTweetId ? `https://x.com/${user.userName || handle}/status/${pinnedTweetId}` : "",
    notableFollowers: "",
    provider: "TwitterAPI.io",
    note: "Verified or notable follower lists require a separate follower endpoint."
  });
}

async function fetchSocialDataProfile(handle) {
  if (!SOCIALDATA_API_KEY) {
    return null;
  }

  const profileUrl = `https://api.socialdata.tools/twitter/user/${encodeURIComponent(handle)}`;
  const profileResponseRaw = await fetch(profileUrl, {
    headers: {
      Authorization: `Bearer ${SOCIALDATA_API_KEY}`,
      Accept: "application/json"
    }
  });

  if (!profileResponseRaw.ok) {
    throw new Error(`SocialData request failed with ${profileResponseRaw.status}`);
  }

  const user = await profileResponseRaw.json();
  if (user.status === "error") {
    throw new Error(user.message || "SocialData request failed");
  }

  return profileResponse({
    handle: user.screen_name || handle,
    name: user.name || "",
    avatarUrl: user.profile_image_url_https || "",
    bio: user.description || "",
    followers: toNumber(user.followers_count),
    following: toNumber(user.friends_count),
    tweetCount: toNumber(user.statuses_count),
    location: user.location || "",
    verified: Boolean(user.verified),
    pinnedTweet: "",
    notableFollowers: "",
    provider: "SocialData",
    note: "Verified or notable follower lists require a separate follower endpoint."
  });
}

async function fetchXProfile(handle, options = {}) {
  const cleanHandle = cleanXHandle(handle);
  const cachedProfile = options.forceRefresh ? null : getCachedXProfile(cleanHandle);

  if (cachedProfile) {
    return cachedProfile;
  }

  const errors = [];
  const providers = [
    { name: "TwitterAPI.io", fetchProfile: fetchTwitterApiIoProfile },
    { name: "SocialData", fetchProfile: fetchSocialDataProfile },
    { name: "X API", fetchProfile: fetchOfficialXProfile }
  ];

  for (const provider of providers) {
    try {
      const profile = await provider.fetchProfile(cleanHandle);
      if (profile) {
        return cacheXProfile(cleanHandle, profile);
      }
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  return profileResponse({
    handle: cleanHandle,
    followers: null,
    pinnedTweet: "",
    notableFollowers: "",
    note: errors.length
      ? `Profile enrichment failed. ${errors.join("; ")}`
      : "Set X_BEARER_TOKEN, TWITTERAPI_IO_KEY, or SOCIALDATA_API_KEY to enable live X profile enrichment."
  });
}

async function readSupabaseCampaignRequests() {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("*, brands(email, contact), campaign_creators(creators(*))")
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return addDraftSignedUrls(data || []);
}

async function readSupabaseBrandCampaigns(brandId) {
  if (!supabaseAdmin || !brandId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .select("*, brands(email, contact), campaign_creators(creators(*))")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return addDraftSignedUrls(data || []);
}

async function readSupabaseBrandShortlists(brandId) {
  if (!supabaseAdmin || !brandId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("shortlists")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return data || [];
}

async function ensureSupabaseTrackedBrand(access) {
  if (!supabaseAdmin || !access?.brandId) {
    return null;
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("brands")
    .select("*")
    .eq("id", access.brandId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const payload = {
    id: access.brandId,
    project_name: access.projectName || "",
    email: access.contact && access.contact.includes("@") ? access.contact : "",
    contact: access.contact || ""
  };

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("brands")
      .update({
        project_name: existing.project_name || payload.project_name,
        email: existing.email || payload.email,
        contact: existing.contact || payload.contact
      })
      .eq("id", access.brandId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("brands")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function findSupabaseProjectAccess(contact, trackingCode) {
  requireSupabaseAdmin();

  const { data, error } = await supabaseAdmin
    .from("project_access_codes")
    .select("*")
    .eq("contact_key", normalizeContact(contact))
    .eq("tracking_code", normalizeTrackingCode(trackingCode))
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function ensureSupabaseProjectAccess({ contact, trackingCode = "", projectName = "" }) {
  requireSupabaseAdmin();

  const contactKey = normalizeContact(contact);
  const normalizedCode = normalizeTrackingCode(trackingCode);

  if (normalizedCode) {
    const existing = await findSupabaseProjectAccess(contact, normalizedCode);
    if (existing) {
      const updates = {
        contact: existing.contact || contact,
        project_name: existing.project_name || projectName
      };
      await supabaseAdmin.from("project_access_codes").update(updates).eq("id", existing.id);
      return {
        ...existing,
        contact: updates.contact,
        project_name: updates.project_name,
        brandId: existing.brand_id,
        trackingCode: existing.tracking_code,
        projectName: updates.project_name
      };
    }
  }

  let trackingCodeToUse = normalizedCode || generateTrackingCode();
  let existingCode = await findSupabaseProjectAccess(contact, trackingCodeToUse);

  while (existingCode) {
    trackingCodeToUse = generateTrackingCode();
    existingCode = await findSupabaseProjectAccess(contact, trackingCodeToUse);
  }

  const brandId = randomUUID();
  const access = {
    brandId,
    contact,
    trackingCode: trackingCodeToUse,
    projectName
  };

  await ensureSupabaseTrackedBrand(access);

  const { data, error } = await supabaseAdmin
    .from("project_access_codes")
    .insert({
      brand_id: brandId,
      contact,
      contact_key: contactKey,
      tracking_code: trackingCodeToUse,
      project_name: projectName || ""
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    brandId: data.brand_id,
    trackingCode: data.tracking_code,
    projectName: data.project_name
  };
}

async function ensureCampaignDraftBucket() {
  requireSupabaseAdmin();

  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
  if (listError) {
    throw listError;
  }

  if ((buckets || []).some((bucket) => bucket.id === CAMPAIGN_DRAFT_BUCKET)) {
    return;
  }

  const { error } = await supabaseAdmin.storage.createBucket(CAMPAIGN_DRAFT_BUCKET, {
    public: false,
    fileSizeLimit: CAMPAIGN_DRAFT_MAX_BYTES
  });

  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
    throw error;
  }
}

async function createDraftSignedUrl(draftFile) {
  if (!supabaseAdmin || !draftFile?.path) {
    return draftFile || null;
  }

  const { data, error } = await supabaseAdmin.storage
    .from(draftFile.bucket || CAMPAIGN_DRAFT_BUCKET)
    .createSignedUrl(draftFile.path, 60 * 60 * 24 * 7);

  if (error) {
    return draftFile;
  }

  return {
    ...draftFile,
    url: data.signedUrl
  };
}

async function addDraftSignedUrls(campaigns) {
  return Promise.all((campaigns || []).map(async (campaign) => {
    if (!campaign?.draft_file) {
      return campaign;
    }

    return {
      ...campaign,
      draft_file: await createDraftSignedUrl(campaign.draft_file)
    };
  }));
}

async function uploadSupabaseCampaignDraft(buffer, { fileName, contentType }) {
  requireSupabaseAdmin();
  await ensureCampaignDraftBucket();

  const safeName = sanitizeFileName(fileName);
  const objectPath = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${randomBytes(4).toString("hex")}-${safeName}`;
  const { data, error } = await supabaseAdmin.storage
    .from(CAMPAIGN_DRAFT_BUCKET)
    .upload(objectPath, buffer, {
      contentType: contentType || "application/octet-stream",
      upsert: false
    });

  if (error) {
    throw error;
  }

  const draftFile = {
    storage: "supabase",
    bucket: CAMPAIGN_DRAFT_BUCKET,
    path: data.path,
    name: fileName || safeName,
    size: buffer.length,
    type: contentType || "application/octet-stream",
    uploadedAt: new Date().toISOString()
  };

  return createDraftSignedUrl(draftFile);
}

async function createSupabaseTrackedCampaign(access, campaignRequest, creatorIds = []) {
  requireSupabaseAdmin();

  await ensureSupabaseTrackedBrand(access);

  const { data: campaign, error } = await supabaseAdmin
    .from("campaigns")
    .insert({
      brand_id: access.brandId,
      project_name: campaignRequest.projectName,
      category: campaignRequest.category,
      region: campaignRequest.region,
      budget_min: campaignRequest.budgetRange?.[0] || 0,
      budget_max: campaignRequest.budgetRange?.[1] === null || campaignRequest.budgetRange?.[1] === Infinity
        ? null
        : campaignRequest.budgetRange?.[1],
      skill_type: campaignRequest.skillType,
      urgency: campaignRequest.urgency,
      video_styles: campaignRequest.videoStyles || [],
      notes: campaignRequest.notes,
      content_scope: campaignRequest.contentScope,
      draft_file: campaignRequest.draftFile || null,
      status: "Received"
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  const links = creatorIds
    .filter(Boolean)
    .map((creatorId) => ({
      campaign_id: campaign.id,
      creator_id: creatorId
    }));

  if (links.length) {
    const { error: linkError } = await supabaseAdmin.from("campaign_creators").insert(links);
    if (linkError) {
      throw linkError;
    }
  }

  const signedDraftFile = await createDraftSignedUrl(campaign.draft_file);
  return signedDraftFile ? { ...campaign, draft_file: signedDraftFile } : campaign;
}

async function createSupabaseTrackedShortlist(access, shortlist) {
  requireSupabaseAdmin();

  await ensureSupabaseTrackedBrand(access);

  const { data, error } = await supabaseAdmin
    .from("shortlists")
    .insert({
      brand_id: access.brandId,
      name: shortlist.name,
      creator_ids: shortlist.creator_ids || []
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function readSupabaseShortlist(shortlistId) {
  requireSupabaseAdmin();

  if (!shortlistId) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("shortlists")
    .select("*")
    .eq("id", shortlistId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function updateSupabaseCampaignStatus(requestId, status) {
  if (!supabaseAdmin) {
    return null;
  }

  const { data, error } = await supabaseAdmin
    .from("campaigns")
    .update({ status })
    .eq("id", requestId)
    .select()
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function deleteSupabaseCampaignRequests() {
  if (!supabaseAdmin) {
    return null;
  }

  const { error } = await supabaseAdmin
    .from("campaigns")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");

  if (error) {
    throw error;
  }

  return [];
}

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const db = readDb();

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      ...runtimeConfig
    }, request);
  }

  if (request.method === "POST" && url.pathname === "/api/x-me") {
    try {
      const body = await readBody(request);
      if (!body.providerToken) {
        return sendJson(response, 400, { error: "Missing provider token" }, request);
      }

      logInfo("x_me_requested");
      return sendJson(response, 200, await fetchXProfileWithUserToken(body.providerToken), request);
    } catch (error) {
      return sendJson(response, 502, { error: error.message }, request);
    }
  }

  if (request.method === "POST" && url.pathname === "/api/admin/login") {
    const body = await readBody(request);
    return sendJson(response, body.passcode === ADMIN_PASSCODE ? 200 : 401, {
      ok: body.passcode === ADMIN_PASSCODE
    });
  }

  if (request.method === "GET" && url.pathname === "/api/creators") {
    return sendJson(response, 200, db.creators);
  }

  if (request.method === "POST" && url.pathname === "/api/creators") {
    const creator = await readBody(request);
    db.creators = [{ ...creator, id: creator.id || `creator-${Date.now()}` }, ...db.creators];
    writeDb(db);
    return sendJson(response, 201, db.creators[0]);
  }

  if (request.method === "POST" && url.pathname === "/api/uploads/campaign-draft") {
    try {
      const fileName = decodeHeaderValue(request.headers["x-file-name"], "campaign-draft");
      const contentType = String(request.headers["content-type"] || request.headers["x-content-type"] || "application/octet-stream");
      const fileBuffer = await readRawBody(request);
      const uploadedFile = await uploadSupabaseCampaignDraft(fileBuffer, { fileName, contentType });
      return sendJson(response, 201, uploadedFile);
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Draft file could not be uploaded to Supabase."
      });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/tracked-requests") {
    const body = await readBody(request);
    const campaignRequest = body.request || body;
    const contact = campaignRequest.contact || body.contact;

    if (!contact) {
      return sendJson(response, 400, { error: "Contact is required." });
    }

    let access;
    try {
      access = await ensureSupabaseProjectAccess({
        contact,
        trackingCode: campaignRequest.trackingCode || body.trackingCode,
        projectName: campaignRequest.projectName
      });
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Project access could not be saved to Supabase."
      });
    }

    const localAccess = ensureProjectAccess(db, {
      contact,
      trackingCode: access.trackingCode,
      projectName: campaignRequest.projectName
    });
    const creatorIds = Array.isArray(body.creatorIds)
      ? body.creatorIds
      : (campaignRequest.creators || []).map((creator) => creator.id);

    try {
      const savedCampaign = await createSupabaseTrackedCampaign(access, campaignRequest, creatorIds);
      const savedRequest = {
        ...campaignRequest,
        id: savedCampaign.id,
        draftFile: savedCampaign.draft_file || campaignRequest.draftFile || null,
        trackingCode: access.trackingCode,
        createdAt: savedCampaign.created_at || campaignRequest.createdAt || new Date().toISOString()
      };

      if (!localAccess.requestIds.includes(savedRequest.id)) {
        localAccess.requestIds.unshift(savedRequest.id);
      }

      db.requests = [savedRequest, ...db.requests.filter((item) => item.id !== savedRequest.id)];
      writeDb(db);

      return sendJson(response, 201, {
        request: savedRequest,
        trackingCode: access.trackingCode
      });
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Campaign request could not be saved to Supabase."
      });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/tracked-shortlists") {
    const body = await readBody(request);
    const contact = body.contact || "";

    if (!contact) {
      return sendJson(response, 400, { error: "Contact is required." });
    }

    let access;
    try {
      access = await ensureSupabaseProjectAccess({
        contact,
        trackingCode: body.trackingCode,
        projectName: body.projectName || ""
      });
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Project access could not be saved to Supabase."
      });
    }

    const localAccess = ensureProjectAccess(db, {
      contact,
      trackingCode: access.trackingCode,
      projectName: body.projectName || ""
    });
    const localShortlist = {
      id: body.id || `shortlist-${Date.now()}`,
      name: body.name || "Saved shortlist",
      creator_ids: Array.isArray(body.creatorIds) ? body.creatorIds : [],
      created_at: new Date().toISOString(),
      trackingCode: access.trackingCode,
      contact
    };

    try {
      const savedShortlist = await createSupabaseTrackedShortlist(access, localShortlist);
      if (!localAccess.shortlistIds.includes(savedShortlist.id)) {
        localAccess.shortlistIds.unshift(savedShortlist.id);
      }

      db.shortlists = [savedShortlist, ...db.shortlists.filter((item) => item.id !== savedShortlist.id)];
      writeDb(db);

      return sendJson(response, 201, {
        shortlist: savedShortlist,
        trackingCode: access.trackingCode
      });
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Shortlist could not be saved to Supabase."
      });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/project-access") {
    const body = await readBody(request);
    let access;
    try {
      access = await findSupabaseProjectAccess(body.contact, body.trackingCode);
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Project access could not be loaded from Supabase."
      });
    }

    if (!access) {
      return sendJson(response, 404, { error: "Tracking code or contact was not found." });
    }

    try {
      const campaigns = await readSupabaseBrandCampaigns(access.brand_id);
      const shortlists = await readSupabaseBrandShortlists(access.brand_id);
      return sendJson(response, 200, {
        contact: access.contact,
        trackingCode: access.tracking_code,
        campaigns: campaigns || [],
        shortlists: shortlists || []
      });
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Project records could not be loaded from Supabase."
      });
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/shortlists/")) {
    const shortlistId = decodeURIComponent(url.pathname.split("/").pop());
    try {
      const shortlist = await readSupabaseShortlist(shortlistId);
      return sendJson(response, shortlist ? 200 : 404, shortlist || { error: "Shortlist not found." });
    } catch (error) {
      return sendJson(response, error.statusCode || 500, {
        error: error.message || "Shortlist could not be loaded from Supabase."
      });
    }
  }

  if (request.method === "GET" && url.pathname === "/api/requests") {
    const supabaseRequests = await readSupabaseCampaignRequests();
    if (supabaseRequests) {
      const supabaseIds = new Set(supabaseRequests.map((item) => item.id));
      const localOnlyRequests = db.requests.filter((item) => !supabaseIds.has(item.id));
      return sendJson(response, 200, [...supabaseRequests, ...localOnlyRequests]);
    }

    return sendJson(response, 200, db.requests);
  }

  if (request.method === "POST" && url.pathname === "/api/requests") {
    const campaignRequest = await readBody(request);
    db.requests = [{ ...campaignRequest, id: campaignRequest.id || `request-${Date.now()}` }, ...db.requests];
    writeDb(db);
    return sendJson(response, 201, db.requests[0]);
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/requests/")) {
    const requestId = url.pathname.split("/").pop();
    const body = await readBody(request);
    const supabaseRequest = await updateSupabaseCampaignStatus(requestId, body.status);
    if (supabaseRequest) {
      return sendJson(response, 200, supabaseRequest);
    }

    db.requests = db.requests.map((item) => item.id === requestId ? { ...item, status: body.status } : item);
    writeDb(db);
    return sendJson(response, 200, db.requests.find((item) => item.id === requestId) || null);
  }

  if (request.method === "DELETE" && url.pathname === "/api/requests") {
    const supabaseRequests = await deleteSupabaseCampaignRequests();
    if (supabaseRequests) {
      return sendJson(response, 200, supabaseRequests);
    }

    db.requests = [];
    writeDb(db);
    return sendJson(response, 200, db.requests);
  }

  if (request.method === "GET" && url.pathname === "/api/x-profile") {
    const handle = url.searchParams.get("handle");
    if (!handle) {
      return sendJson(response, 400, { error: "Missing handle" });
    }

    try {
      const forceRefresh = ["1", "true", "yes"].includes(String(url.searchParams.get("refresh") || url.searchParams.get("force") || "").toLowerCase());
      logInfo("x_profile_requested", { handle, forceRefresh });
      return sendJson(response, 200, await fetchXProfile(handle, { forceRefresh }));
    } catch (error) {
      return sendJson(response, 502, { error: error.message });
    }
  }

  return sendJson(response, 404, { error: "API route not found" });
}

const server = http.createServer((request, response) => {
  Object.entries(getCorsHeaders(request)).forEach(([header, value]) => {
    response.setHeader(header, value);
  });

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.url.startsWith("/api/")) {
    handleApi(request, response).catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
    return;
  }

  serveStatic(request, response);
});

server.listen(PORT, () => {
  console.log(`Crypto Creator Desk running at http://localhost:${PORT}`);
});
