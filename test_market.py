import os
import upstox_client
from upstox_client.rest import ApiException
from dotenv import load_dotenv
from pprint import pprint

# Load environment variables from .env file
load_dotenv()

# Get the access token from the environment
access_token = os.getenv("UPSTOX_ACCESS_TOKEN")

if not access_token:
    print("Error: UPSTOX_ACCESS_TOKEN not found in .env file.")
    exit()

# Configure the API client
configuration = upstox_client.Configuration()
configuration.access_token = access_token

# Create an instance of the API class
# We will use MarketQuoteApi to get quote data
api_instance = upstox_client.MarketQuoteApi(upstox_client.ApiClient(configuration))

# --- Define the instrument and API version ---

# We'll test with the Nifty 50 Index.
# Note: The instrument key is case-sensitive.
instrument_key = "NSE_INDEX|Nifty 50" 
api_version = "2.0"  # Use '2.0' for Upstox API v2

print(f"Fetching full market quote for: {instrument_key}...")

try:
    # Call the API to get the full market quote
    api_response = api_instance.get_full_market_quote(instrument_key, api_version)
    
    print("--- API Response Success ---")
    pprint(api_response.data)

except ApiException as e:
    print(f"Error calling MarketQuoteApi->get_full_market_quote: {e}")
except Exception as e:
    print(f"An unexpected error occurred: {e}")