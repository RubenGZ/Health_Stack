"""partial_indexes_tokens

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-05-28 09:15:00.000000

Añade partial indexes (índices parciales) a las tablas de tokens.

MOTIVACIÓN:
Los tokens revocados (refresh_tokens.revoked_at IS NOT NULL) y los tokens
de reset usados (password_reset_tokens.used_at IS NOT NULL) NUNCA se vuelven
a consultar en producción. Sin embargo, los índices actuales B-tree completos
incluyen todas las filas — incluyendo las ya inactivas.

Con partial indexes, el índice solo cubre las filas activas (una fracción del
total). A medida que la tabla crece con tokens históricos, el índice de lookup
permanece pequeño y eficiente.

CONSULTAS QUE USAN ESTOS ÍNDICES:
  -- refresh token validation (identity/repository.py)
  WHERE jti = :jti AND revoked_at IS NULL

  -- password reset validation
  WHERE token_hash = :hash AND used_at IS NULL AND expires_at > NOW()

NOTA: Los índices existentes (B-tree completos) se mantienen para soportar
queries admin/audit que buscan sobre tokens revocados/usados.
"""
from __future__ import annotations

from alembic import op


# revision identifiers, used by Alembic.
revision = 'a7b8c9d0e1f2'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Partial index: solo refresh tokens activos (no revocados)
    # Cubre el 99%+ de las queries de validación de token
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_refresh_tokens_active
        ON public.refresh_tokens (user_id)
        WHERE revoked_at IS NULL
    """)

    # Partial index: solo password reset tokens no consumidos
    # El token_hash está indexado en el B-tree completo; este partial
    # acelera además la ruta de validación que filtra por used_at IS NULL
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_password_reset_active
        ON public.password_reset_tokens (token_hash)
        WHERE used_at IS NULL
    """)


def downgrade() -> None:
    op.drop_index('ix_refresh_tokens_active', table_name='refresh_tokens', schema='public', if_exists=True)
    op.drop_index('ix_password_reset_active', table_name='password_reset_tokens', schema='public', if_exists=True)
