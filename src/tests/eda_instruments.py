import pandas as pd
import os

# Set display options for pandas so we can see all columns/rows
pd.set_option('display.max_rows', None)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 1000)

INSTRUMENT_URL = "https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv.gz"

print(f"Starting EDA on: {INSTRUMENT_URL}\n")

try:
    # 1. Load the data
    df = pd.read_csv(INSTRUMENT_URL, compression='gzip')
    print("--- File Loaded Successfully ---")

    # 2. Basic Info: Columns, Non-Null Count, Data Types
    print("\n\n--- 1. DataFrame Info (Columns & Data Types) ---")
    df.info()

    # 3. Check for Missing Values
    print("\n\n--- 2. Missing Values Count (per column) ---")
    print(df.isnull().sum())

    # 4. Explore Categorical Columns (The most important part for us)
    
    print("\n\n--- 3. Unique Values in 'instrument_type' ---")
    # This will show us ['EQUITY', 'ETF', 'INDEX', 'WARRANT'] etc.
    print(df['instrument_type'].value_counts())

    print("\n\n--- 4. Unique Values in 'exchange' ---")
    # This will show us ['NSE', 'BSE', 'MCX'] etc.
    print(df['exchange'].value_counts())

    print("\n\n--- 5. Unique Values in 'option_type' (for Options) ---")
    # .value_counts() automatically drops NaNs
    print(df['option_type'].value_counts())

    # 6. The "Money Shot": A Pivot Table of Types vs. Exchanges
    print("\n\n--- 6. Crosstab: Instrument Type vs. Exchange ---")
    # This table will show us the *exact* count for ('EQUITY', 'NSE')
    # and prove why our new filter logic is correct.
    crosstab = pd.crosstab(df['instrument_type'], df['exchange'])
    print(crosstab)

    # 7. Look at a sample of 'EQUITY' data
    print("\n\n--- 7. Sample of 5 'EQUITY' (NSE) Instruments ---")
    # Use the filter we now know is correct
    equity_df = df[(df['instrument_type'] == 'EQUITY') & (df['exchange'] == 'NSE')]
    print(equity_df.head())

except Exception as e:
    print(f"An error occurred during EDA: {e}")