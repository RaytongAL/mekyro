from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError

from app.core.audit import record_audit
from app.core.dependencies import SessionDep, WorkspaceDep, WorkspaceWriteDep
from app.core.models import ContactActivity, Lead, Order, Quote, new_id
from app.modules.outreach.outbox import enqueue_email_outreach

router = APIRouter(prefix="/workspaces/{workspace_id}/leads", tags=["crm"])
activity_router = APIRouter(prefix="/workspaces/{workspace_id}/activities", tags=["crm"])


class LeadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    workspace_name: str = ""
    source: str
    external_ref: str
    merchant_name: str
    company_name: str
    contact_person: str
    country: str
    city: str
    zip_code: str
    description: str
    email: str
    phone: str
    country_code: str
    whatsapp: str
    stage: str
    recommendation_score: int
    recommendation_reason: str
    created_at: datetime
    updated_at: datetime
    latest_contact_at: datetime | None = None


class LeadListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[LeadResponse]


class ActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    lead_id: str
    merchant_name: str = ""
    activity_type: str
    direction: str
    channel: str
    subject: str
    sender: str
    recipient: str
    content: str
    created_at: datetime


class ActivityListResponse(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[ActivityResponse]


LeadStage = Literal["new", "contacting", "replied", "qualified", "quoting", "ordered", "lost"]
LeadSource = Literal["manual", "website", "amazon", "trade_show", "other"]
ActivityDirection = Literal["inbound", "outbound"]
ActivityChannel = Literal["email", "whatsapp", "phone", "meeting", "other"]
ActivityType = Literal["ai_outbound", "human_outbound", "customer_inbound"]
EMAIL_OR_BLANK_PATTERN = r"^(?:$|[^@\s]+@[^@\s]+\.[^@\s]+)$"

ALLOWED_STAGE_TRANSITIONS: dict[str, set[str]] = {
    "new": {"contacting", "lost"},
    "contacting": {"replied", "qualified", "lost"},
    "replied": {"qualified", "lost"},
    "qualified": {"quoting", "lost"},
    "quoting": {"ordered", "lost"},
    "ordered": set(),
    "lost": set(),
}


class LeadCreateRequest(BaseModel):
    source: LeadSource = "manual"
    external_ref: str | None = Field(default=None, min_length=1, max_length=120)
    merchant_name: str = Field(min_length=1, max_length=200)
    company_name: str = Field(min_length=1, max_length=200)
    contact_person: str = Field(default="", max_length=150)
    country: str = Field(min_length=2, max_length=2, pattern=r"^[a-zA-Z]{2}$")
    city: str = Field(default="", max_length=100)
    zip_code: str = Field(default="", max_length=20)
    description: str = Field(default="", max_length=10000)
    email: str = Field(default="", max_length=254, pattern=EMAIL_OR_BLANK_PATTERN)
    phone: str = Field(default="", max_length=50)
    country_code: str = Field(default="", max_length=10)
    whatsapp: str = Field(default="", max_length=50)
    recommendation_score: int = Field(default=0, ge=0, le=100)
    recommendation_reason: str = Field(default="", max_length=2000)


class LeadUpdateRequest(BaseModel):
    source: LeadSource | None = None
    external_ref: str | None = Field(default=None, min_length=1, max_length=120)
    merchant_name: str | None = Field(default=None, min_length=1, max_length=200)
    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    contact_person: str | None = Field(default=None, max_length=150)
    country: str | None = Field(default=None, min_length=2, max_length=2, pattern=r"^[a-zA-Z]{2}$")
    city: str | None = Field(default=None, max_length=100)
    zip_code: str | None = Field(default=None, max_length=20)
    description: str | None = Field(default=None, max_length=10000)
    email: str | None = Field(default=None, max_length=254, pattern=EMAIL_OR_BLANK_PATTERN)
    phone: str | None = Field(default=None, max_length=50)
    country_code: str | None = Field(default=None, max_length=10)
    whatsapp: str | None = Field(default=None, max_length=50)
    stage: LeadStage | None = None
    recommendation_score: int | None = Field(default=None, ge=0, le=100)
    recommendation_reason: str | None = Field(default=None, max_length=2000)


class LeadBatchCreateRequest(BaseModel):
    items: list[LeadCreateRequest] = Field(min_length=1, max_length=500)


class ActivityCreateRequest(BaseModel):
    activity_type: ActivityType | None = None
    direction: ActivityDirection | None = None
    channel: ActivityChannel
    subject: str = Field(default="", max_length=500)
    sender: str = Field(default="", max_length=254, pattern=EMAIL_OR_BLANK_PATTERN)
    recipient: str = Field(default="", max_length=254, pattern=EMAIL_OR_BLANK_PATTERN)
    content: str = Field(min_length=1, max_length=10000)

    @model_validator(mode="after")
    def normalize_direction(self):
        if self.activity_type is None and self.direction is None:
            self.activity_type = "human_outbound"
            self.direction = "outbound"
        elif self.activity_type is None:
            self.activity_type = (
                "customer_inbound" if self.direction == "inbound" else "human_outbound"
            )
        elif self.direction is None:
            self.direction = "inbound" if self.activity_type == "customer_inbound" else "outbound"
        expected = "inbound" if self.activity_type == "customer_inbound" else "outbound"
        if self.direction != expected:
            raise ValueError("Activity type and direction are inconsistent")
        return self


class ActivityUpdateRequest(BaseModel):
    activity_type: ActivityType | None = None
    channel: ActivityChannel | None = None
    subject: str | None = Field(default=None, max_length=500)
    sender: str | None = Field(
        default=None,
        max_length=254,
        pattern=EMAIL_OR_BLANK_PATTERN,
    )
    recipient: str | None = Field(
        default=None,
        max_length=254,
        pattern=EMAIL_OR_BLANK_PATTERN,
    )
    content: str | None = Field(default=None, min_length=1, max_length=10000)


class ActivityBatchCreateRequest(BaseModel):
    items: list[ActivityCreateRequest] = Field(min_length=1, max_length=500)


def _new_lead(workspace_id: str, payload: LeadCreateRequest) -> Lead:
    return Lead(
        id=new_id(),
        workspace_id=workspace_id,
        source=payload.source,
        external_ref=payload.external_ref or f"MAN-{new_id()}",
        merchant_name=payload.merchant_name,
        company_name=payload.company_name,
        contact_person=payload.contact_person,
        country=payload.country.upper(),
        city=payload.city,
        zip_code=payload.zip_code,
        description=payload.description,
        email=payload.email,
        phone=payload.phone,
        country_code=payload.country_code,
        whatsapp=payload.whatsapp,
        stage="new",
        recommendation_score=payload.recommendation_score,
        recommendation_reason=payload.recommendation_reason,
    )


def _new_activity(
    workspace_id: str,
    lead_id: str,
    payload: ActivityCreateRequest,
) -> ContactActivity:
    return ContactActivity(
        id=new_id(),
        workspace_id=workspace_id,
        lead_id=lead_id,
        activity_type=payload.activity_type or "human_outbound",
        direction=payload.direction or "outbound",
        channel=payload.channel,
        subject=payload.subject,
        sender=payload.sender,
        recipient=payload.recipient,
        content=payload.content,
    )


@router.get("", response_model=LeadListResponse)
async def list_leads(
    context: WorkspaceDep,
    session: SessionDep,
    search: str | None = None,
    stage: str | None = None,
    country: str | None = None,
    source_filter: Annotated[LeadSource | None, Query(alias="source")] = None,
    ordering: Literal[
        "id",
        "-id",
        "created_at",
        "-created_at",
        "recommendation_score",
        "-recommendation_score",
        "merchant_name",
        "-merchant_name",
    ] = "-recommendation_score",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> LeadListResponse:
    filters = [Lead.workspace_id == context.workspace.id]
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                Lead.merchant_name.ilike(term),
                Lead.company_name.ilike(term),
                Lead.contact_person.ilike(term),
                Lead.email.ilike(term),
            )
        )
    if stage:
        filters.append(Lead.stage == stage)
    if country:
        filters.append(Lead.country == country.upper())
    if source_filter:
        filters.append(Lead.source == source_filter)

    ordering_map = {
        "id": Lead.created_at.asc(),
        "-id": Lead.created_at.desc(),
        "created_at": Lead.created_at.asc(),
        "-created_at": Lead.created_at.desc(),
        "recommendation_score": Lead.recommendation_score.asc(),
        "-recommendation_score": Lead.recommendation_score.desc(),
        "merchant_name": Lead.merchant_name.asc(),
        "-merchant_name": Lead.merchant_name.desc(),
    }

    total = await session.scalar(select(func.count()).select_from(Lead).where(*filters))
    latest_contact_at = (
        select(func.max(ContactActivity.created_at))
        .where(ContactActivity.lead_id == Lead.id)
        .correlate(Lead)
        .scalar_subquery()
    )
    rows = (
        await session.execute(
            select(Lead, latest_contact_at.label("latest_contact_at"))
            .where(*filters)
            .order_by(ordering_map[ordering], Lead.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return LeadListResponse(
        total=total or 0,
        limit=limit,
        offset=offset,
        items=[
            LeadResponse.model_validate(lead).model_copy(
                update={
                    "workspace_name": context.workspace.name,
                    "latest_contact_at": latest,
                }
            )
            for lead, latest in rows
        ],
    )


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Lead:
    lead = _new_lead(context.workspace.id, payload)
    session.add(lead)
    enqueue_email_outreach(session, workspace=context.workspace, leads=[lead])
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="crm.lead_created",
        entity_type="lead",
        entity_id=lead.id,
        payload={"source": lead.source, "external_ref": lead.external_ref},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead source and external reference already exist",
        ) from exc
    return LeadResponse.model_validate(lead).model_copy(
        update={"workspace_name": context.workspace.name}
    )


@router.post("/batch", response_model=list[LeadResponse], status_code=status.HTTP_201_CREATED)
async def batch_create_leads(
    payload: LeadBatchCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> list[Lead]:
    leads = [_new_lead(context.workspace.id, item) for item in payload.items]
    session.add_all(leads)
    enqueue_email_outreach(session, workspace=context.workspace, leads=leads)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="crm.leads_batch_created",
        entity_type="workspace",
        entity_id=context.workspace.id,
        payload={"lead_ids": [item.id for item in leads]},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Batch contains an existing source and external reference",
        ) from exc
    return [
        LeadResponse.model_validate(lead).model_copy(
            update={"workspace_name": context.workspace.name}
        )
        for lead in leads
    ]


async def _get_lead(workspace_id: str, lead_id: str, session: SessionDep) -> Lead:
    lead = await session.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.workspace_id == workspace_id)
    )
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    return lead


