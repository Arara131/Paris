import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_MONTHLY = 1500;
const CLEANING_FEE = 450;
const MONTHLY_TARGET = 10500;
const COST_PER_NIGHT = BASE_MONTHLY / 30;

const TIERS = {
  tier1: { label: "Amis", multiplier: 1.1, color: "#c8b89a", bg: "#faf6f0", text: "#7a5c3a", badge: "Friends" },
  tier2: { label: "Référés", multiplier: 2.3, color: "#8fa8c8", bg: "#eef4fb", text: "#2c4e72", badge: "Referral" },
  tier3: { label: "Marché", multiplier: MONTHLY_TARGET / BASE_MONTHLY, color: "#85a88a", bg: "#edf5ee", text: "#2d5233", badge: "Market" },
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcPrice(nights, tier) {
  return (COST_PER_NIGHT * nights + CLEANING_FEE) * TIERS[tier].multiplier;
}

function formatDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isSameDay(a, b) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function startOfDay(d) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

// ─── Supabase data functions ──────────────────────────────────────────────────
async function fetchBookingsFromDB() {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .order("start_date", { ascending: true });
  if (error) { console.error("Fetch error:", error); return []; }
  return data.map(b => ({
    id: b.id,
    guestName: b.guest_name || "",
    tier: b.tier,
    startDate: b.start_date,
    endDate: b.end_date,
    price: b.price,
    cleaningFee: b.cleaning_fee ?? CLEANING_FEE,
    notes: b.notes || "",
    status: b.status || "confirmed",
    createdAt: b.created_at,
  }));
}

async function insertBookingToDB(booking) {
  const { error } = await supabase.from("bookings").insert({
    guest_name: booking.guestName,
    tier: booking.tier,
    start_date: booking.startDate,
    end_date: booking.endDate,
    price: booking.price,
    cleaning_fee: booking.cleaningFee,
    notes: booking.notes || "",
    status: "confirmed",
  });
  if (error) throw error;
}

async function deleteBookingFromDB(id) {
  const { error } = await supabase.from("bookings").delete().eq("id", id);
  if (error) throw error;
}

// ─── Quote builder ────────────────────────────────────────────────────────────
function buildQuote(booking) {
  const nights = Math.ceil(
    (new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24)
  );
  const base = booking.price - (booking.cleaningFee || CLEANING_FEE);
  return `Bonjour ${booking.guestName || ""},

Here are the details for your upcoming stay at our Paris apartment:

  📍  159 Rue Montmartre, Paris 2ème

  Check-in:     ${formatDate(booking.startDate)}
  Check-out:    ${formatDate(booking.endDate)}
  Duration:     ${nights} night${nights !== 1 ? "s" : ""}

  Accommodation:  €${Math.round(base).toLocaleString()}
  Cleaning fee:   €${booking.cleaningFee || CLEANING_FEE}
  ───────────────────────────
  Total:          €${Math.round(booking.price).toLocaleString()}

We look forward to welcoming you.

À bientôt 🗝️`;
}

// ─── Login screen ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError("Incorrect email or password.");
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f7f3ee", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap'); * { box-sizing: border-box; margin: 0; padding: 0; }`}</style>
      <div style={{ background: "#fffdf9", borderRadius: 16, padding: "48px 44px", width: 360, border: "1px solid #e8dfd4" }}>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 28, color: "#2a1f14", marginBottom: 6 }}>Paris Rental</div>
          <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8c7a" }}>Management Portal</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ ...inputStyle, width: "100%" }} placeholder="you@example.com" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={{ ...inputStyle, width: "100%" }} placeholder="••••••••" />
        </div>
        {error && <div style={{ fontSize: 12, color: "#b04a2a", marginBottom: 14, padding: "8px 12px", background: "#fdf0ec", borderRadius: 6 }}>{error}</div>}
        <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: "13px 0", background: loading ? "#c8b89a" : "#2a1f14", border: "none", borderRadius: 10, color: "#f5ede2", fontSize: 13, letterSpacing: "0.08em", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ─── Calendar ─────────────────────────────────────────────────────────────────
