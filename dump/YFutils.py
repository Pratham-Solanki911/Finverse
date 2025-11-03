# YFutils.py
"""
Yahoo Finance utility functions for fetching stock data
"""

import yfinance as yf
import pandas as pd
from typing import List, Dict, Optional, Union
from datetime import datetime, timedelta


def normalize_ticker(ticker: str, exchange: str = "NSE") -> str:
    """
    Normalize ticker symbol to Yahoo Finance format
    
    Args:
        ticker: Stock symbol (e.g., "RELIANCE" or "RELIANCE.NS")
        exchange: Exchange suffix ("NSE", "BSE", or None)
    
    Returns:
        Normalized ticker (e.g., "RELIANCE.NS")
    """
    ticker = ticker.strip().upper()
    
    # If already has a suffix, return as-is
    if '.' in ticker:
        return ticker
    
    # Add exchange suffix
    if exchange == "NSE":
        return f"{ticker}.NS"
    elif exchange == "BSE":
        return f"{ticker}.BO"
    else:
        return ticker


def get_historical(
    tickers: Union[str, List[str]],
    period: str = "1y",
    interval: str = "1d",
    start: Optional[str] = None,
    end: Optional[str] = None,
    auto_suffix_exchange: Optional[str] = "NSE"
) -> pd.DataFrame:
    """
    Get historical stock data using yfinance
    
    Args:
        tickers: Single ticker or list of tickers
        period: Data period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
        interval: Data interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)
        start: Start date (YYYY-MM-DD)
        end: End date (YYYY-MM-DD)
        auto_suffix_exchange: Automatically add exchange suffix (NSE/BSE/None)
    
    Returns:
        DataFrame with historical data
    """
    # Normalize tickers
    if isinstance(tickers, str):
        tickers = [tickers]
    
    if auto_suffix_exchange:
        tickers = [normalize_ticker(t, auto_suffix_exchange) for t in tickers]
    
    # Download data
    try:
        if start and end:
            df = yf.download(
                tickers,
                start=start,
                end=end,
                interval=interval,
                progress=False,
                auto_adjust=False
            )
        else:
            df = yf.download(
                tickers,
                period=period,
                interval=interval,
                progress=False,
                auto_adjust=False
            )
        
        return df
    
    except Exception as e:
        print(f"Error fetching historical data: {e}")
        return pd.DataFrame()


def get_realtime(
    tickers: Union[str, List[str]],
    interval: str = "1m",
    auto_suffix_exchange: Optional[str] = "NSE",
    batch_method: str = "download"
) -> Dict[str, Dict]:
    """
    Get real-time/latest stock data
    
    Args:
        tickers: Single ticker or list of tickers
        interval: Data interval (typically 1m for real-time)
        auto_suffix_exchange: Automatically add exchange suffix
        batch_method: Method to use ("download" or "ticker")
    
    Returns:
        Dictionary with ticker as key and data dict as value
    """
    # Normalize tickers
    if isinstance(tickers, str):
        tickers = [tickers]
    
    if auto_suffix_exchange:
        tickers = [normalize_ticker(t, auto_suffix_exchange) for t in tickers]
    
    result = {}
    
    try:
        if batch_method == "ticker":
            # Use Ticker objects (slower but more info)
            for ticker in tickers:
                try:
                    tk = yf.Ticker(ticker)
                    info = tk.info
                    hist = tk.history(period="1d")
                    
                    if not hist.empty:
                        latest = hist.iloc[-1]
                        result[ticker] = {
                            "ticker": ticker,
                            "close": float(latest['Close']),
                            "last_price": float(latest['Close']),
                            "open": float(latest['Open']),
                            "high": float(latest['High']),
                            "low": float(latest['Low']),
                            "volume": int(latest['Volume']),
                            "previous_close": float(info.get('previousClose', latest['Close'])),
                            "change": float(latest['Close'] - info.get('previousClose', latest['Close'])),
                        }
                    else:
                        result[ticker] = {"ticker": ticker, "error": "No data available"}
                
                except Exception as e:
                    result[ticker] = {"ticker": ticker, "error": str(e)}
        
        else:
            # Use download method (faster for multiple tickers)
            df = yf.download(tickers, period="1d", progress=False, auto_adjust=False)
            
            if df.empty:
                for ticker in tickers:
                    result[ticker] = {"ticker": ticker, "error": "No data available"}
                return result
            
            # Handle single vs multiple tickers
            if len(tickers) == 1:
                ticker = tickers[0]
                if not df.empty:
                    latest = df.iloc[-1]
                    prev = df.iloc[-2] if len(df) > 1 else latest
                    
                    result[ticker] = {
                        "ticker": ticker,
                        "close": float(latest['Close']),
                        "last_price": float(latest['Close']),
                        "open": float(latest['Open']),
                        "high": float(latest['High']),
                        "low": float(latest['Low']),
                        "volume": int(latest['Volume']),
                        "previous_close": float(prev['Close']),
                        "change": float(latest['Close'] - prev['Close']),
                    }
            else:
                # Multiple tickers - MultiIndex columns
                for ticker in tickers:
                    try:
                        if ticker in df.columns.get_level_values(1):
                            ticker_data = df.xs(ticker, axis=1, level=1)
                            if not ticker_data.empty:
                                latest = ticker_data.iloc[-1]
                                prev = ticker_data.iloc[-2] if len(ticker_data) > 1 else latest
                                
                                result[ticker] = {
                                    "ticker": ticker,
                                    "close": float(latest['Close']),
                                    "last_price": float(latest['Close']),
                                    "open": float(latest['Open']),
                                    "high": float(latest['High']),
                                    "low": float(latest['Low']),
                                    "volume": int(latest['Volume']),
                                    "previous_close": float(prev['Close']),
                                    "change": float(latest['Close'] - prev['Close']),
                                }
                        else:
                            result[ticker] = {"ticker": ticker, "error": "Ticker not found in data"}
                    except Exception as e:
                        result[ticker] = {"ticker": ticker, "error": str(e)}
    
    except Exception as e:
        print(f"Error fetching realtime data: {e}")
        for ticker in tickers:
            result[ticker] = {"ticker": ticker, "error": str(e)}
    
    return result


