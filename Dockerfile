# استخدام صورة Playwright الرسمية مع نظام jammy
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

# ترقية Node.js داخل الحاوية إلى الإصدار 22 ليتوافق مع Supabase
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

# 🌟 إخبار Playwright رسمياً بمكان المتصفحات في الصورة السحابية لكي يراها الكود مباشرة
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# تحديد مجلد العمل
WORKDIR /app

# نسخ ملفات التعاريف
COPY package*.json ./

# تثبيت جميع المكتبات
RUN npm install
RUN npm install playwright-extra puppeteer-extra-plugin-stealth ws

# إجبار السيرفر على تنزيل المتصفح وضبطه في المسار العام
RUN npx playwright install chromium

# نسخ بقية كود المشروع
COPY . .

# أمر التشغيل الأساسي
CMD ["node", "--expose-gc", "publisher.js"]
