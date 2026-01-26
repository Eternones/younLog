# 1. 구글 공식 Puppeteer 이미지 사용
FROM ghcr.io/puppeteer/puppeteer:latest

# 2. 작업 디렉토리 설정
WORKDIR /usr/src/app

# 3. 의존성 설치
USER root
COPY package*.json ./
RUN npm install

# 4. 소스 코드 복사
COPY . .

# 5. 환경 변수 설정: Puppeteer가 자체 내장된 크롬을 쓰도록 유도
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false

# 6. 포트 설정
EXPOSE 10000

# 7. 실행
CMD [ "node", "server.js" ]