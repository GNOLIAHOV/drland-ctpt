import logging
import os
from typing import Dict, List
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from pydantic import BaseModel, Field
import uvicorn

from app.agent import (
    execute_agent_chat,
    get_live_contact_hotline,
    get_live_houses_summary,
)

load_dotenv()
logger = logging.getLogger("ai_main")

app = FastAPI(
    title="AI Booking Agent API",
    description="Trợ lý AI Tư vấn & Đặt lịch xem phòng (kết nối qua core-api)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://127.0.0.1:5174", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory dictionary lưu trữ lịch sử hội thoại theo session_id
chat_histories: Dict[str, List[BaseMessage]] = {}
_MAX_CHAT_SESSIONS = 500


def get_session_history(session_id: str) -> List[BaseMessage]:
    if session_id not in chat_histories:
        if len(chat_histories) >= _MAX_CHAT_SESSIONS:
            oldest_key = next(iter(chat_histories))
            chat_histories.pop(oldest_key, None)
        chat_histories[session_id] = []
    return chat_histories[session_id]


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1, description="ID định danh phiên hội thoại")
    message: str = Field(..., min_length=1, description="Nội dung tin nhắn của khách hàng")


class ChatResponse(BaseModel):
    response: str


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "ai-booking-agent",
        "core_api_url": os.getenv("CORE_API_BASE_URL", "http://localhost:3001"),
    }


@app.post("/chat", response_model=ChatResponse)
def chat_endpoint(body: ChatRequest) -> ChatResponse:
    history = get_session_history(body.session_id)
    try:
        answer = execute_agent_chat(
            body.message,
            list(history),
            session_id=body.session_id,
        )

        # Lưu tin nhắn của khách và câu trả lời vào lịch sử
        history.append(HumanMessage(content=body.message))
        history.append(AIMessage(content=answer))

        return ChatResponse(response=answer)
    except Exception as exc:
        logger.error("Lỗi ngoại lệ trong chat_endpoint: %s", exc)
        houses_summary = get_live_houses_summary()
        hotline = get_live_contact_hotline()
        fallback_msg = (
            f"Dạ em là quản lý hệ thống DRLAND ({houses_summary}). "
            "Kênh tư vấn tự động đang nhận nhiều yêu cầu cùng lúc. "
            "Anh/Chị có thể tham khảo bảng giá các phòng trống trên trang web "
            f"hoặc liên hệ trực tiếp Hotline / Zalo: {hotline} để được hỗ trợ đón tiếp xem phòng ngay nhé ạ!"
        )
        return ChatResponse(response=fallback_msg)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
