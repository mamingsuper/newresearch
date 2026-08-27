import { useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Crosshair, Books, BookmarkSimple, ChatTeardropText,
  UploadSimple, User, SignIn, Sun, Moon, List, X, Globe,
  ArrowRight
} from "@phosphor-icons/react";
import { useApp } from "../context/AppContext";
import { t } from "../i18n";
import { AuthModal } from "./AuthModal";
import { PaywallModal } from "./PaywallModal";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useReveal } from "../hooks/useReveal";

const NAV = [
  { to: "/",              icon: Crosshair,         key: "nav_new_analysis"      as const },
  { to: "/library",       icon: Books,             key: "nav_conference_library" as const },
  { to: "/papers",        icon: BookmarkSimple,    key: "nav_saved_papers"      as const },
  { to: "/conversations", icon: ChatTeardropText,  key: "nav_conversations"     as const },
  { to: "/submit",        icon: UploadSimple,      key: "nav_submit_program"    as const },
];

/* ── Radar logo mark ──────────────────────────────────────── */
function RadarMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" opacity="0.25"/>
      <circle cx="14" cy="14" r="7.5" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
      <circle cx="14" cy="14" r="3"   stroke="currentColor" strokeWidth="1.5"/>
      <line x1="14" y1="2"  x2="14" y2="26" stroke="currentColor" strokeWidth="0.8" opacity="0.2"/>
      <line x1="2"  y1="14" x2="26" y2="14" stroke="currentColor" strokeWidth="0.8" opacity="0.2"/>
      <circle cx="14" cy="14" r="1.8" fill="currentColor"/>
      {/* sweep arm */}
      <g className="radar-mark-sweep">
        <line x1="14" y1="14" x2="23" y2="7" stroke="currentColor" strokeWidth="1.2" opacity="0.6" strokeLinecap="round"/>
        <circle cx="23" cy="7" r="1.3" fill="currentColor" opacity="0.8"/>
      </g>
    </svg>
  );
}

/* ── Corpus status pill ───────────────────────────────────── */
function CorpusPill({ compact }: { compact?: boolean }) {
  const { lang } = useApp();
  if (compact) {
    return (
      <div className="corpus-compact flex items-center gap-1.5 font-mono text-xs tabnum">
        <span className="live-dot" />
        <span className="corpus-compact-label">10,230 {t("corpus_papers_indexed", lang)}</span>
      </div>
    );
  }
  return (
    <div className="corpus-status">
      <div className="flex items-center justify-between mb-1">
        <span className="corpus-status-title text-xs font-semibold">
          {t("corpus_ready", lang)}
        </span>
        <span className="live-dot" />
      </div>
      <p className="corpus-status-copy font-mono text-xs tabnum leading-snug">
        10,230 papers<br/>APSA · ICA · EPSS 2026
      </p>
    </div>
  );
}

/* ── Desktop product header ───────────────────────────────── */
function DesktopHeader() {
  const { lang, setLang, darkMode, toggleDark, user, setShowAuth } = useApp();
  const location = useLocation();

  return (
    <header className="desktop-header hidden lg:grid">
      <Link to="/" className="top-brand group">
        <div className="brand-mark brand-mark-desktop">
          <RadarMark size={22} />
        </div>
        <div className="min-w-0">
          <p className="brand-title font-semibold text-sm leading-tight tracking-tight">Idea Radar</p>
          <p className="brand-subtitle text-xs leading-tight mt-0.5">Research Intelligence</p>
        </div>
      </Link>

      <nav className="top-navigation" aria-label="Primary navigation">
        {NAV.map(({ to, icon: Icon, key }) => {
          const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`top-nav-link${active ? " active" : ""}`}
            >
              <span className="top-nav-icon" aria-hidden="true">
                <Icon size={16} weight={active ? "duotone" : "regular"} />
              </span>
              <span>{t(key, lang)}</span>
            </Link>
          );
        })}
      </nav>

      <div className="top-actions">
        <div className="top-corpus"><CorpusPill compact /></div>
        <button
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
          className="top-icon-button"
          aria-label={lang === "en" ? "切换到中文" : "Switch to English"}
        >
          <Globe size={15} />
          <span>{lang === "en" ? "中文" : "EN"}</span>
        </button>
        <button
          onClick={toggleDark}
          className="top-icon-button"
          aria-label={darkMode ? "Light mode" : "Dark mode"}
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        {user ? (
          <Link to="/account" className="top-account-link" aria-label={`Account: ${user.email}`}>
            <User size={16} />
            <span className="top-account-email">{user.email}</span>
          </Link>
        ) : (
          <button
            onClick={() => setShowAuth(true)}
            className="top-signin"
          >
            <SignIn size={15} />
            <span>{t("nav_sign_in", lang)}</span>
            <ArrowRight size={13} />
          </button>
        )}
      </div>
    </header>
  );
}

