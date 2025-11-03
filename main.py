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
from google import genai  # <-- CHANGED: Import Gemini
from google.genai import types  # <-- CHANGED: Import Gemini types

# --- Your Application Imports ---
from src.upstox_helper import (
    get_instrument_details,
    fetch_live_quote,
    fetch_historical_candles,
    get_user_profile
)
from src.instrument_service import update_instrument_database, DB_PATH

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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")  # <-- CHANGED: Use Gemini API key

# --- CHANGED: Initialize Gemini Client ---
gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
else:
    print("Warning: GEMINI_API_KEY not set. AI features will be disabled.")


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


# --- Pydantic Models for AI ---
# --- Pydantic Models for AI ---
class AIRequest(pydantic.BaseModel):
    text: str
    prompt: str = "Analyze the sentiment of this financial news headline. Respond with one word: POSITIVE, NEGATIVE, or NEUTRAL."

class SentimentAnalysisRequest(pydantic.BaseModel):
    """Request for sentiment analysis with news context"""
    symbol: str
    news_articles: List[Dict]  # List of news articles from get_market_news
    
class ChatMessage(pydantic.BaseModel):
    role: str
    content: str

class ChatRequest(pydantic.BaseModel):
    messages: List[ChatMessage]
    model: str = "gemini-flash-lite-latest"
    # Context data
    watched_instruments: Optional[List[Dict]] = None  # Current quotes for user's watchlist
    recent_news: Optional[Dict[str, List[Dict]]] = None  # News by symbol

# --- Pydantic Models for News ---
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
        self._clients: Dict[WebSocket, asyncio.Queue] = {}
        self._upstream_task: Optional[asyncio.Task] = None
        self._running = False
        self._lock = asyncio.Lock()
        self._token: Optional[str] = None
        self._stop = asyncio.Event()
        
        self.upstream_socket: Optional[websockets.WebSocketClientProtocol] = None
        self.subscriptions: Set[str] = set()
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

    async def _send_subscription_request(self, keys: Set[str], mode: pb.RequestMode = pb.RequestMode.ltpc, subscribe: bool = True):
        """Helper to build and send a sub/unsub request to Upstox."""
        if not self.upstream_socket:
            print("[UpstoxFeedManager] Cannot subscribe, upstream socket is not connected.")
            return

        try:
            sub_request = pb.Feed()
            if mode == pb.RequestMode.ltpc:
                lt = pb.LTPC()
                if hasattr(lt, "instrument_keys"):
                    lt.instrument_keys.extend(list(keys))
                    sub_request.ltpc.CopyFrom(lt)
                else:
                    sub_request.ltpc.instrument_keys.extend(list(keys))
                sub_request.requestMode = pb.RequestMode.ltpc
            
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
                await self._send_subscription_request(keys={key}, subscribe=True)

    async def remove_subscription(self, key: str):
        """
        Removes a key from master set.
        NOTE: For simplicity, we DON'T unsubscribe from Upstox.
        """
        async with self.sub_lock:
            if key in self.subscriptions:
                print(f"[UpstoxFeedManager] Client unsubscribed, but master sub for {key} is kept active.")
                pass

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
                    self.upstream_socket = upstox_socket
                    backoff = 3.0

                    if self.subscriptions:
                        print(f"[UpstoxFeedManager] Re-subscribing to {len(self.subscriptions)} keys...")
                        await self._send_subscription_request(keys=self.subscriptions, subscribe=True)
                    
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
                self.upstream_socket = None

            wait = backoff + (0.5 * backoff * (0.5 - asyncio.random.random() if hasattr(asyncio, "random") else 0) if False else 0)
            jitter = (0.5 * backoff)
            wait = min(max(1.0, backoff + (jitter * (0.5 - 0.5))), max_backoff)
            await asyncio.sleep(backoff + (0.2 * backoff))
            backoff = min(backoff * 2, max_backoff)

# --- Initialize the single feed manager ---
feed_manager = UpstoxFeedManager()

# --- Chat Memory Store (In-Memory) ---
# In production, use Redis or a database
chat_memory: Dict[str, List[Dict]] = {}  # session_id -> list of messages

def get_or_create_session(session_id: str) -> List[Dict]:
    """Get chat history for a session or create new one"""
    if session_id not in chat_memory:
        chat_memory[session_id] = []
    return chat_memory[session_id]

