#!/usr/bin/env python3
"""Download monthly adj-close + best-effort fundamentals for factors-public-v1.

Offline-capable: --offline reuses prices/ and fundamentals/ only.
On Yahoo failure: log clearly and exit non-zero unless --allow-empty.
--dry-run prints the plan without network or writes.

Stooq fallback: see fetch_stooq_monthly_adj_close (stub / shrink-path hook).
Do NOT invent fake prices labeled as real market data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import traceback
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
UNIVERSE_PATH = ROOT / "universe-factors-public-v1.json"
PRICES_DIR = ROOT / "prices"
FUND_DIR = ROOT / "fundamentals"
SNAPSHOTS_DIR = ROOT / "snapshots"
MANIFEST_PATH = ROOT / "manifest.json"
CHECKSUMS_PATH = ROOT / "checksums.sha256"

SAMPLE_START = "2019-01-01"  # lookback buffer before frozenAsOf
SAMPLE_END = "2024-12-31"


def load_universe() -> dict:
    with UNIVERSE_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch_stooq_monthly_adj_close(ticker: str):
    """Stooq shrink-path hook (stub).

    Intended fallback when Yahoo is rate-limited/403. In this environment Stooq
    TLS often fails; do not call until a working client is wired. Returns None.
    """
    # Stub only — real implementation would hit https://stooq.com/q/d/l/?s={ticker}.us&i=m
    _ = ticker
    return None


def month_end_adj_close_from_yf(ticker: str, start: str, end: str):
    """Fetch daily history via yfinance and resample to month-end adj close."""
    import yfinance as yf  # local .venv

    t = yf.Ticker(ticker)
    # auto_adjust=True → Close is adjusted; keep Adj Close when present
    hist = t.history(start=start, end=end, auto_adjust=True, actions=False)
    if hist is None or hist.empty:
        return None
    col = "Close" if "Close" in hist.columns else None
    if col is None:
        return None
    monthly = hist[col].resample("ME").last().dropna()
    rows = []
    for ts, val in monthly.items():
        rows.append({"date": ts.strftime("%Y-%m-%d"), "adjClose": float(val)})
    return rows


def fundamentals_best_effort(ticker: str) -> list:
    """Best-effort EPS / ROE rows with disclosure dates for availableAt logic.

    availableAt = filed/disclosure date when known, else periodEnd + 45 calendar days.
    Returns [] on failure (never invents numbers).
    """
    import pandas as pd
    import yfinance as yf

    t = yf.Ticker(ticker)
    rows = []
    try:
        info = t.info or {}
    except Exception:
        info = {}
    # Point-in-time quarterly earnings dates if available
    try:
        ed = t.get_earnings_dates(limit=24)
    except Exception:
        ed = None
    try:
        fin = t.quarterly_financials
        bs = t.quarterly_balance_sheet
    except Exception:
        fin, bs = None, None

    # Prefer structured income / equity if present
    if fin is not None and not fin.empty:
        # Net Income row names vary
        ni_label = None
        for cand in ("Net Income", "Net Income Common Stockholders", "NetIncome"):
            if cand in fin.index:
                ni_label = cand
                break
        equity_label = None
        if bs is not None and not bs.empty:
            for cand in (
                "Stockholders Equity",
                "Total Stockholder Equity",
                "Common Stock Equity",
                "Total Equity Gross Minority Interest",
            ):
                if cand in bs.index:
                    equity_label = cand
                    break
        for col in fin.columns:
            period_end = col
            if hasattr(period_end, "strftime"):
                pe = period_end.strftime("%Y-%m-%d")
            else:
                pe = str(period_end)[:10]
            ep = None
            roe = None
            # EPS from info is trailing — skip inventing; leave ep null unless we can derive
            if ni_label is not None:
                try:
                    ni = float(fin.loc[ni_label, col])
                except Exception:
                    ni = None
            else:
                ni = None
            equity = None
            if equity_label is not None and bs is not None and col in bs.columns:
                try:
                    equity = float(bs.loc[equity_label, col])
                except Exception:
                    equity = None
            if ni is not None and equity not in (None, 0) and abs(equity) > 0:
                roe = ni / equity
            # shares for E/P approximation not reliable here → leave ep null unless trailingEps
            available_at = None
            if ed is not None and hasattr(ed, "index"):
                # nearest earnings date on/after period end within ~90d
                try:
                    pe_ts = pd.Timestamp(pe)
                    for idx in ed.index:
                        d = pd.Timestamp(idx).tz_localize(None) if getattr(idx, "tzinfo", None) else pd.Timestamp(idx)
                        if d >= pe_ts and (d - pe_ts).days <= 120:
                            available_at = d.strftime("%Y-%m-%d")
                            break
                except Exception:
                    available_at = None
            if available_at is None:
                try:
                    pe_ts = pd.Timestamp(pe) + pd.Timedelta(days=45)
                    available_at = pe_ts.strftime("%Y-%m-%d")
                except Exception:
                    available_at = pe
            rows.append(
                {
                    "ticker": ticker,
                    "periodEnd": pe,
                    "ep": ep,
                    "roe": roe,
                    "observedAt": pe,
                    "availableAt": available_at,
                    "source": "yfinance-quarterly",
                }
            )

    # Trailing bookends from info (weak; tagged)
    te = info.get("trailingEps")
    roe_info = info.get("returnOnEquity")
    if te is not None or roe_info is not None:
        asof = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        rows.append(
            {
                "ticker": ticker,
                "periodEnd": asof,
                "ep": float(te) if te is not None else None,
                "roe": float(roe_info) if roe_info is not None else None,
                "observedAt": asof,
                "availableAt": asof,
                "source": "yfinance-info-trailing",
                "note": "trailing snapshot only; prefer quarterly rows for look-ahead-safe backtests",
            }
        )
    return rows


def write_price_file(ticker: str, rows: list) -> Path:
    PRICES_DIR.mkdir(parents=True, exist_ok=True)
    path = PRICES_DIR / f"{ticker}.json"
    payload = {
        "ticker": ticker,
        "frequency": "month",
        "field": "adjClose",
        "source": "yahoo-yfinance",
        "rows": rows,
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def write_fund_file(ticker: str, rows: list) -> Path:
    FUND_DIR.mkdir(parents=True, exist_ok=True)
    path = FUND_DIR / f"{ticker}.json"
    payload = {"ticker": ticker, "source": "yahoo-yfinance", "rows": rows}
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def existing_price_tickers() -> list[str]:
    if not PRICES_DIR.exists():
        return []
    return sorted(p.stem for p in PRICES_DIR.glob("*.json"))


def build_manifest(universe: dict, downloaded: list, errors: list, mode: str) -> dict:
    return {
        "version": universe.get("version"),
        "frozenAsOf": universe.get("frozenAsOf"),
        "sampleWindow": universe.get("sampleWindow"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "tickersRequested": [t["ticker"] for t in universe["tickers"]],
        "tickersWithPrices": downloaded,
        "errors": errors,
        "interimNote": (
            "factors-public-price-v1 measures Momentum+LowVol only until fundamentals "
            "are present; Value/Quality untested in price-only interim."
        ),
    }


def write_checksums(paths: list[Path]) -> None:
    lines = []
    for p in sorted(paths, key=lambda x: str(x)):
        if p.is_file():
            rel = p.relative_to(ROOT).as_posix()
            lines.append(f"{sha256_file(p)}  {rel}")
    CHECKSUMS_PATH.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="FactorLab public_real Yahoo download")
    ap.add_argument("--offline", action="store_true", help="Reuse prices/fundamentals snapshots only")
    ap.add_argument("--dry-run", action="store_true", help="Print plan; no network; no writes")
    ap.add_argument(
        "--allow-empty",
        action="store_true",
        help="Exit 0 even when no prices obtained (honest empty path)",
    )
    ap.add_argument("--sleep", type=float, default=0.35, help="Delay between Yahoo calls")
    ap.add_argument("--stooq-fallback", action="store_true", help="Try Stooq stub after Yahoo miss (no-op stub)")
    args = ap.parse_args(argv)

    universe = load_universe()
    tickers = [t["ticker"] for t in universe["tickers"]]
    print(f"[download_yahoo] universe={universe.get('version')} n={len(tickers)}", flush=True)

    if args.dry_run:
        print("[download_yahoo] DRY-RUN — would fetch monthly adj close for:", flush=True)
        for t in tickers:
            print(f"  - {t}", flush=True)
        print(
            "[download_yahoo] DRY-RUN complete (no network, no writes). "
            "Stooq hook: fetch_stooq_monthly_adj_close (stub).",
            flush=True,
        )
        return 0

    if args.offline:
        have = existing_price_tickers()
        print(f"[download_yahoo] OFFLINE reuse: {len(have)} price files", flush=True)
        manifest = build_manifest(universe, have, [], mode="offline")
        MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        paths = [MANIFEST_PATH] + list(PRICES_DIR.glob("*.json")) + list(FUND_DIR.glob("*.json"))
        write_checksums(paths)
        if not have and not args.allow_empty:
            print(
                "[download_yahoo] ERROR: offline mode found no price snapshots under prices/. "
                "Pass --allow-empty for honest empty measurement, or run online download.",
                flush=True,
            )
            return 1
        print("[download_yahoo] offline manifest written", flush=True)
        return 0

    # Online path
    try:
        import yfinance  # noqa: F401
        import pandas  # noqa: F401
    except ImportError as e:
        print(
            f"[download_yahoo] ERROR: missing dependency in this interpreter: {e}. "
            "Use public-data/.venv: `.venv/bin/pip install -r requirements.txt`",
            flush=True,
        )
        return 1

    downloaded: list[str] = []
    errors: list[dict] = []
    written: list[Path] = []

    for i, ticker in enumerate(tickers):
        print(f"[download_yahoo] ({i+1}/{len(tickers)}) {ticker} …", flush=True)
        try:
            rows = month_end_adj_close_from_yf(ticker, SAMPLE_START, SAMPLE_END)
            if not rows and args.stooq_fallback:
                print(f"[download_yahoo] Yahoo miss for {ticker}; Stooq stub → None", flush=True)
                rows = fetch_stooq_monthly_adj_close(ticker)
            if not rows:
                raise RuntimeError("empty price history (Yahoo miss; Stooq not wired)")
            p = write_price_file(ticker, rows)
            written.append(p)
            try:
                frows = fundamentals_best_effort(ticker)
                if frows:
                    written.append(write_fund_file(ticker, frows))
            except Exception as fe:
                errors.append({"ticker": ticker, "stage": "fundamentals", "error": str(fe)})
            downloaded.append(ticker)
        except Exception as e:
            msg = str(e)
            errors.append({"ticker": ticker, "stage": "prices", "error": msg})
            print(f"[download_yahoo] FAIL {ticker}: {msg}", flush=True)
            # Detect rate-limit / 403 class errors for clearer logging
            low = msg.lower()
            if "403" in low or "rate" in low or "too many" in low or "unauthorized" in low:
                print(
                    "[download_yahoo] Yahoo rate-limit/403 detected. "
                    "Retry later, use --offline with a cache, or --allow-empty for honest null StudyResult.",
                    flush=True,
                )
        time.sleep(max(0.0, args.sleep))

    mode = "online"
    manifest = build_manifest(universe, downloaded, errors, mode=mode)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    written.append(MANIFEST_PATH)
    write_checksums(written + list(PRICES_DIR.glob("*.json")) + list(FUND_DIR.glob("*.json")))

    if not downloaded:
        print(
            "[download_yahoo] ERROR: no tickers downloaded. "
            "Network Yahoo/yfinance appears blocked or empty. "
            "Do not invent prices. Use --allow-empty for honest empty fixture rebuild.",
            flush=True,
        )
        if args.allow_empty:
            print("[download_yahoo] --allow-empty: exiting 0 with empty prices", flush=True)
            return 0
        return 2

    print(f"[download_yahoo] done: {len(downloaded)}/{len(tickers)} with prices", flush=True)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
