from fastapi import FastAPI, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import httpx
import os
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
import json
import asyncio
from datetime import datetime, date
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Date
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import databases

# Load environment variables
load_dotenv()

# FastAPI app
app = FastAPI(
    title="LionRock Backend API",
    description="Backend API for LionRock with subscription check and usage tracking",
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

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")

# SQLAlchemy setup
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database models
class UserUsage(Base):
    __tablename__ = "user_usage"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    date = Column(Date, default=date.today(), index=True)
    prompt_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ChatHistory(Base):
    __tablename__ = "chat_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    message = Column(Text)
    reply = Column(Text)
    message_type = Column(String)  # 'user' or 'bot'
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# DeepSeek API Key and Base URL
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
if not DEEPSEEK_API_KEY:
    raise ValueError("DEEPSEEK_API_KEY is not set. Please check your .env file.")

DEEPSEEK_BASE_URL = "https://api.deepseek.com"

# WordPress Membership API
MEMBERSHIP_API = "https://lionrocklabs.com/wp-json/membership/v1/status"

# Usage limits
DAILY_PROMPT_CAP = {
    "Standard": 5,
    "Pro": 50
}

# Request and response models
class ChatRequest(BaseModel):
    message: str
    user_id: str

class ChatResponse(BaseModel):
    reply: str

class UsageResponse(BaseModel):
    user_id: str
    date: date
    prompt_count: int
    daily_limit: int
    remaining_quota: int
    plan: str

# Check subscription
async def check_subscription(user_id: str):
    async with httpx.AsyncClient() as client:
        res = await client.get(f"{MEMBERSHIP_API}?user_id={user_id}")
        if res.status_code != 200:
            raise HTTPException(status_code=500, detail="Failed to check subscription")
        data = res.json()
        return data

# Check and update user usage
def check_user_usage(db: Session, user_id: str, plan: str):
    today = date.today()
    
    # Get or create user usage record for today
    user_usage = db.query(UserUsage).filter(
        UserUsage.user_id == user_id,
        UserUsage.date == today
    ).first()
    
    if not user_usage:
        user_usage = UserUsage(user_id=user_id, date=today, prompt_count=0)
        db.add(user_usage)
        db.commit()
        db.refresh(user_usage)
    
    # Get daily limit based on plan
    daily_limit = DAILY_PROMPT_CAP.get(plan, 5)  # Default to 5 if plan not found
    
    # Check if user has exceeded daily limit
    if user_usage.prompt_count >= daily_limit:
        raise HTTPException(
            status_code=429, 
            detail=f"Daily limit reached. You have used {user_usage.prompt_count}/{daily_limit} messages today."
        )
    
    # Increment prompt count
    user_usage.prompt_count += 1
    db.commit()
    
    return user_usage, daily_limit

# Save chat message to database
def save_chat_message(db: Session, user_id: str, message: str, reply: str = None):
    # Save user message
    user_message = ChatHistory(
        user_id=user_id,
        message=message,
        message_type="user"
    )
    db.add(user_message)
    
    # Save bot reply if available
    if reply:
        bot_reply = ChatHistory(
            user_id=user_id,
            reply=reply,
            message_type="bot"
        )
        db.add(bot_reply)
    
    db.commit()

# Streaming generator
async def event_stream(req_message: str, user_id: str, db: Session):
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
                            yield f"data: {full_text}\n\n"
                            await asyncio.sleep(0.01)
                    except Exception:
                        continue
    
    # Save the complete chat history after streaming is done
    save_chat_message(db, user_id, req_message, full_text)

# Get user usage endpoint
@app.get("/usage/{user_id}", response_model=UsageResponse)
async def get_user_usage(user_id: str, db: Session = Depends(get_db)):
    subscription_data = await check_subscription(user_id)
    plan = subscription_data.get("plan", "Standard") if subscription_data.get("subscribed") else "Free"
    
    today = date.today()
    user_usage = db.query(UserUsage).filter(
        UserUsage.user_id == user_id,
        UserUsage.date == today
    ).first()
    
    current_count = user_usage.prompt_count if user_usage else 0
    daily_limit = DAILY_PROMPT_CAP.get(plan, 5)
    
    return UsageResponse(
        user_id=user_id,
        date=today,
        prompt_count=current_count,
        daily_limit=daily_limit,
        remaining_quota=max(0, daily_limit - current_count),
        plan=plan
    )

# Streaming endpoint
@app.post("/chat/stream")
async def chat_stream(req: ChatRequest, db: Session = Depends(get_db)):
    # Check subscription
    subscription_data = await check_subscription(req.user_id)
    
    if not subscription_data.get("subscribed"):
        async def unsubscribed_gen():
            yield f"data: You are not a subscribed member. Please subscribe to use the chatbot.\n\n"
        return StreamingResponse(unsubscribed_gen(), media_type="text/event-stream")
    
    # Get user plan
    plan = subscription_data.get("plan", "Standard")
    
    # Check usage limits
    try:
        user_usage, daily_limit = check_user_usage(db, req.user_id, plan)
    except HTTPException as e:
        async def limit_exceeded_gen():
            yield f"data: {e.detail}\n\n"
        return StreamingResponse(limit_exceeded_gen(), media_type="text/event-stream")
    
    # Save user message to database
    save_chat_message(db, req.user_id, req.message)
    
    # Proceed to chatbot streaming
    return StreamingResponse(
        event_stream(req.message, req.user_id, db), 
        media_type="text/event-stream"
    )

# Non-streaming endpoint
@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest, db: Session = Depends(get_db)):
    # Check subscription
    subscription_data = await check_subscription(req.user_id)
    
    if not subscription_data.get("subscribed"):
        return ChatResponse(reply="You are not a subscribed member. Please subscribe to use the chatbot.")
    
    # Get user plan
    plan = subscription_data.get("plan", "Standard")
    
    # Check usage limits
    user_usage, daily_limit = check_user_usage(db, req.user_id, plan)
    
    # Save user message to database
    save_chat_message(db, req.user_id, req.message)

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
    
    # Save bot reply to database
    save_chat_message(db, req.user_id, req.message, reply)

    return ChatResponse(reply=reply)

# Get chat history endpoint
@app.get("/chat/history/{user_id}")
async def get_chat_history(user_id: str, limit: int = 50, db: Session = Depends(get_db)):
    chat_history = db.query(ChatHistory).filter(
        ChatHistory.user_id == user_id
    ).order_by(ChatHistory.created_at.desc()).limit(limit).all()
    
    return {
        "user_id": user_id,
        "chat_history": [
            {
                "id": chat.id,
                "message": chat.message,
                "reply": chat.reply,
                "message_type": chat.message_type,
                "created_at": chat.created_at
            }
            for chat in reversed(chat_history)  # Return in chronological order
        ]
    }

# Reset usage (admin endpoint - use with caution)
@app.delete("/usage/{user_id}/reset")
async def reset_user_usage(user_id: str, db: Session = Depends(get_db)):
    today = date.today()
    user_usage = db.query(UserUsage).filter(
        UserUsage.user_id == user_id,
        UserUsage.date == today
    ).first()
    
    if user_usage:
        user_usage.prompt_count = 0
        db.commit()
    
    return {"message": f"Usage reset for user {user_id}"}

# Run server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)