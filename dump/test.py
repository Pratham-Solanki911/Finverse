import os
import upstox_client
from dotenv import load_dotenv
# --- 1. IMPORT THE EXCEPTION CLASS --- (This is new)
from upstox_client.rest import ApiException

# --- Load Environment Variables ---
print("🚀 Starting Upstox API test...")
load_dotenv()

API_KEY = os.getenv("API_KEY")
ACCESS_TOKEN = os.getenv("ACCESS_TOKEN")

if not all([API_KEY, ACCESS_TOKEN]):
    print("❌ Error: API_KEY or ACCESS_TOKEN not found in .env file.")
    print("Please check your .env file and ensure it's in the same directory.")
    exit()

print("✅ Credentials loaded successfully from .env file.")

# --- 2. Configure the API Client ---
configuration = upstox_client.Configuration()
configuration.access_token = ACCESS_TOKEN

print("🔧 API client configured.")

# --- 3. Make an API Call to Fetch Profile ---
try:
    print("\nFetching user profile...")
    
    # --- 2. USE UserApi INSTEAD OF ProfileApi --- (This is changed)
    api_instance = upstox_client.UserApi(upstox_client.ApiClient(configuration))
    
    api_version = "2.0" 
    
    api_response = api_instance.get_profile(api_version)
    
    # --- 4. Print the Results ---
    print("\n🎉 Success! Profile data received:")
    print("---------------------------------")
    print(f"User Name: {api_response.data.user_name}")
    print(f"Email: {api_response.data.email}")
    print(f"User ID: {api_response.data.user_id}")
    print(f"Exchanges Enabled: {api_response.data.exchanges}")
    print("---------------------------------")
    # import pprint
    # pprint.pprint(api_response)

# --- 3. CATCH THE CORRECT EXCEPTION --- (This is changed)
except ApiException as e:
    print(f"\n❌ An API exception occurred: {e.status} {e.reason}")
    print(f"Body: {e.body}")

except Exception as e:
    print(f"\n❌ An unexpected error occurred: {e}")