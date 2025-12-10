from fastapi import FastAPI, HTTPException, Depends, Request, Form
from fastapi.responses import StreamingResponse, HTMLResponse, RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import httpx
import os
import json
import secrets
import hashlib
from datetime import datetime, date, timedelta
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, Date, func
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from dotenv import load_dotenv
import posthog

# Load environment variables
load_dotenv()

# =============================================================================
# CONFIGURATION
# =============================================================================

app = FastAPI(
    title="LionRock Backend API",
    description="Backend API for LionRock with analytics and admin dashboard",
    version="1.0.0"
)

# CORS configuration
origins = [
    "http://localhost:3000",  # Next.js development server
    "http://localhost:8080",  # FastAPI development server
    "https://lionrock-6p8fy.ondigitalocean.app",  # FastAPI production server
    "https://lionrock-frontend.vercel.app"  # Frontend Production Server
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL")

# API Keys and External Services
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_BASE_URL = "https://api.deepseek.com"
WORDPRESS_MEMBERSHIP_API = "https://lionrocklabs.com/wp-json/membership/v1/me"

# PostHog Analytics Configuration
POSTHOG_API_KEY = os.getenv("POSTHOG_API_KEY")
if POSTHOG_API_KEY:
    posthog.api_key = POSTHOG_API_KEY
    posthog.host = 'https://eu.posthog.com'

# Admin Configuration
ADMIN_PASSWORD_HASH = hashlib.sha256(os.getenv("ADMIN_PASSWORD", "admin123").encode()).hexdigest()
active_sessions = {}

# Usage limits - CORRECTED CONFIGURATION
USAGE_LIMITS = {
    "Free": {"limit": 0, "period": "daily"},         # 0 prompts for free users
    "Starter": {"limit": 5, "period": "monthly"},   # 5 prompts per month
    "Pro": {"limit": 50, "period": "daily"},         # 50 prompts per day
    }

# =============================================================================
# DATABASE MODELS
# =============================================================================

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

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
    message_type = Column(String)
    template_label = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

Base.metadata.create_all(bind=engine)

# =============================================================================
# DEPENDENCIES & UTILITIES
# =============================================================================

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_admin_session(request: Request):
    session_token = request.cookies.get("admin_session")
    if not session_token or session_token not in active_sessions:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return True

def track_event(user_id: str, event_name: str, properties: dict = None):
    """Track analytics events with PostHog"""
    if not POSTHOG_API_KEY:
        return
    
    try:
        posthog.capture(
            distinct_id=user_id,
            event=event_name,
            properties=properties or {}
        )
    except Exception as e:
        print(f"PostHog tracking error: {e}")

# =============================================================================
# BUSINESS LOGIC
# =============================================================================

async def verify_user_with_wordpress(wp_nonce: str = None):
    """Verify user with WordPress API using provided authentication data"""
    if not wp_nonce:
        return {"verified": False, "error": "No WordPress nonce provided"}

    try:
        headers = {"X-WP-Nonce": wp_nonce}

        # Note: We don't use cookies for privacy and security reasons.
        # The nonce should be sufficient for WordPress session validation.
        # If cookies are required, the frontend has already validated the session.

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                WORDPRESS_MEMBERSHIP_API,
                headers=headers
            )

            if response.status_code == 200:
                wp_data = response.json()
                return {
                    "verified": True,
                    "user_id": str(wp_data.get("user_id")),
                    "logged_in": wp_data.get("logged_in", False),
                    "email": wp_data.get("email"),
                    "plan": wp_data.get("plan", "None")
                }
            else:
                return {
                    "verified": False,
                    "error": f"WordPress API returned {response.status_code}",
                    "details": response.text
                }

    except httpx.TimeoutException:
        return {
            "verified": False,
            "error": "WordPress API timeout - please try again"
        }
    except httpx.HTTPStatusError as e:
        return {
            "verified": False,
            "error": f"WordPress API error: HTTP {e.response.status_code}",
            "details": e.response.text[:200]  # Limit error details
        }
    except httpx.RequestError as e:
        return {
            "verified": False,
            "error": f"Network error connecting to WordPress: {str(e)}"
        }
    except Exception as e:
        # Log unexpected errors for debugging
        print(f"Unexpected error in WordPress verification: {e}")
        return {
            "verified": False,
            "error": "Verification service temporarily unavailable"
        }

