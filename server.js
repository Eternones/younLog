const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// 서버 깨우기용 경로
app.get('/', (req, res) => res.send('Server is awake!'));

app.post('/extract', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.startsWith('https://ccfolia.com')) {
        return res.status(400).json({ success: false, error: '유효한 URL이 아닙니다.' });
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            headless: "new",
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || puppeteer.executablePath(),
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });

        const page = await browser.newPage();

        // 타임아웃을 10분(600000ms)으로 설정하여 수만 줄 로딩 견디기
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 600000 });

        const chatContainerSelector = '.MuiList-root';
        await page.waitForSelector(chatContainerSelector, { timeout: 60000 }).catch(() => console.log("진행함"));

        // [핵심] 덩어리 수집 및 정렬 로직 수정
        const chatLogs = await page.evaluate(async (selector) => {
            const list = document.querySelector(selector);
            let scrollBox = list;
            // 스크롤 가능한 부모 찾기
            while (scrollBox) {
                const style = window.getComputedStyle(scrollBox);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
                scrollBox = scrollBox.parentElement;
            }
            if (!scrollBox) scrollBox = list?.parentElement;

            const chunks = []; // 덩어리들을 담을 배열
            const seenKeys = new Set(); // 중복 방지

            await new Promise((resolve) => {
                let sameCount = 0;
                const maxRetries = 60; // 약 50초 동안 변화 없어도 기다림 (로딩 지연 대응)

                const timer = setInterval(() => {
                    // 1. 현재 화면의 로그들 수집 (위에서 아래로 정방향)
                    const items = document.querySelectorAll('.MuiListItem-root');
                    const currentChunk = [];

                    items.forEach(item => {
                        const nameEl = item.querySelector('h6');
                        const msgEl = item.querySelector('p');
                        const imgEl = item.querySelector('img');

                        if (nameEl && msgEl) {
                            const name = nameEl.innerText.trim();
                            const message = msgEl.innerText.trim();
                            const image = imgEl ? imgEl.src : null;
                            const nameColor = window.getComputedStyle(nameEl).color;

                            const key = `${name}_${message}_${image}`;

                            // 아직 수집하지 않은 새로운 로그만 추가
                            if (!seenKeys.has(key)) {
                                seenKeys.add(key);
                                currentChunk.push({ name, message, image, nameColor });
                            }
                        }
                    });

                    // 이번 스크롤에서 건진 게 있다면 덩어리 보관함에 넣음
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        sameCount = 0; // 데이터가 들어왔으니 카운트 리셋
                    } else {
                        // 건진 게 없다면(로딩 중이거나 끝에 도달) 카운트 증가
                        sameCount++;
                    }

                    // 2. 위로 스크롤 (더 과감하게 이동)
                    scrollBox.scrollBy(0, -2000);

                    // 3. 종료 조건 체크
                    // 맨 위(scrollTop 0)에 도달했고, 60번(약 50초) 동안 새 데이터가 안 뜨면 종료
                    if (scrollBox.scrollTop === 0 && sameCount >= maxRetries) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 800); // 0.8초 간격
            });

            // chunks는 [ [최신 로그들], [그다음 과거 로그들], ..., [가장 오래된 로그들] ] 순서로 쌓임
            // 따라서 덩어리들의 순서만 뒤집으면 [ [가장 오래된], ... , [최신] ]이 됨
            // *내부 요소(.reverse())는 하지 않음!*
            chunks.reverse();

            // 하나로 합치기
            return chunks.flat();
        }, chatContainerSelector);

        res.json({ success: true, logs: chatLogs });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: error.message });
    } finally {
        if (browser) await browser.close();
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));