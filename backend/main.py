import hashlib
from uuid import uuid4
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, get_db
from .models import Tutor, Usuario
from .schemas import TutorCreate, TutorResponse


app = FastAPI(title="Guardian API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


ADMIN_EMAIL = "admin@guardian.net"
ADMIN_PASSWORD = "Admin1234"


def _hash_password(password: str) -> str:
    """Mantiene compatibilidad con el SHA-256 usado por la PWA local."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def _ensure_user_role_column() -> None:
    inspector = inspect(engine)
    if not inspector.has_table("usuarios"):
        return

    columns = {column["name"] for column in inspector.get_columns("usuarios")}
    if "rol" not in columns:
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE usuarios ADD COLUMN rol VARCHAR(30) NOT NULL DEFAULT 'usuario'")
            )


@app.on_event("startup")
def seed_admin_user() -> None:
    """Crea el administrador demo una sola vez al iniciar la API."""
    Base.metadata.create_all(bind=engine)
    _ensure_user_role_column()
    db = SessionLocal()

    try:
        admin = db.query(Usuario).filter(Usuario.email == ADMIN_EMAIL).first()
        if admin is None:
            db.add(
                Usuario(
                    id_usuario=str(uuid4()),
                    nombre_completo="Administrador Guardian",
                    telefono="0000000000",
                    email=ADMIN_EMAIL,
                    password_hash=_hash_password(ADMIN_PASSWORD),
                    push_token=None,
                    dispositivo_modelo="Guardian Admin",
                    app_version="1.0.0",
                    rol="admin",
                )
            )
            db.commit()
            print(f"[Guardian] Usuario administrador creado: {ADMIN_EMAIL}")
        elif admin.rol != "admin":
            admin.rol = "admin"
            db.commit()
            print(f"[Guardian] Rol admin confirmado: {ADMIN_EMAIL}")
        else:
            print(f"[Guardian] Usuario administrador ya existe: {ADMIN_EMAIL}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


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
