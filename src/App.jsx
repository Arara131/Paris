import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

// ─── Constants (overridden by settings from DB) ───────────────────────────────
const DEFAULT_SETTINGS = {
  base_monthly: 1500,
  cleaning_fee: 450,
  monthly_target: 10500,
  tier1_multiplier: 1.1,
  tier2_multiplier: 2.3,
  tier3_multiplier: 7.0,
};

const COST_CATEGORIES = [
  "Cleaning / linen",
  "Building charges (copropriété)",
  "Insurance",
  "Utilities",
  "Maintenance & repairs",
  "Restocking",
  "Concierge",
  "Tax (CFE, taxe foncière etc)",
  "Other",
];

const COST_TYPES = {
  booking:  { label: "Per Booking",  color: "#8fa8c8", bg: "#eef4fb", text: "#2c4e72" },
  monthly:  { label: "Monthly",      color: "#85a88a", bg: "#edf5ee", text: "#2d5233" },
  oneoff:   { label: "One-off",      color: "#c8b89a", bg: "#faf6f0", text: "#7a5c3a" },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Tier config (built from settings) ───────────────────────────────────────
function buildTiers(s) {
  return {
    tier1: { label: "Amis",    multiplier: s.tier1_multiplier, color: "#c8b89a", bg: "#faf6f0", text: "#7a5c3a", badge: "Friends"  },
    tier2: { label: "Référés", multiplier: s.tier2_multiplier, color: "#8fa8c8", bg: "#eef4fb", text: "#2c4e72", badge: "Referral" },
    tier3: { label: "Marché",  multiplier: s.tier3_multiplier, color: "#85a88a", bg: "#edf5ee", text: "#2d5233", badge: "Market"   },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcPrice(nights, tier, settings) {
  const tiers = buildTiers(settings);
  return (settings.base_monthly / 30 * nights + settings.cleaning_fee) * tiers[tier].multiplier;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function startOfDay(d) {
  const c = new Date(d); c.setHours(0,0,0,0); return c;
}

function nightsBetween(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24));
}

function bookingProfit(booking, costs) {
  const linked = costs.filter(c => c.bookingId === booking.id);
  const totalCosts = linked.reduce((s, c) => s + c.amount, 0);
  return booking.price - totalCosts;
}

// ─── Supabase data layer ──────────────────────────────────────────────────────
async function fetchBookingsFromDB() {
  const { data, error } = await supabase.from("bookings").select("*").order("start_date");
  if (error) { console.error(error); return []; }
  return data.map(b => ({
    id: b.id, guestName: b.guest_name || "", tier: b.tier,
    startDate: b.start_date, endDate: b.end_date,
    price: b.price, cleaningFee: b.cleaning_fee ?? 450,
    notes: b.notes || "", status: b.status || "confirmed",
    createdAt: b.created_at,
  }));
}

async function fetchCostsFromDB() {
  const { data, error } = await supabase.from("costs").select("*").order("date", { ascending: false });
  if (error) { console.error(error); return []; }
  return data.map(c => ({
    id: c.id, bookingId: c.booking_id, date: c.date,
    category: c.category, amount: c.amount,
    notes: c.notes || "", type: c.type,
  }));
}

async function fetchSettingsFromDB() {
  const { data, error } = await supabase.from("settings").select("*").eq("id", 1).single();
  if (error) return DEFAULT_SETTINGS;
  return data;
}

async function saveSettingsToDB(s) {
  const { error } = await supabase.from("settings").upsert({ id: 1, ...s });
  if (error) throw error;
}

async function insertBookingToDB(b) {
  const { error } = await supabase.from("bookings").insert({
    guest_name: b.guestName, tier: b.tier,
    start_date: b.startDate, end_date: b.endDate,
    price: b.price, cleaning_fee: b.cleaningFee,
    notes: b.notes || "", status: "confirmed",
  });
  if (error) throw error;
}

async function updateBookingInDB(id, b) {
  const { error } = await supabase.from("bookings").update({
    guest_name: b.guestName, tier: b.tier,
    start_date: b.startDate, end_date: b.endDate,
    price: b.price, cleaning_fee: b.cleaningFee,
    notes: b.notes || "",
  }).eq("id", id);
  if (error) throw error;
}

async function deleteBookingFromDB(id) {
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw error;
}

async function insertCostToDB(c) {
  const { error } = await supabase.from("costs").insert({
    booking_id: c.bookingId || null, date: c.date,
    category: c.category, amount: c.amount,
    notes: c.notes || "", type: c.type,
  });
  if (error) throw error;
}

async function deleteCostFromDB(id) {
  const { error } = await supabase.from("costs").delete().eq("id", id);
  if (error) throw error;
}

// ─── Quote builder ────────────────────────────────────────────────────────────
function buildQuote(booking) {
  const nights = nightsBetween(booking.startDate, booking.endDate);
  const accommodation = booking.price - (booking.cleaningFee ?? 450);
  const tierLabel = buildTiers(DEFAULT_SETTINGS)[booking.tier]?.badge || booking.tier;
  return `Bonjour${booking.guestName ? ` ${booking.guestName}` : ""},

Here are the details for your stay at our Paris apartment:

📍 159 Rue Montmartre, Paris 2ème

Check-in:       ${formatDate(booking.startDate)}
Check-out:      ${formatDate(booking.endDate)}
Duration:       ${nights} night${nights !== 1 ? "s" : ""}
Rate:           ${tierLabel}

Accommodation:  €${Math.round(accommodation).toLocaleString()}
Cleaning fee:   €${booking.cleaningFee ?? 450}
────────────────────────────
Total:          €${Math.round(booking.price).toLocaleString()}

We look forward to welcoming you to Paris.

À bientôt`;
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const navBtn = {
  background: "none", border: "1px solid #e0d5c8", borderRadius: 6,
  width: 28, height: 28, cursor: "pointer", fontSize: 18, color: "#9e8c7a",
  display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
};
const labelStyle = {
  display: "block", fontSize: 10, letterSpacing: "0.1em",
  textTransform: "uppercase", color: "#9e8c7a", marginBottom: 6,
};
const inputStyle = {
  width: "100%", padding: "9px 12px", background: "#f7f3ee",
  border: "1px solid #e0d5c8", borderRadius: 8, fontSize: 14,
  color: "#2a1f14", fontFamily: "'DM Sans', sans-serif",
};
const cardStyle = {
  background: "#fffdf9", borderRadius: 16, padding: 28, border: "1px solid #e8dfd4",
};
const sectionTitle = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: 16, letterSpacing: "0.06em", color: "#9e8c7a",
  marginBottom: 20, textTransform: "uppercase",
};

function shareBtn(bg, color) {
  return { flex: 1, padding: "9px 0", background: bg, border: "none", borderRadius: 8, color, fontSize: 12, letterSpacing: "0.05em", cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "opacity 0.15s" };
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("Incorrect email or password.");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f3ee", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');`}</style>
      <div style={{ ...cardStyle, width: "100%", maxWidth: 400, padding: "48px 52px", boxShadow: "0 24px 64px rgba(30,20,10,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: "#2a1f14", marginBottom: 6 }}>Paris Rental</div>
          <div style={{ fontSize: 11, color: "#9e8c7a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Management Portal</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="your@email.com" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" style={inputStyle} />
        </div>
        {error && <div style={{ fontSize: 12, color: "#b04a2a", marginBottom: 16, padding: "8px 12px", background: "#fdf0ec", borderRadius: 6 }}>{error}</div>}
        <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: "13px 0", background: loading ? "#c8b89a" : "#2a1f14", border: "none", borderRadius: 10, color: "#f5ede2", fontSize: 13, letterSpacing: "0.08em", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function Calendar({ bookings, onRangeSelect, selectedRange, tiers }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hoverDate, setHoverDate] = useState(null);
  const [picking, setPicking] = useState(null);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay  = new Date(viewYear, viewMonth + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((startPad + lastDay.getDate()) / 7) * 7 }, (_, i) => {
    const d = i - startPad + 1;
    return (d < 1 || d > lastDay.getDate()) ? null : new Date(viewYear, viewMonth, d);
  });

  const getBookingForDate = date => bookings.find(b => {
    const d = startOfDay(date);
    return d >= startOfDay(new Date(b.startDate)) && d <= startOfDay(new Date(b.endDate));
  });

  const inSelectedRange = date => {
    const [s, e] = selectedRange;
    if (!s) return false;
    const end = e || hoverDate;
    if (!end) return isSameDay(date, s);
    const lo = s < end ? s : end, hi = s < end ? end : s;
    return startOfDay(date) >= startOfDay(lo) && startOfDay(date) <= startOfDay(hi);
  };

  const handleDayClick = date => {
    if (!picking) { setPicking(date); onRangeSelect([date, null]); }
    else { onRangeSelect(picking < date ? [picking, date] : [date, picking]); setPicking(null); }
  };

  const prev = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y-1)) : setViewMonth(m => m-1);
  const next = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y+1)) : setViewMonth(m => m+1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={prev} style={navBtn}>‹</button>
        <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, letterSpacing: "0.06em", color: "#2a1f14" }}>{MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={next} style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8c7a", paddingBottom: 6, fontWeight: 600 }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const bk = getBookingForDate(date);
          const inSel = inSelectedRange(date);
          const isToday = isSameDay(date, today);
          const isPast  = startOfDay(date) < startOfDay(today);
          const [ss, se] = selectedRange;
          const isEndpoint = (ss && isSameDay(date, ss)) || (se && isSameDay(date, se)) || (picking && isSameDay(date, picking));
          let bg = "transparent", fg = isPast ? "#c4b8aa" : "#2a1f14";
          if (bk)         { bg = tiers[bk.tier].bg;  fg = tiers[bk.tier].text; }
          if (inSel)      { bg = "#e8dfd4"; fg = "#5c3d1e"; }
          if (isEndpoint) { bg = "#b8997a"; fg = "#fff"; }
          return (
            <div key={i} onClick={() => !isPast && handleDayClick(date)}
              onMouseEnter={() => picking && setHoverDate(date)}
              onMouseLeave={() => setHoverDate(null)}
              style={{ textAlign: "center", padding: "6px 2px", borderRadius: 6, cursor: isPast ? "default" : "pointer", background: bg, transition: "background 0.12s", outline: isToday ? "1.5px solid #b8997a" : "none", outlineOffset: -1 }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 600 : 400, color: fg, lineHeight: 1.3 }}>{date.getDate()}</div>
              {bk && <div style={{ width: 4, height: 4, borderRadius: "50%", background: tiers[bk.tier].color, margin: "2px auto 0" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Booking Modal (view + edit) ──────────────────────────────────────────────
function BookingModal({ booking, costs, onSave, onDelete, onClose, settings }) {
  const tiers = buildTiers(settings);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [form, setForm] = useState({
    guestName:   booking.guestName,
    tier:        booking.tier,
    startDate:   booking.startDate,
    endDate:     booking.endDate,
    price:       booking.price,
    cleaningFee: booking.cleaningFee ?? settings.cleaning_fee,
    notes:       booking.notes,
  });

  const nights       = nightsBetween(form.startDate, form.endDate);
  const suggested    = calcPrice(nights, form.tier, settings);
  const linkedCosts  = costs.filter(c => c.bookingId === booking.id);
  const totalLinked  = linkedCosts.reduce((s, c) => s + c.amount, 0);
  const profit       = form.price - totalLinked;
  const isLoss       = profit < 0;
  const tier         = tiers[booking.tier];

  const handleSave = async () => {
    setSaving(true);
    await onSave(booking.id, form);
    setSaving(false); setEditing(false);
  };

  const handleCopy      = () => { navigator.clipboard.writeText(buildQuote(booking)); setCopied(true); setTimeout(() => setCopied(false), 2500); };
  const handleEmail     = () => window.open(`mailto:?subject=${encodeURIComponent(`Your Paris stay — ${formatDate(booking.startDate)}`)}&body=${encodeURIComponent(buildQuote(booking))}`);
  const handleWhatsApp  = () => window.open(`https://wa.me/?text=${encodeURIComponent(buildQuote(booking))}`);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(30,20,10,0.38)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fffdf9", borderRadius: 16, padding: "32px 36px", width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(30,20,10,0.18)", border: "1px solid #e8dfd4" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, color: "#2a1f14", marginBottom: 4 }}>
              {editing ? "Edit Reservation" : (booking.guestName || "Unnamed Guest")}
            </div>
            {!editing && <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", background: tier.bg, color: tier.text, borderRadius: 4, padding: "3px 8px", fontWeight: 600 }}>{tier.badge}</span>}
          </div>
          <button onClick={onClose} style={{ ...navBtn, marginTop: 2 }}>×</button>
        </div>

        {/* ── View mode ── */}
        {!editing && <>
          <div style={{ borderTop: "1px solid #e8dfd4", paddingTop: 20, marginBottom: 20 }}>
            {[
              ["Check-in",  formatDate(booking.startDate)],
              ["Check-out", formatDate(booking.endDate)],
              ["Duration",  `${nights} night${nights !== 1 ? "s" : ""}`],
              ["Cleaning",  `€${booking.cleaningFee ?? settings.cleaning_fee}`],
              ["Total",     `€${Math.round(booking.price).toLocaleString()}`],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9e8c7a" }}>{label}</span>
                <span style={{ fontSize: 15, color: "#2a1f14", fontWeight: 500 }}>{value}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8, paddingTop: 8, borderTop: "1px solid #e8dfd4" }}>
              <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: isLoss ? "#b04a2a" : "#5a8a5a" }}>Net Profit</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: isLoss ? "#b04a2a" : "#5a8a5a" }}>
                {isLoss ? "▼ " : "▲ "}€{Math.abs(Math.round(profit)).toLocaleString()}{isLoss && " ⚠"}
              </span>
            </div>
          </div>

          {linkedCosts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 8 }}>Linked Costs</div>
              {linkedCosts.map(c => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#4a3828", marginBottom: 4 }}>
                  <span>{c.category}</span><span>€{Math.round(c.amount).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          {booking.notes && (
            <div style={{ background: "#f7f3ee", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#4a3828", fontStyle: "italic" }}>{booking.notes}</div>
          )}

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 10 }}>Send Quote</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleEmail}   style={shareBtn("#2a1f14", "#f5ede2")}>✉ Email</button>
              <button onClick={handleWhatsApp} style={shareBtn("#25D366", "#fff")}>WhatsApp</button>
              <button onClick={handleCopy}    style={shareBtn(copied ? "#5a8a5a" : "#e8dfd4", copied ? "#fff" : "#2a1f14")}>{copied ? "✓ Copied" : "Copy"}</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, borderTop: "1px solid #e8dfd4", paddingTop: 16 }}>
            <button onClick={() => setEditing(true)}       style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid #e0d5c8", borderRadius: 8, color: "#2a1f14", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
            <button onClick={() => onDelete(booking.id)}  style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid #e8b8a8", borderRadius: 8, color: "#b04a2a", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            <button onClick={onClose}                      style={{ flex: 1, padding: "10px 0", background: "#2a1f14", border: "none", borderRadius: 8, color: "#f5ede2", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
          </div>
        </>}

        {/* ── Edit mode ── */}
        {editing && <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Guest name</label>
              <input value={form.guestName} onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Check-in</label>
              <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Check-out</label>
              <input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Tier</label>
              <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))} style={inputStyle}>
                {Object.entries(tiers).map(([k, t]) => <option key={k} value={k}>{t.badge} — {t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Cleaning fee (€)</label>
              <input type="number" value={form.cleaningFee} onChange={e => setForm(f => ({ ...f, cleaningFee: parseFloat(e.target.value) || 0 }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>
                Agreed price (€)
                <span style={{ color: "#b8997a", textTransform: "none", letterSpacing: 0, marginLeft: 6, fontWeight: 400 }}>
                  suggested: €{Math.round(suggested).toLocaleString()}
                </span>
              </label>
              <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))} style={inputStyle} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Private notes</label>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setEditing(false)} style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid #e0d5c8", borderRadius: 8, color: "#9e8c7a", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: "10px 0", background: saving ? "#c8b89a" : "#2a1f14", border: "none", borderRadius: 8, color: "#f5ede2", fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </>}
      </div>
    </div>
  );
}

