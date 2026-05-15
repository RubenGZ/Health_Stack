"""ranked_and_gym_tables

Revision ID: b2c3d4e5f6a8
Revises: a1b2c3d4e5f7
Create Date: 2026-05-15 11:00:00.000000

"""
from __future__ import annotations
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision = 'b2c3d4e5f6a8'
down_revision = 'a1b2c3d4e5f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ranked_seasons
    op.create_table(
        'ranked_seasons',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('closed', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('season'),
        comment='Temporadas del sistema de rankeds.',
        schema='public',
    )

    # ranked_profiles
    op.create_table(
        'ranked_profiles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('queue', sa.String(length=20), nullable=False),
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('tier', sa.String(length=20), nullable=False),
        sa.Column('division', sa.Integer(), nullable=True),
        sa.Column('lp', sa.Integer(), nullable=False),
        sa.Column('peak_tier', sa.String(length=20), nullable=False),
        sa.Column('peak_division', sa.Integer(), nullable=True),
        sa.Column('prev_season_tier', sa.String(length=20), nullable=True),
        sa.Column('lp_week', sa.Integer(), nullable=False),
        sa.Column('lp_week_reset', sa.DateTime(timezone=True), nullable=True),
        sa.Column('competitive_unlocked', sa.Boolean(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'queue', name='uq_ranked_user_queue'),
        comment='Estado de ranking del usuario por cola.',
        schema='public',
    )
    op.create_index('ix_ranked_profiles_user_id', 'ranked_profiles', ['user_id'], schema='public')

    # ranked_events
    op.create_table(
        'ranked_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('queue', sa.String(length=20), nullable=False),
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(length=30), nullable=False),
        sa.Column('lp_delta', sa.Integer(), nullable=False),
        sa.Column('lp_after', sa.Integer(), nullable=False),
        sa.Column('tier_after', sa.String(length=20), nullable=False),
        sa.Column('div_after', sa.Integer(), nullable=True),
        sa.Column('meta', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='Log inmutable de cambios LP. Nunca se actualiza.',
        schema='public',
    )
    op.create_index('ix_ranked_events_user_id', 'ranked_events', ['user_id'], schema='public')

    # gym_servers
    op.create_table(
        'gym_servers',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=80), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('city', sa.String(length=80), nullable=True),
        sa.Column('province', sa.String(length=80), nullable=True),
        sa.Column('country', sa.String(length=5), nullable=False),
        sa.Column('invite_code', sa.String(length=12), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=False),
        sa.Column('is_verified', sa.Boolean(), nullable=False),
        sa.Column('max_members', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['public.users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('invite_code'),
        comment='Servidor de gimnasio — comunidad de entrenamiento.',
        schema='public',
    )

    # gym_memberships
    op.create_table(
        'gym_memberships',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('gym_id', sa.Integer(), nullable=False),
        sa.Column('role', sa.String(length=10), nullable=False),
        sa.Column('profile_public', sa.Boolean(), nullable=False),
        sa.Column('training_schedule', sa.String(length=20), nullable=True),
        sa.Column('training_goal', sa.String(length=20), nullable=True),
        sa.Column('contact_info', sa.String(length=120), nullable=True),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['gym_id'], ['public.gym_servers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'gym_id', name='uq_gym_membership'),
        schema='public',
    )
    op.create_index('ix_gym_memberships_user_id', 'gym_memberships', ['user_id'], schema='public')
    op.create_index('ix_gym_memberships_gym_id', 'gym_memberships', ['gym_id'], schema='public')

    # gym_champion_badges
    op.create_table(
        'gym_champion_badges',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('gym_id', sa.Integer(), nullable=False),
        sa.Column('season', sa.Integer(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('queue', sa.String(length=20), nullable=False),
        sa.Column('city_league_eligible', sa.Boolean(), nullable=False),
        sa.Column('earned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['gym_id'], ['public.gym_servers.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='Insignia top-3 de temporada en un gym.',
        schema='public',
    )
    op.create_index('ix_gym_champion_badges_user_id', 'gym_champion_badges', ['user_id'], schema='public')

    # gym_challenges
    op.create_table(
        'gym_challenges',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('gym_id', sa.Integer(), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('target_type', sa.String(length=20), nullable=False),
        sa.Column('target_value', sa.Integer(), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('closed', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['public.users.id']),
        sa.ForeignKeyConstraint(['gym_id'], ['public.gym_servers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        comment='Reto colectivo dentro de un gym server.',
        schema='public',
    )
    op.create_index('ix_gym_challenges_gym_id', 'gym_challenges', ['gym_id'], schema='public')

    # gym_challenge_participants
    op.create_table(
        'gym_challenge_participants',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('challenge_id', sa.Integer(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('contribution', sa.Integer(), nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['challenge_id'], ['public.gym_challenges.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['public.users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('challenge_id', 'user_id', name='uq_challenge_participant'),
        schema='public',
    )
    op.create_index('ix_gym_challenge_participants_challenge_id', 'gym_challenge_participants', ['challenge_id'], schema='public')


def downgrade() -> None:
    op.drop_table('gym_challenge_participants', schema='public')
    op.drop_table('gym_challenges', schema='public')
    op.drop_table('gym_champion_badges', schema='public')
    op.drop_table('gym_memberships', schema='public')
    op.drop_table('gym_servers', schema='public')
    op.drop_index('ix_ranked_events_user_id', table_name='ranked_events', schema='public')
    op.drop_table('ranked_events', schema='public')
    op.drop_index('ix_ranked_profiles_user_id', table_name='ranked_profiles', schema='public')
    op.drop_table('ranked_profiles', schema='public')
    op.drop_table('ranked_seasons', schema='public')
