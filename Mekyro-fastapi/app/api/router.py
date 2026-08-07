from fastapi import APIRouter

from app.modules.agent.router import router as agent_router
from app.modules.apikey.router import external_router as api_key_external_router
from app.modules.apikey.router import router as api_key_router
from app.modules.audit.router import platform_router as platform_audit_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.challenge_router import router as auth_challenge_router
from app.modules.auth.router import router as auth_router
from app.modules.catalog.import_router import router as catalog_import_router
from app.modules.catalog.router import router as catalog_router
from app.modules.crm.router import activity_router
from app.modules.crm.router import router as crm_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.health.router import router as health_router
from app.modules.inquiries.router import router as inquiry_router
from app.modules.orders.router import router as order_router
from app.modules.platform.router import router as platform_router
from app.modules.quotes.router import router as quote_router
from app.modules.shopify.router import router as shopify_router
from app.modules.shopify.router import workspace_router as shopify_workspace_router
from app.modules.workspaces.management_router import router as workspace_management_router
from app.modules.workspaces.members_router import invitation_router as workspace_invitation_router
from app.modules.workspaces.members_router import router as workspace_members_router
from app.modules.workspaces.onboarding_router import router as onboarding_router
from app.modules.workspaces.router import router as workspace_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(auth_challenge_router)
api_router.include_router(workspace_router)
api_router.include_router(workspace_management_router)
api_router.include_router(workspace_members_router)
api_router.include_router(workspace_invitation_router)
api_router.include_router(onboarding_router)
api_router.include_router(dashboard_router)
api_router.include_router(crm_router)
api_router.include_router(activity_router)
api_router.include_router(catalog_router)
api_router.include_router(catalog_import_router)
api_router.include_router(audit_router)
api_router.include_router(platform_audit_router)
api_router.include_router(api_key_router)
api_router.include_router(api_key_external_router)
api_router.include_router(inquiry_router)
api_router.include_router(order_router)
api_router.include_router(platform_router)
api_router.include_router(quote_router)
api_router.include_router(shopify_router)
api_router.include_router(shopify_workspace_router)
api_router.include_router(agent_router)
