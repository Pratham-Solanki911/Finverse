# main.py

from datetime import datetime, timedelta
import pathlib
import os
import sqlite3
import logging
logger = logging.getLogger(__name__)
import json
import pprint
import pydantic
import httpx
import websockets
import asyncio
import traceback
import atexit
import ast
import numbers
from fastapi import Cookie
from typing import Optional, Set, Dict, List
from websockets.exceptions import InvalidStatus
import upstox_client
from fastapi import (
    FastAPI, HTTPException, Query, Request, 
    WebSocket, WebSocketDisconnect
)
import logging
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from google.protobuf.json_format import MessageToDict
from groq import AsyncGroq

# --- Your Application Imports ---
from src.upstox_helper import (
    get_instrument_details,
    fetch_live_quote,
    fetch_historical_candles,
    get_user_profile  # <-- UPDATED
)
from src.instrument_service import update_instrument_database, DB_PATH # <-- UPDATED

# This is the file you compiled with 'protoc'
try:
    from src import MarketDataFeedV3_pb2 as pb
except ImportError:
    print("FATAL ERROR: 'MarketDataFeedV3_pb2.py' not found.")
    print("Please run 'protoc --python_out=. MarketDataFeedV3.proto' in your 'src' folder.")
    exit(1)

# Load .env variables
load_dotenv()
CLIENT_ID = os.getenv("UPSTOX_API_KEY") 
CLIENT_SECRET = os.getenv("UPSTOX_API_SECRET")
REDIRECT_URI = os.getenv("UPSTOX_REDIRECT_URI")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:5173")
GROQ_API_KEY = os.getenv("GROQ_API_KEY") # <-- NEW

# --- NEW: Initialize Groq Client ---
groq_client = None
if GROQ_API_KEY:
    groq_client = AsyncGroq(api_key=GROQ_API_KEY)
else:
    print("Warning: GROQ_API_KEY not set. AI features will be disabled.")


# --- Scheduler Setup ---
scheduler = BackgroundScheduler(daemon=True)
@atexit.register
def shutdown_scheduler():
    scheduler.shutdown()

def run_instrument_update():
    update_instrument_database()

scheduler.add_job(run_instrument_update, 'cron', hour=8, minute=0)
scheduler.start()


app = FastAPI(
    title="Finverse API",
    description="API for the stock market helper dashboard."
)

@app.on_event("startup")
async def startup_event():
    print("Application startup...")
    # Run update once on startup
    scheduler.add_job(run_instrument_update, 'date', run_date=datetime.now())


# --- NEW Pydantic Models for AI ---
class AIRequest(pydantic.BaseModel):
    text: str
    prompt: str = "Analyze the sentiment of this financial news headline. Respond with one word: POSITIVE, NEGATIVE, or NEUTRAL."

class ChatMessage(pydantic.BaseModel):
    role: str
    content: str

class ChatRequest(pydantic.BaseModel):
    messages: List[ChatMessage]
    model: str = "openai/gpt-oss-safeguard-20b" # Default to a known fast model

# --- NEW: Pydantic Models for News ---
class NewsArticle(pydantic.BaseModel):
    headline: str = pydantic.Field(description="The main headline of the news article.")
    summary: str = pydantic.Field(description="A 1-2 sentence summary of the article.")
    url: str = pydantic.Field(description="The full URL to the original article.")
    sourceName: str = pydantic.Field(description="The name of the news publication (e.g., 'The Economic Times').")
    imageUrl: str = pydantic.Field(description="A relevant, high-quality image URL for the article. This should be a direct image link, not a logo.")
    publishedTime: str = pydantic.Field(description="A human-readable published time (e.g., '2 hours ago', 'Oct 31, 2025').")

class NewsResponse(pydantic.BaseModel):
    articles: List[NewsArticle] = pydantic.Field(description="A list of 5 news articles.")


