from typing import List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from . import database

ENTITY_TYPE_SENSOR = "sensor"
ENTITY_TYPE_AIRCON = "aircon"


def list_entities(db: Session, entity_type: str) -> List[database.DisplayEntity]:
    return (
        db.query(database.DisplayEntity)
        .filter(database.DisplayEntity.entity_type == entity_type)
        .order_by(database.DisplayEntity.entity_id)
        .all()
    )


def get_entity(
    db: Session,
    entity_type: str,
    entity_id: int,
) -> Optional[database.DisplayEntity]:
    return (
        db.query(database.DisplayEntity)
        .filter(
            database.DisplayEntity.entity_type == entity_type,
            database.DisplayEntity.entity_id == entity_id,
        )
        .first()
    )


def upsert_entity(
    db: Session,
    entity_type: str,
    entity_id: int,
    name: str,
    inherits_from: Optional[int] = None,
    *,
    update_inherits_from: bool = False,
) -> database.DisplayEntity:
    row = get_entity(db, entity_type, entity_id)
    if row is None:
        row = database.DisplayEntity(
            entity_type=entity_type,
            entity_id=entity_id,
            name=name.strip(),
            inherits_from=inherits_from if entity_type == ENTITY_TYPE_SENSOR else None,
        )
        db.add(row)
    else:
        row.name = name.strip()
        if update_inherits_from and entity_type == ENTITY_TYPE_SENSOR:
            row.inherits_from = inherits_from
    db.commit()
    db.refresh(row)
    return row


def ensure_entity(
    db: Session,
    entity_type: str,
    entity_id: int,
    name: str,
) -> database.DisplayEntity:
    row = get_entity(db, entity_type, entity_id)
    if row is not None:
        return row

    row = database.DisplayEntity(
        entity_type=entity_type,
        entity_id=entity_id,
        name=name.strip(),
        inherits_from=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def migrate_legacy_tables(db: Session) -> None:
    if not list_entities(db, ENTITY_TYPE_SENSOR) and _legacy_table_exists(db, "device_names"):
        if _legacy_column_exists(db, "device_names", "inherits_from"):
            legacy_device_rows = db.execute(
                text("SELECT id, name, inherits_from FROM device_names")
            ).fetchall()
        else:
            legacy_device_rows = db.execute(
                text("SELECT id, name FROM device_names")
            ).fetchall()
        for row in legacy_device_rows:
            inherits_from = int(row[2]) if len(row) > 2 and row[2] is not None else None
            upsert_entity(
                db,
                ENTITY_TYPE_SENSOR,
                int(row[0]),
                str(row[1]),
                inherits_from,
                update_inherits_from=True,
            )

    if not list_entities(db, ENTITY_TYPE_AIRCON) and _legacy_table_exists(
        db, "aircon_unit_names"
    ):
        legacy_aircon_rows = db.execute(
            text("SELECT ac_id, name FROM aircon_unit_names")
        ).fetchall()
        for row in legacy_aircon_rows:
            upsert_entity(db, ENTITY_TYPE_AIRCON, int(row[0]), str(row[1]))


def _legacy_table_exists(db: Session, table_name: str) -> bool:
    result = db.execute(text("SHOW TABLES LIKE :table_name"), {"table_name": table_name})
    return result.fetchone() is not None


def _legacy_column_exists(db: Session, table_name: str, column_name: str) -> bool:
    result = db.execute(
        text(f"SHOW COLUMNS FROM `{table_name}` LIKE :column_name"),
        {"column_name": column_name},
    )
    return result.fetchone() is not None
