FROM mcr.microsoft.com/playwright:v1.62.1-jammy

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

WORKDIR /app

COPY package*.json ./
RUN npm install

# هذا هو السطر الحاسم الذي يضمن وجود المتصفح في المسار الذي تبحث عنه المكتبة
RUN npx playwright install chromium

COPY . .

CMD ["node", "--expose-gc", "publisher.js"]