def add_to_chat_memory(session_id: str, role: str, content: str):
    """Add a message to chat history"""
    history = get_or_create_session(session_id)
    history.append({"role": role, "content": content})
    # Keep only last 20 messages to avoid context overflow
    if len(history) > 20:
        chat_memory[session_id] = history[-20:]
# --- Authentication Endpoints ---

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
            secure=False,
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

# --- Data Endpoints ---

@app.get("/api/user/profile")
async def get_profile(request: Request):
    """Fetches the logged-in user's Upstox profile."""
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
    """Searches the local instrument database for equities and indices."""
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

# --- Quote and History Endpoints (keeping existing code) ---

@app.get("/api/debug/raw_quote_save/{symbol}")
async def debug_raw_quote_save(symbol: str, request: Request):
    """Debug helper for quote data"""
    try:
        instrument_info = get_instrument_details(symbol)
        instrument_key = instrument_info.get("instrument_key")
        print(f"[DEBUG] Fetching live quote for: {symbol} ({instrument_key})")

        quote_data = fetch_live_quote(request, instrument_key)

        def safe_serialize(obj):
            try:
                return json.loads(json.dumps(obj, default=str))
            except Exception:
                try:
                    return repr(obj)
                except Exception:
                    return f"<unserializable {type(obj)}>"

        serializable = safe_serialize(quote_data)

        fname = f"debug_quote_{symbol.upper().replace(' ', '_')}.json"
        path = pathlib.Path.cwd() / fname
        try:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(serializable, fh, indent=2, ensure_ascii=False)
            saved = True
        except Exception as e:
            print(f"[DEBUG] Failed to write debug file: {e}")
            saved = False

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

        print(f"[DEBUG] Saved raw quote to: {path}" if saved else "[DEBUG] Did not save raw quote.")
        print(f"[DEBUG] Type: {type(quote_data)}")
        print(preview_text[:800])

        return resp

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Debug error: {e}")

@app.get("/api/quote/{symbol}")
async def get_quote(symbol: str, request: Request):
    """Robust quote endpoint with fixed string-to-dict parsing"""
    try:
        instrument_info = get_instrument_details(symbol)
        instrument_key = instrument_info.get("instrument_key")
        if not instrument_key:
            raise HTTPException(status_code=404, detail="Instrument key not found")

        try:
            quote_data = fetch_live_quote(request, instrument_key)
        except Exception as e:
            print("[get_quote] fetch_live_quote error:", e)
            raise HTTPException(status_code=502, detail=f"Upstream error: {e}")

        alt_keys = {
            instrument_key,
            instrument_key.replace("|", ":"),
            instrument_key.replace(":", "|"),
            instrument_key.split("|")[-1] if "|" in instrument_key else instrument_key,
            symbol.upper(),
            symbol.replace(" ", "_").upper()
        }

        sdk_entry = None

        if isinstance(quote_data, dict):
            for k in alt_keys:
                if k in quote_data:
                    sdk_entry = quote_data[k]
                    break

            if sdk_entry is None:
                for k, v in quote_data.items():
                    if isinstance(k, str):
                        for alt in alt_keys:
                            if k.endswith(str(alt)):
                                sdk_entry = v
                                break
                    if sdk_entry is not None:
                        break

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

        if sdk_entry is None:
            if hasattr(quote_data, "instrument_token") or hasattr(quote_data, "last_price"):
                sdk_entry = quote_data

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

        print(f"\n[DEBUG] Symbol: {symbol}")
        print(f"[DEBUG] sdk_entry type: {type(sdk_entry)}")
        print(f"[DEBUG] sdk_entry value (first 500 chars): {str(sdk_entry)[:500]}")

        if isinstance(sdk_entry, str):
            try:
                sdk_entry = ast.literal_eval(sdk_entry)
                print(f"[DEBUG] Successfully parsed stringified dict for {symbol}")
                print(f"[DEBUG] After parsing, type: {type(sdk_entry)}")
            except Exception as parse_err:
                print(f"[DEBUG] Failed to parse string as dict: {parse_err}")

        parsed = None
        if isinstance(sdk_entry, dict):
            parsed = dict(sdk_entry)
            print(f"[DEBUG] Converted to dict, keys: {list(parsed.keys())}")
        elif hasattr(sdk_entry, "__dict__"):
            parsed = dict(sdk_entry.__dict__)
            print(f"[DEBUG] Converted from object.__dict__, keys: {list(parsed.keys())}")
        else:
            parsed = {"_raw": sdk_entry}
            print(f"[DEBUG] Using fallback _raw structure")

        def pick(d, *names):
            for n in names:
                if isinstance(d, dict):
                    if n in d and d[n] is not None:
                        return d[n]
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

        last_price = _coerce_number(last_price)
        net_change = _coerce_number(net_change)

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
            if '.' not in val:
                return int(val)
            return float(val)
        except ValueError:
            return val
    return val