# --- DYNAMIC UpstoxFeedManager ---
class UpstoxFeedManager:
    """
    Maintains one upstream websocket to Upstox and broadcasts parsed JSON
    messages to all connected Starlette WebSocket clients.
    Manages dynamic subscriptions based on client requests.
    """
    def __init__(self):
        self._clients: Dict[WebSocket, asyncio.Queue] = {}  # per-client queue
        self._upstream_task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self._token: Optional[str] = None
        self._stop = asyncio.Event()
        
        # --- DYNAMIC SUB HANDLING ---
        self.upstream_socket: Optional[websockets.WebSocketClientProtocol] = None
        self.subscriptions: Set[str] = set() # Master set of *all* subscribed keys
        self.sub_lock = asyncio.Lock()

    def set_token(self, token: str):
        self._token = token
        if self._upstream_task and not self._upstream_task.done():
            self._upstream_task.cancel()
            self._upstream_task = None

    async def start(self):
        async with self._lock:
            if self._running:
                return
            self._running = True
            self._stop.clear()
            self._upstream_task = asyncio.create_task(self._run_upstream_loop())

    async def stop(self):
        async with self._lock:
            self._running = False
            self._stop.set()
            if self._upstream_task:
                self._upstream_task.cancel()
            for q in self._clients.values():
                try: q.put_nowait({"type": "server_shutdown"})
                except Exception: pass

    async def register(self, websocket: WebSocket) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        self._clients[websocket] = q
        await self.start()
        return q

    async def unregister(self, websocket: WebSocket):
        if websocket in self._clients:
            del self._clients[websocket]
        if not self._clients:
            asyncio.create_task(self._stop_if_no_clients_delay(30))

    async def _stop_if_no_clients_delay(self, delay_seconds: int):
        await asyncio.sleep(delay_seconds)
        if not self._clients:
            await self.stop()

    async def broadcast(self, message: dict):
        dead = []
        for ws, q in list(self._clients.items()):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                pass
            except Exception:
                dead.append(ws)
        for ws in dead:
            await self.unregister(ws)

    # --- NEW DYNAMIC SUB-HANDLING METHODS ---
    
    async def _send_subscription_request(self, keys: Set[str], mode: pb.RequestMode = pb.RequestMode.ltpc, subscribe: bool = True):
        """Helper to build and send a sub/unsub request to Upstox."""
        if not self.upstream_socket:
            print("[UpstoxFeedManager] Cannot subscribe, upstream socket is not connected.")
            return

        try:
            sub_request = pb.Feed()
            # This is a simplification. We're only handling LTPC subs.
            if mode == pb.RequestMode.ltpc:
                lt = pb.LTPC()
                if hasattr(lt, "instrument_keys"):
                    lt.instrument_keys.extend(list(keys))
                    sub_request.ltpc.CopyFrom(lt)
                else: # Fallback for different proto versions
                    sub_request.ltpc.instrument_keys.extend(list(keys))
                sub_request.requestMode = pb.RequestMode.ltpc
            
            # TODO: Add logic for full_d5, option_greeks etc. if needed
            
            await self.upstream_socket.send(sub_request.SerializeToString())
            action = "Subscribed" if subscribe else "Unsubscribed"
            print(f"[UpstoxFeedManager] {action} to: {keys}")
        except Exception as e:
            print(f"[UpstoxFeedManager] Failed to send subscription: {e}")

    async def add_subscription(self, key: str):
        """Adds a key to the master subscription set if it's new."""
        async with self.sub_lock:
            if key not in self.subscriptions:
                self.subscriptions.add(key)
                # Send the *actual* subscription to Upstox
                await self._send_subscription_request(keys={key}, subscribe=True)

    async def remove_subscription(self, key: str):
        """
        Removes a key from master set.
        NOTE: For simplicity, we DON'T unsubscribe from Upstox.
        This prevents one client leaving from breaking another client.
        """
        async with self.sub_lock:
            if key in self.subscriptions:
                print(f"[UpstoxFeedManager] Client unsubscribed, but master sub for {key} is kept active.")
                pass

    # --- UPDATED UPSTREAM LOOP ---
    async def _run_upstream_loop(self):
        backoff = 3.0
        max_backoff = 60.0
        while not self._stop.is_set():
            if not self._token:
                await asyncio.sleep(1.0)
                continue

            try:
                upstox_ws_url = await get_websocket_url(self._token)
                print(f"[UpstoxFeedManager] Connecting upstream: {upstox_ws_url}")
                
                async with websockets.connect(upstox_ws_url) as upstox_socket:
                    print("[UpstoxFeedManager] Connected to upstream.")
                    self.upstream_socket = upstox_socket # Store the active socket
                    backoff = 3.0

                    # --- RESUBSCRIBE ---
                    # When we reconnect, resubscribe to all keys we're tracking
                    if self.subscriptions:
                        print(f"[UpstoxFeedManager] Re-subscribing to {len(self.subscriptions)} keys...")
                        await self._send_subscription_request(keys=self.subscriptions, subscribe=True)
                    
                    # Read loop: parse and broadcast
                    while True:
                        binary_message = await upstox_socket.recv()
                        try:
                            feed_response = pb.FeedResponse()
                            feed_response.ParseFromString(binary_message)
                            data_dict = MessageToDict(feed_response, preserving_proto_field_name=True)
                            asyncio.create_task(self.broadcast(data_dict))
                        except Exception as e:
                            print(f"[UpstoxFeedManager] Parse/broadcast error: {e}")

            except InvalidStatus as e:
                print("[UpstoxFeedManager] Upstream websocket handshake rejected:", e)
            except asyncio.CancelledError:
                print("[UpstoxFeedManager] Upstream task cancelled.")
                break
            except Exception as e:
                print("[UpstoxFeedManager] Error in upstream loop:", e)
                traceback.print_exc()
            finally:
                self.upstream_socket = None # Clear the socket

            # exponential backoff
            wait = backoff + (0.5 * backoff * (0.5 - asyncio.random.random() if hasattr(asyncio, "random") else 0) if False else 0)
            jitter = (0.5 * backoff)
            wait = min(max(1.0, backoff + (jitter * (0.5 - 0.5))), max_backoff)
            await asyncio.sleep(backoff + (0.2 * backoff))
            backoff = min(backoff * 2, max_backoff)

