# QuickNotes REST API Design

## 1. Overview

QuickNotes is an online note-taking service that allows registered users to create, view, update, and delete notes and organize them using tags.

This document describes the production API that the backend team should implement. It is separate from the JSONPlaceholder practice API used by the browser client.

### Base URL

`https://api.quicknotes.example.com/v1`

All request and response bodies use JSON unless otherwise specified.

### Authentication

Protected endpoints require a valid bearer access token:

`Authorization: Bearer <access_token>`

The server must derive the authenticated user's identity from the token rather than trusting a user ID supplied in the request body.

## 2. REST Endpoint Table

| Method | Path | Description | Success status |
|---|---|---|---|
| POST | `/auth/register` | Register a new user | 201 Created |
| POST | `/auth/login` | Authenticate a user and issue a token | 200 OK |
| GET | `/notes` | List the authenticated user's notes, with pagination | 200 OK |
| GET | `/notes/{noteId}` | Retrieve one note owned by the authenticated user | 200 OK |
| POST | `/notes` | Create a note | 201 Created |
| PATCH | `/notes/{noteId}` | Update selected fields of an existing note | 200 OK |
| DELETE | `/notes/{noteId}` | Delete an existing note | 204 No Content |
| GET | `/tags` | List the user's tags | 200 OK |
| POST | `/notes/{noteId}/tags` | Associate a tag with a note | 201 Created |
| DELETE | `/notes/{noteId}/tags/{tagId}` | Remove a tag association from a note | 204 No Content |

## 3. Creating a Note

### Request

`POST /v1/notes`

Headers:

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

Request body:

```json
{
  "title": "Study plan",
  "body": "Revise database normalization.",
  "tagIds": [2, 4]
}
```

The title is required and must contain between 1 and 100 characters after trimming whitespace. The body is optional. The `tagIds` field is optional and references tags belonging to the authenticated user.

### Successful response

Status: `201 Created`

```json
{
  "data": {
    "id": 101,
    "userId": 7,
    "title": "Study plan",
    "body": "Revise database normalization.",
    "createdAt": "2026-10-27T08:30:00Z",
    "updatedAt": "2026-10-27T08:30:00Z",
    "tags": [
      {
        "id": 2,
        "name": "School"
      },
      {
        "id": 4,
        "name": "Revision"
      }
    ]
  }
}
```

The server generates the note ID and timestamps. The response includes the created resource.

## 4. Listing Notes

### Request

`GET /v1/notes?page=1&limit=10`

Headers:

```http
Authorization: Bearer <access_token>
```

The endpoint returns only notes owned by the authenticated user. Pagination limits the amount of data returned in a single response.

### Successful response

Status: `200 OK`

```json
{
  "data": [
    {
      "id": 101,
      "userId": 7,
      "title": "Study plan",
      "body": "Revise database normalization.",
      "createdAt": "2026-10-27T08:30:00Z",
      "updatedAt": "2026-10-27T08:30:00Z",
      "tags": [
        {
          "id": 2,
          "name": "School"
        }
      ]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

An account with no notes receives an empty `data` array and a `200 OK` response.

## 5. Updating a Note

### Request

`PATCH /v1/notes/101`

```json
{
  "title": "Updated study plan",
  "body": "Revise normalization and indexing."
}
```

### Successful response

Status: `200 OK`

```json
{
  "data": {
    "id": 101,
    "userId": 7,
    "title": "Updated study plan",
    "body": "Revise normalization and indexing.",
    "createdAt": "2026-10-27T08:30:00Z",
    "updatedAt": "2026-10-27T09:00:00Z",
    "tags": []
  }
}
```

Only fields supplied in the request are updated. The server validates the changes and updates `updatedAt`.

## 6. Deleting a Note

### Request

`DELETE /v1/notes/101`

### Successful response

Status: `204 No Content`

No response body is returned when deletion succeeds. The server must verify ownership before deleting the note.

## 7. Error Status Codes

| Status code | Meaning | Example situation |
|---|---|---|
| 400 Bad Request | Invalid request data | Missing title or invalid pagination |
| 401 Unauthorized | Authentication is missing or invalid | Expired access token |
| 403 Forbidden | The action is not permitted | Account lacks permission for an operation |
| 404 Not Found | Resource does not exist or is not accessible | Requested note cannot be found |
| 409 Conflict | Request conflicts with existing data | Duplicate email during registration |
| 422 Unprocessable Content | Valid JSON fails business validation | Title exceeds the allowed length |
| 429 Too Many Requests | Rate limit exceeded | Too many requests in a short period |
| 500 Internal Server Error | Unexpected server failure | Unhandled backend error |
| 503 Service Unavailable | Service is temporarily unavailable | Database service is unavailable |

The API should use consistent error responses and avoid exposing stack traces, database credentials, or internal implementation details.

### Example error body

Status: `400 Bad Request`

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": [
      {
        "field": "title",
        "message": "Title is required and must not exceed 100 characters."
      }
    ],
    "requestId": "req-8f42c1"
  }
}
```

The `requestId` helps developers trace a failed request through server logs.

## 8. API Design Principles

- Use nouns for resource paths and HTTP methods for actions.
- Require authentication for private notes and tags.
- Enforce ownership checks on every protected resource.
- Validate request bodies, query parameters, and resource identifiers.
- Use pagination for list endpoints.
- Return appropriate HTTP status codes.
- Use parameterized SQL queries to prevent SQL injection.
- Apply rate limiting to authentication and other sensitive endpoints.
- Use HTTPS for all production traffic.
- Document the API with an OpenAPI specification before implementation.

## 9. Conclusion

This API provides a consistent interface for managing notes and tags. Authentication, validation, pagination, ownership checks, and standardized errors provide a foundation for a secure backend serving a large number of users.