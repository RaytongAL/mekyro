from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Lead, OutboxMessage, Workspace, new_id


def enqueue_email_outreach(
    session: AsyncSession,
    *,
    workspace: Workspace,
    leads: list[Lead],
) -> list[OutboxMessage]:
    if not workspace.email_outreach_enabled:
        return []
    messages = []
    for lead in leads:
        if lead.workspace_id != workspace.id:
            raise ValueError("Lead and Workspace do not share the same tenant")
        message = OutboxMessage(
            id=new_id(),
            workspace_id=workspace.id,
            topic="email.outreach.requested",
            aggregate_type="lead",
            aggregate_id=lead.id,
            deduplication_key=f"email:outreach:lead:{lead.id}",
            payload={"lead_id": lead.id, "allow_repeat": True},
        )
        session.add(message)
        messages.append(message)
    return messages
