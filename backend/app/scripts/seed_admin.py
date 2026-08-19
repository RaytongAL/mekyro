import asyncio
import os

from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import Database
from app.core.models import User
from app.core.security import hash_password


async def main() -> None:
    username = os.environ.get("MEKYRO_ADMIN_USERNAME", "").strip().lower()
    password = os.environ.get("MEKYRO_ADMIN_PASSWORD", "")
    email = os.environ.get("MEKYRO_ADMIN_EMAIL", "").strip().lower()
    if not username or not password or not email:
        raise RuntimeError(
            "MEKYRO_ADMIN_USERNAME, MEKYRO_ADMIN_PASSWORD and MEKYRO_ADMIN_EMAIL are required"
        )

    database = Database(get_settings().database_url)
    try:
        async with database.sessions() as session:
            user = await session.scalar(select(User).where(User.username == username))
            if user is None:
                session.add(
                    User(
                        username=username,
                        email=email,
                        display_name=username,
                        nickname=username,
                        password_hash=hash_password(password),
                        is_active=True,
                        is_platform_admin=True,
                    )
                )
            else:
                user.email = email
                user.password_hash = hash_password(password)
                user.is_active = True
                user.is_platform_admin = True
            await session.commit()
    finally:
        await database.dispose()


if __name__ == "__main__":
    asyncio.run(main())