@app.get("/api/history/{symbol}")
async def get_history(
    symbol: str,
    request: Request, 
    interval: str = Query("1day", enum=["1minute", "30minute", "1day", "1week", "1month"]),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    """Fetches historical candle data for a given symbol."""
    try:
        if not to_date:
            to_date = datetime.now().date().isoformat()
        if not from_date:
            from_date = (datetime.now().date() - timedelta(days=365)).isoformat()

        print(f"[get_history] Fetching history for: {symbol}")
        print(f"[get_history] Date range: {from_date} to {to_date}")
        print(f"[get_history] Interval: {interval}")

        try:
            instrument_info = get_instrument_details(symbol)
            instrument_key = instrument_info.get("instrument_key")
            
            if not instrument_key:
                raise HTTPException(status_code=404, detail=f"Instrument key not found for symbol: {symbol}")
            
            print(f"[get_history] Instrument key: {instrument_key}")
            
        except Exception as e:
            print(f"[get_history] Error getting instrument details: {e}")
            raise HTTPException(status_code=404, detail=f"Instrument not found: {symbol}")
        
        try:
            candles = fetch_historical_candles(
                request, 
                instrument_key, 
                interval,
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


@app.get("/api/debug/history/{symbol}")
async def debug_history(
    symbol: str,
    request: Request,
    interval: str = Query("1day"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None
):
    """Debug endpoint for history requests."""
    if not to_date:
        to_date = datetime.now().date().isoformat()
    if not from_date:
        from_date = (datetime.now().date() - timedelta(days=30)).isoformat()
    
    try:
        instrument_info = get_instrument_details(symbol)
        instrument_key = instrument_info.get("instrument_key")
        
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
    """Calls the Upstox API to get the authorized WebSocket V3 URL."""
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

# --- CHANGED: AI ENDPOINTS using Gemini ---

@app.get("/api/ai/get_market_news", response_model=NewsResponse)
async def get_market_news(
    symbol: str = Query(..., description="The stock symbol (e.g., 'RELIANCE')"),
    companyName: Optional[str] = Query(None, description="The full company name (e.g., 'Reliance Industries Ltd.')")
):
    """
    Uses Gemini with Google Search to find recent market news
    for a given company and return it in a structured JSON format.
    Includes retry logic for handling API failures.
    """
    if not gemini_client:
        raise HTTPException(status_code=503, detail="AI service (Gemini) is not configured.")

    search_query = companyName if companyName else symbol
    today = datetime.now().strftime("%Y-%m-%d")
    
    # Retry configuration
    max_retries = 3
    retry_delay = 1.0  # seconds

    system_prompt = f"""
    You are a specialized financial news assistant. Your task is to find the 5 most
    recent, relevant, and important news articles for the company: "{search_query}".
    
    CRITICAL RULES - YOU MUST FOLLOW EXACTLY:
    1.  **Search:** You MUST use Google Search to find real, recent news about this company.
    2.  **Sources:** Focus ONLY on reputable Indian financial news sites (e.g., The Economic Times, Business Standard, Livemint, Moneycontrol, Reuters India).
    3.  **Recency:** Find articles from today ({today}) or the last 3-4 days.
    4.  **Images:** For each article, you MUST find a relevant, high-quality image URL:
        -   REQUIRED: Must be a direct link to .jpg, .png, or .webp image (NOT .svg, NOT logos)
        -   GOOD: Article thumbnail images, stock photos related to the company/topic
        -   BAD: Company logos, icons, placeholder images, SVG files, or Livemint/ET logos
        -   If no good image is found, use: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800"
    5.  **Published Time:** You MUST include the publishedTime field for EVERY article.
        -   Format: "X hours ago", "X days ago", or "Oct 31, 2025"
        -   NEVER leave this field empty or omit it
    6.  **Output Format:** Respond with ONLY a valid JSON object. ALL FIVE FIELDS ARE MANDATORY for each article:
    {{
        "articles": [
            {{
                "headline": "string (REQUIRED)",
                "summary": "string (REQUIRED - 1-2 sentences)",
                "url": "string (REQUIRED - full URL)",
                "sourceName": "string (REQUIRED - publication name)",
                "imageUrl": "string (REQUIRED - must be .jpg/.png/.webp, NOT .svg)",
                "publishedTime": "string (REQUIRED - e.g., '2 hours ago', '3 days ago', 'Nov 1, 2025')"
            }}
        ]
    }}
    
    IMPORTANT: Every article object MUST have all 6 fields. Do not omit publishedTime or imageUrl.
    Do not include any other text, greetings, or explanations outside the JSON object.
    """

    user_prompt = f"Find and format the 5 most recent news articles about {search_query}."

    # Retry loop - will attempt up to max_retries times
    last_error = None
    for attempt in range(1, max_retries + 1):  # This creates loop: 1, 2, 3
        try:
            print(f"[News API] Attempt {attempt}/{max_retries} for {search_query}")
            
            # Build Gemini request with Google Search tool
            contents = [
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_text(text=f"{system_prompt}\n\n{user_prompt}"),
                    ],
                ),
            ]
            
            generate_content_config = types.GenerateContentConfig(
                temperature=0.2,
                max_output_tokens=2048,
                tools=[types.Tool(google_search=types.GoogleSearch())],  # Enable Google Search
            )

            # Generate response
            response = gemini_client.models.generate_content(
                model="gemini-flash-lite-latest",
                contents=contents,
                config=generate_content_config,
            )
            
            # Extract text from response
            response_content = response.text
            
            if not response_content:
                raise ValueError("AI returned empty response")
            
            # Clean up the response (remove markdown code blocks if present)
            response_content = response_content.strip()
            if response_content.startswith("```json"):
                response_content = response_content.replace("```json", "", 1)
            if response_content.startswith("```"):
                response_content = response_content.replace("```", "", 1)
            if response_content.endswith("```"):
                response_content = response_content[:-3]
            response_content = response_content.strip()
            
            # Parse JSON first (before Pydantic validation)
            try:
                articles_data = json.loads(response_content)
            except json.JSONDecodeError as e:
                print(f"[News API] Attempt {attempt} - JSON decode error: {e}")
                print(f"[News API] Raw response: {response_content[:500]}...")
                raise ValueError(f"AI returned invalid JSON: {str(e)}")
            
            # Validate articles exist
            if "articles" not in articles_data or not articles_data["articles"]:
                raise ValueError("AI response missing articles array")
            
            # Post-process articles to fix missing/bad data
            default_image = "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800"
            
            for article in articles_data.get("articles", []):
                # Fix missing publishedTime
                if "publishedTime" not in article or not article["publishedTime"]:
                    article["publishedTime"] = "Recently"
                
                # Fix bad image URLs (SVG, logos, etc.)
                image_url = article.get("imageUrl", "")
                if not image_url or image_url.endswith(".svg") or "logo" in image_url.lower():
                    article["imageUrl"] = default_image
                    print(f"[News] Replaced bad image URL for: {article.get('headline', 'Unknown')[:50]}")
            
            # Now validate with Pydantic
            parsed_response = NewsResponse.model_validate(articles_data)
            
            print(f"[News API] Successfully fetched news on attempt {attempt}")
            return parsed_response
            
        except pydantic.ValidationError as e:
            last_error = e
            print(f"[News API] Attempt {attempt} - Pydantic validation error: {e}")
            if attempt < max_retries:
                print(f"[News API] Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
            continue
            
        except ValueError as e:
            last_error = e
            print(f"[News API] Attempt {attempt} - ValueError: {e}")
            if attempt < max_retries:
                print(f"[News API] Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2
            continue
            
        except Exception as e:
            last_error = e
            print(f"[News API] Attempt {attempt} - Unexpected error: {e}")
            import traceback
            traceback.print_exc()
            if attempt < max_retries:
                print(f"[News API] Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2
            continue
    
    # All retries exhausted
    print(f"[News API] All {max_retries} attempts failed for {search_query}")
    error_msg = f"Failed to fetch news after {max_retries} attempts"
    if last_error:
        if isinstance(last_error, pydantic.ValidationError):
            error_msg += f": Validation error - {str(last_error)}"
        else:
            error_msg += f": {str(last_error)}"
    
    raise HTTPException(status_code=500, detail=error_msg)

@app.post("/api/ai/analyze")
async def analyze_sentiment(payload: SentimentAnalysisRequest):
    """
    Analyzes sentiment of news articles for a given stock symbol.
    Uses the actual news context to provide informed sentiment analysis.
    """
    if not gemini_client:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")
    
    try:
        # Build context from news articles
        news_context = f"Stock Symbol: {payload.symbol}\n\nRecent News Articles:\n"
        for i, article in enumerate(payload.news_articles[:5], 1):  # Limit to 5 articles
            news_context += f"\n{i}. {article.get('headline', 'N/A')}\n"
            news_context += f"   Summary: {article.get('summary', 'N/A')}\n"
            news_context += f"   Source: {article.get('sourceName', 'N/A')}\n"
        
        system_prompt = """You are a financial sentiment analyst. Analyze the provided news articles 
        and provide a comprehensive sentiment analysis for the stock. 
        
        Provide your analysis in this format:
        - Overall Sentiment: [POSITIVE/NEGATIVE/NEUTRAL]
        - Confidence: [HIGH/MEDIUM/LOW]
        - Key Points: [2-3 bullet points explaining the sentiment]
        - Recommendation: [Brief investment perspective]
        
        Be concise but insightful."""
        
        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_text(text=f"{system_prompt}\n\n{news_context}"),
                ],
            ),
        ]
        
        generate_content_config = types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=500,
        )

        response = gemini_client.models.generate_content(
            model="gemini-flash-lite-latest",
            contents=contents,
            config=generate_content_config,
        )
        
        return {
            "symbol": payload.symbol,
            "analysis": response.text,
            "articles_analyzed": len(payload.news_articles)
        }
            
    except Exception as e:
        print(f"Error calling Gemini for sentiment analysis: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Error communicating with AI service.")

