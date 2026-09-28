from fastapi import APIRouter

from app.schemas.assistant_schema import AssistantChatRequest, AssistantChatResponse
from app.services import assistant_service

router = APIRouter(prefix="/api/v1/assistant", tags=["Assistant"])

@router.post(
    "/chat",
    response_model=AssistantChatResponse,
    summary="Ask the in-app AI assistant a question about the current page",
    description=(
        "Public. The reply is scoped to whatever page the caller is on (see Page). "
        "If the server has no ANTHROPIC_API_KEY configured, Configured is false and Reply "
        "explains that instead of erroring."
    ),
)
async def chat(payload: AssistantChatRequest):
    reply, configured = await assistant_service.chat(payload.Message, payload.Page, payload.History, payload.UserRole)
    return AssistantChatResponse(Reply=reply, Configured=configured)
