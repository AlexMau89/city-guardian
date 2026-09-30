from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import get_db
from .models import Tutor
from .schemas import TutorCreate, TutorResponse


app = FastAPI(title="Guardian API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _tutor_values(payload: TutorCreate) -> dict:
    return payload.dict()


def _upsert_tutor(db: Session, payload: TutorCreate, usuario_id: str) -> Tutor:
    tutor = db.query(Tutor).filter(Tutor.id_usuario == usuario_id).first()
    values = _tutor_values(payload)
    values["id_usuario"] = usuario_id

    if tutor is None:
        tutor = Tutor(**values)
        db.add(tutor)
    else:
        for field, value in values.items():
            setattr(tutor, field, value)

    db.commit()
    db.refresh(tutor)
    return tutor


@app.get("/api/tutores/{usuario_id}", response_model=Optional[TutorResponse])
def obtener_tutor(usuario_id: str, db: Session = Depends(get_db)):
    return db.query(Tutor).filter(Tutor.id_usuario == usuario_id).first()


@app.post("/api/tutores", response_model=TutorResponse)
def crear_o_actualizar_tutor(payload: TutorCreate, db: Session = Depends(get_db)):
    return _upsert_tutor(db, payload, payload.id_usuario)


@app.put("/api/tutores/{usuario_id}", response_model=TutorResponse)
def actualizar_tutor(usuario_id: str, payload: TutorCreate, db: Session = Depends(get_db)):
    if payload.id_usuario != usuario_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="id_usuario no coincide con el usuario de la ruta",
        )

    return _upsert_tutor(db, payload, usuario_id)
