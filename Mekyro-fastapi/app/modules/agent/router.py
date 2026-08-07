from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from app.core.config import Settings, get_settings
from app.core.dependencies import SessionDep, WorkspaceDep
from app.modules.agent.gateway import DeterministicModelGateway
from app.modules.agent.service import chat_stream

router = APIRouter(prefix="/workspaces/{workspace_id}/agent", tags=["agent"])


class AgentChatRequest(BaseModel):
    message: str = Field(default="", max_length=2000)
    conversation_id: str | None = Field(default=None, max_length=36)
    action: dict | None = None

    @model_validator(mode="after")
    def validate_request(self):
        self.message = self.message.strip()
        if not self.message and not self.action:
            raise ValueError("message or action is required")
        return self


@router.post("/chat")
async def agent_chat(
    payload: AgentChatRequest,
    request: Request,
    context: WorkspaceDep,
    session: SessionDep,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    gateway = getattr(request.app.state, "agent_gateway", None) or DeterministicModelGateway()
    return StreamingResponse(
        chat_stream(
            message=payload.message,
            action=payload.action,
            conversation_id=payload.conversation_id,
            context=context,
            session=session,
            settings=settings,
            gateway=gateway,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
