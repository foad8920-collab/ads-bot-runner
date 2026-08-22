FROM node:22-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install

# تثبيت كافة متصفحات Playwright مع التبعات
RUN npx playwright install --with-deps

COPY . .

CMD ["node", "--expose-gc", "publisher.js"]