def check_subscription(user_id: str, logged_in: bool, plan: str, verified_data: dict = None):
    """Check user subscription status from WordPress membership data"""
    # If we have verified data from WordPress, use it; otherwise use provided data
    if verified_data and verified_data.get("verified"):
        actual_logged_in = verified_data.get("logged_in", False)
        actual_plan = verified_data.get("plan", "None")
        actual_user_id = verified_data.get("user_id")

        # Check if provided data matches verified data
        if str(user_id) != str(actual_user_id):
            track_event(user_id, "user_mismatch", {
                "provided_user_id": user_id,
                "verified_user_id": actual_user_id
            })
            return {"logged_in": False, "subscribed": False, "plan": "Free", "user_id": user_id}

        logged_in = actual_logged_in
        plan = actual_plan
        user_id = actual_user_id

    # Convert "None" plan to "Free" for backward compatibility
    normalized_plan = "Free" if plan == "None" else plan

    subscription_data = {
        "logged_in": logged_in,
        "subscribed": logged_in and plan != "None",
        "plan": normalized_plan,
        "user_id": user_id
    }

    track_event(user_id, "subscription_checked", {
        "logged_in": logged_in,
        "subscribed": subscription_data["subscribed"],
        "plan": normalized_plan,
        "verified": verified_data.get("verified") if verified_data else False
    })

    return subscription_data

def check_user_usage(db: Session, user_id: str, plan: str):
    """
    Check and update user usage based on their subscription plan
    Returns: (user_usage_record, limit)
    """
    today = date.today()
    first_day_of_month = today.replace(day=1)
    
    # Get usage limits for the plan
    plan_config = USAGE_LIMITS.get(plan, {"limit": 0, "period": "daily"})
    limit = plan_config["limit"]
    period = plan_config["period"]
    
    if period == "monthly":
        # Starter Plan: Monthly usage check (5 per month)
        monthly_usage = db.query(func.sum(UserUsage.prompt_count)).filter(
            UserUsage.user_id == user_id,
            UserUsage.date >= first_day_of_month
        ).scalar() or 0
        
        if monthly_usage >= limit:
            track_event(user_id, "quota_exceeded", {
                "plan": plan,
                "monthly_usage": monthly_usage,
                "monthly_limit": limit
            })
            raise HTTPException(
                status_code=429, 
                detail=f"Monthly limit reached. You have used {monthly_usage}/{limit} messages this month."
            )
        
        # Get or create today's usage record for tracking
        user_usage = db.query(UserUsage).filter(
            UserUsage.user_id == user_id,
            UserUsage.date == today
        ).first()
        
        if not user_usage:
            user_usage = UserUsage(user_id=user_id, date=today, prompt_count=0)
            db.add(user_usage)
            db.commit()
            db.refresh(user_usage)
            track_event(user_id, "usage_record_created", {"plan": plan})
        
        # Increment usage count
        user_usage.prompt_count += 1
        db.commit()
        
        track_event(user_id, "message_sent", {
            "plan": plan,
            "new_prompt_count": user_usage.prompt_count,
            "monthly_usage": monthly_usage + 1,
            "monthly_limit": limit,
            "remaining_quota": max(0, limit - (monthly_usage + 1))
        })
        
        return user_usage, limit
        
    else:
        # PRO PLAN: Daily usage check (50 per day)
        user_usage = db.query(UserUsage).filter(
            UserUsage.user_id == user_id,
            UserUsage.date == today
        ).first()
        
        if not user_usage:
            user_usage = UserUsage(user_id=user_id, date=today, prompt_count=0)
            db.add(user_usage)
            db.commit()
            db.refresh(user_usage)
            track_event(user_id, "usage_record_created", {"plan": plan})
        
        if user_usage.prompt_count >= limit:
            track_event(user_id, "quota_exceeded", {
                "plan": plan,
                "prompt_count": user_usage.prompt_count,
                "daily_limit": limit
            })
            raise HTTPException(
                status_code=429, 
                detail=f"Daily limit reached. You have used {user_usage.prompt_count}/{limit} messages today."
            )
        
        # Increment usage count
        user_usage.prompt_count += 1
        db.commit()
        
        track_event(user_id, "message_sent", {
            "plan": plan,
            "new_prompt_count": user_usage.prompt_count,
            "daily_limit": limit,
            "remaining_quota": limit - user_usage.prompt_count
        })
        
        return user_usage, limit