@app.post("/api/ai/chat")
async def ai_chat_stream(
    payload: ChatRequest,
    session_id: str = Query(default="default", description="Session ID for chat memory")
):
    """
    A streaming chat endpoint using Gemini with full financial context.
    Includes chat memory and real-time market data.
    """
    if not gemini_client:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")

    async def get_gemini_response():
        try:
            # Retrieve chat history for this session
            chat_history = get_or_create_session(session_id)
            
            # Build financial context
            context_parts = ["You are Finverse AI, a helpful financial assistant with access to real-time market data."]
            
            # Add watchlist context if provided
            if payload.watched_instruments:
                context_parts.append("\n📊 User's Current Watchlist:")
                for instrument in payload.watched_instruments:
                    symbol = instrument.get('symbol', 'N/A')
                    last_price = instrument.get('last_price', 'N/A')
                    net_change = instrument.get('net_change', 'N/A')
                    context_parts.append(f"  • {symbol}: ₹{last_price} (Change: {net_change})")
            
            # Add news context if provided
            if payload.recent_news:
                context_parts.append("\n📰 Recent News:")
                for symbol, articles in payload.recent_news.items():
                    context_parts.append(f"\n  {symbol}:")
                    for article in articles[:3]:  # Limit to 3 articles per symbol
                        context_parts.append(f"    - {article.get('headline', 'N/A')}")
            
            financial_context = "\n".join(context_parts)
            
            # Build conversation with memory
            contents = []
            
            # Add system context as first user message (Gemini doesn't have system role)
            if not chat_history:  # Only add context at start of conversation
                contents.append(
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=financial_context)],
                    )
                )
                contents.append(
                    types.Content(
                        role="model",
                        parts=[types.Part.from_text(text="I understand. I'm ready to help you with financial insights using the provided market data.")],
                    )
                )
            
            # Add chat history (last 10 messages to keep context manageable)
            for msg in chat_history[-10:]:
                role = "user" if msg["role"] == "user" else "model"
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=msg["content"])],
                    )
                )
            
            # Add current user message from payload
            current_user_message = payload.messages[-1].content if payload.messages else ""
            contents.append(
                types.Content(
                    role="user",
                    parts=[types.Part.from_text(text=current_user_message)],
                )
            )
            
            # Store user message in memory
            add_to_chat_memory(session_id, "user", current_user_message)
            
            generate_content_config = types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=2048,
            )

            # Use streaming
            stream = gemini_client.models.generate_content_stream(
                model=payload.model,
                contents=contents,
                config=generate_content_config,
            )
            
            # Collect full response for memory
            full_response = ""
            
            for chunk in stream:
                if chunk.text:
                    full_response += chunk.text
                    # Stream JSON objects for easier frontend handling
                    yield f"data: {json.dumps({'content': chunk.text})}\n\n"

            # Store assistant response in memory
            add_to_chat_memory(session_id, "assistant", full_response)
            
            # Signal the end of the stream
            yield f"data: {json.dumps({'content': '[DONE]'})}\n\n"

        except Exception as e:
            print(f"Error during Gemini stream: {e}")
            import traceback
            traceback.print_exc()
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    # Return a StreamingResponse using Server-Sent Events
    return StreamingResponse(get_gemini_response(), media_type="text/event-stream")

