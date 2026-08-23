# استخدام صورة Playwright الرسمية المجهزة بالكامل من Microsoft
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# تحديد مجلد العمل
WORKDIR /app

# نسخ ملفات التعاريف
COPY package*.json ./

# تثبيت جميع المكتبات
RUN npm install
RUN npm install playwright-extra puppeteer-extra-plugin-stealth

# نسخ بقية كود المشروع
COPY . .

# أمر التشغيل الأساسي
CMD ["node", "--expose-gc", "publisher.js"]
