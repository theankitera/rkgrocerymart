/* ============================================
   RINKU KIRANA — AUTH.JS
   Supabase Auth Logic (Shared) — Safe Singleton

   BUG FIX (Critical #1): Supabase keys ab hardcoded nahi hain.
   Keys window.__RK_CONFIG__ se load hoti hain jo index.html mein
   ek <script> tag ke zariye inject ki jaati hai.

   Deployment setup:
     index.html / account.html mein sabse upar ye script add karein:
       <script>
         window.__RK_CONFIG__ = {
           supabaseUrl: "https://xxxx.supabase.co",
           supabaseAnonKey: "sb_publishable__your_key"
         };
       </script>
     Ye values Vercel/Netlify environment variables se inject ki ja sakti hain
     build step ya edge functions ke zariye.
     Git history mein ye values tab bhi nahi aayengi.
   ============================================ */
(function () {
  "use strict";

  if (window.__RK_AUTH_INITIALIZED__) return;
  window.__RK_AUTH_INITIALIZED__ = true;

  // ── SUPABASE CONFIG (env-injected) ───────────
  var cfg = window.__RK_CONFIG__ || {};
  var SUPABASE_URL     = cfg.supabaseUrl     || "";
  var SUPABASE_ANON_KEY = cfg.supabaseAnonKey || "";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error(
      "[RKAuth] window.__RK_CONFIG__ set nahi hai.\n" +
      "index.html mein sabse pehle ye script add karein:\n" +
      "<script>window.__RK_CONFIG__={supabaseUrl:'https://xxxx.supabase.co'," +
      "supabaseAnonKey:'sb_publishable__...'}<\/script>"
    );
    return;
  }

  if (!window.supabase || !window.supabase.createClient) {
    console.error(
      "[RKAuth] @supabase/supabase-js load nahi hui. Check karein ki " +
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2 script " +
      "auth.js se PEHLE load ho rahi hai."
    );
    return;
  }

  var createClient = window.supabase.createClient;

  window.rkSupabase = window.rkSupabase || createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  var supabase = window.rkSupabase;

  // ── SESSION HELPERS ───────────────────────────
  async function getSession() {
    var res = await supabase.auth.getSession();
    return res.data.session;
  }

  async function redirectIfLoggedIn() {
    var session = await getSession();
    if (session) window.location.href = "index.html";
  }

  function saveUserLocal(user) {
    var meta = user.user_metadata || {};
    var profile = {
      uid: user.id,
      email: user.email,
      name: meta.name || user.email.split("@")[0],
      avatar: meta.avatar_url || null,
      savedAt: Date.now(),
    };
    try { localStorage.setItem("rk_user", JSON.stringify(profile)); } catch (e) {}
    return profile;
  }

  function getUserLocal() {
    try {
      var raw = localStorage.getItem("rk_user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function clearUserLocal() { localStorage.removeItem("rk_user"); }

  // ── UI HELPERS ────────────────────────────────
  function showMsg(el, type, html) {
    if (!el) return;
    el.className = "msg-box " + type;
    el.innerHTML =
      '<span class="msg-icon">' +
      (type === "error" ? "⚠️" : "✅") +
      "</span><span>" + html + "</span>";
    el.style.display = "flex";
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function hideMsg(el) { if (el) el.style.display = "none"; }

  function setLoading(btn, loading, label) {
    if (!btn) return;
    btn.disabled = loading;
    btn.innerHTML = loading ? '<span class="spinner"></span> Ek second…' : label;
  }

  function togglePass(inputId, btnEl) {
    var inp = document.getElementById(inputId);
    if (!inp) return;
    var isText = inp.type === "text";
    inp.type = isText ? "password" : "text";
    if (btnEl) btnEl.textContent = isText ? "👁️" : "🙈";
  }

  // ── PASSWORD STRENGTH ─────────────────────────
  function getStrength(pw) {
    var score = 0;
    if (pw.length >= 6)  score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw))        score++;
    if (/[0-9]/.test(pw))        score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  }

  function updateStrengthUI(pw, segs, label) {
    if (!segs || !label) return;
    var score = getStrength(pw);
    var colors      = ["#E2E8F0","#E63946","#FF6B35","#FFB800","#1BA672","#0EA86A"];
    var labels      = ["","Bahut kamzor","Kamzor","Theek hai","Achha","Bahut achha"];
    var labelColors = ["","#E63946","#FF6B35","#FFB800","#1BA672","#0EA86A"];
    segs.forEach(function (s, i) {
      s.style.background = i < score ? colors[score] : "#E2E8F0";
    });
    label.textContent = pw.length ? labels[score] || "" : "";
    label.style.color = labelColors[score] || "#94A3B8";
  }

  // ── AUTH FUNCTIONS ────────────────────────────
  async function doSignup(opts) {
    var res = await supabase.auth.signUp({
      email: opts.email, password: opts.password,
      options: {
        data: { name: opts.name.trim() },
        emailRedirectTo: window.location.origin + "/email-verified.html",
      },
    });
    return { data: res.data, error: res.error };
  }

  async function doLogin(opts) {
    var res = await supabase.auth.signInWithPassword({ email: opts.email, password: opts.password });
    if (!res.error && res.data.user) {
      var profile = saveUserLocal(res.data.user);
      if (!opts.remember) { profile.sessionOnly = true; localStorage.setItem("rk_user", JSON.stringify(profile)); }
    }
    return { data: res.data, error: res.error };
  }

  async function doForgotPassword(email) {
    var redirectUrl = window.location.origin + "/reset-password.html";
    var res = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    return { error: res.error };
  }

  function friendlyError(err) {
    if (!err) return "";
    var msg = err.message || "";
    if (msg.indexOf("User already registered") !== -1 || msg.indexOf("already registered") !== -1)
      return 'Yeh email pehle se registered hai! <a href="login.html">Login karein →</a>';
    if (msg.indexOf("Invalid login credentials") !== -1)
      return "Email ya password galat hai. Dobara try karein.";
    if (msg.indexOf("Email not confirmed") !== -1)
      return "Pehle email verify karein. Inbox check karein.";
    if (msg.indexOf("rate limit") !== -1 || msg.indexOf("Too many") !== -1)
      return "Zyada try kiya. 1 minute baad dobara karein.";
    if (msg.indexOf("network") !== -1 || msg.indexOf("fetch") !== -1)
      return "Network error. Internet check karein.";
    if (msg.indexOf("Password should be") !== -1)
      return "Password kam se kam 6 characters ka hona chahiye.";
    if (msg.indexOf("Auth session missing") !== -1 || msg.indexOf("session missing") !== -1)
      return "Reset link expire ho gaya ya pehle use ho chuka hai. Naya link mangwayein.";
    return msg || "Kuch error hua. Dobara try karein.";
  }

  // ── EXPOSE ────────────────────────────────────
  window.RKAuth = {
    supabase, getSession, redirectIfLoggedIn,
    saveUserLocal, getUserLocal, clearUserLocal,
    showMsg, hideMsg, setLoading, togglePass,
    getStrength, updateStrengthUI,
    doSignup, doLogin, doForgotPassword, friendlyError,
  };
})();