/* ── Mobile top bar ───────────────────────────────────────── */
function TopBar({ menuOpen, onMenuOpen }: { menuOpen: boolean; onMenuOpen: () => void }) {
  const { lang, user, setShowAuth } = useApp();
  return (
    <header
      className="mobile-topbar lg:hidden fixed top-0 inset-x-0 z-40 flex items-center gap-3 px-4 h-14"
    >
      <Link to="/" className="mobile-brand flex items-center gap-2 mr-auto">
        <div className="brand-mark brand-mark-mobile">
          <RadarMark size={18} />
        </div>
        <span className="mobile-brand-label font-semibold text-sm">Idea Radar</span>
      </Link>

      <CorpusPill compact />

      {user ? (
        <Link to="/account" aria-label="Account" className="mobile-account p-1.5">
          <User size={18} />
        </Link>
      ) : (
        <button
          onClick={() => setShowAuth(true)}
          className="mobile-signin text-xs font-semibold px-3 py-1.5 rounded-[8px] cursor-pointer"
        >
          {t("nav_sign_in", lang)}
        </button>
      )}
      <button
        onClick={onMenuOpen}
        className="mobile-menu-trigger p-1.5 rounded-[8px] cursor-pointer"
        aria-label="Open menu"
        aria-controls="mobile-navigation"
        aria-expanded={menuOpen}
        aria-haspopup="dialog"
      >
        <List size={20} />
      </button>
    </header>
  );
}

/* ── Mobile drawer ────────────────────────────────────────── */
function Drawer({ onClose }: { onClose: () => void }) {
  const { lang, setLang, darkMode, toggleDark, user, setShowAuth } = useApp();
  const location = useLocation();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useFocusTrap<HTMLDivElement>({
    initialFocusRef: closeButtonRef,
    lockBodyScroll: true,
    onEscape: onClose,
  });

  return (
    <div
      className="drawer-backdrop lg:hidden fixed inset-0 z-50 anim-fade-in"
      onClick={onClose}
    >
      <div
        ref={drawerRef}
        id="mobile-navigation"
        className="drawer-panel absolute right-0 top-0 bottom-0 flex flex-col anim-slide"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={lang === "zh" ? "移动导航" : "Mobile navigation"}
        tabIndex={-1}
      >
        <div className="drawer-header flex items-center justify-between px-4 h-14">
          <span className="font-semibold text-sm">{lang === "zh" ? "导航" : "Navigation"}</span>
          <button ref={closeButtonRef} onClick={onClose} className="drawer-close p-1.5 cursor-pointer" aria-label={t("close", lang)}>
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-0.5">
          {NAV.map(({ to, icon: Icon, key }) => {
            const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`sidebar-link drawer-nav-link${active ? " active" : ""}`}
                onClick={onClose}
              >
                <Icon size={16} weight={active ? "duotone" : "regular"} />
                {t(key, lang)}
              </Link>
            );
          })}
        </nav>
        <div className="drawer-footer px-3 pt-3 pb-5 space-y-2">
          <CorpusPill />
          <div className="drawer-utilities">
            <button onClick={() => setLang(lang === "en" ? "zh" : "en")} className="drawer-utility text-xs">
              <Globe size={13}/>{lang === "en" ? "中文" : "EN"}
            </button>
            <button onClick={toggleDark} className="drawer-utility text-xs">
              {darkMode ? <Sun size={13}/> : <Moon size={13}/>}{darkMode ? "Light" : "Dark"}
            </button>
          </div>
          {!user && (
            <button onClick={() => { setShowAuth(true); onClose(); }}
              className="drawer-signin w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-sm font-semibold cursor-pointer"
            ><SignIn size={15}/>{t("nav_sign_in", lang)}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Root layout ──────────────────────────────────────────── */
export function Layout({ children }: { children: React.ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { showAuth, setShowAuth, showPaywall, setShowPaywall } = useApp();
  const location = useLocation();
  const routeRef = useRef<HTMLDivElement>(null);
  useReveal(routeRef, location.pathname);

  return (
    <div className="app-shell flex flex-col overflow-hidden">
      <a href="#main-workspace" className="skip-link">Skip to content</a>
      <DesktopHeader />
      <TopBar menuOpen={drawerOpen} onMenuOpen={() => setDrawerOpen(true)} />
      {drawerOpen && <Drawer onClose={() => setDrawerOpen(false)} />}

      <main id="main-workspace" tabIndex={-1} className="app-main flex-1 overflow-y-auto lg:pt-0 pt-14">
        <div ref={routeRef} className="route-stage" key={location.pathname}>{children}</div>
      </main>

      {showAuth   && <AuthModal   onClose={() => setShowAuth(false)} />}
      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} />}
    </div>
  );
}