# --- Initialize the single feed manager ---
feed_manager = UpstoxFeedManager()


# --- Authentication Endpoints (Unchanged) ---

@app.get("/api/auth/status")
async def auth_status(upstox_access_token: Optional[str] = Cookie(None)):
    if upstox_access_token:
        token_preview = f"{upstox_access_token[:8]}... (len={len(upstox_access_token)})"
        return {"authenticated": True, "token_preview": token_preview}
    return {"authenticated": False}
    
@app.get("/api/auth/authorize")
async def authorize_login():
    if not CLIENT_ID or not REDIRECT_URI:
        raise HTTPException(status_code=500, detail="Auth credentials not configured")
    
    auth_url = (
        f"https://api.upstox.com/v2/login/authorization/dialog"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
    )
    return RedirectResponse(url=auth_url)


@app.get("/api/auth/callback")
async def handle_auth_callback(code: str):
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code not found")

    print(f"Received auth code: {code}")

    try:
        configuration = upstox_client.Configuration()
        base_api_client = upstox_client.ApiClient(configuration)
        api_instance = upstox_client.LoginApi(base_api_client)
        
        token_response = api_instance.token(
            api_version="2.0",
            code=code,
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET,
            redirect_uri=REDIRECT_URI,
            grant_type="authorization_code"
        )
        
        access_token = token_response.access_token
        print(f"Successfully obtained access token!")
        
        response = RedirectResponse(url=f"{FRONTEND_URL}/dashboard")

        response.set_cookie(
            key="upstox_access_token",
            value=access_token,
            httponly=True,
            secure=False,        # True if you serve over HTTPS
            samesite="lax",
            max_age=86400,
            domain="127.0.0.1"
        )
        return response

    except upstox_client.rest.ApiException as e:
        print(f"API Error during auth: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get access token from Upstox. API Error: {e.body}")
    except Exception as e:
        print(f"Error during auth: {e}")
        raise HTTPException(status_code=500, detail="An unexpected error occurred")

# --- NEW DATA ENDPOINTS ---

@app.get("/api/user/profile")
async def get_profile(request: Request):
    """
    Fetches the logged-in user's Upstox profile.
    """
    try:
        profile_data = get_user_profile(request)
        return profile_data
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API error: {str(e)}")