@router.get("/{lead_id}", response_model=LeadResponse)
async def get_lead(lead_id: str, context: WorkspaceDep, session: SessionDep) -> Lead:
    lead = await _get_lead(context.workspace.id, lead_id, session)
    latest = await session.scalar(
        select(func.max(ContactActivity.created_at)).where(ContactActivity.lead_id == lead.id)
    )
    return LeadResponse.model_validate(lead).model_copy(
        update={
            "workspace_name": context.workspace.name,
            "latest_contact_at": latest,
        }
    )


@router.patch("/{lead_id}", response_model=LeadResponse)
async def update_lead(
    lead_id: str,
    payload: LeadUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> Lead:
    lead = await _get_lead(context.workspace.id, lead_id, session)
    changes = payload.model_dump(exclude_unset=True)
    requested_stage = changes.get("stage")
    if (
        requested_stage is not None
        and requested_stage != lead.stage
        and requested_stage not in ALLOWED_STAGE_TRANSITIONS.get(lead.stage, set())
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Lead stage cannot transition from {lead.stage} to {requested_stage}",
        )
    previous_stage = lead.stage
    if "country" in changes:
        changes["country"] = changes["country"].upper()
    for field_name, value in changes.items():
        setattr(lead, field_name, value)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action=(
            "crm.lead_stage_changed"
            if requested_stage is not None and requested_stage != previous_stage
            else "crm.lead_updated"
        ),
        entity_type="lead",
        entity_id=lead.id,
        payload={"from": previous_stage, "to": lead.stage, "fields": sorted(changes)},
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Lead source and external reference already exist",
        ) from exc
    latest = await session.scalar(
        select(func.max(ContactActivity.created_at)).where(ContactActivity.lead_id == lead.id)
    )
    return LeadResponse.model_validate(lead).model_copy(update={"latest_contact_at": latest})


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lead(
    lead_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    lead = await _get_lead(context.workspace.id, lead_id, session)
    await session.execute(update(Order).where(Order.lead_id == lead.id).values(lead_id=None))
    await session.execute(update(Quote).where(Quote.lead_id == lead.id).values(lead_id=None))
    await session.execute(delete(ContactActivity).where(ContactActivity.lead_id == lead.id))
    await session.execute(delete(Lead).where(Lead.id == lead.id))
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="crm.lead_deleted",
        entity_type="lead",
        entity_id=lead.id,
        payload={"merchant_name": lead.merchant_name},
    )
    await session.commit()


