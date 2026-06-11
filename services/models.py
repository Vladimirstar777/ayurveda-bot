from sqlmodel import SQLModel, Field
from typing import Optional

class User(SQLModel, table=True):
    __tablename__ = "users"
    user_id: int = Field(primary_key=True, description="Telegram user id")
    profile_data: str = Field(default="{}", description="JSON with user profile")
    blockpost_data: str = Field(default='{"conditions": []}', description="JSON with blockpost conditions")
    admin_notes: str = Field(default="")
    manual_dosha: str = Field(default="")
    created_at: str = Field(default="")
    updated_at: str = Field(default="")

class Ration(SQLModel, table=True):
    __tablename__ = "rations"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(description="Telegram user id")
    ration_data: str = Field(description="JSON with generated ration")
    generated_at: str = Field(default="")