function Calendar({ bookings, onRangeSelect, selectedRange }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hoverDate, setHoverDate] = useState(null);
  const [picking, setPicking] = useState(null);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((startPad + lastDay.getDate()) / 7) * 7 }, (_, i) => {
    const d = i - startPad + 1;
    return (d < 1 || d > lastDay.getDate()) ? null : new Date(viewYear, viewMonth, d);
  });

  const getBookingForDate = (date) =>
    bookings.find(b => {
      const s = startOfDay(b.startDate);
      const e = startOfDay(b.endDate);
      const d = startOfDay(date);
      return d >= s && d <= e;
    });

  const inSelectedRange = (date) => {
    const [s, e] = selectedRange;
    if (!s) return false;
    const end = e || hoverDate;
    if (!end) return isSameDay(date, s);
    const lo = s < end ? s : end;
    const hi = s < end ? end : s;
    return startOfDay(date) >= startOfDay(lo) && startOfDay(date) <= startOfDay(hi);
  };

  const handleDayClick = (date) => {
    if (!picking) {
      setPicking(date);
      onRangeSelect([date, null]);
    } else {
      const range = picking < date ? [picking, date] : [date, picking];
      onRangeSelect(range);
      setPicking(null);
    }
  };

  const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
  const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button onClick={prevMonth} style={navBtn}>‹</button>
        <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, letterSpacing: "0.06em", color: "#2a1f14" }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 6 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8c7a", paddingBottom: 6, fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px 0" }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const booking = getBookingForDate(date);
          const inSel = inSelectedRange(date);
          const isToday = isSameDay(date, today);
          const isPast = startOfDay(date) < startOfDay(today);
          const [selStart, selEnd] = selectedRange;
          const isEndpoint = (selStart && isSameDay(date, selStart)) || (selEnd && isSameDay(date, selEnd)) || (picking && isSameDay(date, picking));

          let bgColor = "transparent";
          let textColor = isPast ? "#c4b8aa" : "#2a1f14";
          let dot = null;

          if (booking) { bgColor = TIERS[booking.tier].bg; textColor = TIERS[booking.tier].text; dot = <div style={{ width: 4, height: 4, borderRadius: "50%", background: TIERS[booking.tier].color, margin: "2px auto 0" }} />; }
          if (inSel) { bgColor = "#e8dfd4"; textColor = "#5c3d1e"; }
          if (isEndpoint) { bgColor = "#b8997a"; textColor = "#fff"; }

          return (
            <div key={i} onClick={() => !isPast && handleDayClick(date)} onMouseEnter={() => picking && setHoverDate(date)} onMouseLeave={() => setHoverDate(null)}
              style={{ textAlign: "center", padding: "6px 2px", borderRadius: 6, cursor: isPast ? "default" : "pointer", background: bgColor, transition: "background 0.12s", outline: isToday ? "1.5px solid #b8997a" : "none", outlineOffset: -1 }}>
              <div style={{ fontSize: 13, fontWeight: isToday ? 600 : 400, color: textColor, lineHeight: 1.3 }}>{date.getDate()}</div>
              {dot}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Quote modal ──────────────────────────────────────────────────────────────
function QuoteModal({ booking, onClose }) {
  const [copied, setCopied] = useState(false);
  const text = buildQuote(booking);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEmail = () => {
    const subject = encodeURIComponent(`Your Paris stay — ${formatDate(booking.startDate)}`);
    const body = encodeURIComponent(text);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(30,20,10,0.45)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fffdf9", borderRadius: 16, padding: "32px 36px", width: 460, maxWidth: "92vw", border: "1px solid #e8dfd4" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 20, color: "#2a1f14" }}>Send Quote</span>
          <button onClick={onClose} style={navBtn}>×</button>
        </div>
        <pre style={{ background: "#f7f3ee", borderRadius: 10, padding: "16px 18px", fontSize: 12, lineHeight: 1.8, color: "#4a3828", whiteSpace: "pre-wrap", fontFamily: "'DM Sans', sans-serif", marginBottom: 20, border: "1px solid #e8dfd4", maxHeight: 280, overflowY: "auto" }}>
          {text}
        </pre>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={handleCopy} style={{ ...shareBtn, flex: 1, background: copied ? "#edf5ee" : "#f7f3ee", color: copied ? "#2d5233" : "#4a3828" }}>
            {copied ? "✓ Copied" : "Copy"}
          </button>
          <button onClick={handleWhatsApp} style={{ ...shareBtn, flex: 1, background: "#e8f5e9", color: "#2d5233" }}>
            WhatsApp
          </button>
          <button onClick={handleEmail} style={{ ...shareBtn, flex: 1, background: "#eef4fb", color: "#2c4e72" }}>
            Email
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#9e8c7a", textAlign: "center" }}>
          Copy → paste into any app · WhatsApp → opens web · Email → opens your mail client
        </p>
      </div>
    </div>
  );
}

// ─── Booking modal ────────────────────────────────────────────────────────────
function BookingModal({ booking, onDelete, onClose, onQuote }) {
  if (!booking) return null;
  const nights = Math.ceil((new Date(booking.endDate) - new Date(booking.startDate)) / (1000 * 60 * 60 * 24));
  const tier = TIERS[booking.tier];

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(30,20,10,0.38)", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#fffdf9", borderRadius: 16, padding: "32px 36px", minWidth: 340, maxWidth: "92vw", border: "1px solid #e8dfd4" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 24, color: "#2a1f14", marginBottom: 6 }}>
              {booking.guestName || "Unnamed Guest"}
            </div>
            <span style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", background: tier.bg, color: tier.text, borderRadius: 4, padding: "3px 8px", fontWeight: 600 }}>
              {tier.badge}
            </span>
          </div>
          <button onClick={onClose} style={{ ...navBtn, marginTop: 2 }}>×</button>
        </div>
        <div style={{ borderTop: "1px solid #e8dfd4", paddingTop: 20, marginBottom: 24 }}>
          {[
            ["Check-in", formatDate(booking.startDate)],
            ["Check-out", formatDate(booking.endDate)],
            ["Duration", `${nights} night${nights !== 1 ? "s" : ""}`],
            ["Cleaning fee", `€${booking.cleaningFee || CLEANING_FEE}`],
            ["Total", `€${Math.round(booking.price).toLocaleString()}`],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#9e8c7a" }}>{label}</span>
              <span style={{ fontSize: 15, color: "#2a1f14", fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <button onClick={() => onQuote(booking)} style={{ flex: 2, padding: "10px 0", background: "#2a1f14", border: "none", borderRadius: 8, color: "#f5ede2", fontSize: 13, letterSpacing: "0.05em", cursor: "pointer", fontFamily: "inherit" }}>
            Send Quote
          </button>
          <button onClick={onClose} style={{ flex: 1, padding: "10px 0", background: "none", border: "1px solid #e0d5c8", borderRadius: 8, color: "#9e8c7a", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Close
          </button>
        </div>
        <button onClick={() => onDelete(booking.id)} style={{ width: "100%", padding: "10px 0", background: "none", border: "1px solid #e8b8a8", borderRadius: 8, color: "#b04a2a", fontSize: 13, letterSpacing: "0.05em", cursor: "pointer", fontFamily: "inherit" }}>
          Remove booking
        </button>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function ParisBookingPortal() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tier, setTier] = useState("tier2");
  const [guestName, setGuestName] = useState("");
  const [selectedRange, setSelectedRange] = useState([null, null]);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [quoteBooking, setQuoteBooking] = useState(null);
  const [addError, setAddError] = useState("");
  const [lastSync, setLastSync] = useState(null);

  // ── Auth ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────
  const fetchBookings = useCallback(async () => {
    const data = await fetchBookingsFromDB();
    setBookings(data);
    setLastSync(new Date());
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchBookings().finally(() => setLoading(false));
  }, [session, fetchBookings]);

  // ── Real-time sync ───────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const channel = supabase
      .channel("bookings-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, fetchBookings)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [session, fetchBookings]);

  const [startDate, endDate] = selectedRange;
  const nights = startDate && endDate ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) : 0;
  const suggestedPrice = nights > 0 ? calcPrice(nights, tier) : 0;

  const hasOverlap = (start, end) =>
    bookings.some(b => startOfDay(start) <= startOfDay(b.endDate) && startOfDay(end) >= startOfDay(b.startDate));

  const addBooking = async () => {
    setAddError("");
    if (!startDate || !endDate) { setAddError("Please select a date range on the calendar."); return; }
    if (nights < 1) { setAddError("Check-out must be after check-in."); return; }
    if (hasOverlap(startDate, endDate)) { setAddError("These dates overlap with an existing booking."); return; }
    setSaving(true);
    try {
      await insertBookingToDB({
        guestName: guestName.trim(),
        tier,
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        price: suggestedPrice,
        cleaningFee: CLEANING_FEE,
      });
      setGuestName("");
      setSelectedRange([null, null]);
    } catch (e) {
      setAddError("Failed to save. Please try again.");
      console.error(e);
    }
    setSaving(false);
  };

  const deleteBooking = async (id) => {
    setSaving(true);
    try { await deleteBookingFromDB(id); setSelectedBooking(null); }
    catch (e) { console.error(e); }
    setSaving(false);
  };

  const totalRevenue = bookings.reduce((acc, b) => acc + b.price, 0);
  const totalNights = bookings.reduce((acc, b) => acc + Math.ceil((new Date(b.endDate) - new Date(b.startDate)) / (1000 * 60 * 60 * 24)), 0);

  if (authLoading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f3ee", fontFamily: "Georgia, serif", color: "#9e8c7a" }}>Loading…</div>;
  if (!session) return <LoginScreen />;
  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f7f3ee", fontFamily: "Georgia, serif", color: "#9e8c7a" }}>Loading reservations…</div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #f7f3ee; }
        input, select { font-family: 'DM Sans', sans-serif; }
        input:focus, select:focus { outline: 2px solid #b8997a; outline-offset: 1px; }
        button:focus-visible { outline: 2px solid #b8997a; outline-offset: 2px; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #d5c9bb; border-radius: 2px; }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#f7f3ee", fontFamily: "'DM Sans', sans-serif" }}>

        {/* Header */}
        <header style={{ background: "#2a1f14", padding: "0 40px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#f5ede2", letterSpacing: "0.05em" }}>Paris Rental</span>
            <span style={{ fontSize: 11, color: "#9e8c7a", letterSpacing: "0.12em", textTransform: "uppercase" }}>Management Portal</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {saving && <span style={{ fontSize: 11, color: "#c8b89a" }}>Saving…</span>}
            {lastSync && !saving && <span style={{ fontSize: 11, color: "#6b5c4e" }}>Synced {lastSync.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            <button onClick={fetchBookings} title="Refresh" style={{ background: "none", border: "1px solid #4a3828", borderRadius: 6, color: "#9e8c7a", fontSize: 14, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit" }}>↻</button>
            <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "1px solid #4a3828", borderRadius: 6, color: "#9e8c7a", fontSize: 11, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.06em" }}>Sign out</button>
          </div>
        </header>

        {/* Stats */}
        <div style={{ background: "#ede5da", borderBottom: "1px solid #ddd0c0", padding: "0 40px" }}>
          <div style={{ display: "flex" }}>
            {[
              { label: "Total Revenue", value: `€${Math.round(totalRevenue).toLocaleString()}` },
              { label: "Bookings", value: bookings.length },
              { label: "Nights Booked", value: totalNights },
              { label: "Avg / Night", value: totalNights > 0 ? `€${Math.round((totalRevenue - bookings.length * CLEANING_FEE) / totalNights)}` : "—" },
            ].map(({ label, value }, i) => (
              <div key={label} style={{ padding: "14px 32px", borderRight: i < 3 ? "1px solid #d5c9bb" : "none" }}>
                <div style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 3 }}>{label}</div>
                <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "#2a1f14" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, padding: "28px 40px", maxWidth: 1200, margin: "0 auto" }}>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Calendar */}
            <div style={{ background: "#fffdf9", borderRadius: 16, padding: 28, border: "1px solid #e8dfd4" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, letterSpacing: "0.06em", color: "#9e8c7a", marginBottom: 20, textTransform: "uppercase" }}>Availability</div>
              <Calendar bookings={bookings} selectedRange={selectedRange} onRangeSelect={setSelectedRange} />
              <div style={{ display: "flex", gap: 16, marginTop: 20, paddingTop: 16, borderTop: "1px solid #e8dfd4" }}>
                {Object.entries(TIERS).map(([key, t]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: t.color }} />
                    <span style={{ fontSize: 11, color: "#9e8c7a", letterSpacing: "0.06em" }}>{t.badge}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* New reservation */}
            <div style={{ background: "#fffdf9", borderRadius: 16, padding: 28, border: "1px solid #e8dfd4" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, letterSpacing: "0.06em", color: "#9e8c7a", marginBottom: 20, textTransform: "uppercase" }}>New Reservation</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={labelStyle}>Guest name</label>
                  <input value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="e.g. Marie Dupont" style={inputStyle} onKeyDown={e => e.key === "Enter" && addBooking()} />
                </div>
                <div>
                  <label style={labelStyle}>Pricing tier</label>
                  <select value={tier} onChange={e => setTier(e.target.value)} style={inputStyle}>
                    {Object.entries(TIERS).map(([key, t]) => <option key={key} value={key}>{t.badge} — {t.label}</option>)}
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
                    <div style={{ fontSize: 11, color: "#9e8c7a" }}>{nights} nights · {TIERS[tier].badge}</div>
                  </div>
                )}
              </div>
              {addError && <div style={{ fontSize: 12, color: "#b04a2a", marginBottom: 12, padding: "8px 12px", background: "#fdf0ec", borderRadius: 6 }}>{addError}</div>}
              <button onClick={addBooking} disabled={saving || !startDate || !endDate} style={{ width: "100%", padding: "13px 0", background: saving || !startDate || !endDate ? "#c8b89a" : "#2a1f14", border: "none", borderRadius: 10, color: "#f5ede2", fontSize: 13, letterSpacing: "0.08em", cursor: saving || !startDate || !endDate ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "background 0.15s" }}>
                {saving ? "Saving…" : "Confirm Reservation"}
              </button>
            </div>
          </div>

          {/* Bookings list */}
          <div>
            <div style={{ background: "#fffdf9", borderRadius: 16, padding: 28, border: "1px solid #e8dfd4" }}>
              <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 16, letterSpacing: "0.06em", color: "#9e8c7a", marginBottom: 20, textTransform: "uppercase", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span>Reservations</span>
                <span style={{ fontSize: 13, color: "#c8b89a" }}>{bookings.length} total</span>
              </div>
              {bookings.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: "#c8b89a" }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 18, marginBottom: 8 }}>No reservations yet</div>
                  <div style={{ fontSize: 12, letterSpacing: "0.06em" }}>Select dates on the calendar to begin</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bookings.map(b => {
                    const t = TIERS[b.tier];
                    const n = Math.ceil((new Date(b.endDate) - new Date(b.startDate)) / (1000 * 60 * 60 * 24));
                    const isPast = new Date(b.endDate) < new Date();
                    return (
                      <div key={b.id} onClick={() => setSelectedBooking(b)}
                        onMouseEnter={e => e.currentTarget.style.transform = "translateX(2px)"}
                        onMouseLeave={e => e.currentTarget.style.transform = "none"}
                        style={{ padding: "14px 16px", borderRadius: 10, cursor: "pointer", border: `1px solid ${isPast ? "#e8dfd4" : t.color}22`, background: isPast ? "#f7f3ee" : t.bg, display: "flex", alignItems: "center", justifyContent: "space-between", transition: "transform 0.1s", opacity: isPast ? 0.65 : 1 }}>
                        <div>
                          <div style={{ fontSize: 14, color: t.text, fontWeight: 500, marginBottom: 3 }}>{b.guestName || <em style={{ fontWeight: 400, opacity: 0.7 }}>Unnamed</em>}</div>
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
        </div>
      </div>

      <BookingModal booking={selectedBooking} onDelete={deleteBooking} onClose={() => setSelectedBooking(null)} onQuote={(b) => { setSelectedBooking(null); setQuoteBooking(b); }} />
      {quoteBooking && <QuoteModal booking={quoteBooking} onClose={() => setQuoteBooking(null)} />}
    </>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const navBtn = { background: "none", border: "1px solid #e0d5c8", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 18, color: "#9e8c7a", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 };
const shareBtn = { padding: "10px 0", border: "1px solid #e0d5c8", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.04em" };
const labelStyle = { display: "block", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9e8c7a", marginBottom: 6 };
const inputStyle = { width: "100%", padding: "9px 12px", background: "#f7f3ee", border: "1px solid #e0d5c8", borderRadius: 8, fontSize: 14, color: "#2a1f14", fontFamily: "'DM Sans', sans-serif" };