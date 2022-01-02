FROM node:12-alpine
WORKDIR /usr/app
COPY package*.json ./
COPY tsconfig*.json ./
RUN arch
RUN node -v
RUN apk add --no-cache \
        libstdc++ \
    && apk add --no-cache --virtual .build-deps \
        binutils-gold \
        curl \
        g++ \
        gcc \
        gnupg \
        libgcc \
        linux-headers \
        make \
        python3 \
        libc6-compat 
RUN npm install
COPY . ./
RUN npm run build

RUN npm install pm2 -g

EXPOSE 8000

CMD ["pm2-runtime", "dist/src/index.js"]