def save_chat_message(db: Session, user_id: str, message: str, reply: str = None, template_label: str = None):
    """Save chat message and bot reply to database"""
    # Save user message
    user_message = ChatHistory(
        user_id=user_id,
        message=message,
        message_type="user",
        template_label=template_label
    )
    db.add(user_message)
    
    # Save bot reply if provided
    if reply:
        bot_reply = ChatHistory(
            user_id=user_id,
            message=None,
            reply=reply,
            message_type="bot",
            template_label=template_label
        )
        db.add(bot_reply)
    
    db.commit()
    
    track_event(user_id, "chat_message_saved", {
        "has_reply": bool(reply),
        "message_length": len(message),
        "template_label": template_label
    })

# =============================================================================
# CHAT ENDPOINTS
# =============================================================================

class ChatRequest(BaseModel):
    message: str
    user_id: str
    logged_in: bool = False
    email: Optional[str] = None
    plan: str = "None"
    template_label: Optional[str] = None
    wp_nonce: Optional[str] = None  # WordPress nonce for verification

class ChatResponse(BaseModel):
    reply: str

class UsageResponse(BaseModel):
    user_id: str
    date: date
    prompt_count: int
    daily_limit: int
    remaining_quota: int
    plan: str

async def event_stream(req_message: str, user_id: str, db: Session, template_label: str = None):
    """Stream chat response from DeepSeek API"""
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

    track_event(user_id, "streaming_started", {
        "message_length": len(req_message),
        "template_label": template_label
    })

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream(
            "POST", f"{DEEPSEEK_BASE_URL}/chat/completions", json=payload, headers=headers
        ) as response:
            if response.status_code != 200:
                content = await response.aread()
                track_event(user_id, "streaming_api_error", {"status_code": response.status_code})
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
                            yield f"data: {json.dumps({'delta': delta, 'full_text': full_text})}\n\n"
                    except Exception:
                        continue
    
    # Save user message AND bot reply together
    save_chat_message(db, user_id, req_message, full_text, template_label)
    track_event(user_id, "streaming_completed", {
        "final_text_length": len(full_text),
        "template_label": template_label
    })

