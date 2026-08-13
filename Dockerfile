# استخدام صورة Playwright الرسمية المجهزة بالكامل من Microsoft بكل مكتبات Linux
FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# نسخ وتثبيت المكتبات
COPY package*.json ./
RUN npm install

# نسخ ملفات المشروع
COPY . .

# أمر التشغيل
CMD ["node", "--expose-gc", "publisher.js"]
