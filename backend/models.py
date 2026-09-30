from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func

from .database import Base


class Usuario(Base):
    __tablename__ = "usuarios"

    id_usuario = Column(String(36), primary_key=True, index=True)
    nombre_completo = Column(String(150), nullable=False)
    telefono = Column(String(20), nullable=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    password_hash = Column(String(128), nullable=False)
    push_token = Column(String(255), nullable=True)
    dispositivo_modelo = Column(String(120), nullable=True)
    app_version = Column(String(32), nullable=True)
    creado_en = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    rol = Column(String(30), nullable=False, default="usuario", server_default="usuario")


class Tutor(Base):
    __tablename__ = "tutores"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    id_usuario = Column(
        String(36),
        ForeignKey("usuarios.id_usuario", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    nombre = Column(String(120), nullable=False)
    telefono = Column(String(10), nullable=False)
    parentesco = Column(String(80), nullable=True)
    email = Column(String(255), nullable=True)
