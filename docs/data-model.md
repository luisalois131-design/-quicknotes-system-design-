# QuickNotes Data Model

## 1. Overview

QuickNotes uses a relational database to store users, notes, tags, and the relationships between notes and tags.

The proposed schema uses PostgreSQL-compatible SQL. Primary keys uniquely identify records, foreign keys maintain relationships, and constraints protect data integrity.

## 2. Entities and Columns

### A. Users

The `users` table stores account information.

| Column | Type | Key / constraint | Description |
|---|---|---|---|
| id | BIGINT | Primary key | Unique user identifier |
| name | VARCHAR(100) | NOT NULL | User's display name |
| email | VARCHAR(255) | UNIQUE, NOT NULL | Login email |
| password_hash | VARCHAR(255) | NOT NULL | Secure password hash |
| created_at | TIMESTAMPTZ | NOT NULL | Account creation time |

Passwords must be hashed using a suitable password-hashing algorithm and never stored as plaintext.

### B. Notes

The `notes` table stores note content.

| Column | Type | Key / constraint | Description |
|---|---|---|---|
| id | BIGINT | Primary key | Unique note identifier |
| user_id | BIGINT | Foreign key, NOT NULL | Owner of the note |
| title | VARCHAR(100) | NOT NULL | Note title |
| body | TEXT | NULL allowed | Note content |
| created_at | TIMESTAMPTZ | NOT NULL | Creation time |
| updated_at | TIMESTAMPTZ | NOT NULL | Last update time |

Each note belongs to one user.

### C. Tags

The `tags` table stores labels used to organize notes.

| Column | Type | Key / constraint | Description |
|---|---|---|---|
| id | BIGINT | Primary key | Unique tag identifier |
| user_id | BIGINT | Foreign key, NOT NULL | Tag owner |
| name | VARCHAR(50) | NOT NULL | Tag name |
| created_at | TIMESTAMPTZ | NOT NULL | Creation time |

A tag belongs to one user. A unique constraint on `(user_id, name)` prevents duplicate tag names for the same user.

### D. Note Tags

The `note_tags` table connects notes to tags.

| Column | Type | Key / constraint | Description |
|---|---|---|---|
| note_id | BIGINT | Composite primary key; foreign key | Associated note |
| tag_id | BIGINT | Composite primary key; foreign key | Associated tag |

The combination of `note_id` and `tag_id` is the composite primary key, preventing the same tag from being attached to a note more than once.

## 3. Relationships

### One-to-many relationships

- One user can create many notes, but each note belongs to one user.
- One user can create many tags, but each tag belongs to one user.

### Many-to-many relationship

- One note can have many tags.
- One tag can be associated with many notes.
- The `note_tags` junction table implements this many-to-many relationship through two foreign keys.

The application must also verify that a user can only attach their own tags to their own notes. Foreign keys alone do not enforce that ownership rule in this schema.

## 4. CREATE TABLE Statements

Create the tables in the following order so referenced tables exist before their foreign keys are defined.

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(100) NOT NULL,
    body TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notes_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT chk_note_title
        CHECK (LENGTH(TRIM(title)) BETWEEN 1 AND 100)
);

CREATE TABLE tags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tags_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_tags_user_name
        UNIQUE (user_id, name)
);

CREATE TABLE note_tags (
    note_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,

    PRIMARY KEY (note_id, tag_id),

    CONSTRAINT fk_note_tags_note
        FOREIGN KEY (note_id)
        REFERENCES notes(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_note_tags_tag
        FOREIGN KEY (tag_id)
        REFERENCES tags(id)
        ON DELETE CASCADE
);
```

## 5. Indexes

```sql
CREATE INDEX idx_notes_user_created
ON notes(user_id, created_at DESC);

CREATE INDEX idx_note_tags_tag
ON note_tags(tag_id);
```

### Why these indexes are useful

- `idx_notes_user_created` supports retrieving a user's notes in creation-date order without scanning the entire notes table.
- `idx_note_tags_tag` speeds up finding notes associated with a particular tag. The composite primary key on `note_tags` already supports lookups beginning with `note_id`.

Indexes improve read performance but consume storage and add work to inserts, updates, and deletes.

## 6. Example SQL Queries

### Query 1: Retrieve a user's notes

```sql
SELECT id, title, body, created_at, updated_at
FROM notes
WHERE user_id = 7
ORDER BY created_at DESC
LIMIT 20;
```

This query returns the 20 most recent notes owned by user 7.

### Query 2: Create a new note

```sql
INSERT INTO notes (user_id, title, body)
VALUES (7, 'Study plan', 'Revise SQL and database normalization.')
RETURNING id, user_id, title, body, created_at, updated_at;
```

The database creates the note and returns its generated identifier and stored values.

### Query 3: Retrieve notes and their tags using JOIN

```sql
SELECT
    n.id AS note_id,
    n.title,
    t.id AS tag_id,
    t.name AS tag_name
FROM notes AS n
JOIN note_tags AS nt
    ON n.id = nt.note_id
JOIN tags AS t
    ON nt.tag_id = t.id
WHERE n.user_id = 7
ORDER BY n.created_at DESC, t.name;
```

This query joins notes, the junction table, and tags to show the tags associated with a user's notes.

### Query 4: Count notes belonging to each user

```sql
SELECT
    u.id,
    u.name,
    COUNT(n.id) AS total_notes
FROM users AS u
LEFT JOIN notes AS n
    ON u.id = n.user_id
GROUP BY u.id, u.name
ORDER BY total_notes DESC;
```

The `LEFT JOIN` includes users who have not created any notes.

### Query 5: Delete a note belonging to a particular user

```sql
DELETE FROM notes
WHERE id = 101
  AND user_id = 7
RETURNING id;
```

The ownership condition prevents this query from deleting a note owned by another user. The backend should check whether a row was returned and respond appropriately if no accessible note exists.

## 7. SQL Versus NoSQL

I recommend a relational SQL database such as PostgreSQL for QuickNotes.

The application has clearly defined entities and relationships, including users owning notes and tags, plus a many-to-many relationship between notes and tags. SQL supports foreign keys, transactions, unique constraints, joins, and indexes, which help maintain consistency as the service grows.

A NoSQL database could be useful for certain flexible document or high-volume event workloads, but it would introduce additional complexity for these relational requirements. PostgreSQL is a practical starting point, with read replicas, connection pooling, indexing, and partitioning considered as the workload grows.

## 8. Conclusion

This schema provides a normalized foundation for user accounts, notes, and tags. Primary keys identify records, foreign keys enforce referential integrity, constraints prevent invalid data, and indexes support common retrieval patterns.

The backend must still enforce authentication, authorization, tag ownership, secure password handling, and safe parameterized queries.