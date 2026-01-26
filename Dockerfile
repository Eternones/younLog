# 1. 구글 공식 Puppeteer 이미지 사용 (크롬과 의존성이 이미 다 포함됨)
FROM ghcr.io/puppeteer/puppeteer:latest

# 2. 앱 디렉토리 설정
WORKDIR /usr/src/app

# 3. 의존성 설치 (루트 권한으로 실행)
USER root
COPY package*.json ./
RUN npm install

# 4. 소스 코드 복사
COPY . .

# 5. Render의 기본 포트 10000 오픈
EXPOSE 10000

# 6. 서버 실행 (Docker 환경에서는 전역 설치된 크롬을 사용하게 됨)
CMD [ "node", "server.js" ]