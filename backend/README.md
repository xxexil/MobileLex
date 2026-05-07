# LexConnectMobile Backend

## Setup

1. Install dependencies:
   npm install express sequelize sqlite3 bcryptjs body-parser

2. Start the server:
   node server.js

- The server runs on http://localhost:4000 by default.
- Endpoints:
  - POST /auth/forgot-password
  - POST /auth/verify-token
  - POST /auth/reset-password

- Uses SQLite for demo. Replace with your DB config for production.