@app.post("/chat/stream")
async def chat_stream(req: ChatRequest, db: Session = Depends(get_db)):
    """Streaming chat endpoint"""
    track_event(req.user_id, "chat_started", {
        "message_length": len(req.message),
        "template_label": req.template_label
    })

    # Verify user with WordPress if authentication data is provided
    verified_data = None
    if req.wp_nonce:
        verified_data = await verify_user_with_wordpress(req.wp_nonce)

        if not verified_data.get("verified"):
            track_event(req.user_id, "verification_failed", {
                "error": verified_data.get("error"),
                "endpoint": "chat_stream"
            })
            async def verification_failed_gen():
                yield f"data: Authentication verification failed. Please refresh and try again.\n\n"
            return StreamingResponse(verification_failed_gen(), media_type="text/event-stream")

    # Check subscription status
    subscription_data = check_subscription(req.user_id, req.logged_in, req.plan, verified_data)
    
    if not subscription_data.get("subscribed"):
        track_event(req.user_id, "unsubscribed_access_attempt")
        async def unsubscribed_gen():
            yield f"data: You are not a subscribed member. Please subscribe to use the chatbot.\n\n"
        return StreamingResponse(unsubscribed_gen(), media_type="text/event-stream")
    
    plan = subscription_data.get("plan", "Starter")
    
    # Check usage limits
    try:
        user_usage, limit = check_user_usage(db, req.user_id, plan)
    except HTTPException as e:
        error_detail = e.detail
        async def limit_exceeded_gen():
            yield f"data: {error_detail}\n\n"
        return StreamingResponse(limit_exceeded_gen(), media_type="text/event-stream")
    
    return StreamingResponse(
        event_stream(req.message, req.user_id, db, req.template_label), 
        media_type="text/event-stream"
    )

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(req: ChatRequest, db: Session = Depends(get_db)):
    """Non-streaming chat endpoint"""
    track_event(req.user_id, "non_streaming_chat_started", {
        "template_label": req.template_label
    })

    # Verify user with WordPress if authentication data is provided
    verified_data = None
    if req.wp_nonce:
        verified_data = await verify_user_with_wordpress(req.wp_nonce)

        if not verified_data.get("verified"):
            track_event(req.user_id, "verification_failed", {
                "error": verified_data.get("error"),
                "endpoint": "chat"
            })
            raise HTTPException(
                status_code=401,
                detail="Authentication verification failed. Please refresh and try again."
            )

    # Check subscription status
    subscription_data = check_subscription(req.user_id, req.logged_in, req.plan, verified_data)
    
    if not subscription_data.get("subscribed"):
        track_event(req.user_id, "unsubscribed_non_streaming_attempt")
        return ChatResponse(reply="You are not a subscribed member. Please subscribe to use the chatbot.")
    
    plan = subscription_data.get("plan", "Starter")
    
    # Check usage limits
    user_usage, limit = check_user_usage(db, req.user_id, plan)

    # Call DeepSeek API
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
            track_event(req.user_id, "api_request_error", {"error": str(e)})
            raise HTTPException(status_code=500, detail=f"Error contacting DeepSeek: {e}")

    if response.status_code != 200:
        track_event(req.user_id, "api_response_error", {"status_code": response.status_code})
        raise HTTPException(status_code=response.status_code, detail=response.text)

    res_json = response.json()
    try:
        reply = res_json["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        track_event(req.user_id, "api_response_parse_error")
        raise HTTPException(status_code=500, detail=f"Malformed DeepSeek response: {res_json}")
    
    # Save user message AND bot reply together
    save_chat_message(db, req.user_id, req.message, reply, req.template_label)
    track_event(req.user_id, "non_streaming_chat_completed", {
        "reply_length": len(reply),
        "template_label": req.template_label
    })

    return ChatResponse(reply=reply)

@app.get("/usage/{user_id}", response_model=UsageResponse)
async def get_user_usage(user_id: str, plan: str = "None", wp_nonce: str = None, db: Session = Depends(get_db)):
    """Get current usage information for a user"""
    track_event(user_id, "usage_checked")

    # Verify user with WordPress if authentication data is provided
    verified_data = None
    if wp_nonce:
        verified_data = await verify_user_with_wordpress(wp_nonce)

        if verified_data.get("verified"):
            plan = verified_data.get("plan", "None")

    # Normalize plan (convert "None" to "Free" for backward compatibility)
    normalized_plan = "Free" if plan == "None" else plan
    
    today = date.today()
    first_day_of_month = today.replace(day=1)
    
    # Get usage limits for the plan
    plan_config = USAGE_LIMITS.get(plan, {"limit": 0, "period": "daily"})
    limit = plan_config["limit"]
    period = plan_config["period"]
    
    if period == "monthly":
        # Starter Plan: Show monthly usage
        current_count = db.query(func.sum(UserUsage.prompt_count)).filter(
            UserUsage.user_id == user_id,
            UserUsage.date >= first_day_of_month
        ).scalar() or 0
    else:
        # PRO PLAN: Show daily usage
        user_usage = db.query(UserUsage).filter(
            UserUsage.user_id == user_id,
            UserUsage.date == today
        ).first()
        current_count = user_usage.prompt_count if user_usage else 0
    
    return UsageResponse(
        user_id=user_id,
        date=today,
        prompt_count=current_count,
        daily_limit=limit,
        remaining_quota=max(0, limit - current_count),
        plan=normalized_plan
    )

@app.get("/chat/history/{user_id}")
async def get_chat_history(user_id: str, limit: int = 50, db: Session = Depends(get_db)):
    """Get chat history for a user"""
    track_event(user_id, "chat_history_accessed")
    
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
                "template_label": chat.template_label,
                "created_at": chat.created_at
            }
            for chat in reversed(chat_history)
        ]
    }

