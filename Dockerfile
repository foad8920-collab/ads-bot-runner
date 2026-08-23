FROM node:22-bookworm

WORKDIR /app

# إجبار Playwright على تثبيت المتصفح في مجلد node_modules المحلي
ENV PLAYWRIGHT_BROWSERS_PATH=0

COPY package*.json ./
RUN npm install
RUN npx playwright install --with-deps

COPY . .

ENV PLAYWRIGHT_BROWSERS_PATH=0

CMD ["node", "--expose-gc", "publisher.js"]
