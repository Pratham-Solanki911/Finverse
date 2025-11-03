import pandas as pd
import sqlite3
import os
import numpy as np

# --- Paths ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "instruments.db")
INSTRUMENT_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv.gz"

def update_instrument_database():
    """
    Downloads the master instrument list from Upstox and populates
    two tables:
    1. 'instrument_lookup': A small, fast table for Equities and Indices.
    2. 'derivatives_data': A large table with all other instruments
       (Options, Futures) for future analysis.
    """
    print("Starting instrument database update...")
    conn = None 
    
    try:
        # 1. Download the master file
        df = pd.read_csv(INSTRUMENT_URL, compression='gzip')
        print("Download complete. Processing file...")

        # 2. Separate the data into two DataFrames
        
        # --- FIX: Lookup Table Data (Equities ONLY) ---
        lookup_filter = (df['instrument_type'] == 'EQUITY')
        df_lookup = df[lookup_filter].copy()
        print(f"Found {len(df_lookup)} EQUITY records for the 'instrument_lookup' table.")
        
        # --- FIX: Derivatives Table Data (Everything Else, including INDEX) ---
        df_derivatives = df[~lookup_filter].copy()
        print(f"Found {len(df_derivatives)} records for the 'derivatives_data' table.")

        # 4. Connect to SQLite DB
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # 5. Create the 'instrument_lookup' table (unchanged)
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS instrument_lookup (
            symbol TEXT PRIMARY KEY,
            instrument_key TEXT NOT NULL,
            name TEXT NOT NULL,
            instrument_type TEXT NOT NULL
        )
        ''')
        cursor.execute('''
        CREATE UNIQUE INDEX IF NOT EXISTS idx_lookup_symbol ON instrument_lookup (symbol)
        ''')
        
        # 6. Create the 'derivatives_data' table (unchanged)
        cursor.execute('''
        CREATE TABLE IF NOT EXISTS derivatives_data (
            instrument_key TEXT PRIMARY KEY,
            tradingsymbol TEXT,
            name TEXT,
            instrument_type TEXT,
            exchange TEXT,
            expiry TEXT,
            strike REAL,
            option_type TEXT,
            lot_size REAL,
            tick_size REAL
        )
        ''')
        
        # Create index for faster searching on tradingsymbol
        cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_derivatives_symbol ON derivatives_data (tradingsymbol)
        ''')

        # 7. Prepare and insert data for 'instrument_lookup'
        
        # --- THIS IS THE FIX: Added .strip() to remove whitespace ---
        lookup_tuples = [
            (row['tradingsymbol'].strip().upper(), row['instrument_key'], row['name'], row['instrument_type']) 
            for _, row in df_lookup.iterrows() if pd.notna(row['tradingsymbol'])
        ]
        
        # --- FIX: Manually add the NIFTY 50 row ---
        lookup_tuples.append(
            ("NIFTY 50", "NSE_INDEX|Nifty 50", "Nifty 50", "INDEX")
        )
        
        cursor.executemany('''
        INSERT INTO instrument_lookup (symbol, instrument_key, name, instrument_type)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET 
            instrument_key = excluded.instrument_key,
            name = excluded.name,
            instrument_type = excluded.instrument_type
        ''', lookup_tuples)
        print(f"Successfully upserted {len(lookup_tuples)} rows into 'instrument_lookup'.")

        # 8. Prepare and insert data for 'derivatives_data' (unchanged)
        df_derivatives = df_derivatives.replace({np.nan: None, pd.NaT: None})

        derivatives_tuples = [
            (
                row['instrument_key'], row['tradingsymbol'], row['name'], 
                row['instrument_type'], row['exchange'], row['expiry'],
                row['strike'], row['option_type'], row['lot_size'], row['tick_size']
            )
            for _, row in df_derivatives.iterrows()
        ]
        
        cursor.executemany('''
        INSERT INTO derivatives_data (
            instrument_key, tradingsymbol, name, instrument_type, exchange,
            expiry, strike, option_type, lot_size, tick_size
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instrument_key) DO UPDATE SET 
            tradingsymbol = excluded.tradingsymbol,
            name = excluded.name,
            instrument_type = excluded.instrument_type,
            exchange = excluded.exchange,
            expiry = excluded.expiry,
            strike = excluded.strike,
            option_type = excluded.option_type,
            lot_size = excluded.lot_size,
            tick_size = excluded.tick_size
        ''', derivatives_tuples)
        print(f"Successfully upserted {len(derivatives_tuples)} rows into 'derivatives_data'.")
        
        conn.commit()
        print("Database update complete.")

    except Exception as e:
        print(f"An error occurred during instrument update: {e}")
        if 'df' in locals():
            print(f"Columns found were: {df.columns.tolist()}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

# ===== NEW SEARCH FUNCTIONS =====

def search_instrument(symbol):
    """
    Search for an instrument by symbol with cascading logic:
    1. First search in instrument_lookup table (Equities + Indices)
    2. If not found, search in derivatives_data table (Options, Futures)
    
    Args:
        symbol (str): The trading symbol to search for
        
    Returns:
        dict: Dictionary containing instrument details, or None if not found
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row  # Return rows as dictionaries
        cursor = conn.cursor()
        
        # Clean up the search symbol
        search_symbol = symbol.strip().upper()
        
        # Step 1: Search in instrument_lookup table
        cursor.execute('''
            SELECT symbol, instrument_key, name, instrument_type
            FROM instrument_lookup
            WHERE symbol = ?
        ''', (search_symbol,))
        
        result = cursor.fetchone()
        
        if result:
            print(f"Found '{symbol}' in instrument_lookup table")
            return {
                'symbol': result['symbol'],
                'instrument_key': result['instrument_key'],
                'name': result['name'],
                'instrument_type': result['instrument_type'],
                'source': 'instrument_lookup'
            }
        
        # Step 2: If not found, search in derivatives_data table
        print(f"'{symbol}' not found in instrument_lookup, searching derivatives_data...")
        
        cursor.execute('''
            SELECT instrument_key, tradingsymbol, name, instrument_type, 
                   exchange, expiry, strike, option_type, lot_size, tick_size
            FROM derivatives_data
            WHERE UPPER(tradingsymbol) = ?
        ''', (search_symbol,))
        
        result = cursor.fetchone()
        
        if result:
            print(f"Found '{symbol}' in derivatives_data table")
            return {
                'symbol': result['tradingsymbol'],
                'instrument_key': result['instrument_key'],
                'name': result['name'],
                'instrument_type': result['instrument_type'],
                'exchange': result['exchange'],
                'expiry': result['expiry'],
                'strike': result['strike'],
                'option_type': result['option_type'],
                'lot_size': result['lot_size'],
                'tick_size': result['tick_size'],
                'source': 'derivatives_data'
            }
        
        # Not found in either table
        print(f"'{symbol}' not found in any table")
        return None
        
    except Exception as e:
        print(f"Error searching for instrument '{symbol}': {e}")
        return None
    finally:
        if conn:
            conn.close()

def search_instruments_fuzzy(search_term, limit=10):
    """
    Fuzzy search for instruments across both tables using LIKE pattern matching.
    Useful when you don't know the exact symbol.
    
    Args:
        search_term (str): Partial symbol or name to search for
        limit (int): Maximum number of results to return
        
    Returns:
        list: List of matching instruments from both tables
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        search_pattern = f"%{search_term.strip().upper()}%"
        results = []
        
        # Search instrument_lookup table
        cursor.execute('''
            SELECT symbol, instrument_key, name, instrument_type, 'instrument_lookup' as source
            FROM instrument_lookup
            WHERE UPPER(symbol) LIKE ? OR UPPER(name) LIKE ?
            LIMIT ?
        ''', (search_pattern, search_pattern, limit))
        
        for row in cursor.fetchall():
            results.append(dict(row))
        
        # If we haven't reached the limit, search derivatives_data
        remaining_limit = limit - len(results)
        if remaining_limit > 0:
            cursor.execute('''
                SELECT tradingsymbol as symbol, instrument_key, name, instrument_type, 
                       'derivatives_data' as source
                FROM derivatives_data
                WHERE UPPER(tradingsymbol) LIKE ? OR UPPER(name) LIKE ?
                LIMIT ?
            ''', (search_pattern, search_pattern, remaining_limit))
            
            for row in cursor.fetchall():
                results.append(dict(row))
        
        print(f"Found {len(results)} matches for '{search_term}'")
        return results
        
    except Exception as e:
        print(f"Error in fuzzy search for '{search_term}': {e}")
        return []
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    update_instrument_database()