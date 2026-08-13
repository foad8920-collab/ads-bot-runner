FROM mcr.microsoft.com/playwright:v1.62.1-jammy

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

WORKDIR /app

COPY package*.json ./
RUN npm install

# تنزيل المتصفح الرسمي النظيف المرتبط بنسخة Playwright
RUN npx playwright install chromium

COPY . .

CMD ["node", "--expose-gc", "publisher.js"]
