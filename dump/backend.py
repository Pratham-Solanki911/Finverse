# backend.py
from fastapi import FastAPI, HTTPException, Depends, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from typing import Optional, List
import upstox_client
from upstox_client.rest import ApiException
import os
from dotenv import load_dotenv
from datetime import datetime
import asyncio
from concurrent.futures import ThreadPoolExecutor
import traceback

# Load environment variables
load_dotenv()

# App init
app = FastAPI(title="Upstox Trading Dashboard", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Templates (assumes ./templates has the html files)
templates = Jinja2Templates(directory="templates")

# Security
security = HTTPBearer()

# In-memory store for active configurations, keyed by access_token
user_configurations = {}

# Executor for blocking SDK calls
executor = ThreadPoolExecutor(max_workers=6)


# ----------------------------
# Pydantic models
# ----------------------------
class LoginRequest(BaseModel):
    # Demo/front-end fields
    login_id: Optional[str] = None
    password: Optional[str] = None

    # Legacy/real fields
    api_key: Optional[str] = None
    access_token: Optional[str] = None


class LoginResponse(BaseModel):
    success: bool
    message: str
    user_data: Optional[dict] = None


class MarketQuoteRequest(BaseModel):
    symbol: str
    exchange: str


class HistoricalDataRequest(BaseModel):
    instrument_key: str
    interval: str
    to_date: str
    from_date: Optional[str] = None


# Helper: DEMO_TOKEN reads from env; but we won't short-circuit based on it anymore.
DEMO_TOKEN = os.getenv('ACCESS_TOKEN') or os.getenv('UPSTOX_ACCESS_TOKEN') or None


# Utility to create ApiClient from token
def build_api_client_from_token(token: str):
    configuration = upstox_client.Configuration()
    configuration.access_token = token
    return upstox_client.ApiClient(configuration)


# Dependency to produce an ApiClient for endpoints
def get_api_client(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    # debug logging
    print(f"[get_api_client] incoming token: {token!r}; known tokens: {list(user_configurations.keys())}")
    if token not in user_configurations:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    configuration = user_configurations.get(token)
    # If configuration is stored (should be an upstox_client.Configuration), build ApiClient
    if configuration is not None:
        try:
            return upstox_client.ApiClient(configuration)
        except Exception:
            # fallback: try create configuration from token
            try:
                return build_api_client_from_token(token)
            except Exception:
                raise HTTPException(status_code=500, detail="Failed to build Upstox API client")
    else:
        # if we stored None (shouldn't happen with this patch), try building from token
        try:
            return build_api_client_from_token(token)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to build Upstox API client")


# ----------------------------
# Frontend routes (templates)
# ----------------------------
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/portfolio", response_class=HTMLResponse)
async def portfolio_page(request: Request):
    return templates.TemplateResponse("portfolio.html", {"request": request})


@app.get("/orders", response_class=HTMLResponse)
async def orders_page(request: Request):
    return templates.TemplateResponse("orders.html", {"request": request})


@app.get("/market", response_class=HTMLResponse)
async def market_page(request: Request):
    return templates.TemplateResponse("market.html", {"request": request})


# ----------------------------
# Authentication endpoint (demo behaves like real)
# ----------------------------
@app.post("/api/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    """
    Accept either:
      - { "login_id": "123", "password": "123" }  -> demo front-end path: uses ACCESS_TOKEN from .env (must be a real token to fetch real data)
      - { "api_key": "...", "access_token": "..." } -> legacy flow (uses provided access_token)
    """
    # 1) Demo front-end path: if login_id/password provided -> use ACCESS_TOKEN from .env
    if (request.login_id is not None) or (request.password is not None):
        # require both for demo path
        if (request.login_id == '123') and (request.password == '123'):
            ACCESS_TOKEN = os.getenv('ACCESS_TOKEN') or os.getenv('UPSTOX_ACCESS_TOKEN')
            API_KEY = os.getenv('API_KEY') or os.getenv('UPSTOX_API_KEY')
            API_SECRET = os.getenv('API_SECRET') or os.getenv('UPSTOX_API_SECRET')

            if not ACCESS_TOKEN:
                raise HTTPException(status_code=400, detail="ACCESS_TOKEN is not set in environment; cannot use demo login for real data.")

            # Attempt to verify token by calling get_profile with timeout
            try:
                # build configuration and client
                configuration = upstox_client.Configuration()
                configuration.access_token = ACCESS_TOKEN
                api_client = upstox_client.ApiClient(configuration)
                user_api = upstox_client.UserApi(api_client)

                def call_get_profile():
                    return user_api.get_profile("2.0")

                api_response = await asyncio.wait_for(
                    asyncio.get_event_loop().run_in_executor(executor, call_get_profile),
                    timeout=8.0
                )

                # if success, store configuration keyed by ACCESS_TOKEN
                user_configurations[ACCESS_TOKEN] = configuration

                return LoginResponse(
                    success=True,
                    message="Authentication successful (demo -> using ACCESS_TOKEN from .env)",
                    user_data={
                        "user_name": getattr(api_response.data, 'user_name', os.getenv('DEMO_USER_NAME', 'Demo User')),
                        "email": getattr(api_response.data, 'email', os.getenv('DEMO_USER_EMAIL', 'demo@example.com')),
                        "user_id": getattr(api_response.data, 'user_id', os.getenv('DEMO_USER_ID', 'demo_user_1')),
                        "access_token": ACCESS_TOKEN,
                        "api_key": API_KEY,
                        "api_secret": API_SECRET
                    }
                )

            except asyncio.TimeoutError:
                raise HTTPException(status_code=504, detail="Upstox API timed out while verifying ACCESS_TOKEN (8s)")
            except ApiException as e:
                # Upstox returned an API error during verification
                raise HTTPException(status_code=400, detail=f"Upstox API error during verification: {str(e)}")
            except Exception as e:
                tb = traceback.format_exc()
                print("[login][demo] verification exception:", tb)
                raise HTTPException(status_code=502, detail=f"Error verifying ACCESS_TOKEN: {type(e).__name__}: {str(e)}")

        else:
            raise HTTPException(status_code=401, detail="Invalid demo login_id/password. For demo use '123'/'123'.")

    # 2) Legacy flow: api_key + access_token provided
    if request.api_key and request.access_token:
        try:
            configuration = upstox_client.Configuration()
            configuration.access_token = request.access_token
            api_client = upstox_client.ApiClient(configuration)
            user_api = upstox_client.UserApi(api_client)

            def call_get_profile():
                return user_api.get_profile("2.0")

            api_response = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(executor, call_get_profile),
                timeout=8.0
            )

            # store config keyed by provided access_token
            user_configurations[request.access_token] = configuration

            return LoginResponse(
                success=True,
                message="Authentication successful",
                user_data={
                    "user_name": getattr(api_response.data, 'user_name', None),
                    "email": getattr(api_response.data, 'email', None),
                    "user_id": getattr(api_response.data, 'user_id', None),
                    "access_token": request.access_token
                }
            )

        except asyncio.TimeoutError:
            raise HTTPException(status_code=504, detail="Upstox API timed out while verifying provided access_token (8s)")
        except ApiException as e:
            raise HTTPException(status_code=400, detail=f"Upstox API error during verification: {str(e)}")
        except Exception as e:
            tb = traceback.format_exc()
            print("[login][legacy] exception:", tb)
            raise HTTPException(status_code=502, detail=f"Error verifying provided access_token: {type(e).__name__}: {str(e)}")

    # 3) If neither form provided -> validation guidance
    raise HTTPException(
        status_code=422,
        detail=[
            {"loc": ["body", "login_id"], "msg": "Provide login_id/password (demo) OR api_key/access_token (real).", "type": "value_error"},
            {"loc": ["body", "api_key"], "msg": "Provide login_id/password (demo) OR api_key/access_token (real).", "type": "value_error"}
        ]
    )


# ----------------------------
# Real-data endpoints (no demo short-circuit)
# All endpoints call Upstox SDK using api_client provided by get_api_client
# ----------------------------

@app.get("/api/user/profile")
async def get_user_profile(api_client = Depends(get_api_client)):
    """Get user profile"""
    try:
        user_api = upstox_client.UserApi(api_client)

        def call_profile():
            return user_api.get_profile("2.0")

        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_profile),
            timeout=8.0
        )

        return {
            "success": True,
            "data": {
                "user_name": getattr(api_response.data, 'user_name', None),
                "email": getattr(api_response.data, 'email', None),
                "user_id": getattr(api_response.data, 'user_id', None),
                "exchanges": getattr(api_response.data, 'exchanges', []),
                "products": getattr(api_response.data, 'products', []),
                "user_type": getattr(api_response.data, 'user_type', None)
            }
        }

    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching profile")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_user_profile] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/user/funds")
async def get_user_funds(api_client = Depends(get_api_client)):
    try:
        user_api = upstox_client.UserApi(api_client)
        def call_funds():
            return user_api.get_user_fund_margin("2.0")
        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_funds),
            timeout=8.0
        )
        return {"success": True, "data": api_response.data}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching funds")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_user_funds] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/portfolio/holdings")
async def get_holdings(api_client = Depends(get_api_client)):
    try:
        portfolio_api = upstox_client.PortfolioApi(api_client)
        def call_holdings():
            return portfolio_api.get_holdings("2.0")
        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_holdings),
            timeout=8.0
        )
        return {"success": True, "data": api_response.data}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching holdings")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_holdings] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/portfolio/positions")
async def get_positions(api_client = Depends(get_api_client)):
    try:
        portfolio_api = upstox_client.PortfolioApi(api_client)
        def call_positions():
            return portfolio_api.get_positions("2.0")
        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_positions),
            timeout=8.0
        )
        return {"success": True, "data": api_response.data}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching positions")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_positions] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/orders")
async def get_orders(api_client = Depends(get_api_client)):
    try:
        order_api = upstox_client.OrderApi(api_client)
        def call_orders():
            return order_api.get_order_book("2.0")
        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_orders),
            timeout=8.0
        )
        return {"success": True, "data": api_response.data}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching orders")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_orders] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/trades")
async def get_trades(api_client = Depends(get_api_client)):
    try:
        order_api = upstox_client.OrderApi(api_client)
        def call_trades():
            return order_api.get_trade_history("2.0")
        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_trades),
            timeout=8.0
        )
        return {"success": True, "data": api_response.data}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching trades")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_trades] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


# Market endpoints
@app.post("/api/market/quote")
async def get_market_quote(request: MarketQuoteRequest, api_client = Depends(get_api_client)):
    try:
        market_api = upstox_client.MarketQuoteApi(api_client)
        def call_quote():
            instrument_key = f"{request.exchange}:{request.symbol}"
            return market_api.get_full_market_quote(instrument_key, "2.0")
        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_quote),
            timeout=8.0
        )
        return {"success": True, "data": api_response.data}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching quote")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_market_quote] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/market/historical")
async def get_historical_data(request: HistoricalDataRequest, api_client = Depends(get_api_client)):
    try:
        history_api = upstox_client.HistoryApi(api_client)
        def call_hist():
            return history_api.get_historical_candle_data(
                instrument_key=request.instrument_key,
                interval=request.interval,
                to_date=request.to_date,
                from_date=request.from_date,
                api_version="2.0"
            )
        api_response = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(executor, call_hist),
            timeout=8.0
        )
        return {"success": True, "data": api_response.data}
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Upstox API timed out while fetching historical data")
    except ApiException as e:
        raise HTTPException(status_code=400, detail=f"API Error: {str(e)}")
    except Exception as e:
        tb = traceback.format_exc()
        print("[get_historical_data] exception:", tb)
        raise HTTPException(status_code=500, detail=str(e))


# Health
@app.get("/health")
async def health_check():
    return {"status": "healthy", "active_sessions": len(user_configurations), "timestamp": datetime.now().isoformat()}


# Run server when executed directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="localhost", port=8000)
