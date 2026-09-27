from typing import List, Literal

from pydantic import BaseModel, Field


class AssistantMessage(BaseModel):
    Role: Literal["user", "assistant"]
    Text: str = Field(..., max_length=2000)


class AssistantChatRequest(BaseModel):
    Message: str = Field(..., min_length=1, max_length=2000)
    Page: str = Field(..., max_length=200, description="The route path the user is currently on, e.g. /admin/inventory")
    History: List[AssistantMessage] = Field(default_factory=list, max_length=12, description="Prior turns of this conversation, oldest first")


class AssistantChatResponse(BaseModel):
    Reply: str
    Configured: bool = Field(..., description="False if ANTHROPIC_API_KEY isn't set on the server yet")
