from sqlalchemy import Column, ForeignKey, Integer, String

from .database import Base


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
