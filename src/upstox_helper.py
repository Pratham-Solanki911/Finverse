# src/upstox_helper.py

import os
import upstox_client
from upstox_client.rest import ApiException
from dotenv import load_dotenv
from datetime import datetime,timezone
import sqlite3
from fastapi import Request, HTTPException # <-- Import Request and HTTPException
import json
# Load environment variables
load_dotenv()

# --- Database Path ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "instruments.db")


# --- CRITICAL UPDATE: Reads token from cookie ---
def _get_api_client(request: Request) -> upstox_client.ApiClient:
    """
    Creates and configures the API client by reading the
    access token from the user's secure cookie.
    """
    # Read the token from the cookie
    access_token = request.cookies.get("upstox_access_token")
    
    if not access_token:
        # If no cookie, user is not logged in
        raise HTTPException(status_code=401, detail="Not authenticated. Please /login.")
    
    configuration = upstox_client.Configuration()
    configuration.access_token = access_token
    configuration.host = "https://api.upstox.com" 
    
    api_client = upstox_client.ApiClient(configuration)
    return api_client



# --- NEW: Get User Profile ---
def get_user_profile(request: Request) -> dict:
    """
    Fetches the user's profile data from Upstox.
    """
    api_version = "2.0"
    api_client = _get_api_client(request)
    api_instance = upstox_client.UserApi(api_client)
    
    try:
        api_response = api_instance.get_profile(api_version)
        return api_response.data.to_dict()
    except ApiException as e:
        print(f"Error calling UserApi->get_profile: {e}")
        if e.status == 401:
             raise HTTPException(status_code=401, detail="Upstox token expired. Please /login.")
        raise
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise
# --- PUBLIC HELPER FUNCTIONS (for your API to call) ---

def get_instrument_details(symbol: str) -> dict:
    """
    Finds the instrument key and name for a given symbol
    by querying the SQLite database.
    (This function doesn't need the token, so no change in logic)
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        # Return rows as dictionaries
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute(
            "SELECT instrument_key, name, instrument_type, symbol FROM instrument_lookup WHERE symbol = ?", 
            (symbol.upper(),)
        )
        result = cursor.fetchone() 
        
        if result:
            return dict(result) # Convert row object to dict
        else:
            raise ValueError(f"Symbol '{symbol}' not found in instrument database.")
            
    except Exception as e:
        print(f"Database error in get_instrument_details: {e}")
        raise
    finally:
        if conn:
            conn.close()

# --- UPDATED: Must accept 'request' and pass it down ---
def fetch_live_quote(request: Request, instrument_key: str) -> dict:
    api_version = "2.0"
    api_client = _get_api_client(request) # Pass request
    api_instance = upstox_client.MarketQuoteApi(api_client)
    
    try:
        api_response = api_instance.get_full_market_quote(instrument_key, api_version)
        return api_response.data
    except ApiException as e:
        print(f"Error calling MarketQuoteApi->get_full_market_quote: {e}")
        # Handle expired token
        if e.status == 401:
             raise HTTPException(status_code=401, detail="Upstox token expired. Please /login.")
        raise
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        raise

# In src/upstox_helper.py

def fetch_historical_candles(request: Request, instrument_key: str, interval: str, to_date: str, from_date: str = None):
    """
    Fetch historical candle data from Upstox.
    
    Args:
        instrument_key: The instrument key (e.g., "NSE_EQ|INE002A01018")
        interval: Must be one of: "1minute", "30minute", "1day", "1week", "1month"
        to_date: End date in YYYY-MM-DD format
        from_date: Start date (NOT USED - Upstox API doesn't support this parameter)
    
    Note: Upstox API only accepts 'to_date' and returns historical data going backwards.
    ...
    """
    access_token = request.cookies.get("upstox_access_token")
    if not access_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    configuration = upstox_client.Configuration()
    configuration.access_token = access_token
    
    api_client = upstox_client.ApiClient(configuration)
    api_instance = upstox_client.HistoryApi(api_client)

    # --- NEW: Map friendly names to API required names ---
    interval_mapping = {
        "1minute": "1minute",
        "30minute": "30minute",
        "1day": "day",
        "1week": "week",
        "1month": "month"
    }
    
    # Get the correct API interval, default to the original value if not in map
    api_interval = interval_mapping.get(interval, interval)
    # --- END OF FIX ---

    try:
        # IMPORTANT: Upstox API only accepts these parameters
        # 'from_date' is NOT supported!
        api_response = api_instance.get_historical_candle_data(
            instrument_key=instrument_key,
            interval=api_interval,  # <-- USE THE MAPPED VALUE
            to_date=to_date,    # Only this date parameter is supported
            api_version="2.0"
        )
        
        # Extract candles from response
        if hasattr(api_response, 'data') and hasattr(api_response.data, 'candles'):
            candles = api_response.data.candles
            
            # Optional: Filter candles by from_date if provided
            if from_date and candles:
                # Ensure from_date is datetime object for comparison
                from_datetime = datetime.strptime(from_date, '%Y-%m-%d').replace(tzinfo=timezone.utc)
                
                filtered_candles = []
                for candle in candles:
                    # Candle format: [timestamp, open, high, low, close, volume, oi]
                    # Timestamp is usually the first element
                    if isinstance(candle, list) and len(candle) > 0:
                        candle_timestamp_str = candle[0]
                        try:
                            # Upstox V2 API returns ISO 8601 string timestamps
                            # e.g., "2025-11-03T09:15:00+05:30"
                            candle_dt = datetime.fromisoformat(candle_timestamp_str)
                            
                            if candle_dt >= from_datetime:
                                filtered_candles.append(candle)
                        except (ValueError, TypeError):
                            # Fallback for integer timestamps (just in case)
                            try:
                                candle_timestamp_int = int(candle_timestamp_str)
                                if candle_timestamp_int > 10000000000:  # milliseconds
                                    candle_dt = datetime.fromtimestamp(candle_timestamp_int / 1000, tz=timezone.utc)
                                else:  # seconds
                                    candle_dt = datetime.fromtimestamp(candle_timestamp_int, tz=timezone.utc)
                                
                                if candle_dt >= from_datetime:
                                    filtered_candles.append(candle)
                            except:
                                # If timestamp parsing fails, include the candle
                                filtered_candles.append(candle)
                    else:
                        filtered_candles.append(candle)
                
                return filtered_candles
            
            return candles
        
        return []
        
    except upstox_client.rest.ApiException as e:
        print(f"Upstox API error: {e}")
        # Pass the specific error message from Upstox
        try:
            error_body = json.loads(e.body)
            detail = error_body.get("errors", [{}])[0].get("message", "Upstox API error")
            raise HTTPException(status_code=e.status, detail=detail)
        except:
             raise HTTPException(status_code=502, detail=f"Upstox API error: {e}")
    except Exception as e:
        print(f"Error in fetch_historical_candles: {e}")
        import traceback
        traceback.print_exc()
        raise