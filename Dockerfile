FROM node:22-slim

WORKDIR /app

# تثبيت الاعتماديات اللازمة لمتصفح الكروم في لينكس
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libasound2 libpango-1.0-0 libcairo2 libx11-xcb1 libx11-xcb-dev \
    fonts-liberation libappindicator3-1 xdg-utils libu2f-udev libvulkan1 \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

CMD ["node", "--expose-gc", "publisher.js"]