def get_stock_info(ticker: str, auto_suffix_exchange: Optional[str] = "NSE") -> Dict:
    """
    Get detailed stock information
    
    Args:
        ticker: Stock symbol
        auto_suffix_exchange: Automatically add exchange suffix
    
    Returns:
        Dictionary with stock information
    """
    if auto_suffix_exchange:
        ticker = normalize_ticker(ticker, auto_suffix_exchange)
    
    try:
        tk = yf.Ticker(ticker)
        info = tk.info
        
        return {
            "symbol": ticker,
            "name": info.get("longName", info.get("shortName", ticker)),
            "sector": info.get("sector"),
            "industry": info.get("industry"),
            "market_cap": info.get("marketCap"),
            "pe_ratio": info.get("trailingPE"),
            "dividend_yield": info.get("dividendYield"),
            "52_week_high": info.get("fiftyTwoWeekHigh"),
            "52_week_low": info.get("fiftyTwoWeekLow"),
            "current_price": info.get("currentPrice"),
            "previous_close": info.get("previousClose"),
            "open": info.get("open"),
            "day_high": info.get("dayHigh"),
            "day_low": info.get("dayLow"),
            "volume": info.get("volume"),
            "avg_volume": info.get("averageVolume"),
        }
    
    except Exception as e:
        return {"symbol": ticker, "error": str(e)}


def calculate_returns(
    tickers: Union[str, List[str]],
    period: str = "1y",
    auto_suffix_exchange: Optional[str] = "NSE"
) -> Dict[str, float]:
    """
    Calculate returns for stocks over a period
    
    Args:
        tickers: Single ticker or list of tickers
        period: Time period
        auto_suffix_exchange: Automatically add exchange suffix
    
    Returns:
        Dictionary with ticker as key and return percentage as value
    """
    if isinstance(tickers, str):
        tickers = [tickers]
    
    df = get_historical(tickers, period=period, auto_suffix_exchange=auto_suffix_exchange)
    
    returns = {}
    
    if df.empty:
        return {t: None for t in tickers}
    
    if len(tickers) == 1:
        ticker = tickers[0]
        if 'Close' in df.columns and len(df) > 0:
            start_price = float(df['Close'].iloc[0])
            end_price = float(df['Close'].iloc[-1])
            returns[ticker] = ((end_price - start_price) / start_price) * 100
        else:
            returns[ticker] = None
    else:
        for ticker in tickers:
            try:
                if ticker in df.columns.get_level_values(1):
                    close_prices = df['Close'][ticker]
                    if len(close_prices) > 0:
                        start_price = float(close_prices.iloc[0])
                        end_price = float(close_prices.iloc[-1])
                        returns[ticker] = ((end_price - start_price) / start_price) * 100
                    else:
                        returns[ticker] = None
                else:
                    returns[ticker] = None
            except Exception:
                returns[ticker] = None
    
    return returns


# Example usage
if __name__ == "__main__":
    # Test functions
    print("Testing YFutils...")
    
    # Test normalize_ticker
    print("\n1. Normalize ticker:")
    print(normalize_ticker("RELIANCE"))
    print(normalize_ticker("RELIANCE.NS"))
    
    # Test get_historical
    print("\n2. Historical data:")
    hist = get_historical("RELIANCE", period="5d")
    print(hist.tail())
    
    # Test get_realtime
    print("\n3. Realtime data:")
    rt = get_realtime(["RELIANCE", "TCS", "INFY"])
    for ticker, data in rt.items():
        print(f"{ticker}: {data}")
    
    # Test get_stock_info
    print("\n4. Stock info:")
    info = get_stock_info("RELIANCE")
    print(info)