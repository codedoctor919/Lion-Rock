from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio

# Load environment variables
load_dotenv()

# FastAPI app
app = FastAPI(
    title="LionRock Backend API",
    description="Backend API for LionRock with DigitalOcean, PostgreSQL and Posthog",
    version="1.0.0"
)

# CORS for frontend
origins = ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# DeepSeek API Key and Base URL
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY is not set. Please check your .env file.")

DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# Request and response models
class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    reply: str

# Streaming generator
async def event_stream(req_message: str):
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": req_message}
        ],
        "stream": True
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
    }

    full_text = ""

    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST", f"{DEEPSEEK_BASE_URL}/chat/completions", json=payload, headers=headers
        ) as response:
            if response.status_code != 200:
                content = await response.aread()
                raise HTTPException(status_code=response.status_code, detail=content.decode())

            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data_str = line[len("data: "):].strip()
                    if data_str == "[DONE]":
                        break
                    try:
                        data = json.loads(data_str)
                        delta = data["choices"][0]["delta"].get("content")
                        if delta:
                            full_text += delta
                            # yield the **full text so far**
                            yield f"data: {full_text}\n\n"
                            await asyncio.sleep(0.01)
                    except Exception:
                        continue

# Streaming endpoint
@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    return StreamingResponse(event_stream(req.message), media_type="text/event-stream")

# Optional: fallback non-streaming endpoint
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest):
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": req.message}
        ],
        "stream": False
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(
                f"{DEEPSEEK_BASE_URL}/chat/completions",
                json=payload,
                headers=headers,
            )
        except httpx.RequestError as e:
            raise HTTPException(status_code=500, detail=f"Error contacting DeepSeek: {e}")

    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=response.text)

    res_json = response.json()
    try:
        reply = res_json["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        raise HTTPException(status_code=500, detail=f"Malformed DeepSeek response: {res_json}")

    return ChatResponse(reply=reply)

# Run server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)