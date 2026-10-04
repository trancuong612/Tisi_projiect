# Cài Bright English trên Windows

## Cần có
- Node.js 20 trở lên
- PostgreSQL đang chạy trên máy

## 1. Tạo database
Mở pgAdmin hoặc psql và tạo database:

```sql
CREATE DATABASE bright_english;
```

## 2. Tạo file môi trường
Copy `.env.example` thành `.env` rồi sửa:

```env
DATABASE_URL="postgresql://postgres:MAT_KHAU_CUA_BAN@localhost:5432/bright_english?schema=public"
```

## 3. Cài package + tạo bảng
Mở Terminal/PowerShell ngay trong folder project:

```bash
npm install
npx prisma migrate dev --name init
npm run dev
```

Mở: http://localhost:5173

## Trang dùng nhiều trên PC
- Nhập từ: http://localhost:5173/admin/import
- Thêm bài đọc: http://localhost:5173/admin/reading
- Prisma Studio: `npx prisma studio`

## Format nhập từ
```text
abandon | /əˈbændən/ | verb | từ bỏ | They abandoned the project. | thường dùng với plan/project
reluctant | /rɪˈlʌktənt/ | adjective | miễn cưỡng | She was reluctant to agree. | reluctant to + V
```

Không giới hạn số dòng.
