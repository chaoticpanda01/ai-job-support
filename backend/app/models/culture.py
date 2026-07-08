from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CreatedAtMixin, TimestampMixin, UUIDPrimaryKeyMixin


class CultureTopic(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """
    Browseable workplace culture article for Indonesian professionals.
    published_at=None means draft. Set to NOW() to publish.

    body is markdown rendered client-side via react-markdown.
    tags supports multi-value filter queries via the GIN index.
    """

    __tablename__ = "culture_topics"
    __table_args__ = (
        UniqueConstraint("slug", name="culture_topics_slug_uk"),
        Index(
            "idx_culture_topics_published",
            "published_at",
            postgresql_where=text("published_at IS NOT NULL"),
        ),
        Index("idx_culture_topics_tags", "tags", postgresql_using="gin"),
    )

    slug: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(Text()), nullable=False, server_default=text("'{}'")
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CultureGlossary(UUIDPrimaryKeyMixin, CreatedAtMixin, Base):
    """Japanese workplace term with Indonesian definition and romaji reading."""

    __tablename__ = "culture_glossary"
    __table_args__ = (UniqueConstraint("term_ja", name="culture_glossary_term_uk"),)

    term_ja: Mapped[str] = mapped_column(String(255), nullable=False)
    reading_romaji: Mapped[str | None] = mapped_column(String(255))
    definition_id: Mapped[str] = mapped_column(Text, nullable=False)