@router.get("/{lead_id}/activities", response_model=ActivityListResponse)
async def list_activities(
    lead_id: str,
    context: WorkspaceDep,
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ActivityListResponse:
    await _get_lead(context.workspace.id, lead_id, session)
    filters = [
        ContactActivity.workspace_id == context.workspace.id,
        ContactActivity.lead_id == lead_id,
    ]
    total = await session.scalar(
        select(func.count()).select_from(ContactActivity).where(*filters)
    ) or 0
    rows = (
        await session.execute(
            select(ContactActivity, Lead.merchant_name)
            .join(Lead, Lead.id == ContactActivity.lead_id)
            .where(*filters)
            .order_by(ContactActivity.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return ActivityListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            ActivityResponse.model_validate(activity).model_copy(
                update={"merchant_name": merchant_name}
            )
            for activity, merchant_name in rows
        ],
    )


@router.post(
    "/{lead_id}/activities",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_activity(
    lead_id: str,
    payload: ActivityCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> ActivityResponse:
    await _get_lead(context.workspace.id, lead_id, session)
    activity = _new_activity(context.workspace.id, lead_id, payload)
    session.add(activity)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="crm.activity_created",
        entity_type="contact_activity",
        entity_id=activity.id,
        payload={"lead_id": lead_id, "channel": activity.channel},
    )
    await session.commit()
    return await _activity_response(activity, session)


@router.post(
    "/{lead_id}/activities/batch",
    response_model=list[ActivityResponse],
    status_code=status.HTTP_201_CREATED,
)
async def batch_create_activities(
    lead_id: str,
    payload: ActivityBatchCreateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> list[ActivityResponse]:
    await _get_lead(context.workspace.id, lead_id, session)
    activities = [_new_activity(context.workspace.id, lead_id, item) for item in payload.items]
    session.add_all(activities)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="crm.activities_batch_created",
        entity_type="lead",
        entity_id=lead_id,
        payload={"activity_ids": [item.id for item in activities]},
    )
    await session.commit()
    return [await _activity_response(activity, session) for activity in activities]


async def _get_activity(
    workspace_id: str,
    activity_id: str,
    session: SessionDep,
) -> ContactActivity:
    activity = await session.scalar(
        select(ContactActivity).where(
            ContactActivity.id == activity_id,
            ContactActivity.workspace_id == workspace_id,
        )
    )
    if activity is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact activity not found",
        )
    return activity


async def _activity_response(activity: ContactActivity, session: SessionDep) -> ActivityResponse:
    merchant_name = await session.scalar(
        select(Lead.merchant_name).where(Lead.id == activity.lead_id)
    )
    return ActivityResponse.model_validate(activity).model_copy(
        update={"merchant_name": merchant_name or ""}
    )


@activity_router.get("", response_model=ActivityListResponse)
async def list_workspace_activities(
    context: WorkspaceDep,
    session: SessionDep,
    lead_id: str | None = None,
    activity_type: Annotated[ActivityType | None, Query(alias="type")] = None,
    channel: ActivityChannel | None = None,
    search: str | None = None,
    ordering: Literal["id", "-id", "created_at", "-created_at"] = "-id",
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ActivityListResponse:
    filters = [ContactActivity.workspace_id == context.workspace.id]
    if lead_id:
        await _get_lead(context.workspace.id, lead_id, session)
        filters.append(ContactActivity.lead_id == lead_id)
    if activity_type:
        filters.append(ContactActivity.activity_type == activity_type)
    if channel:
        filters.append(ContactActivity.channel == channel)
    if search:
        term = f"%{search.strip()}%"
        filters.append(
            or_(
                ContactActivity.subject.ilike(term),
                ContactActivity.sender.ilike(term),
                ContactActivity.recipient.ilike(term),
                ContactActivity.content.ilike(term),
            )
        )
    total = await session.scalar(
        select(func.count()).select_from(ContactActivity).where(*filters)
    ) or 0
    ordering_map = {
        "id": ContactActivity.created_at.asc(),
        "-id": ContactActivity.created_at.desc(),
        "created_at": ContactActivity.created_at.asc(),
        "-created_at": ContactActivity.created_at.desc(),
    }
    rows = (
        await session.execute(
            select(ContactActivity, Lead.merchant_name)
            .join(Lead, Lead.id == ContactActivity.lead_id)
            .where(*filters)
            .order_by(ordering_map[ordering], ContactActivity.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    return ActivityListResponse(
        total=total,
        limit=limit,
        offset=offset,
        items=[
            ActivityResponse.model_validate(activity).model_copy(
                update={"merchant_name": merchant_name}
            )
            for activity, merchant_name in rows
        ],
    )


@activity_router.get("/{activity_id}", response_model=ActivityResponse)
async def get_activity(
    activity_id: str,
    context: WorkspaceDep,
    session: SessionDep,
) -> ActivityResponse:
    activity = await _get_activity(context.workspace.id, activity_id, session)
    return await _activity_response(activity, session)


@activity_router.patch("/{activity_id}", response_model=ActivityResponse)
async def update_activity(
    activity_id: str,
    payload: ActivityUpdateRequest,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> ActivityResponse:
    activity = await _get_activity(context.workspace.id, activity_id, session)
    changes = payload.model_dump(exclude_unset=True)
    if "activity_type" in changes:
        changes["direction"] = (
            "inbound" if changes["activity_type"] == "customer_inbound" else "outbound"
        )
    for field_name, value in changes.items():
        setattr(activity, field_name, value)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="crm.activity_updated",
        entity_type="contact_activity",
        entity_id=activity.id,
        payload={"fields": sorted(changes)},
    )
    await session.commit()
    return await _activity_response(activity, session)


@activity_router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(
    activity_id: str,
    context: WorkspaceWriteDep,
    session: SessionDep,
) -> None:
    activity = await _get_activity(context.workspace.id, activity_id, session)
    await session.delete(activity)
    record_audit(
        session,
        workspace_id=context.workspace.id,
        actor_user_id=context.user.id,
        action="crm.activity_deleted",
        entity_type="contact_activity",
        entity_id=activity.id,
        payload={"lead_id": activity.lead_id},
    )
    await session.commit()
