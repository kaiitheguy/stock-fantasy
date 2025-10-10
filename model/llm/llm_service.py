import os
import json
import openai
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class LLMService:
    def __init__(self, provider: str = "gemini"):
        """
        Initialize the LLM service with the specified provider.
        Supported providers: "openai", "gemini"
        """
        self.provider = provider.lower()
        if self.provider not in ["openai", "gemini"]:
            raise ValueError(f"Unsupported provider: {self.provider}. Please use 'openai' or 'gemini'.")
        
        # Configure clients from environment variables
        if self.provider == "openai":
            self.openai_client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
            if not self.openai_client.api_key:
                raise ValueError("OPENAI_API_KEY environment variable not set.")
        elif self.provider == "gemini":
            gemini_api_key = os.getenv("GEMINI_API_KEY")
            if not gemini_api_key:
                raise ValueError("GEMINI_API_KEY environment variable not set.")
            genai.configure(api_key=gemini_api_key)
            self.gemini_model = genai.GenerativeModel('gemini-2.5-flash')

    def generate_prompt(self) -> str:
        """
        Generate the prompt for the LLM.
        """
        # Added a more explicit instruction for the JSON format
        return """
        Generate a list of the 50 most popular stocks this week. For each stock, provide:
        1. The ticker symbol (string)
        2. A buy_sell_score (integer from 0 to 100, where 100 is a strong buy)
        3. A brief reason for the preference (string, 1-2 sentences)
        
        Return the data as a single JSON object with a key "stocks" containing a list of these items.
        Example format: {"stocks": [{"ticker": "AAPL", "preference_score": 85, "reason": "..."}]}
        """

    def call_openai(self, prompt: str) -> str:
        """
        Call the OpenAI API using the latest SDK version.
        """
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4-turbo-preview", # Or another suitable model like "gpt-3.5-turbo"
                messages=[
                    {"role": "system", "content": "You are a financial analyst that returns data in JSON format."},
                    {"role": "user", "content": prompt}
                ],
                response_format={"type": "json_object"}, # Enforces JSON output
                temperature=0.1
            )
            return response.choices[0].message.content
        except openai.APIError as e:
            raise Exception(f"OpenAI API error: {e}")

    def call_gemini(self, prompt: str) -> str:
        """
        Call the Gemini API using the official Google AI Python SDK.
        """
        try:
            # The SDK handles the API endpoint and request/response formatting
            response = self.gemini_model.generate_content(prompt)
            # Gemini may add markdown backticks to JSON, so we clean it up
            cleaned_response = response.text.strip().replace("```json", "").replace("```", "")
            return cleaned_response
        except Exception as e:
            raise Exception(f"Gemini API error: {e}")

    def generate_stock_data(self) -> dict:
        """
        Generate stock data using the selected provider and parse it into a dictionary.
        This version is robust against extra text before or after the JSON object.
        """
        prompt = self.generate_prompt()
        raw_response = ""

        if self.provider == "openai":
            raw_response = self.call_openai(prompt)
        elif self.provider == "gemini":
            raw_response = self.call_gemini(prompt)
        
        try:
            # ---- NEW LOGIC TO FIND AND EXTRACT THE JSON OBJECT ----
            
            # Find the starting position of the JSON object
            start_index = raw_response.find('{')
            # Find the ending position of the JSON object
            end_index = raw_response.rfind('}') + 1
            
            if start_index == -1 or end_index == 0:
                raise json.JSONDecodeError("Could not find a JSON object in the response.", raw_response, 0)
            
            # Extract the JSON string
            json_string = raw_response[start_index:end_index]
            
            # Return the parsed JSON data
            return json.loads(json_string)
            
        except json.JSONDecodeError as e:
            # Provide a more informative error message
            print(f"JSON Decode Error: {e.msg}")
            print("--- LLM Raw Response ---")
            print(raw_response)
            print("------------------------")
            raise Exception("Failed to decode JSON from LLM response.")

# Example Usage:
if __name__ == "__main__":
    try:
        # ---- To test with Gemini ----
        print("Fetching stock data from Gemini...")
        gemini_service = LLMService(provider="gemini")
        gemini_data = gemini_service.generate_stock_data()
        print(f"Successfully got {len(gemini_data.get('stocks', []))} stocks from Gemini.")
        # print(json.dumps(gemini_data, indent=2))

        print("\n" + "="*50 + "\n")

        # ---- To test with OpenAI ----
        print("Fetching stock data from OpenAI...")
        openai_service = LLMService(provider="openai")
        openai_data = openai_service.generate_stock_data()
        print(f"Successfully got {len(openai_data.get('stocks', []))} stocks from OpenAI.")
        # print(json.dumps(openai_data, indent=2))

    except Exception as e:
        print(f"An error occurred: {e}")