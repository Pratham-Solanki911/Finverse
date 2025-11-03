# main.py
import os
import json
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
from sqlalchemy import create_engine, Column, Integer, String, Text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
from pydantic import Field
# Try to import your YFutils module. If missing, provide safe stubs so server starts.
try:
    from YFutils import get_historical, get_realtime, normalize_ticker, get_stock_info, calculate_returns
except Exception:
    import pandas as pd
    def get_historical(tickers, period="6mo", interval="1d", auto_suffix_exchange=None):
        # return empty DataFrame to keep chart endpoint stable in dev
        return pd.DataFrame()
    def get_realtime(symbols, auto_suffix_exchange=None):
        return {s: {"error": "YFutils not available"} for s in symbols}
    def normalize_ticker(t, suffix): return t
    def get_stock_info(ticker, auto_suffix_exchange=None):
        return {"error": "YFutils not available"}
    def calculate_returns(*args, **kwargs):
        return {}

# ---------------------------
# CONFIG (env override)
# ---------------------------
DATABASE_URL = os.getenv("FY_DB_URL", "sqlite:///./fy_users.db")
SECRET_KEY = os.getenv("FY_SECRET_KEY", "change-me-to-a-secure-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("FY_ACCESS_MINUTES", 60 * 24))  # default 1 day

# ---------------------------
# DB models (SQLAlchemy)
# ---------------------------
Base = declarative_base()
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    portfolio_json = Column(Text, nullable=True)

Base.metadata.create_all(bind=engine)

# ---------------------------
# Auth utilities - use Argon2 to avoid bcrypt issues
# ---------------------------
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

def get_password_hash(password: str) -> str:
    if not isinstance(password, str):
        raise ValueError("Password must be a string")
    return pwd_context.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False

def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = {"sub": subject}
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------------------------
# Pydantic schemas
# ---------------------------
class LoginRequest(BaseModel):
    login_id: str = Field(..., alias='login-id')
    password: str

    class Config:
        allow_population_by_field_name = True
        
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class PortfolioIn(BaseModel):
    holdings: Dict[str, int]

class PortfolioOut(BaseModel):
    holdings: Dict[str, int]
    total_value: Optional[float] = None
    stocks_data: Optional[List[Dict]] = None

class ChartRequest(BaseModel):
    tickers: List[str]
    period: Optional[str] = "6mo"
    interval: Optional[str] = "1d"
    auto_suffix: Optional[str] = "NSE"

class StockInfoRequest(BaseModel):
    ticker: str
    auto_suffix: Optional[str] = "NSE"

# ---------------------------
# FastAPI app
# ---------------------------
app = FastAPI(
    title="FinVerse - Yahoo Finance API",
    description="API for stock market data using Yahoo Finance",
    version="1.0.0"
)

# Ensure static folder exists to avoid mount errors
if not os.path.isdir("static"):
    os.makedirs("static", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------
# Helper: user retrieval & auth
# ---------------------------
def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def authenticate_user(db: Session, username: str, password: str):
    user = get_user_by_username(db, username)
    if not user:
        return False
    if not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_by_username(db, username)
    if user is None:
        raise credentials_exception
    return user

# ---------------------------
# Auth endpoints
# ---------------------------
@app.post("/auth/register", response_model=Dict[str, str])
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")

    # Basic validation: avoid empty password
    if not user_in.password or not isinstance(user_in.password, str):
        raise HTTPException(status_code=400, detail="Password must be a non-empty string")

    try:
        hashed = get_password_hash(user_in.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Password hashing failed: {e}")

    user = User(
        username=user_in.username,
        hashed_password=hashed,
        portfolio_json=json.dumps({})
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"msg": "user_created", "username": user.username}

@app.post("/auth/token", response_model=Token)
def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(subject=user.username, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

# ---------------------------
# Portfolio endpoints (protected)
# ---------------------------
@app.get("/portfolio", response_model=PortfolioOut)
def get_portfolio(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    holdings = {}
    if current_user.portfolio_json:
        try:
            holdings = json.loads(current_user.portfolio_json)
        except Exception:
            holdings = {}

    if not holdings:
        return {"holdings": {}, "total_value": 0.0, "stocks_data": []}

    symbols = list(holdings.keys())
    rt_data = get_realtime(symbols, auto_suffix_exchange=None)

    total_value = 0.0
    stocks_data = []

    for symbol, qty in holdings.items():
        data = rt_data.get(symbol, {})
        if "error" not in data:
            price = data.get("close", 0.0)
            prev_close = data.get("previous_close", price)
            change = data.get("change", 0.0)
            change_pct = ((price - prev_close) / prev_close * 100) if prev_close else 0.0

            value = price * int(qty)
            total_value += value

            stocks_data.append({
                "symbol": symbol,
                "quantity": int(qty),
                "price": round(price, 2),
                "value": round(value, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "previous_close": round(prev_close, 2)
            })
        else:
            stocks_data.append({
                "symbol": symbol,
                "quantity": int(qty),
                "error": data.get("error")
            })

    return {"holdings": holdings, "total_value": round(total_value, 2), "stocks_data": stocks_data}

@app.post("/portfolio", response_model=PortfolioOut)
def upsert_portfolio(payload: PortfolioIn, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    holdings = payload.holdings
    normalized = {}
    for ticker, qty in holdings.items():
        normalized[ticker] = int(qty)

    current_user.portfolio_json = json.dumps(normalized)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {"holdings": normalized, "total_value": None}

@app.delete("/portfolio", response_model=Dict[str, str])
def clear_portfolio(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.portfolio_json = json.dumps({})
    db.add(current_user)
    db.commit()
    return {"msg": "portfolio_cleared"}

# ---------------------------
# Chart data endpoint
# ---------------------------
@app.post("/chart-data")
def chart_data(req: ChartRequest):
    import pandas as pd
    tickers = req.tickers

    if req.auto_suffix:
        tickers = [normalize_ticker(t, req.auto_suffix) for t in tickers]

    df = get_historical(tickers, period=req.period, interval=req.interval, auto_suffix_exchange=None)

    if df is None or getattr(df, "empty", False):
        return {"labels": [], "datasets": []}

    colors = [
        'rgb(255, 99, 132)', 'rgb(54, 162, 235)', 'rgb(255, 206, 86)',
        'rgb(75, 192, 192)', 'rgb(153, 102, 255)', 'rgb(255, 159, 64)'
    ]

    labels = [idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx) for idx in df.index]
    datasets = []

    if isinstance(df.columns, pd.MultiIndex):
        for i, ticker in enumerate(tickers):
            try:
                if ('Close', ticker) in df.columns:
                    close_data = df[('Close', ticker)].dropna()
                    datasets.append({
                        "label": ticker,
                        "data": [float(x) for x in close_data.tolist()],
                        "borderColor": colors[i % len(colors)],
                        "backgroundColor": colors[i % len(colors)].replace('rgb', 'rgba').replace(')', ', 0.1)'),
                        "fill": False,
                        "tension": 0.1
                    })
                else:
                    datasets.append({"label": ticker, "data": [], "borderColor": colors[i % len(colors)], "fill": False})
            except Exception:
                datasets.append({"label": ticker, "data": [], "borderColor": colors[i % len(colors)], "fill": False})
    else:
        if 'Close' in df.columns:
            close_data = df['Close'].dropna()
            datasets.append({
                "label": tickers[0] if tickers else "ticker",
                "data": [float(x) for x in close_data.tolist()],
                "borderColor": colors[0],
                "backgroundColor": colors[0].replace('rgb', 'rgba').replace(')', ', 0.1)'),
                "fill": False,
                "tension": 0.1
            })
        else:
            datasets.append({"label": tickers[0] if tickers else "ticker", "data": [], "borderColor": colors[0], "fill": False})

    return {"labels": labels, "datasets": datasets}

# ---------------------------
# Stock info endpoint
# ---------------------------
@app.post("/stock-info")
def stock_info(req: StockInfoRequest):
    info = get_stock_info(req.ticker, auto_suffix_exchange=req.auto_suffix)
    return info

# ---------------------------
# KPI endpoint
# ---------------------------
@app.get("/kpis/today")
def kpis_top_performers(watch: Optional[str] = None, top_n: int = 5):
    if watch:
        tickers = [t.strip() for t in watch.split(",") if t.strip()]
    else:
        tickers = ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "SBIN.NS", "ICICIBANK.NS", "ITC.NS", "BHARTIARTL.NS"]

    rt_data = get_realtime(tickers, auto_suffix_exchange=None)
    performance = []
    for ticker in tickers:
        data = rt_data.get(ticker, {})
        if "error" not in data:
            close = data.get("close")
            prev_close = data.get("previous_close")
            try:
                pct_change = ((close - prev_close) / prev_close) * 100 if (close is not None and prev_close not in (None, 0)) else None
            except Exception:
                pct_change = None
            performance.append({
                "ticker": ticker,
                "close": round(close, 2) if close else None,
                "previous_close": round(prev_close, 2) if prev_close else None,
                "change": round(data.get("change", 0), 2),
                "pct_change": round(pct_change, 2) if pct_change is not None else None
            })
        else:
            performance.append({"ticker": ticker, "error": data.get("error")})

    valid = [p for p in performance if p.get("pct_change") is not None]
    gainers = sorted(valid, key=lambda x: x["pct_change"], reverse=True)[:top_n]
    losers = sorted(valid, key=lambda x: x["pct_change"])[:top_n]

    return {"gainers": gainers, "losers": losers, "timestamp": datetime.now().isoformat()}

# ---------------------------
# Market overview
# ---------------------------
@app.get("/market/overview")
def market_overview():
    indices = ["^NSEI", "^BSESN", "^NSEBANK"]
    rt_data = get_realtime(indices, auto_suffix_exchange=None)

    overview = []
    index_names = {"^NSEI": "NIFTY 50", "^BSESN": "SENSEX", "^NSEBANK": "NIFTY BANK"}

    for idx in indices:
        data = rt_data.get(idx, {})
        if "error" not in data:
            close = data.get("close")
            prev_close = data.get("previous_close")
            change = data.get("change")
            pct_change = ((close - prev_close) / prev_close * 100) if prev_close else 0
            overview.append({
                "index": index_names.get(idx, idx),
                "symbol": idx,
                "value": round(close, 2) if close else None,
                "change": round(change, 2) if change else None,
                "change_pct": round(pct_change, 2)
            })

    return {"indices": overview, "timestamp": datetime.now().isoformat()}

# ---------------------------
# Root
# ---------------------------
@app.get("/")
def root():
    front = os.path.join("static", "front.html")
    if os.path.exists(front):
        return FileResponse(front)
    return {"msg": "FinVerse API running"}

# ---------------------------
# Run with `python main.py`
# ---------------------------
if __name__ == "__main__":
    host = os.getenv("FY_HOST", "127.0.0.1")
    port = int(os.getenv("FY_PORT", "8000"))
    reload_flag = os.getenv("FY_RELOAD", "True").lower() in ("1", "true", "yes")
    uvicorn.run("main:app", host=host, port=port, reload=reload_flag)
