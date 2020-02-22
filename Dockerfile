FROM node:13-alpine

WORKDIR /usr/src/app

COPY package.json yarn.lock ./
RUN yarn install --production

COPY . ./

ENTRYPOINT ["node"]
CMD ["index.js"]
