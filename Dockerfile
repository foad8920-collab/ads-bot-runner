# استخدام صورة أوبونتو الأساسية المجهزة بالكامل لنظام لينكس
FROM mcr.microsoft.com/playwright:v1.62.1-jammy

# ترقية Node.js إلى الإصدار 22 ليتوافق مع Supabase
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install playwright-extra puppeteer-extra-plugin-stealth ws

# تثبيت متصفح كروم النظام مباشرة لتجنب أي مشاكل في مجلدات Playwright المحلية
RUN apt-get update && apt-get install -y chromium-browser

COPY . .

CMD ["node", "--expose-gc", "publisher.js"]
