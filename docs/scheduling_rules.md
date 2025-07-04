# Scheduling Rules API

The scheduling system supports custom posting rules that override the default timing recommendations. These rules are stored in the `user_scheduling_rules` table.

## Endpoints

### `GET /api/scheduling/rules`
Returns all rules owned by the authenticated user.

**Response**
```json
[
  {
    "id": "uuid",
    "platform": "youtube",
    "timezone": "America/New_York",
    "vertical": "tech",
    "bestTimes": [
      {"day": 1, "hour": 9, "minute": 0}
    ],
    "avoidTimes": [],
    "frequency": { "maxPerDay": 1, "minHoursBetween": 24 }
  }
]
```

### `GET /api/scheduling/rules/:id`
Fetches a single rule by id.

**Response**
```json
{
  "id": "uuid",
  "platform": "youtube",
  "timezone": "America/New_York",
  "vertical": "tech",
  "bestTimes": [
    {"day": 1, "hour": 9, "minute": 0}
  ],
  "avoidTimes": [],
  "frequency": { "maxPerDay": 1, "minHoursBetween": 24 }
}
```

### `POST /api/scheduling/rules`
Creates a new rule.

**Request**
```json
{
  "platform": "youtube",
  "timezone": "America/New_York",
  "vertical": "tech",
  "bestTimes": [
    {"day": 1, "hour": 9, "minute": 0}
  ],
  "avoidTimes": [],
  "frequency": { "maxPerDay": 1, "minHoursBetween": 24 }
}
```

**Response** – Returns the created rule object with its generated `id`.

### `PUT /api/scheduling/rules/:id`
Updates an existing rule.

**Request**
```json
{
  "bestTimes": [
    {"day": 2, "hour": 10, "minute": 0}
  ]
}
```

**Response** – The updated rule.

### `DELETE /api/scheduling/rules/:id`
Removes the rule.

**Response**
```json
{ "success": true }
```

These endpoints operate on the `user_scheduling_rules` table where each row stores a user's custom scheduling preferences.
