FROM mcr.microsoft.com/playwright:v1.62.1-jammy

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs

WORKDIR /app

COPY package*.json ./
RUN npm install
RUN npm install playwright-extra puppeteer-extra-plugin-stealth ws

# تثبيت الاعتماديات الأساسية للعمل السحابي بدون مشاكل Snap
RUN apt-get update && apt-get install -y \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 libx11-xcb1

COPY . .

CMD ["node", "--expose-gc", "publisher.js"]
