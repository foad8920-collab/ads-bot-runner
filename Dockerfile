# استخدام صورة Playwright الرسمية بالإصدار المطابق لمكتبتك بالمليمتر
FROM mcr.microsoft.com/playwright:v1.62.1-focal

# 🚀 التحديث الجذري: ترقية Node.js داخل الحاوية إلى الإصدار 22 ليتوافق مع Supabase وإنهاء خطأ الـ WebSocket
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

# تحديد مجلد العمل
WORKDIR /app

# نسخ ملفات التعاريف
COPY package*.json ./

# تثبيت جميع المكتبات المذكورة في package.json والمكتبات الإضافية، بالإضافة لمكتبة ws كدعم إضافي
RUN npm install
RUN npm install playwright-extra puppeteer-extra-plugin-stealth ws

# نسخ بقية كود المشروع
COPY . .

# أمر التشغيل الأساسي
CMD ["node", "--expose-gc", "publisher.js"]
