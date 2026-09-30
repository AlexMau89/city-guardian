from typing import Optional

from pydantic import BaseModel, Field


class TutorCreate(BaseModel):
    id_usuario: str = Field(min_length=1, max_length=36)
    nombre: str = Field(min_length=2, max_length=120)
    telefono: str = Field(min_length=10, max_length=10)
    parentesco: Optional[str] = Field(default=None, max_length=80)
    email: Optional[str] = Field(default=None, max_length=255)


class TutorResponse(TutorCreate):
    id: int

    class Config:
        orm_mode = True
