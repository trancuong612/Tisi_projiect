# Bright English

Personal English learning website built with Remix classic-style routes, JavaScript/JSX, Prisma, PostgreSQL and FSRS.

## Requirements
- Node.js 20+
- PostgreSQL already installed/running

## Setup
1. Copy `.env.example` to `.env`.
2. Create PostgreSQL database, e.g. `bright_english`.
3. Update `DATABASE_URL`.
4. Install and migrate:

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Open http://localhost:5173

## Main routes
- `/` Today dashboard
- `/learn` new words
- `/review` FSRS review
- `/reader` reading + TTS
- `/practice` adaptive reverse recall / cloze / dictation
- `/words` vocabulary library
- `/stats` learning stats
- `/admin/import` bulk vocabulary import
- `/admin/reading` paste reading for a lesson
- `/api/backup` export JSON backup

## Vocabulary import format
One item per line:

```text
word | /ipa/ | part of speech | meaning | example | note
```

The number of words is never hard-coded.