# =============================================================================
# ADMIN API ENDPOINTS
# =============================================================================

@app.post("/admin/login")
async def admin_login(password: str = Form(...)):
    """Admin login endpoint"""
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    if password_hash == ADMIN_PASSWORD_HASH:
        session_token = secrets.token_hex(32)
        active_sessions[session_token] = {
            "created_at": datetime.utcnow(),
            "last_activity": datetime.utcnow()
        }
        
        # Return JSON success instead of redirect
        response_data = {"status": "success", "message": "Login successful"}
        
        # Create response with cookie
        response = JSONResponse(content=response_data)
        response.set_cookie(
            key="admin_session",
            value=session_token,
            httponly=True,
            max_age=3600,
            samesite="none",
            secure=True
        )
        track_event("admin", "admin_logged_in")
        return response
    else:
        track_event("admin", "admin_login_failed")
        raise HTTPException(status_code=401, detail="Invalid password")

@app.get("/admin/api/metrics")
async def get_admin_metrics(authenticated: bool = Depends(verify_admin_session)):
    """Get admin dashboard metrics"""
    today = date.today()
    first_day_of_month = today.replace(day=1)
    
    db = SessionLocal()
    try:
        # Active Subscribers
        active_subscribers = db.query(UserUsage).filter(
            UserUsage.date == today
        ).distinct(UserUsage.user_id).count()
        
        # Monthly Messages
        monthly_messages = db.query(UserUsage).filter(
            UserUsage.date >= first_day_of_month
        ).with_entities(UserUsage.prompt_count).all()
        total_monthly_messages = sum([msg[0] for msg in monthly_messages])
        
        # API Cost
        approximate_cost = total_monthly_messages * 0.07
        
        # Top Prompts
        top_prompts_query = db.query(
            ChatHistory.template_label,
            func.count(ChatHistory.id)
        ).filter(
            ChatHistory.message_type == "user",
            ChatHistory.created_at >= first_day_of_month,
            ChatHistory.template_label.isnot(None)
        ).group_by(
            ChatHistory.template_label
        ).order_by(
            func.count(ChatHistory.id).desc()
        ).limit(5).all()
        
        top_prompts = [(label, count) for label, count in top_prompts_query]
        
        return {
            "active_subscribers": active_subscribers,
            "monthly_messages": total_monthly_messages,
            "api_cost": round(approximate_cost, 2),
            "system_status": "Online",
            "top_prompts": top_prompts,
            "last_updated": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        }
    finally:
        db.close()

@app.post("/admin/logout")
async def admin_logout(request: Request, authenticated: bool = Depends(verify_admin_session)):
    """Admin logout endpoint"""
    session_token = request.cookies.get("admin_session")
    if session_token in active_sessions:
        del active_sessions[session_token]
    
    track_event("admin", "admin_logged_out")
    
    response = RedirectResponse(url="/admin/login", status_code=303)
    response.delete_cookie("admin_session")
    return response


# =============================================================================
# APPLICATION STARTUP
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    
    if not DEEPSEEK_API_KEY:
        raise ValueError("DEEPSEEK_API_KEY is not set. Please check your .env file.")
    
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL is not set. Please check your .env file.")
    
    print("Starting LionRock Backend API...")
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)