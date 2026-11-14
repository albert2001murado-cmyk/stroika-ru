from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


Decision = Literal["approved", "manual_review", "rejected"]
Severity = Literal["critical", "changes", "review"]


class CatalogContext(BaseModel):
    model_config = ConfigDict(extra="forbid")

    section: str = Field(default="", max_length=80)
    category: str = Field(default="", max_length=180)
    subcategory: str = Field(default="", max_length=180)
    alternatives: list[Annotated[str, Field(min_length=1, max_length=180)]] = Field(
        default_factory=list, max_length=800
    )


class MediaItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["image", "video"]
    url: HttpUrl


class ModerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=5_000)
    catalog: CatalogContext = Field(default_factory=CatalogContext)
    media: list[MediaItem] = Field(default_factory=list, max_length=18)


class ModerationFlag(BaseModel):
    code: str = Field(max_length=80)
    field: str = Field(max_length=80)
    severity: Severity
    message: str = Field(max_length=500)
    legalBasis: str = Field(default="Правила публикации Стройка.ру", max_length=500)


class ModerationResponse(BaseModel):
    decision: Decision
    flags: list[ModerationFlag]
    provider: Literal["stroika-local-v1"] = "stroika-local-v1"
    mediaChecked: int = Field(ge=0)
    scores: dict[str, float | int | str | bool] = Field(default_factory=dict)