@app.get("/api/instruments/search")
async def search_instruments(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, le=100)
):
    """
    Searches the local instrument database for equities and indices.
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        query_pattern = f"{q.upper()}%"
        cursor.execute(
            """
            SELECT symbol, name, instrument_key, instrument_type 
            FROM instrument_lookup 
            WHERE (symbol LIKE ? OR name LIKE ?)
            AND (instrument_type = 'EQUITY' OR instrument_type = 'INDEX')
            LIMIT ?
            """,
            (query_pattern, query_pattern, limit)
        )
        results = [dict(row) for row in cursor.fetchall()]
        return results
            
    except Exception as e:
        print(f"Database error in search_instruments: {e}")
        raise HTTPException(status_code=500, detail="Instrument database error")
    finally:
        if conn:
            conn.close()

# --- EXISTING HTTP Data Endpoints (Unchanged) ---

@app.get("/api/debug/raw_quote_save/{symbol}")
async def debug_raw_quote_save(symbol: str, request: Request):
    """
    Debug helper:
    - fetches the raw value returned by fetch_live_quote(...)
    - saves a JSON-safe dump to debug_quote_<SYMBOL>.json in the current working dir
    - returns the file path, Python type, and a clipped preview for quick inspection
    """
    try:
        instrument_info = get_instrument_details(symbol)
        instrument_key = instrument_info.get("instrument_key")
        print(f"[DEBUG] Fetching live quote for: {symbol} ({instrument_key})")

        # Call the same function your /api/quote uses
        quote_data = fetch_live_quote(request, instrument_key)

        # Safe JSON serialization helper (falls back to str() on unknown types)
        def safe_serialize(obj):
            try:
                return json.loads(json.dumps(obj, default=str))
            except Exception:
                # last resort: convert repr to string
                try:
                    return repr(obj)
                except Exception:
                    return f"<unserializable {type(obj)}>"

        serializable = safe_serialize(quote_data)

        # Save full JSON dump to a file for inspection
        fname = f"debug_quote_{symbol.upper().replace(' ', '_')}.json"
        path = pathlib.Path.cwd() / fname
        try:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(serializable, fh, indent=2, ensure_ascii=False)
            saved = True
        except Exception as e:
            print(f"[DEBUG] Failed to write debug file: {e}")
            saved = False

        # Build a clipped preview
        preview_text = None
        try:
            preview_text = json.dumps(serializable, indent=2, ensure_ascii=False)[:4000]
            if len(preview_text) >= 4000:
                preview_text += "...(truncated)"
        except Exception:
            try:
                preview_text = repr(serializable)[:1000] + "...(truncated)"
            except Exception:
                preview_text = "<unable to build preview>"

        resp = {
            "symbol": symbol.upper(),
            "instrument_key": instrument_key,
            "quote_data_type": str(type(quote_data)),
            "file_saved": str(path) if saved else None,
            "preview": preview_text
        }

        # Also log a short version to console
        print(f"[DEBUG] Saved raw quote to: {path}" if saved else "[DEBUG] Did not save raw quote.")
        print(f"[DEBUG] Type: {type(quote_data)}")
        print(preview_text[:800])  # print a head in logs for convenience

        return resp

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug error: {e}")

@app.get("/api/quote/{symbol}")
async def get_quote(symbol: str, request: Request):
    """
    Robust quote endpoint with fixed string-to-dict parsing
    """
    try:
        instrument_info = get_instrument_details(symbol)
        instrument_key = instrument_info.get("instrument_key")
        if not instrument_key:
            raise HTTPException(status_code=404, detail="Instrument key not found")

        # Call helper (may raise on auth issues)
        try:
            quote_data = fetch_live_quote(request, instrument_key)
        except Exception as e:
            print("[get_quote] fetch_live_quote error:", e)
            raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

        # Determine possible keys to try in dict responses
        alt_keys = {
            instrument_key,
            instrument_key.replace("|", ":"),
            instrument_key.replace(":", "|"),
            instrument_key.split("|")[-1] if "|" in instrument_key else instrument_key,
            symbol.upper(),
            symbol.replace(" ", "_").upper()
        }

        sdk_entry = None

        # Case A: dict-like container
        if isinstance(quote_data, dict):
            # Try exact matches first
            for k in alt_keys:
                if k in quote_data:
                    sdk_entry = quote_data[k]
                    break

            # Suffix-match fallback (keys like "NSE_EQ:RELIANCE")
            if sdk_entry is None:
                for k, v in quote_data.items():
                    if isinstance(k, str):
                        for alt in alt_keys:
                            if k.endswith(str(alt)):
                                sdk_entry = v
                                break
                    if sdk_entry is not None:
                        break

            # Also handle nested 'feeds' structure
            if sdk_entry is None and "feeds" in quote_data and isinstance(quote_data["feeds"], dict):
                feeds = quote_data["feeds"]
                for k in alt_keys:
                    if k in feeds:
                        sdk_entry = feeds[k]
                        break
                if sdk_entry is None:
                    for k, v in feeds.items():
                        for alt in alt_keys:
                            if isinstance(k, str) and k.endswith(str(alt)):
                                sdk_entry = v
                                break
                        if sdk_entry is not None:
                            break

        # Case B: object-like single response
        if sdk_entry is None:
            if hasattr(quote_data, "instrument_token") or hasattr(quote_data, "last_price"):
                sdk_entry = quote_data

        # Case C: list/tuple of entries
        if sdk_entry is None and isinstance(quote_data, (list, tuple)):
            for item in quote_data:
                token = _safe_get(item, "instrument_token") or _safe_get(item, "instrumentKey") or _safe_get(item, "token")
                if token:
                    for alt in alt_keys:
                        if str(token) == str(alt) or str(token).endswith(str(alt)):
                            sdk_entry = item
                            break
                if sdk_entry is not None:
                    break

        if sdk_entry is None:
            print("[get_quote] Unable to find entry. instrument_key:", instrument_key)
            print("[get_quote] quote_data type:", type(quote_data))
            if isinstance(quote_data, dict):
                print("[get_quote] quote_data keys sample:", list(quote_data.keys())[:10])
            raise HTTPException(status_code=404, detail="Data not found for instrument key in API response.")

        # ===== DEBUG: Print what we found =====
        print(f"\n[DEBUG] Symbol: {symbol}")
        print(f"[DEBUG] sdk_entry type: {type(sdk_entry)}")
        print(f"[DEBUG] sdk_entry value (first 500 chars): {str(sdk_entry)[:500]}")

        # ===== FIX: Parse stringified dict ALWAYS if it's a string =====
        if isinstance(sdk_entry, str):
            try:
                sdk_entry = ast.literal_eval(sdk_entry)
                print(f"[DEBUG] Successfully parsed stringified dict for {symbol}")
                print(f"[DEBUG] After parsing, type: {type(sdk_entry)}")
            except Exception as parse_err:
                print(f"[DEBUG] Failed to parse string as dict: {parse_err}")
                # Leave as-is if parsing fails

        # Normalize to dict-like Python object
        parsed = None
        if isinstance(sdk_entry, dict):
            parsed = dict(sdk_entry)
            print(f"[DEBUG] Converted to dict, keys: {list(parsed.keys())}")
        elif hasattr(sdk_entry, "__dict__"):
            parsed = dict(sdk_entry.__dict__)
            print(f"[DEBUG] Converted from object.__dict__, keys: {list(parsed.keys())}")
        else:
            # fallback: return raw value under _raw
            parsed = {"_raw": sdk_entry}
            print(f"[DEBUG] Using fallback _raw structure")

        # Extract fields with multiple-name fallbacks
        def pick(d, *names):
            for n in names:
                if isinstance(d, dict):
                    # Try exact match
                    if n in d and d[n] is not None:
                        return d[n]
                    # Try with underscore prefix (for Upstox SDK objects)
                    underscore_key = f"_{n}"
                    if underscore_key in d and d[underscore_key] is not None:
                        return d[underscore_key]
            return None

        instrument_token = pick(parsed, "instrument_token", "instrumentToken", "token")
        last_price = pick(parsed, "last_price", "lastPrice", "ltp", "last_trade_price")
        net_change = pick(parsed, "net_change", "netChange", "change")
        ohlc = pick(parsed, "ohlc", "OHLC", "ohl")
        depth = pick(parsed, "depth", "market_depth")
        timestamp = pick(parsed, "timestamp", "last_trade_time", "time")

        print(f"[DEBUG] Extracted values:")
        print(f"  instrument_token: {instrument_token}")
        print(f"  last_price: {last_price}")
        print(f"  net_change: {net_change}")
        print(f"  ohlc: {ohlc}")
        print(f"  timestamp: {timestamp}")

        # Coerce numeric string to floats/ints where reasonable
        last_price = _coerce_number(last_price)
        net_change = _coerce_number(net_change)

        # Ensure ohlc/depth are JSON-friendly (if they are strings parse them)
        if isinstance(ohlc, str):
            try:
                ohlc = ast.literal_eval(ohlc)
            except Exception:
                pass
        if isinstance(depth, str):
            try:
                depth = ast.literal_eval(depth)
            except Exception:
                pass

        return {
            "symbol": symbol.upper(),
            "name": instrument_info.get("name"),
            "instrument_token": instrument_token,
            "last_price": last_price,
            "net_change": net_change,
            "ohlc": ohlc,
            "depth": depth,
            "timestamp": timestamp
        }

    except HTTPException:
        raise
    except Exception as e:
        print("[get_quote] Unexpected error:", e)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"API error: {e}")


def _safe_get(obj, key):
    """Helper to safely get attribute or dict key"""
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _coerce_number(val):
    """Try to convert string numbers to float/int"""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return val
    if isinstance(val, str):
        try:
            # Try int first
            if '.' not in val:
                return int(val)
            return float(val)
        except ValueError:
            return val
    return val

# Replace your existing get_history endpoint with this version that has better error handling:


# Replace your existing get_history endpoint with this version that has better error handling:

@app.get("/api/history/{symbol}")
async def get_history(
    symbol: str,
    request: Request, 
    interval: str = Query("1day", enum=["1minute", "30minute", "1day", "1week", "1month"]),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    """
    Fetches historical candle data for a given symbol.
    
    Note: Upstox API only supports 'to_date' parameter. The 'from_date' is used
    for client-side filtering only. The API returns:
    - 1minute/30minute: Last 30 days from to_date
    - 1day/1week: Last 365 days from to_date  
    - 1month: All available historical data
    """
    try:
        # Set default dates
        if not to_date:
            to_date = datetime.now().date().isoformat()
        if not from_date:
            # Default to 1 year ago for filtering
            from_date = (datetime.now().date() - timedelta(days=365)).isoformat()

        print(f"[get_history] Fetching history for: {symbol}")
        print(f"[get_history] Date range: {from_date} to {to_date}")
        print(f"[get_history] Interval: {interval}")

        # Get instrument details
        try:
            instrument_info = get_instrument_details(symbol)
            instrument_key = instrument_info.get("instrument_key")
            
            if not instrument_key:
                raise HTTPException(status_code=404, detail=f"Instrument key not found for symbol: {symbol}")
            
            print(f"[get_history] Instrument key: {instrument_key}")
            
        except Exception as e:
            print(f"[get_history] Error getting instrument details: {e}")
            raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")
        
        # Fetch historical candles
        try:
            candles = fetch_historical_candles(
                request, 
                instrument_key, 
                interval,  # Now this is "1day", "1week", etc.
                to_date, 
                from_date
            )
            
            if not candles:
                print(f"[get_history] No candle data returned for {symbol}")
                return {
                    "symbol": symbol.upper(),
                    "name": instrument_info.get("name"),
                    "instrument_key": instrument_key,
                    "candles": [],
                    "message": "No historical data available for the specified date range"
                }
            
            print(f"[get_history] Successfully fetched {len(candles)} candles")
            
            return {
                "symbol": symbol.upper(),
                "name": instrument_info.get("name"),
                "instrument_key": instrument_key,
                "candles": candles
            }
            
        except Exception as e:
            print(f"[get_history] Error fetching candles: {e}")
            import traceback
            traceback.print_exc()
            raise HTTPException(
                status_code=502, 
                detail=f"Failed to fetch historical data from Upstox: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[get_history] Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


# Also add this debug endpoint to help troubleshoot:
@app.get("/api/debug/history/{symbol}")
async def debug_history(
    symbol: str,
    request: Request,
    interval: str = Query("1day"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    """
    Debug endpoint that returns detailed information about the history request.
    """
    if not to_date:
        to_date = datetime.now().date().isoformat()
    if not from_date:
        from_date = (datetime.now().date() - timedelta(days=30)).isoformat()
    
    try:
        instrument_info = get_instrument_details(symbol)
        instrument_key = instrument_info.get("instrument_key")
        
        # Get access token
        access_token = request.cookies.get("upstox_access_token")
        
        return {
            "symbol": symbol,
            "instrument_info": instrument_info,
            "instrument_key": instrument_key,
            "has_token": bool(access_token),
            "token_preview": f"{access_token[:10]}..." if access_token else None,
            "request_params": {
                "interval": interval,
                "from_date": from_date,
                "to_date": to_date
            }
        }
    except Exception as e:
        import traceback
        return {
            "error": str(e),
            "traceback": traceback.format_exc()
        }

async def get_websocket_url(access_token: str) -> str:
    """
    Calls the Upstox API to get the authorized WebSocket V3 URL.
    (Unchanged)
    """
    url = "https://api.upstox.com/v3/feed/market-data-feed/authorize"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json"
    }
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(url, headers=headers)
            response.raise_for_status() 
            data = response.json()
            return data["data"]["authorized_redirect_uri"]
        except httpx.HTTPStatusError as e:
            print(f"HTTP error authorizing websocket: {e}")
            raise
        except Exception as e:
            print(f"Error authorizing websocket: {e}")
            raise

# --- NEW AI ENDPOINTS (with Groq SDK) ---
# --- +++ NEW AI NEWS ENDPOINT +++ ---
# Replace your existing get_market_news endpoint with this:

@app.get("/api/ai/get_market_news", response_model=NewsResponse)
async def get_market_news(
    symbol: str = Query(..., description="The stock symbol (e.g., 'RELIANCE')"),
    companyName: Optional[str] = Query(None, description="The full company name (e.g., 'Reliance Industries Ltd.')")
):
    """
    Uses Groq with browser_search tool to find recent market news
    for a given company and return it in a structured JSON format.
    """
    if not groq_client:
        raise HTTPException(status_code=503, detail="AI service (Groq) is not configured.")

    search_query = companyName if companyName else symbol
    today = datetime.now().strftime("%Y-%m-%d")

    system_prompt = f"""
    You are a specialized financial news assistant. Your task is to find the 5 most
    recent, relevant, and important news articles for the company: "{search_query}".
    
    RULES:
    1.  **Search:** You MUST use your browser_search tool to find real, recent news.
    2.  **Sources:** Focus ONLY on reputable Indian financial news sites (e.g., The Economic Times, Business Standard, Livemint, Moneycontrol, Reuters India).
    3.  **Recency:** Find articles from today ({today}) or the last 3-4 days.
    4.  **Images:** For each article, you MUST find a relevant, high-quality image URL.
        -   GOOD: A direct link to a .jpg, .png, or .webp image from the article.
        -   GOOD: A high-quality stock photo (e.g., from unsplash, pexels) that is relevant to the article's topic.
        -   BAD: Do NOT use company logos, icons, or placeholder images.
    5.  **Output:** After searching, respond with ONLY a valid JSON object matching this exact schema:
    {{
        "articles": [
            {{
                "headline": "string",
                "summary": "string (1-2 sentences)",
                "url": "string (full URL)",
                "sourceName": "string (publication name)",
                "imageUrl": "string (direct image URL)",
                "publishedTime": "string (e.g., '2 hours ago')"
            }}
        ]
    }}
    Do not include any other text, greetings, or explanations outside the JSON object.
    """

    try:
        # CRITICAL FIX: Add tools parameter with browser_search
        completion = await groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Find and format the 5 most recent news articles about {search_query}."}
            ],
            model="openai/gpt-oss-safeguard-20b",  # This model supports browser_search
            tools=[{"type": "browser_search"}],
            temperature=0.2,
            max_completion_tokens=2048,  # <-- CHANGED FROM 4096
        )
        
        # Extract the final response content
        response_content = completion.choices[0].message.content
        
        # Extract the final response content
        response_content = completion.choices[0].message.content
        
        if not response_content:
            raise HTTPException(status_code=500, detail="AI returned empty response")
        
        # Clean up the response (remove markdown code blocks if present)
        response_content = response_content.strip()
        if response_content.startswith("```json"):
            response_content = response_content.replace("```json", "", 1)
        if response_content.startswith("```"):
            response_content = response_content.replace("```", "", 1)
        if response_content.endswith("```"):
            response_content = response_content[:-3]
        response_content = response_content.strip()
        
        # Validate the JSON against our Pydantic model
        parsed_response = NewsResponse.model_validate_json(response_content)
        
        return parsed_response

    except pydantic.ValidationError as e:
        print(f"Groq JSON validation error: {e}")
        print(f"Raw response: {response_content}")
        raise HTTPException(status_code=500, detail=f"AI failed to return valid JSON structure.")
    except Exception as e:
        print(f"Error calling Groq: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error communicating with AI service: {str(e)}")
    


@app.post("/api/ai/analyze")
async def analyze_sentiment(payload: AIRequest):
    """
    Uses Groq SDK for a simple (non-streaming) AI task.
    """
    if not groq_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not set.")
    
    try:
        completion = await groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": payload.prompt},
                {"role": "user", "content": payload.text}
            ],
            model="llama3-8b-8192", # Using a fast model for sentiment
            temperature=0.1,
            max_tokens=50,
        )
        return {"response": completion.choices[0].message.content}
            
    except Exception as e:
        print(f"Error calling Groq: {e}")
        raise HTTPException(status_code=500, detail="Error communicating with AI service.")


@app.post("/api/ai/chat")
async def ai_chat_stream(payload: ChatRequest):
    """
    NEW: A streaming chat endpoint using the Groq SDK.
    """
    if not groq_client:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not set.")

    async def get_groq_response():
        try:
            stream = await groq_client.chat.completions.create(
                messages=[msg.model_dump() for msg in payload.messages],
                model=payload.model,
                temperature=0.7,
                max_tokens=2048,
                stream=True,
            )
            
            async for chunk in stream:
                content = chunk.choices[0].delta.content or ""
                if content:
                    # Stream JSON objects for easier frontend handling
                    yield f"data: {json.dumps({'content': content})}\n\n"

            # Signal the end of the stream
            yield f"data: {json.dumps({'content': '[DONE]'})}\n\n"

        except Exception as e:
            print(f"Error during Groq stream: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    # Return a StreamingResponse using Server-Sent Events
    return StreamingResponse(get_groq_response(), media_type="text/event-stream")


# --- NEW DYNAMIC WEBSOCKET ENDPOINT ---

@app.websocket("/ws/feed")
async def websocket_feed_endpoint(websocket: WebSocket):
    """
    Handles a client WebSocket connection.
    1. Registers client for broadcasts.
    2. Listens for 'subscribe'/'unsubscribe' messages from the client.
    3. Filters broadcast messages, sending only those the client subscribed to.
    """
    await websocket.accept()

    token = websocket.cookies.get("upstox_access_token") or websocket.query_params.get("token")
    if token:
        feed_manager.set_token(token)

    client_queue = await feed_manager.register(websocket)
    client_subs: Set[str] = set() # Keys this *specific* client is watching

    async def client_message_reader():
        """Task to read messages *from* the client (e.g., sub requests)"""
        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                key = data.get("key") # e.g., "NSE_EQ|INE002A01018"
                
                if not key:
                    continue
                
                # Normalize key for internal tracking (replace | with :)
                normalized_key = key.replace('|', ':')

                if msg_type == "subscribe":
                    if normalized_key not in client_subs:
                        client_subs.add(normalized_key)
                        await feed_manager.add_subscription(key) # Use original key for Upstox
                
                elif msg_type == "unsubscribe":
                    if normalized_key in client_subs:
                        client_subs.remove(normalized_key)
                        await feed_manager.remove_subscription(key) # Use original key for Upstox
        
        except WebSocketDisconnect:
            print("[websocket_feed_endpoint] Client message reader disconnected.")
        except Exception as e:
            print(f"[websocket_feed_endpoint] Error in client message reader: {e}")

    async def broadcast_message_sender():
        """Task to read messages *from* the broadcast queue and send to client"""
        try:
            while True:
                msg = await client_queue.get() # Wait for message from manager
                
                if msg.get("type") == "server_shutdown":
                    break
                
                msg_feeds = msg.get("feeds")
                if not msg_feeds or not client_subs:
                    continue

                # Filter feeds, sending only what this client asked for
                relevant_feeds = {k: v for k, v in msg_feeds.items() if k in client_subs}
                
                if relevant_feeds:
                    filtered_msg = msg.copy()
                    filtered_msg["feeds"] = relevant_feeds
                    await websocket.send_json(filtered_msg)

        except WebSocketDisconnect:
            print("[websocket_feed_endpoint] Broadcast sender disconnected.")
        except Exception as e:
            print(f"[websocket_feed_endpoint] Error in broadcast sender: {e}")

    # Run both tasks concurrently
    try:
        await asyncio.gather(client_message_reader(), broadcast_message_sender())
    except Exception as e:
        print(f"Error in WebSocket gather: {e}")
    finally:
        print(f"[websocket_feed_endpoint] Client disconnected. Cleaning up {len(client_subs)} subs.")
        # Notify manager to (potentially) unsubscribe from Upstox
        for sub_key in list(client_subs):
            await feed_manager.remove_subscription(sub_key.replace(':', '|'))
        await feed_manager.unregister(websocket)
        try:
            await websocket.close()
        except Exception:
            pass