@app.delete("/api/ai/chat/history/{session_id}")
async def clear_chat_history(session_id: str):
    """Clear chat history for a specific session"""
    if session_id in chat_memory:
        del chat_memory[session_id]
        return {"message": f"Chat history cleared for session: {session_id}"}
    return {"message": f"No chat history found for session: {session_id}"}


@app.get("/api/ai/chat/history/{session_id}")
async def get_chat_history(session_id: str):
    """Retrieve chat history for a specific session"""
    history = get_or_create_session(session_id)
    return {
        "session_id": session_id,
        "message_count": len(history),
        "messages": history
    }

# --- WebSocket Endpoint ---

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
    client_subs: Set[str] = set()

    async def client_message_reader():
        """Task to read messages *from* the client (e.g., sub requests)"""
        try:
            while True:
                data = await websocket.receive_json()
                msg_type = data.get("type")
                key = data.get("key")
                
                if not key:
                    continue
                
                normalized_key = key.replace('|', ':')

                if msg_type == "subscribe":
                    if normalized_key not in client_subs:
                        client_subs.add(normalized_key)
                        await feed_manager.add_subscription(key)
                
                elif msg_type == "unsubscribe":
                    if normalized_key in client_subs:
                        client_subs.remove(normalized_key)
                        await feed_manager.remove_subscription(key)
        
        except WebSocketDisconnect:
            print("[websocket_feed_endpoint] Client message reader disconnected.")
        except Exception as e:
            print(f"[websocket_feed_endpoint] Error in client message reader: {e}")

    async def broadcast_message_sender():
        """Task to read messages *from* the broadcast queue and send to client"""
        try:
            while True:
                msg = await client_queue.get()
                
                if msg.get("type") == "server_shutdown":
                    break
                
                msg_feeds = msg.get("feeds")
                if not msg_feeds or not client_subs:
                    continue

                relevant_feeds = {k: v for k, v in msg_feeds.items() if k in client_subs}
                
                if relevant_feeds:
                    filtered_msg = msg.copy()
                    filtered_msg["feeds"] = relevant_feeds
                    await websocket.send_json(filtered_msg)

        except WebSocketDisconnect:
            print("[websocket_feed_endpoint] Broadcast sender disconnected.")
        except Exception as e:
            print(f"[websocket_feed_endpoint] Error in broadcast sender: {e}")

    try:
        await asyncio.gather(client_message_reader(), broadcast_message_sender())
    except Exception as e:
        print(f"Error in WebSocket gather: {e}")
    finally:
        print(f"[websocket_feed_endpoint] Client disconnected. Cleaning up {len(client_subs)} subs.")
        for sub_key in list(client_subs):
            await feed_manager.remove_subscription(sub_key.replace(':', '|'))
        await feed_manager.unregister(websocket)
        try:
            await websocket.close()
        except Exception:
            pass