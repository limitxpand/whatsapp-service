FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps

COPY . .

EXPOSE 4000

CMD ["npm", "run", "start"]