// ─── Costs Tab ────────────────────────────────────────────────────────────────
function CostsTab({ costs, bookings, settings, onAddCost, onDeleteCost, statPeriod }) {
  const [form, setForm] = useState({
    type: "oneoff", category: COST_CATEGORIES[0], amount: "",
    date: new Date().toISOString().split("T")[0], notes: "", bookingId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const now = new Date();
  const filteredCosts = costs.filter(c => {
    const d = new Date(c.date);
    if (statPeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (statPeriod === "year")  return d.getFullYear() === now.getFullYear();
    return true;
  });
  const filteredRevenue = bookings.filter(b => {
    const d = new Date(b.startDate);
    if (statPeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (statPeriod === "year")  return d.getFullYear() === now.getFullYear();
    return true;
  }).reduce((s, b) => s + b.price, 0);

  const totalCosts = filteredCosts.reduce((s, c) => s + c.amount, 0);
  const netProfit  = filteredRevenue - totalCosts;

  const byCategory = COST_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = filteredCosts.filter(c => c.category === cat).reduce((s, c) => s + c.amount, 0);
    return acc;
  }, {});

  const handleAdd = async () => {
    setError("");
    if (!form.amount || isNaN(parseFloat(form.amount))) { setError("Please enter a valid amount."); return; }
    setSaving(true);
    try {
      await onAddCost({ ...form, amount: parseFloat(form.amount), bookingId: form.bookingId || null });
      setForm(f => ({ ...f, amount: "", notes: "", bookingId: "" }));
    } catch { setError("Could not save. Please try again."); }
    setSaving(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "Revenue",    value: `€${Math.round(filteredRevenue).toLocaleString()}`, color: "#2d5233" },
            { label: "Costs",      value: `€${Math.round(totalCosts).toLocaleString()}`,      color: "#b04a2a" },
            { label: "Net Profit", value: `€${Math.round(netProfit).toLocaleString()}`,        color: netProfit >= 0 ? "#2d5233" : "#b04a2a" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#fffdf9", borderRadius: 12, padding: "16px 20px", border: "1px solid #e8dfd4" }}>
              <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 6 }}>{label}</div>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, color }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Add cost form */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Log a Cost</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                {Object.entries(COST_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inputStyle}>
                {COST_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Amount (€)</label>
              <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
            </div>
            {form.type === "booking" && (
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Link to booking</label>
                <select value={form.bookingId} onChange={e => setForm(f => ({ ...f, bookingId: e.target.value }))} style={inputStyle}>
                  <option value="">— select booking —</option>
                  {bookings.map(b => <option key={b.id} value={b.id}>{b.guestName || "Unnamed"} · {formatDate(b.startDate)}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={labelStyle}>Notes (optional)</label>
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Plumber callout, burst pipe" style={inputStyle} />
            </div>
          </div>
          {error && <div style={{ fontSize: 12, color: "#b04a2a", marginBottom: 12, padding: "8px 12px", background: "#fdf0ec", borderRadius: 6 }}>{error}</div>}
          <button onClick={handleAdd} disabled={saving} style={{ width: "100%", padding: "13px 0", background: saving ? "#c8b89a" : "#2a1f14", border: "none", borderRadius: 10, color: "#f5ede2", fontSize: 13, letterSpacing: "0.08em", cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
            {saving ? "Saving…" : "Log Cost"}
          </button>
        </div>

        {/* Cost list */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Cost History</div>
          {filteredCosts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#c8b89a" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, marginBottom: 6 }}>No costs logged</div>
              <div style={{ fontSize: 12 }}>for this period</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredCosts.map(c => {
                const ct = COST_TYPES[c.type];
                const linked = c.bookingId ? bookings.find(b => b.id === c.bookingId) : null;
                return (
                  <div key={c.id} style={{ padding: "12px 16px", borderRadius: 10, background: ct.bg, border: `1px solid ${ct.color}22`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, color: ct.text, fontWeight: 500, marginBottom: 2 }}>{c.category}</div>
                      <div style={{ fontSize: 11, color: ct.text, opacity: 0.7 }}>
                        {formatDate(c.date)} · {ct.label}{linked && ` · ${linked.guestName || "Unnamed"}`}
                      </div>
                      {c.notes && <div style={{ fontSize: 11, color: ct.text, opacity: 0.6, fontStyle: "italic", marginTop: 2 }}>{c.notes}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, color: ct.text }}>€{Math.round(c.amount).toLocaleString()}</div>
                      <button onClick={() => onDeleteCost(c.id)} style={{ background: "none", border: "none", color: ct.text, opacity: 0.4, cursor: "pointer", fontSize: 16, padding: 0 }}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: category breakdown */}
      <div style={cardStyle}>
        <div style={sectionTitle}>By Category</div>
        {COST_CATEGORIES.map(cat => {
          const amt = byCategory[cat] || 0;
          if (amt === 0) return null;
          const pct = totalCosts > 0 ? (amt / totalCosts) * 100 : 0;
          return (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: "#4a3828" }}>{cat}</span>
                <span style={{ fontSize: 12, color: "#2a1f14", fontWeight: 500 }}>€{Math.round(amt).toLocaleString()}</span>
              </div>
              <div style={{ height: 4, background: "#e8dfd4", borderRadius: 2 }}>
                <div style={{ height: 4, background: "#b8997a", borderRadius: 2, width: `${pct}%`, transition: "width 0.3s" }} />
              </div>
            </div>
          );
        })}
        {totalCosts === 0 && <div style={{ textAlign: "center", padding: "20px 0", color: "#c8b89a", fontSize: 13 }}>No costs for this period</div>}
      </div>
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ settings, onSave }) {
  const [form, setForm] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const field = (label, key, hint) => (
    <div>
      <label style={labelStyle}>
        {label}
        {hint && <span style={{ color: "#b8997a", textTransform: "none", letterSpacing: 0, marginLeft: 6, fontWeight: 400 }}>{hint}</span>}
      </label>
      <input type="number" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))} style={inputStyle} step="0.01" />
    </div>
  );

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={cardStyle}>
        <div style={sectionTitle}>Pricing Constants</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          {field("Base monthly cost (€)", "base_monthly", "used to calculate cost/night")}
          {field("Default cleaning fee (€)", "cleaning_fee", "applied to all new bookings")}
          {field("Monthly revenue target (€)", "monthly_target", "used for progress tracking")}
        </div>

        <div style={sectionTitle}>Tier Multipliers</div>
        <div style={{ marginBottom: 8, fontSize: 12, color: "#9e8c7a", marginTop: -12 }}>
          Price = (cost/night × nights + cleaning fee) × multiplier
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 28 }}>
          {field("Friends", "tier1_multiplier")}
          {field("Referral", "tier2_multiplier")}
          {field("Market",   "tier3_multiplier")}
        </div>

        {/* Live preview */}
        <div style={{ background: "#f7f3ee", borderRadius: 10, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 12 }}>Live preview — 7 nights</div>
          <div style={{ display: "flex", gap: 32 }}>
            {["tier1","tier2","tier3"].map(t => {
              const tiers = buildTiers(form);
              const price = calcPrice(7, t, form);
              return (
                <div key={t}>
                  <div style={{ fontSize: 11, color: tiers[t].text, marginBottom: 2 }}>{tiers[t].badge}</div>
                  <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#2a1f14" }}>€{Math.round(price).toLocaleString()}</div>
                </div>
              );
            })}
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} style={{ width: "100%", padding: "13px 0", background: saved ? "#5a8a5a" : saving ? "#c8b89a" : "#2a1f14", border: "none", borderRadius: 10, color: "#f5ede2", fontSize: 13, letterSpacing: "0.08em", cursor: saving ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "background 0.3s" }}>
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function ParisBookingPortal() {
  const [session,   setSession]   = useState(undefined);
  const [bookings,  setBookings]  = useState([]);
  const [costs,     setCosts]     = useState([]);
  const [settings,  setSettings]  = useState(DEFAULT_SETTINGS);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [tab,       setTab]       = useState("bookings");
  const [statPeriod,setStatPeriod]= useState("month");
  const [tier,      setTier]      = useState("tier2");
  const [guestName, setGuestName] = useState("");
  const [selectedRange,   setSelectedRange]   = useState([null, null]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [addError,  setAddError]  = useState("");
  const [lastSync,  setLastSync]  = useState(null);

  const tiers = buildTiers(settings);

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: l } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => l.subscription.unsubscribe();
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    const [b, c, s] = await Promise.all([fetchBookingsFromDB(), fetchCostsFromDB(), fetchSettingsFromDB()]);
    setBookings(b); setCosts(c); setSettings(s);
    setLastSync(new Date());
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchAll().finally(() => setLoading(false));
  }, [session, fetchAll]);

  // ── Real-time ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const bCh = supabase.channel("brt").on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, fetchAll).subscribe();
    const cCh = supabase.channel("crt").on("postgres_changes", { event: "*", schema: "public", table: "costs"    }, fetchAll).subscribe();
    return () => { supabase.removeChannel(bCh); supabase.removeChannel(cCh); };
  }, [session, fetchAll]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const [startDate, endDate] = selectedRange;
  const nights       = startDate && endDate ? nightsBetween(startDate, endDate) : 0;
  const suggestedPrice = nights > 0 ? calcPrice(nights, tier, settings) : 0;

  const hasOverlap = (s, e) => bookings.some(b =>
    startOfDay(s) <= startOfDay(new Date(b.endDate)) && startOfDay(e) >= startOfDay(new Date(b.startDate))
  );

  const now = new Date();
  const filteredBookings = bookings.filter(b => {
    const d = new Date(b.startDate);
    if (statPeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (statPeriod === "year")  return d.getFullYear() === now.getFullYear();
    return true;
  });
  const totalRevenue = filteredBookings.reduce((s, b) => s + b.price, 0);
  const totalNights  = filteredBookings.reduce((s, b) => s + nightsBetween(b.startDate, b.endDate), 0);

  // ── Actions ──────────────────────────────────────────────────────────────
  const addBooking = async () => {
    setAddError("");
    if (!startDate || !endDate)         { setAddError("Please select a date range."); return; }
    if (nights < 1)                     { setAddError("Check-out must be after check-in."); return; }
    if (hasOverlap(startDate, endDate)) { setAddError("These dates overlap with an existing booking."); return; }
    setSaving(true);
    try {
      await insertBookingToDB({ guestName: guestName.trim(), tier, startDate: startDate.toISOString().split("T")[0], endDate: endDate.toISOString().split("T")[0], price: suggestedPrice, cleaningFee: settings.cleaning_fee });
      setGuestName(""); setSelectedRange([null, null]);
    } catch { setAddError("Could not save. Please try again."); }
    setSaving(false);
  };

  const saveBooking  = async (id, form) => { await updateBookingInDB(id, form); };
  const deleteBooking = async (id) => { setSaving(true); await deleteBookingFromDB(id); setSelectedBooking(null); setSaving(false); };
  const addCost      = async (cost) => { await insertCostToDB(cost); };
  const deleteCost   = async (id)   => { await deleteCostFromDB(id); };
  const saveSettings = async (s)    => { await saveSettingsToDB(s); setSettings(s); };

  // ── Guards ───────────────────────────────────────────────────────────────
  if (session === undefined || loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f3ee" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#9e8c7a", letterSpacing: "0.1em" }}>Loading…</div>
      </div>
    );
  }
  if (!session) return <LoginScreen />;

  // ── Costs stats for header (when on costs tab) ───────────────────────────
  const filteredCostsForHeader = costs.filter(c => {
    const d = new Date(c.date);
    if (statPeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (statPeriod === "year")  return d.getFullYear() === now.getFullYear();
    return true;
  });
  const headerCostTotal  = filteredCostsForHeader.reduce((s, c) => s + c.amount, 0);
  const headerNetProfit  = totalRevenue - headerCostTotal;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f7f3ee; }
        input, select, textarea { font-family: 'DM Sans', sans-serif; }
        input:focus, select:focus, textarea:focus { outline: 2px solid #b8997a; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid #b8997a; outline-offset: 2px; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #d5c9bb; border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f7f3ee", fontFamily: "'DM Sans', sans-serif" }}>

        {/* ── Header ── */}
        <header style={{ background: "#2a1f14", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#f5ede2", letterSpacing: "0.05em" }}>Paris Rental</span>
            <span style={{ fontSize: 11, color: "#9e8c7a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Management Portal</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["bookings","Calendar"],["costs","Costs"],["settings","Settings"]].map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} style={{ padding: "6px 16px", background: tab === key ? "#f5ede2" : "none", border: "1px solid", borderColor: tab === key ? "#f5ede2" : "#4a3828", borderRadius: 6, color: tab === key ? "#2a1f14" : "#9e8c7a", fontSize: 12, letterSpacing: "0.06em", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {saving && <span style={{ fontSize: 11, color: "#c8b89a" }}>Saving…</span>}
            {lastSync && !saving && <span style={{ fontSize: 11, color: "#6b5c4e" }}>Synced {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            <button onClick={fetchAll} style={{ background: "none", border: "1px solid #4a3828", borderRadius: 6, color: "#9e8c7a", fontSize: 14, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>↻</button>
            <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "1px solid #4a3828", borderRadius: 6, color: "#9e8c7a", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}>Sign out</button>
          </div>
        </header>

        {/* ── Stats strip ── */}
        <div style={{ background: "#ede5da", borderBottom: "1px solid #ddd0c0", padding: "0 40px" }}>
          <div style={{ display: "flex", alignItems: "stretch" }}>
            {/* Period toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "12px 24px 12px 0", borderRight: "1px solid #d5c9bb" }}>
              {[["month","Month"],["year","Year"],["all","All"]].map(([key, label]) => (
                <button key={key} onClick={() => setStatPeriod(key)} style={{ padding: "4px 10px", background: statPeriod === key ? "#2a1f14" : "none", border: "1px solid", borderColor: statPeriod === key ? "#2a1f14" : "#d5c9bb", borderRadius: 4, color: statPeriod === key ? "#f5ede2" : "#9e8c7a", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Booking stats */}
            {tab !== "costs" && [
              { label: statPeriod === "month" ? "Revenue This Month" : statPeriod === "year" ? "Revenue This Year" : "Total Revenue", value: `€${Math.round(totalRevenue).toLocaleString()}` },
              { label: "Bookings",      value: filteredBookings.length },
              { label: "Nights Booked", value: totalNights },
              { label: "Avg / Night",   value: totalNights > 0 ? `€${Math.round((totalRevenue - filteredBookings.length * settings.cleaning_fee) / totalNights)}` : "—" },
            ].map(({ label, value }, i, arr) => (
              <div key={label} style={{ padding: "14px 32px", borderRight: i < arr.length - 1 ? "1px solid #d5c9bb" : "none" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#2a1f14" }}>{value}</div>
              </div>
            ))}

            {/* Cost stats */}
            {tab === "costs" && [
              { label: "Revenue",    value: `€${Math.round(totalRevenue).toLocaleString()}`,      color: "#2d5233" },
              { label: "Costs",      value: `€${Math.round(headerCostTotal).toLocaleString()}`,   color: "#b04a2a" },
              { label: "Net Profit", value: `€${Math.round(headerNetProfit).toLocaleString()}`,   color: headerNetProfit >= 0 ? "#2d5233" : "#b04a2a" },
            ].map(({ label, value, color }, i) => (
              <div key={label} style={{ padding: "14px 32px", borderRight: i < 2 ? "1px solid #d5c9bb" : "none" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tab content ── */}
        <div style={{ padding: "28px 40px", maxWidth: 1200, margin: "0 auto" }}>

          {tab === "bookings" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Calendar */}
                <div style={cardStyle}>
                  <div style={sectionTitle}>Availability</div>
                  <Calendar bookings={bookings} selectedRange={selectedRange} onRangeSelect={setSelectedRange} tiers={tiers} />
                  <div style={{ display: "flex", gap: 16, marginTop: 20, paddingTop: 16, borderTop: "1px solid #e8dfd4" }}>
                    {Object.entries(tiers).map(([key, t]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.color }} />
                        <span style={{ fontSize: 11, color: "#9e8c7a", letterSpacing: "0.06em" }}>{t.badge}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* New booking */}
                <div style={cardStyle}>
                  <div style={sectionTitle}>New Reservation</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={labelStyle}>Guest name</label>
                      <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="e.g. Marie Dupont" style={inputStyle} onKeyDown={e => e.key === "Enter" && addBooking()} />
                    </div>
                    <div>
                      <label style={labelStyle}>Pricing tier</label>
                      <select value={tier} onChange={e => setTier(e.target.value)} style={inputStyle}>
                        {Object.entries(tiers).map(([key, t]) => <option key={key} value={key}>{t.badge} — {t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ background: "#f7f3ee", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 3 }}>Selected dates</div>
                      <div style={{ fontSize: 14, color: "#2a1f14" }}>
                        {startDate ? <>{formatDate(startDate)} → {endDate ? formatDate(endDate) : <em style={{ color: "#b8997a" }}>pick end date</em>}</> : <span style={{ color: "#b8997a", fontStyle: "italic" }}>Click calendar to select dates</span>}
                      </div>
                    </div>
                    {nights > 0 && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 3 }}>Suggested</div>
                        <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#2a1f14" }}>€{Math.round(suggestedPrice).toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "#9e8c7a" }}>{nights} nights · {tiers[tier].badge}</div>
                      </div>
                    )}
                  </div>
                  {addError && <div style={{ fontSize: 12, color: "#b04a2a", marginBottom: 12, padding: "8px 12px", background: "#fdf0ec", borderRadius: 6 }}>{addError}</div>}
                  <button onClick={addBooking} disabled={saving || !startDate || !endDate} style={{ width: "100%", padding: "13px 0", background: saving || !startDate || !endDate ? "#c8b89a" : "#2a1f14", border: "none", borderRadius: 10, color: "#f5ede2", fontSize: 13, letterSpacing: "0.08em", cursor: saving || !startDate || !endDate ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
                    {saving ? "Saving…" : "Confirm Reservation"}
                  </button>
                </div>
              </div>

              {/* Bookings list */}
              <div style={cardStyle}>
                <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span>Reservations</span>
                  <span style={{ fontSize: 13, color: "#c8b89a" }}>{bookings.length} total</span>
                </div>
                {bookings.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "#c8b89a" }}>
                    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, marginBottom: 8 }}>No reservations yet</div>
                    <div style={{ fontSize: 12 }}>Select dates on the calendar to begin</div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {bookings.map(b => {
                      const t = tiers[b.tier];
                      const n = nightsBetween(b.startDate, b.endDate);
                      const isPast = new Date(b.endDate) < new Date();
                      const profit = bookingProfit(b, costs);
                      const isLoss = profit < 0;
                      return (
                        <div key={b.id} onClick={() => setSelectedBooking(b)}
                          style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${isPast ? "#e8dfd4" : t.color}22`, background: isPast ? "#f7f3ee" : t.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "transform 0.1s", opacity: isPast ? 0.65 : 1 }}
                          onMouseEnter={e => { e.currentTarget.style.transform = "translateX(2px)"; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}>
                          <div>
                            <div style={{ fontSize: 14, color: t.text, fontWeight: 500, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
                              {b.guestName || <em style={{ fontWeight: 400, opacity: 0.7 }}>Unnamed</em>}
                              {isLoss && <span style={{ fontSize: 10, background: "#fdf0ec", color: "#b04a2a", borderRadius: 3, padding: "1px 5px" }}>⚠ loss</span>}
                            </div>
                            <div style={{ fontSize: 11, color: isPast ? "#b8a898" : t.text, opacity: 0.75 }}>{formatDate(b.startDate)} · {n}n</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, color: t.text }}>€{Math.round(b.price).toLocaleString()}</div>
                            <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: t.text, opacity: 0.65, marginTop: 2 }}>{t.badge}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "costs" && (
            <CostsTab costs={costs} bookings={bookings} settings={settings} onAddCost={addCost} onDeleteCost={deleteCost} statPeriod={statPeriod} />
          )}

          {tab === "settings" && (
            <SettingsTab settings={settings} onSave={saveSettings} />
          )}
        </div>
      </div>

      {selectedBooking && (
        <BookingModal
          booking={selectedBooking}
          costs={costs}
          onSave={saveBooking}
          onDelete={deleteBooking}
          onClose={() => setSelectedBooking(null)}
          settings={settings}
        />
      )}
    </>
  );
}