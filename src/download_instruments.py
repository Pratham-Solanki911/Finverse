import pandas as pd
import json
import os

# URL for the NSE equity instruments file (this is a gzipped CSV)
# You can find other files (BSE, F&O) on the Upstox developer docs
INSTRUMENT_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv.gz"

# The name of the JSON file we will create
OUTPUT_JSON_FILE = "instrument_lookup.json"

def create_instrument_lookup():
    """
    Downloads the master instrument list from Upstox, filters for
    equity stocks, and saves a simple {symbol -> instrument_key}
    lookup file as JSON.
    """
    print(f"Downloading instrument master from {INSTRUMENT_URL}...")
    
    try:
        # Read the gzipped CSV file directly from the URL into a pandas DataFrame
        df = pd.read_csv(INSTRUMENT_URL, compression='gzip')
        
        print("Download complete. Processing file...")

        # Filter for the "Equity" segment only
        # (The file also contains indices, ETFs, etc.)
        df_equity = df[df['segment'] == 'NSE_EQ'].copy()
        
        # Ensure we have the columns we need
        if 'trading_symbol' not in df_equity.columns or 'instrument_key' not in df_equity.columns:
            print("Error: Required columns 'trading_symbol' or 'instrument_key' not found.")
            return

        # Create our lookup dictionary: { "RELIANCE": "NSE_EQ|INE002A01018", ... }
        # We use instrument_key as it's the ISIN-based key that V3 History API needs
        instrument_lookup = pd.Series(
            df_equity.instrument_key.values, 
            index=df_equity.trading_symbol
        ).to_dict()

        # Also add Nifty 50 (which is an index, so it was filtered out)
        instrument_lookup["NIFTY 50"] = "NSE_INDEX|Nifty 50"
        
        # Save the lookup dictionary to a JSON file
        with open(OUTPUT_JSON_FILE, 'w') as f:
            json.dump(instrument_lookup, f, indent=4)
            
        print(f"Successfully created '{OUTPUT_JSON_FILE}' with {len(instrument_lookup)} instruments.")

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    create_instrument_lookup()