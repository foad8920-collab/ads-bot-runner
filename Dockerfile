# استخدام صورة Playwright الرسمية مع نظام jammy الجديد
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

# ترقية Node.js داخل الحاوية إلى الإصدار 22 ليتوافق مع Supabase
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

# تحديد مجلد العمل
WORKDIR /app

# نسخ ملفات التعاريف
COPY package*.json ./

# تثبيت جميع المكتبات
RUN npm install
RUN npm install playwright-extra puppeteer-extra-plugin-stealth ws

# نسخ بقية كود المشروع
COPY . .

# أمر التشغيل الأساسي
CMD ["node", "--expose-gc", "publisher.js"]
