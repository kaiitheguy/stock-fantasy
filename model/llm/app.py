from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from datetime import datetime, timedelta
import yfinance as yf
from llm_service import LLMService

load_dotenv()

app = FastAPI()

# In-memory storage. The stock_name_map is now gone.
weekly_stock_data = {"last_updated": None, "data": []}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/generate-weekly-stocks")
async def generate_weekly_stocks(provider: str = "gemini"):
    """
    MANUAL TRIGGER: Generates weekly stock recommendations and enriches them with company names.
    """
    global weekly_stock_data
    try:
        print("Generating weekly stock data from LLM...")
        llm_service = LLMService(provider=provider)
        response_data = llm_service.generate_stock_data()
        stock_list = response_data.get("stocks", [])
        
        enriched_stock_list = []
        # Fetch company name from yfinance ONCE during generation
        for stock in stock_list:
            ticker_str = stock.get("ticker")
            if not ticker_str:
                continue
            try:
                print(f"Enriching data for {ticker_str}...")
                ticker_info = yf.Ticker(ticker_str).info
                stock["name"] = ticker_info.get('longName', ticker_str) # Get longName, fallback to ticker
                enriched_stock_list.append(stock)
            except Exception as e:
                print(f"Could not fetch info for {ticker_str}: {e}")
                # Still add it, but with ticker as the name
                stock["name"] = ticker_str
                enriched_stock_list.append(stock)

        weekly_stock_data = {
            "last_updated": datetime.now(),
            "data": enriched_stock_list # Save the enriched list
        }
        print("Weekly data generation complete.")
        return {"message": "Weekly stock data generated and enriched successfully", "count": len(enriched_stock_list)}
    except Exception as e:
        return {"error": f"An error occurred: {str(e)}"}

@app.get("/daily-stock-data")
async def get_daily_stock_data():
    """
    SERVES DATA: Merges the cached weekly recommendations with live daily prices.
    """
    global weekly_stock_data
    now = datetime.now()
    
    # Check if data is missing or stale, but DO NOT regenerate automatically
    if not weekly_stock_data["data"] or (now - weekly_stock_data.get("last_updated", now)) > timedelta(days=7):
        return {"error": "Weekly stock data is missing or outdated. Please trigger the /generate-weekly-stocks endpoint manually."}

    merged_data = []
    for stock in weekly_stock_data["data"]:
        ticker = stock.get("ticker")
        if not ticker:
            continue
        try:
            # Fetch last 2 days to safely calculate percent change
            history = yf.Ticker(ticker).history(period="2d")
            if len(history) < 2:
                continue

            last_close = history["Close"].iloc[-1]
            prev_close = history["Close"].iloc[-2]
            percent_change = ((last_close - prev_close) / prev_close) * 100
            
            merged_data.append({
                "id": f"{ticker}-{now.timestamp()}",
                "ticker": ticker,
                "name": stock.get("name"), # Get the name from our cache
                "buy_sell_score": stock.get("buy_sell_score", 50),
                "reason": stock.get("reason", ""),
                "price": round(last_close, 2),
                "changePct": round(percent_change, 2),
            })
        except Exception as e:
            print(f"Error fetching Yahoo Finance data for {ticker}: {e}")
            continue
    
    return merged_data